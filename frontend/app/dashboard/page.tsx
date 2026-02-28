"use client";

import { useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Activity, ShieldCheck, RefreshCcw, Network, PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import { useSessionStore } from "@/store/useSessionStore";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/store/useAuthStore";

export default function DashboardPage() {
    const { sessions, isLoading, fetchSessions } = useSessionStore();

    useEffect(() => {
        fetchSessions();
        const interval = setInterval(fetchSessions, 10000); // Polling every 10s
        return () => clearInterval(interval);
    }, [fetchSessions]);

    const activeSessionsCount = sessions.filter(s => s.status === "active").length;

    return (
        <DashboardLayout>
            <div className="space-y-8 animate-fade-in">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white uppercase flex items-center gap-3">
                        <Activity className="h-8 w-8 text-primary" />
                        COMMAND_CORE
                    </h1>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Centralized Control Interface</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col items-center text-center space-y-1 hover:bg-white/10 transition-colors cursor-default backdrop-blur-md">
                        <Activity className="h-4 w-4 text-gray-400 mb-1" />
                        <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Latency</p>
                        <p className="text-xs font-semibold text-white tracking-widest">14ms</p>
                    </div>
                    <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col items-center text-center space-y-1 hover:bg-white/10 transition-colors cursor-default backdrop-blur-md">
                        <ShieldCheck className="h-4 w-4 text-gray-400 mb-1" />
                        <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Encryption</p>
                        <p className="text-xs font-semibold text-white tracking-widest">AES-256</p>
                    </div>
                    <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col items-center text-center space-y-1 hover:bg-white/10 transition-colors cursor-default backdrop-blur-md">
                        <RefreshCcw className="h-4 w-4 text-gray-400 mb-1" />
                        <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Uptime</p>
                        <p className="text-xs font-semibold text-white tracking-widest">99.9%</p>
                    </div>
                    <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex flex-col items-center text-center space-y-1 hover:bg-primary/10 transition-colors cursor-default backdrop-blur-md">
                        <Network className="h-4 w-4 text-primary mb-1 animate-pulse" />
                        <p className="text-[8px] font-bold uppercase tracking-widest text-primary/70">Active Nodes</p>
                        <p className="text-xs font-bold text-primary tracking-widest">{activeSessionsCount}</p>
                    </div>
                </div>

                {/* Sessions List */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold tracking-tight text-white uppercase">Active_Uplinks</h2>
                    </div>

                    {isLoading && sessions.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-xs font-bold uppercase tracking-widest border border-white/10 border-dashed rounded-xl bg-white/5">
                            Scanning Network...
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="p-8 text-center border border-white/10 border-dashed rounded-xl bg-white/5 flex flex-col items-center space-y-3">
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">No Active Connections</p>
                            <Button asChild variant="outline" className="border-primary/50 text-white hover:text-black hover:bg-primary uppercase tracking-widest text-[10px]">
                                <Link href="/dashboard/pair">Establish Uplink</Link>
                            </Button>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {sessions.map(session => (
                                <SessionCard key={session._id} session={session} onUpdate={fetchSessions} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}

function SessionCard({ session, onUpdate }: { session: any, onUpdate: () => void }) {
    const isPaused = session.status === "paused";
    const isActive = session.status === "active";
    const isError = ["disconnected", "expired", "failed"].includes(session.status);

    const sub = session.subscriptionInfo || (session.subscription?.planId ? session.subscription : null);

    // For local sub object, resolve properly
    const planName = session.subscriptionInfo?.plan?.name || (session.subscription?.planId ? "Subscribed" : null);
    const expiresAt = session.subscriptionInfo?.expiresAt || session.subscription?.expiresAt;
    const isSubExpired = (session.subscriptionInfo?.isExpired) || (session.subscription?.status === "expired") || !planName;

    const handlePauseResume = async () => {
        try {
            const action = isPaused ? "resume" : "pause";
            await api.post(`/sessions/${session._id}/${action}`);
            toast.success(`Session ${action}d successfully`);
            onUpdate();
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Failed to pause/resume");
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to terminate this node forever?")) return;
        try {
            await api.delete(`/sessions/${session._id}`);
            toast.success("Node Terminated");
            onUpdate();
        } catch (error: any) {
            toast.error("Failed to delete session");
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
            {planName ? (
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
                    <div className="flex justify-between items-center text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                        <span>Plan</span>
                        <span className="text-white font-bold">{planName}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                        <span>Expires</span>
                        <span className={isSubExpired ? "text-destructive font-bold" : "text-primary font-bold"}>
                            {expiresAt ? format(new Date(expiresAt), "MMM dd, yyyy") : "N/A"}
                        </span>
                    </div>
                </div>
            ) : (
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">No Active Plan</p>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-auto pt-2">
                <Button
                    variant="outline" size="sm"
                    onClick={handlePauseResume}
                    className="flex-1 border-white/10 bg-white/5 hover:bg-white/10 text-[10px] uppercase font-bold tracking-widest h-8 text-white transition-colors"
                >
                    {isPaused ? <PlayCircle className="w-3 h-3 mr-2" /> : <PauseCircle className="w-3 h-3 mr-2" />}
                    {isPaused ? 'Resume' : 'Pause'}
                </Button>
                <Button
                    variant="outline" size="sm"
                    onClick={handleDelete}
                    className="w-8 border-destructive/20 bg-destructive/5 hover:bg-destructive/20 text-destructive p-0 h-8 transition-colors"
                >
                    <Trash2 className="w-3 h-3" />
                </Button>
            </div>
            {isSubExpired && (
                <Button asChild className="w-full bg-primary text-black font-bold uppercase tracking-widest text-[10px] h-8 mt-2 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
                    <Link href={`/dashboard/billing?session=${session._id}`}>Renew Subscription</Link>
                </Button>
            )}
        </div>
    )
}
