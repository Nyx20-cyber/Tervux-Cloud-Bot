import { useAuthStore } from "@/store/useAuthStore";
import { LogOut, User as UserIcon, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
    const { user, logout } = useAuthStore();
    return (
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-xl flex items-center justify-between px-4 lg:px-8 z-20 relative">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" className="lg:hidden text-white" onClick={onMenuClick}>
                    <Menu className="h-5 w-5" />
                </Button>
                <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 border border-primary/10 backdrop-blur-md">
                    <div className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
                    </div>
                    <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-primary">Service Online</span>
                </div>
            </div>

            <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                    <UserIcon className="h-3 w-3 text-gray-400" />
                    <span className="text-[10px] font-bold tracking-widest text-gray-300 uppercase truncate max-w-[120px]">{user?.email || "User"}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => logout()} className="text-gray-400 hover:text-white hover:bg-white/10 group h-8 rounded-full border border-transparent hover:border-white/10">
                    <LogOut className="h-3 w-3 mr-2 group-hover:text-destructive transition-colors" />
                    <span className="text-[10px] font-bold uppercase tracking-widest group-hover:text-destructive transition-colors">Logout</span>
                </Button>
            </div>
        </header>
    );
}
