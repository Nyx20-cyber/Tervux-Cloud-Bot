import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Network, CircleDollarSign, ShieldCheck, Activity } from 'lucide-react';
import { DialogTitle } from '@radix-ui/react-dialog';

export function Sidebar({ isMobile }: { isMobile?: boolean }) {
    const pathname = usePathname();

    const links = [
        { href: '/dashboard', label: 'Overview', icon: Activity },
        { href: '/dashboard/pair', label: 'Connect Device', icon: Network },
        { href: '/dashboard/deployments', label: 'Deployments', icon: ShieldCheck },
        { href: '/dashboard/billing', label: 'Coins 🪙', icon: CircleDollarSign },
    ];

    const content = (
        <div className="flex flex-col h-full w-full">
            <div className="p-6">
                {isMobile && <DialogTitle className="sr-only">Navigation Menu</DialogTitle>}
                <h2 className="text-xl font-semibold tracking-tight text-white flex items-center gap-3 uppercase">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    Tervux Cloud
                </h2>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mt-1">
                    Securely connected
                </p>
            </div>

            <nav className="flex-1 px-4 space-y-2 mt-4">
                {links.map((link) => {
                    const isActive = pathname === link.href;
                    const Icon = link.icon;
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${isActive
                                ? 'bg-primary/10 border border-primary/20 text-primary'
                                : 'bg-white/5 border border-transparent hover:bg-white/10 hover:border-white/10 text-gray-400 hover:text-white'
                                }`}
                        >
                            <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-gray-500 group-hover:text-primary'}`} />
                            <span className="text-xs font-bold uppercase tracking-widest">{link.label}</span>
                        </Link>
                    )
                })}
            </nav>

            <div className="p-4 mt-auto">
                <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex flex-col items-center text-center space-y-1">
                    <Activity className="h-4 w-4 text-primary animate-pulse mb-1" />
                    <p className="text-[8px] font-bold uppercase tracking-widest text-primary/70">Service Status</p>
                    <p className="text-[10px] font-black text-primary tracking-widest">ONLINE</p>
                </div>
            </div>
        </div>
    );

    if (isMobile) {
        return content;
    }

    return (
        <aside className="w-64 border-r border-border bg-card/50 backdrop-blur-xl h-full flex flex-col hidden lg:flex">
            {content}
        </aside>
    );
}
