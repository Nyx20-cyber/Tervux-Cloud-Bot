"use client";

import { useState } from "react";
import { api, useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, Loader2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuthStore();
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await api.post("/auth/login", { email, password });
            login(res.data.token, res.data.user);
            toast.success("Login successful");
            router.push("/dashboard");
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Invalid credentials");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 animate-fade-in relative z-20">
            <div className="w-full max-w-md p-8 rounded-3xl border border-border bg-card/50 backdrop-blur-2xl shadow-2xl relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-primary/0 rounded-3xl blur opacity-20 z-0"></div>

                <div className="relative z-10 space-y-8">
                    <div className="text-center space-y-2">
                        <div className="flex justify-center mb-6">
                            <ShieldCheck className="h-12 w-12 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold text-white uppercase tracking-widest">Tervux Cloud Bot</h1>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sign in to your account</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-4">
                            <Input
                                type="email"
                                placeholder="EMAIL ADDRESS"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="h-12 bg-black/50 border-white/10 text-white placeholder:text-gray-600 focus-visible:ring-primary uppercase text-xs tracking-widest"
                                required
                            />
                            <div className="relative">
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="PASSWORD"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="h-12 bg-black/50 border-white/10 text-white placeholder:text-gray-600 focus-visible:ring-primary text-xs tracking-widest pr-10"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white transition-colors"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        <Button type="submit" disabled={isLoading} className="w-full h-12 bg-primary hover:bg-primary/90 text-black font-bold uppercase tracking-widest mt-6">
                            {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            {isLoading ? "Signing in..." : "Sign In"}
                        </Button>
                    </form>

                    <div className="text-center pt-2">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                            No account? <Link href="/register" className="text-primary hover:underline ml-1">Create one</Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
