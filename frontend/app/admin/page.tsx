"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Users, CreditCard, Network, AlertTriangle } from "lucide-react";
import { api, useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

export default function AdminDashboard() {
    const { user } = useAuthStore();
    const router = useRouter();
    const [stats, setStats] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (user && user.role !== "admin") {
            router.replace("/dashboard");
            return;
        }

        api.get("/admin/stats")
            .then(res => {
                setStats(res.data);
                setIsLoading(false);
            })
            .catch(err => {
                console.error(err);
                setIsLoading(false);
            });
    }, [user, router]);

    if (!user || user.role !== "admin") return null;

    return (
        <DashboardLayout>
            <div className="space-y-8 animate-fade-in">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white uppercase flex items-center gap-3">
                        <AlertTriangle className="h-8 w-8 text-destructive" />
                        OVERSEER_TERMINAL
                    </h1>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Classified Administrative Access</p>
                </div>

                {isLoading ? (
                    <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 text-destructive animate-spin" /></div>
                ) : (
                    <>
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col items-center text-center space-y-1 backdrop-blur-md">
                                <Users className="h-4 w-4 text-gray-400 mb-1" />
                                <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Total Users</p>
                                <p className="text-xs font-semibold text-white tracking-widest">{stats?.totalUsers || 0}</p>
                            </div>
                            <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col items-center text-center space-y-1 backdrop-blur-md">
                                <Network className="h-4 w-4 text-gray-400 mb-1" />
                                <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Active Nodes</p>
                                <p className="text-xs font-semibold text-white tracking-widest">{stats?.activeSessions || 0}</p>
                            </div>
                            <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex flex-col items-center text-center space-y-1 backdrop-blur-md">
                                <CreditCard className="h-4 w-4 text-primary mb-1 animate-pulse" />
                                <p className="text-[8px] font-bold uppercase tracking-widest text-primary/70">Revenue (30d)</p>
                                <p className="text-xs font-bold text-primary tracking-widest">{stats?.recentRevenue || 0} TZS</p>
                            </div>
                        </div>

                        {/* Recent Payments Table */}
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold tracking-tight text-white uppercase">Recent_Transactions</h2>
                            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden backdrop-blur-sm">
                                <table className="w-full text-sm text-left text-gray-400">
                                    <thead className="text-[10px] text-gray-500 uppercase tracking-widest bg-white/5 border-b border-white/10">
                                        <tr>
                                            <th className="px-6 py-4 font-bold">Ref ID</th>
                                            <th className="px-6 py-4 font-bold">Node</th>
                                            <th className="px-6 py-4 font-bold">Amount</th>
                                            <th className="px-6 py-4 font-bold">Status</th>
                                            <th className="px-6 py-4 font-bold">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {stats?.recentPayments?.map((p: any) => (
                                            <tr key={p._id} className="hover:bg-white/5 transition-colors">
                                                <td className="px-6 py-4 text-white font-mono text-[10px]">{p.transactionId || p._id.slice(-8)}</td>
                                                <td className="px-6 py-4 text-xs font-bold">{p.sessionId?.phone || p.sessionId}</td>
                                                <td className="px-6 py-4 text-primary font-black tracking-widest text-xs">{p.amount}</td>
                                                <td className="px-6 py-4 uppercase text-[10px] font-bold">
                                                    <span className={p.status === 'completed' ? 'text-primary' : p.status === 'failed' ? 'text-destructive' : 'text-amber-500'}>
                                                        {p.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-[10px] tracking-widest">{format(new Date(p.createdAt), "MMM dd, HH:mm")}</td>
                                            </tr>
                                        ))}
                                        {(!stats?.recentPayments || stats.recentPayments.length === 0) && (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-8 text-center text-xs font-bold uppercase tracking-widest text-gray-500">
                                                    No recent transactions found
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}
