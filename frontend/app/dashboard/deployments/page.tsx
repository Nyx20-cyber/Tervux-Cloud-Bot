"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ShieldCheck, Network, PauseCircle, PlayCircle, Trash2, Rocket, Coins, Loader2 } from "lucide-react";
import { useSessionStore } from "@/store/useSessionStore";
import { useAuthStore } from "@/store/useAuthStore";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/store/useAuthStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useLocaleStore } from "@/store/useLocaleStore";
import { translations } from "@/lib/translations";
import { useRouter } from "next/navigation";

export default function DeploymentsPage() {
    const { language } = useLocaleStore();
    const t = translations[language];
    const { sessions, isLoading, fetchSessions, updateSessionLocally } = useSessionStore();
    const { user, token } = useAuthStore();

    useEffect(() => {
        fetchSessions();

        const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const socket = io(backendUrl, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            auth: { token }
        });

        socket.on("session_update", (data: { sessionId: string; status: string; isLive?: boolean }) => {
            updateSessionLocally(data.sessionId, { status: data.status, isLive: data.isLive });
        });
        socket.on("session_deleted", () => {
            fetchSessions();
        });

        const refresh = setInterval(() => fetchSessions(), 60_000);
        return () => {
            clearInterval(refresh);
            socket.disconnect();
        };
    }, [fetchSessions, updateSessionLocally, token]);

    return (
        <DashboardLayout>
            <div className="space-y-6 sm:space-y-8 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white uppercase flex items-center gap-2.5 sm:gap-3">
                            <ShieldCheck className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                            {t.deployments}
                        </h1>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">{t.manage_pause_deploy}</p>
                    </div>
                    <div className="flex items-center gap-2.5 bg-white/5 border border-white/10 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl backdrop-blur-md w-fit">
                        <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-yellow-500/20 text-yellow-500">
                            <Coins className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t.available_coins} 🪙</p>
                            <p className="text-xs sm:text-sm font-bold text-white tracking-widest">{user?.coins || 0}</p>
                        </div>
                    </div>
                </div>

                {/* Sessions List */}
                <div className="space-y-4">
                    {isLoading && sessions.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-xs font-bold uppercase tracking-widest border border-white/10 border-dashed rounded-xl bg-white/5 flex flex-col items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            {t.loading_deployments}
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="p-8 text-center border border-white/10 border-dashed rounded-xl bg-white/5 flex flex-col items-center space-y-3">
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">{t.no_paired_devices}</p>
                            <Button asChild variant="outline" className="border-primary/50 text-white hover:text-black hover:bg-primary uppercase tracking-widest text-[10px]">
                                <Link href="/dashboard/pair">{t.connect_new_device}</Link>
                            </Button>
                        </div>
                    ) : (
                        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {sessions.map(session => (
                                <SessionCard key={session._id} session={session} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}

function SessionCard({ session }: { session: any }) {
    const { language } = useLocaleStore();
    const t = translations[language];
    const { updateSessionLocally, fetchSessions, updateSessionStatus, deploySession } = useSessionStore();
    const { user, updateCoins } = useAuthStore();
    const router = useRouter();
    const [nowMs, setNowMs] = useState(Date.now());

    const [isDeploying, setIsDeploying] = useState(false);
    const isPaused = session.status === "paused";
    const isActive = session.status === "active";
    const isError = ["disconnected", "expired", "failed"].includes(session.status);
    const isDeployed = !!session.expiresAt;
    const remainingMs = session.expiresAt ? (new Date(session.expiresAt).getTime() - nowMs) : null;
    const remainingDays = remainingMs !== null ? Math.ceil(remainingMs / (1000 * 60 * 60 * 24)) : null;
    const isSubExpired = !isDeployed || (remainingMs !== null && remainingMs <= 0);

    const [isDeployDialogOpen, setIsDeployDialogOpen] = useState(false);
    const [isPauseDialogOpen, setIsPauseDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isActioning, setIsActioning] = useState(false);

    const handleDeploy = async () => {
        setIsDeploying(true);
        try {
            const result = await deploySession(session._id);
            if (typeof result?.coins === "number") {
                updateCoins(result.coins);
            }
            toast.success(t.bot_deployed_success);
            // Refresh sessions to get new status
            fetchSessions();
            setIsDeployDialogOpen(false);
        } catch (error: any) {
            const rawMsg = String(error?.response?.data?.error || error?.message || "");
            const isInsufficient = error?.response?.status === 402 || /insufficient coins/i.test(rawMsg);
            if (isInsufficient) {
                toast.error(t.deploy_insufficient_redirect);
                toast.message(t.deploy_redirect_billing);
                setIsDeployDialogOpen(false);
                router.push("/dashboard/billing");
            } else {
                toast.error(rawMsg || t.failed_deploy_bot_insufficient);
            }
        } finally {
            setIsDeploying(false);
        }
    };

    const handlePauseResume = async () => {
        setIsActioning(true);
        const targetStatus = isPaused ? "active" : "paused";

        try {
            await updateSessionStatus(session._id, targetStatus);
            toast.success(targetStatus === "active" ? t.session_resumed : t.session_paused);
            setIsPauseDialogOpen(false);
        } catch (error: any) {
            toast.error(error.response?.data?.error || t.failed_change_status);
        } finally {
            setIsActioning(false);
        }
    };

    const handleDelete = async () => {
        setIsActioning(true);
        try {
            await api.delete(`/sessions/${session._id}`);
            toast.success(t.device_disconnected);
            fetchSessions();
            setIsDeleteDialogOpen(false);
        } catch (error: any) {
            toast.error(t.failed_delete_session);
        } finally {
            setIsActioning(false);
        }
    };

    useEffect(() => {
        const timer = setInterval(() => setNowMs(Date.now()), 60_000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className={`p-4 sm:p-5 rounded-xl sm:rounded-2xl border ${isActive ? 'border-primary/30 bg-primary/5' : isError ? 'border-destructive/30 bg-destructive/5' : isPaused ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10 bg-white/5'} flex flex-col gap-3 sm:gap-4 backdrop-blur-md transition-all`}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isActive ? 'bg-primary/20 text-primary' : isError ? 'bg-destructive/20 text-destructive' : isPaused ? 'bg-amber-500/20 text-amber-500' : 'bg-gray-500/20 text-gray-500'}`}>
                        <Network className="w-4 h-4" />
                    </div>
                    <div>
                        <p className="text-xs sm:text-sm font-bold text-white tracking-widest">{session.phone || t.unknown_phone}</p>
                        <p className={`text-[9px] font-bold uppercase tracking-widest ${isActive ? 'text-primary' : isError ? 'text-destructive' : isPaused ? 'text-amber-500' : 'text-gray-500'}`}>
                            {session.status}
                        </p>
                    </div>
                </div>
            </div>

            {/* Sub Info */}
            {isDeployed ? (
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex flex-col items-center justify-center gap-1">
                    <p className="text-[10px] text-primary font-bold uppercase tracking-widest">{t.deployed_to_node}</p>
                    {remainingDays !== null && (
                        <p className={`text-[9px] font-bold uppercase tracking-widest ${remainingDays > 5 ? 'text-gray-400' : 'text-amber-500'}`}>
                            {remainingDays > 0 ? `${remainingDays} ${t.days_remaining}` : t.expiring_today}
                        </p>
                    )}
                </div>
            ) : (
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex flex-col items-center justify-center gap-1">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t.awaiting_deployment}</p>
                    <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">{t.lifetime_validation}</p>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-auto pt-1.5 sm:pt-2">
                <Button
                    variant="outline" size="sm"
                    onClick={() => setIsPauseDialogOpen(true)}
                    className="flex-1 border-white/10 bg-white/5 hover:bg-white/10 text-[9px] sm:text-[10px] uppercase font-bold tracking-widest h-8 text-white transition-colors"
                >
                    {isPaused ? <PlayCircle className="w-3 h-3 mr-2" /> : <PauseCircle className="w-3 h-3 mr-2" />}
                    {isPaused ? t.resume : t.pause}
                </Button>
                <Button
                    variant="outline" size="sm"
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="w-8 border-destructive/20 bg-destructive/5 hover:bg-destructive/20 text-destructive p-0 h-8 transition-colors"
                >
                    <Trash2 className="w-3 h-3" />
                </Button>
            </div>
            {isSubExpired && (
                <Button
                    onClick={() => setIsDeployDialogOpen(true)}
                    className="w-full bg-primary text-black font-bold uppercase tracking-widest text-[9px] sm:text-[10px] h-9 mt-2 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                >
                    <Rocket className="w-3 h-3 mr-2" />
                    {t.deploy_bot_cost}
                </Button>
            )}

            {/* Deploy Confirmation Dialog */}
            <Dialog open={isDeployDialogOpen} onOpenChange={setIsDeployDialogOpen}>
                <DialogContent className="sm:max-w-md bg-card/90 border-white/10 backdrop-blur-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-white uppercase tracking-widest flex items-center gap-2">
                            <Rocket className="w-5 h-5 text-primary" />
                            {t.confirm_deployment}
                        </DialogTitle>
                        <DialogDescription className="text-gray-400 mt-2">
                            {t.confirm_deployment_desc}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <p className="text-sm text-gray-300">
                            <strong className="text-primary font-bold">{t.cost}:</strong>{' '}
                            {user?.isVIP ? (
                                <span>
                                    <span className="line-through opacity-50 mr-2">50 Coins</span>
                                    <span className="text-yellow-500 font-bold tracking-widest">45 Coins 🪙 (VIP)</span>
                                </span>
                            ) : (
                                "50 Coins 🪙"
                            )}
                        </p>
                        <p className="text-sm text-gray-300">
                            <strong className="text-primary font-bold">{t.duration}:</strong> 30 {t.days}
                        </p>
                    </div>

                    <DialogFooter className="flex justify-end gap-3 sm:justify-end">
                        <Button variant="ghost" onClick={() => !isDeploying && setIsDeployDialogOpen(false)} disabled={isDeploying} className="text-gray-400 hover:text-white border-white/10 hover:bg-white/5">
                            {t.cancel}
                        </Button>
                        <Button onClick={handleDeploy} disabled={isDeploying} className="bg-primary text-black hover:bg-primary/90 font-bold uppercase tracking-widest px-6 shadow-lg shadow-primary/20">
                            {isDeploying ? t.deploying : t.deploy_now}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Pause Confirmation Dialog */}
            <Dialog open={isPauseDialogOpen} onOpenChange={setIsPauseDialogOpen}>
                <DialogContent className="sm:max-w-md bg-card/90 border-white/10 backdrop-blur-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-white uppercase tracking-widest flex items-center gap-2">
                            {isPaused ? <PlayCircle className="w-5 h-5 text-primary" /> : <PauseCircle className="w-5 h-5 text-amber-500" />}
                            {t.confirm_action} {isPaused ? t.resume : t.pause}
                        </DialogTitle>
                        <DialogDescription className="text-gray-400 mt-2">
                            {isPaused ? t.resume_description : t.pause_description}
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter className="flex justify-end gap-3 sm:justify-end mt-4">
                        <Button variant="ghost" onClick={() => !isActioning && setIsPauseDialogOpen(false)} disabled={isActioning} className="text-gray-400 hover:text-white border-white/10 hover:bg-white/5">
                            {t.cancel}
                        </Button>
                        <Button onClick={handlePauseResume} disabled={isActioning} className={`${isPaused ? 'bg-primary text-black hover:bg-primary/90 shadow-primary/20' : 'bg-amber-500 text-black hover:bg-amber-500/90 shadow-amber-500/20'} font-bold uppercase tracking-widest px-6 shadow-lg`}>
                            {isActioning ? (isPaused ? t.resuming : t.pausing) : (isPaused ? t.resume : t.pause)}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent className="sm:max-w-md bg-card/90 border-white/10 backdrop-blur-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-white uppercase tracking-widest flex items-center gap-2">
                            <Trash2 className="w-5 h-5 text-destructive" />
                            {t.confirm_disconnect}
                        </DialogTitle>
                        <DialogDescription className="text-gray-400 mt-2">
                            {t.confirm_disconnect_desc}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                            <p className="text-sm text-destructive font-bold">
                                {t.warning_active_forfeited}
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="flex justify-end gap-3 sm:justify-end">
                        <Button variant="ghost" onClick={() => !isActioning && setIsDeleteDialogOpen(false)} disabled={isActioning} className="text-gray-400 hover:text-white border-white/10 hover:bg-white/5">
                            {t.cancel}
                        </Button>
                        <Button onClick={handleDelete} disabled={isActioning} className="bg-destructive text-white hover:bg-destructive/90 font-bold uppercase tracking-widest px-6 shadow-lg shadow-destructive/20">
                            {isActioning ? t.deleting : t.confirm}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
