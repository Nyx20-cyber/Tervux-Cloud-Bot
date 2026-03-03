"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ShieldCheck, Network, PauseCircle, PlayCircle, Trash2, Rocket, Coins } from "lucide-react";
import { useSessionStore } from "@/store/useSessionStore";
import { useAuthStore } from "@/store/useAuthStore";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { format, differenceInDays } from "date-fns";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/store/useAuthStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export default function DeploymentsPage() {
    const { sessions, isLoading, fetchSessions, updateSessionLocally } = useSessionStore();
    const { user } = useAuthStore();

    useEffect(() => {
        fetchSessions();

        const socket = io({
            auth: { token: localStorage.getItem("token") }
        });

        socket.on("session_update", (data) => {
            updateSessionLocally(data.sessionId, { status: data.status });
        });

        return () => {
            socket.disconnect();
        };
    }, [fetchSessions, updateSessionLocally]);

    return (
        <DashboardLayout>
            <div className="space-y-8 animate-fade-in">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight text-white uppercase flex items-center gap-3">
                            <ShieldCheck className="h-8 w-8 text-primary" />
                            Deployments
                        </h1>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Manage, Pause, or Deploy Bots</p>
                    </div>
                    <div className="flex items-center gap-3 bg-white/5 border border-white/10 p-3 rounded-2xl backdrop-blur-md">
                        <div className="p-2 rounded-xl bg-yellow-500/20 text-yellow-500">
                            <Coins className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Available Coins 🪙</p>
                            <p className="text-sm font-bold text-white tracking-widest">{user?.coins || 0}</p>
                        </div>
                    </div>
                </div>

                {/* Sessions List */}
                <div className="space-y-4">
                    {isLoading && sessions.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-xs font-bold uppercase tracking-widest border border-white/10 border-dashed rounded-xl bg-white/5">
                            Loading deployments...
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="p-8 text-center border border-white/10 border-dashed rounded-xl bg-white/5 flex flex-col items-center space-y-3">
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">No Paired Devices Found</p>
                            <Button asChild variant="outline" className="border-primary/50 text-white hover:text-black hover:bg-primary uppercase tracking-widest text-[10px]">
                                <Link href="/dashboard/pair">Connect New Device</Link>
                            </Button>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
    const { updateSessionLocally, fetchSessions } = useSessionStore();
    const { checkAuth } = useAuthStore();
    const [isDeploying, setIsDeploying] = useState(false);
    const isPaused = session.status === "paused";
    const isActive = session.status === "active";
    const isError = ["disconnected", "expired", "failed"].includes(session.status);
    const isDeployed = !!session.expiresAt;
    const remainingDays = session.expiresAt ? differenceInDays(new Date(session.expiresAt), new Date()) : null;
    const isSubExpired = !isDeployed || (remainingDays !== null && remainingDays < 0);

    const [isDeployDialogOpen, setIsDeployDialogOpen] = useState(false);
    const [isPauseDialogOpen, setIsPauseDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isActioning, setIsActioning] = useState(false);

    const handleDeploy = async () => {
        setIsDeploying(true);
        try {
            const res = await api.post(`/sessions/${session._id}/deploy`);
            toast.success(res.data.message || "Bot deployed successfully!");
            // Refresh sessions to get new status
            fetchSessions();
            // Refresh user for updated coin balance
            useAuthStore.getState().updateCoins(res.data.coins);
            setIsDeployDialogOpen(false);
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Failed to deploy bot. Check coin 🪙 balance.");
        } finally {
            setIsDeploying(false);
        }
    };

    const handlePauseResume = async () => {
        setIsActioning(true);
        const action = isPaused ? "resume" : "pause";
        const targetStatus = isPaused ? "active" : "paused";

        // Optimistic update
        updateSessionLocally(session._id, { status: targetStatus });

        try {
            await api.post(`/sessions/${session._id}/${action}`);
            toast.success(`Connection ${action}d`);
            setIsPauseDialogOpen(false);
        } catch (error: any) {
            // Rollback on error
            updateSessionLocally(session._id, { status: session.status });
            toast.error(error.response?.data?.error || "Action failed");
        } finally {
            setIsActioning(false);
        }
    };

    const handleDelete = async () => {
        setIsActioning(true);
        try {
            await api.delete(`/sessions/${session._id}`);
            toast.success("Device disconnected");
            fetchSessions();
            setIsDeleteDialogOpen(false);
        } catch (error: any) {
            toast.error("Failed to delete session");
        } finally {
            setIsActioning(false);
        }
    };

    return (
        <div className={`p-5 rounded-2xl border ${isActive ? 'border-primary/30 bg-primary/5' : isError ? 'border-destructive/30 bg-destructive/5' : isPaused ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10 bg-white/5'} flex flex-col gap-4 backdrop-blur-md transition-all`}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isActive ? 'bg-primary/20 text-primary' : isError ? 'bg-destructive/20 text-destructive' : isPaused ? 'bg-amber-500/20 text-amber-500' : 'bg-gray-500/20 text-gray-500'}`}>
                        <Network className="w-4 h-4" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white tracking-widest">{session.phone || 'Unknown'}</p>
                        <p className={`text-[9px] font-bold uppercase tracking-widest ${isActive ? 'text-primary' : isError ? 'text-destructive' : isPaused ? 'text-amber-500' : 'text-gray-500'}`}>
                            {session.status}
                        </p>
                    </div>
                </div>
            </div>

            {/* Sub Info */}
            {isDeployed ? (
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex flex-col items-center justify-center gap-1">
                    <p className="text-[10px] text-primary font-bold uppercase tracking-widest">Deployed to Node</p>
                    {remainingDays !== null && (
                        <p className={`text-[9px] font-bold uppercase tracking-widest ${remainingDays > 5 ? 'text-gray-400' : 'text-amber-500'}`}>
                            {remainingDays > 0 ? `${remainingDays} Day${remainingDays === 1 ? '' : 's'} Remaining` : 'Expiring Today'}
                        </p>
                    )}
                </div>
            ) : (
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex flex-col items-center justify-center gap-1">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Awaiting Deployment</p>
                    <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Lifetime Validation</p>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-auto pt-2">
                <Button
                    variant="outline" size="sm"
                    onClick={() => setIsPauseDialogOpen(true)}
                    className="flex-1 border-white/10 bg-white/5 hover:bg-white/10 text-[10px] uppercase font-bold tracking-widest h-8 text-white transition-colors"
                >
                    {isPaused ? <PlayCircle className="w-3 h-3 mr-2" /> : <PauseCircle className="w-3 h-3 mr-2" />}
                    {isPaused ? 'Resume' : 'Pause'}
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
                    className="w-full bg-primary text-black font-bold uppercase tracking-widest text-[10px] h-8 mt-2 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                >
                    <Rocket className="w-3 h-3 mr-2" />
                    Deploy Bot (50 Coins 🪙)
                </Button>
            )}

            {/* Deploy Confirmation Dialog */}
            <Dialog open={isDeployDialogOpen} onOpenChange={setIsDeployDialogOpen}>
                <DialogContent className="sm:max-w-md bg-card/90 border-white/10 backdrop-blur-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-white uppercase tracking-widest flex items-center gap-2">
                            <Rocket className="w-5 h-5 text-primary" />
                            Confirm Deployment
                        </DialogTitle>
                        <DialogDescription className="text-gray-400 mt-2">
                            You are about to deploy this device. This will allow the bot to respond to commands and manage groups automatically.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 space-y-2">
                            <p className="text-sm text-gray-300">
                                <strong className="text-primary font-bold">Cost:</strong> 50 Coins 🪙
                            </p>
                            <p className="text-sm text-gray-300">
                                <strong className="text-primary font-bold">Duration:</strong> 28 Days
                            </p>
                            <p className="text-[10px] uppercase tracking-widest text-primary/80 font-bold mt-2">
                                Note: This active session will remain deployed for exactly 28 days before requiring renewal.
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="flex justify-end gap-3 sm:justify-end">
                        <Button variant="ghost" onClick={() => !isDeploying && setIsDeployDialogOpen(false)} disabled={isDeploying} className="text-gray-400 hover:text-white border-white/10 hover:bg-white/5">
                            Cancel
                        </Button>
                        <Button onClick={handleDeploy} disabled={isDeploying} className="bg-primary text-black hover:bg-primary/90 font-bold uppercase tracking-widest px-6 shadow-lg shadow-primary/20">
                            {isDeploying ? 'Deploying...' : 'Deploy Now'}
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
                            Confirm {isPaused ? 'Resume' : 'Pause'}
                        </DialogTitle>
                        <DialogDescription className="text-gray-400 mt-2">
                            {isPaused
                                ? "Resuming this device will reconnect it to the WhatsApp network and allow it to respond to commands again."
                                : "Pausing this device will temporarily stop it from responding to messages and commands. You can resume it at any time."
                            }
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter className="flex justify-end gap-3 sm:justify-end mt-4">
                        <Button variant="ghost" onClick={() => !isActioning && setIsPauseDialogOpen(false)} disabled={isActioning} className="text-gray-400 hover:text-white border-white/10 hover:bg-white/5">
                            Cancel
                        </Button>
                        <Button onClick={handlePauseResume} disabled={isActioning} className={`${isPaused ? 'bg-primary text-black hover:bg-primary/90 shadow-primary/20' : 'bg-amber-500 text-black hover:bg-amber-500/90 shadow-amber-500/20'} font-bold uppercase tracking-widest px-6 shadow-lg`}>
                            {isActioning ? (isPaused ? 'Pausing...' : 'Resuming...') : (isPaused ? 'Resume' : 'Pause')}
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
                            Confirm Disconnect
                        </DialogTitle>
                        <DialogDescription className="text-gray-400 mt-2">
                            Are you sure you want to disconnect and delete this device? This action cannot be undone. You will lose any remaining deployment time on this node.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                            <p className="text-sm text-destructive font-bold">
                                Warning: Any active deployment will be forfeited!
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="flex justify-end gap-3 sm:justify-end">
                        <Button variant="ghost" onClick={() => !isActioning && setIsDeleteDialogOpen(false)} disabled={isActioning} className="text-gray-400 hover:text-white border-white/10 hover:bg-white/5">
                            Cancel
                        </Button>
                        <Button onClick={handleDelete} disabled={isActioning} className="bg-destructive text-white hover:bg-destructive/90 font-bold uppercase tracking-widest px-6 shadow-lg shadow-destructive/20">
                            {isActioning ? 'Deleting...' : 'Delete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
