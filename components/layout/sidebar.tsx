"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n/language-context";
import {
    LayoutDashboard,
    ClipboardList,
    ClipboardCheck,
    Factory,
    Package,
    Settings,
    ChevronLeft,
    ChevronRight,
    History,
    ArrowDownFromLine,
    ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SidebarProps {
    collapsed: boolean;
    setCollapsed: (collapsed: boolean) => void;
    onNavigate?: () => void;
}

export function Sidebar({ collapsed, setCollapsed, onNavigate }: SidebarProps) {
    const pathname = usePathname();
    const { t, lang } = useLanguage();

    const navigation = [
        { name: t.dashboard.label, href: "/",          icon: LayoutDashboard },
        { name: t.orderRequests,   href: "/request",     icon: ClipboardList   },
        { name: lang === 'th' ? "คำสั่งผลิต" : "Production Orders", href: "/production",  icon: ClipboardCheck  },
        { name: lang === 'th' ? "สถานี" : "Stations", href: "/stations",    icon: Factory         },
        { name: t.inventory,       href: "/inventory", icon: Package         },
        { name: t.withdrawals,     href: "/withdrawals",        icon: ArrowDownFromLine },
        { name: t.claims,          href: "/claims",             icon: ShieldAlert     },
        { name: t.logs,            href: "/logs",               icon: History         },
        { name: t.settings,        href: "/settings",           icon: Settings        },
    ];

    return (
        <div
            className={cn(
                "relative flex h-full flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300",
                collapsed ? "w-[80px]" : "w-[240px]"
            )}
        >
            <div className="flex shrink-0 h-[72px] items-center justify-between px-4 border-b">
                {!collapsed && (
                    <Link href="/" className="flex items-center justify-center w-full overflow-hidden">
                        <img
                            src="/logo.png"
                            alt="Standard Plus"
                            className="w-auto h-10 object-contain drop-shadow-sm"
                        />
                    </Link>
                )}
                {collapsed && (
                    <Link href="/" className="flex w-full justify-center overflow-hidden">
                        <img
                            src="/logonotname.png"
                            alt="Standard Plus"
                            className="w-8 h-8 sm:w-10 sm:h-10 object-contain drop-shadow-sm rounded-lg"
                        />
                    </Link>
                )}
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-2">
                {navigation.map((item) => {
                    const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={onNavigate}
                            className={cn(
                                "group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:hover:bg-[#E8601C]/10 dark:hover:text-[#E8601C] transition-all duration-200 border-r-[4px] border-transparent",
                                isActive
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground dark:bg-[#E8601C]/10 dark:text-[#E8601C] font-semibold border-sidebar-primary dark:border-[#E8601C]"
                                    : "text-sidebar-foreground/70",
                                collapsed ? "justify-center" : "justify-start"
                            )}
                            title={collapsed ? item.name : undefined}
                        >
                            <item.icon
                                className={cn(
                                    "flex-shrink-0 transition-colors",
                                    collapsed ? "h-5 w-5" : "h-5 w-5 mr-3",
                                    isActive ? "opacity-100" : "opacity-70 group-hover:opacity-100"
                                )}
                                aria-hidden="true"
                            />
                            {!collapsed && <span>{item.name}</span>}
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t flex justify-center">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCollapsed(!collapsed)}
                    className="text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 w-full flex justify-center h-9 rounded-lg transition-colors"
                    title={collapsed ? (lang === 'th' ? "ขยาย" : "Expand") : (lang === 'th' ? "ย่อ" : "Collapse")}
                >
                    {collapsed ? (
                        <ChevronRight className="h-4 w-4" />
                    ) : (
                        <div className="flex items-center gap-2 w-full justify-center">
                            <ChevronLeft className="h-4 w-4" />
                            <span className="text-xs font-medium">{lang === 'th' ? "ย่อเมนู" : "Collapse Menu"}</span>
                        </div>
                    )}
                </Button>
            </div>
        </div>
    );
}
