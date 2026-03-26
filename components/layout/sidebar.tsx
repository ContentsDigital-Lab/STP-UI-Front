"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n/language-context";
import { useAuth } from "@/lib/auth/auth-context";
import {
    LayoutDashboard,
    ClipboardList,
    ClipboardCheck,
    Factory,
    Package,
    Settings,
    History,
    ArrowDownFromLine,
    ShieldAlert,
    PanelLeftClose,
    PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
    collapsed: boolean;
    setCollapsed: (collapsed: boolean) => void;
    onNavigate?: () => void;
}

interface NavItem {
    name: string;
    href: string;
    icon: React.ElementType;
}

interface NavSection {
    label: string;
    items: NavItem[];
}

export function Sidebar({ collapsed, setCollapsed, onNavigate }: SidebarProps) {
    const pathname = usePathname();
    const { t, lang } = useLanguage();
    const { user } = useAuth();
    const isManager = user?.role === "admin" || user?.role === "manager";

    const sections: NavSection[] = [
        {
            label: lang === "th" ? "ภาพรวม" : "Overview",
            items: [
                { name: t.dashboard.label, href: "/", icon: LayoutDashboard },
            ],
        },
        {
            label: lang === "th" ? "การดำเนินงาน" : "Operations",
            items: [
                ...(isManager
                    ? [{ name: t.orderRequests, href: "/request", icon: ClipboardList }]
                    : []),
                {
                    name: lang === "th" ? "ติดตามการผลิต" : "Production",
                    href: "/production",
                    icon: ClipboardCheck,
                },
                {
                    name: lang === "th" ? "สถานี" : "Stations",
                    href: "/stations",
                    icon: Factory,
                },
            ],
        },
        {
            label: lang === "th" ? "คลังสินค้า" : "Warehouse",
            items: [
                { name: t.inventory, href: "/inventory", icon: Package },
                { name: t.withdrawals, href: "/withdrawals", icon: ArrowDownFromLine },
                { name: t.claims, href: "/claims", icon: ShieldAlert },
            ],
        },
        {
            label: lang === "th" ? "ระบบ" : "System",
            items: [
                { name: t.logs, href: "/logs", icon: History },
                { name: t.settings, href: "/settings", icon: Settings },
            ],
        },
    ];

    return (
        <div
            className={cn(
                "relative flex h-full flex-col border-r border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 transition-[width] duration-200 ease-out",
                collapsed ? "w-[4.25rem]" : "w-[15.5rem]",
            )}
        >
            {/* Logo */}
            <div className="flex shrink-0 h-14 items-center border-b border-slate-100 dark:border-slate-800/60 px-4">
                <Link
                    href="/"
                    className="flex items-center gap-3 overflow-hidden"
                    onClick={onNavigate}
                >
                    <img
                        src="/logonotname.png"
                        alt="Standard Plus"
                        className="h-8 w-8 shrink-0"
                    />
                    {!collapsed && (
                        <span className="text-[0.9375rem] font-bold text-slate-900 dark:text-white tracking-tight whitespace-nowrap">
                            Standard<span className="text-orange-500">Plus</span>
                        </span>
                    )}
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2.5">
                {sections.map((section, sIdx) => {
                    if (section.items.length === 0) return null;
                    return (
                        <div key={section.label} className={cn(sIdx > 0 && "mt-5")}>
                            {/* Section label */}
                            {!collapsed && (
                                <p className="px-2.5 mb-1.5 text-[0.6875rem] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                    {section.label}
                                </p>
                            )}
                            {collapsed && sIdx > 0 && (
                                <div className="mx-3 mb-2.5 h-px bg-slate-100 dark:bg-slate-800" />
                            )}

                            {/* Items */}
                            <div className="space-y-0.5">
                                {section.items.map((item) => {
                                    const isActive =
                                        item.href === "/"
                                            ? pathname === "/"
                                            : pathname.startsWith(item.href);
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={onNavigate}
                                            title={collapsed ? item.name : undefined}
                                            className={cn(
                                                "group relative flex items-center rounded-lg text-[0.8125rem] font-medium transition-colors duration-100",
                                                collapsed
                                                    ? "h-10 w-10 mx-auto justify-center"
                                                    : "h-9 px-2.5 gap-2.5",
                                                isActive
                                                    ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                                                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200",
                                            )}
                                        >
                                            {/* Active indicator */}
                                            {isActive && !collapsed && (
                                                <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-blue-600 dark:bg-blue-400" />
                                            )}
                                            <item.icon
                                                className={cn(
                                                    "shrink-0",
                                                    collapsed ? "h-[1.125rem] w-[1.125rem]" : "h-4 w-4",
                                                )}
                                                strokeWidth={isActive ? 2.2 : 1.8}
                                            />
                                            {!collapsed && (
                                                <span className="truncate">{item.name}</span>
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </nav>

            {/* Collapse toggle */}
            <div className="shrink-0 border-t border-slate-100 dark:border-slate-800/60 p-2.5">
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className={cn(
                        "flex items-center rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors duration-100",
                        collapsed
                            ? "h-10 w-10 mx-auto justify-center"
                            : "h-9 w-full px-2.5 gap-2.5",
                    )}
                    title={
                        collapsed
                            ? lang === "th" ? "ขยาย" : "Expand"
                            : lang === "th" ? "ย่อเมนู" : "Collapse"
                    }
                >
                    {collapsed ? (
                        <PanelLeftOpen className="h-4 w-4" strokeWidth={1.8} />
                    ) : (
                        <>
                            <PanelLeftClose className="h-4 w-4" strokeWidth={1.8} />
                            <span className="text-[0.8125rem] font-medium">
                                {lang === "th" ? "ย่อเมนู" : "Collapse"}
                            </span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
