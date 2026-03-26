"use client";

import Link from "next/link";
import { UserCog, ShieldAlert, Users, Bell, Tag, Settings, DollarSign } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";

export default function SettingsPage() {
    const { user } = useAuth();
    const hasUserManagementAccess = user?.role === "admin" || user?.role === "manager";

    const settngsItems = [
        {
            href: "/settings/users",
            title: "User Management",
            description: "Manage administrators, managers, and factory workers. Set permissions and view user activity.",
            icon: UserCog,
            color: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
            lockedIcon: ShieldAlert,
            lockedTitle: "User Management",
            lockedDesc: "You do not have permission to access user management. Administrator or Manager access is required.",
            requireAccess: true,
        },
        {
            href: "/settings/customers",
            title: "Customer Management",
            description: "Manage customer records, contact details, and discount rates.",
            icon: Users,
            color: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
            lockedIcon: Users,
            lockedTitle: "Customer Management",
            lockedDesc: "You do not have permission to access customer management. Administrator or Manager access is required.",
            requireAccess: true,
        },
        {
            href: "/settings/notifications",
            title: "การแจ้งเตือนเซ็นเซอร์",
            description: "ตั้งค่าระดับเสียงและการแจ้งเตือนต่างๆ ให้เหมาะกับการทำงานของคุณ",
            icon: Bell,
            color: "bg-yellow-50 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-400",
            requireAccess: false,
        },
        {
            href: "/settings/pricing",
            title: "ตั้งค่าราคากระจก",
            description: "กำหนดราคาต่อตารางฟุต และค่าบริการเพิ่มเติม เช่น เจียร เจาะ บาก",
            icon: DollarSign,
            color: "bg-orange-50 text-[#E8601C] dark:bg-[#E8601C]/10 dark:text-[#E8601C]",
            lockedIcon: DollarSign,
            lockedTitle: "ตั้งค่าราคากระจก",
            lockedDesc: "You do not have permission to access pricing settings. Administrator or Manager access is required.",
            requireAccess: true,
        },
        {
            href: "/settings/sticker",
            title: "ออกแบบสติ๊กเกอร์",
            description: "จัดการเทมเพลตสติ๊กเกอร์บาร์โค้ด สินค้าและบรรจุภัณฑ์ สำหรับการผลิต",
            icon: Tag,
            color: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
            requireAccess: true,
            hideIfLocked: true,
        }
    ];

    return (
        <div className="flex flex-col gap-6 sm:gap-8 max-w-[1600px] mx-auto w-full pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
                <div>
                    <h1 className="flex items-center gap-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-800 dark:text-white leading-normal pt-1 pb-1">
                        <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                            <Settings className="h-6 w-6 shrink-0" />
                        </div>
                        การตั้งค่าระบบ
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base font-semibold mt-2">
                        จัดการผู้ใช้งาน ข้อมูลลูกค้า และตั้งค่าพารามิเตอร์ของระบบทั้งหมด
                    </p>
                </div>
            </div>

            <div className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3 pb-8">
                {settngsItems.map((item, idx) => {
                    const isLocked = item.requireAccess && !hasUserManagementAccess;

                    if (isLocked && item.hideIfLocked) {
                        return null;
                    }

                    if (isLocked) {
                        const Icon = item.lockedIcon || ShieldAlert;
                        return (
                            <div key={idx} className="rounded-3xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 p-6 sm:p-8 space-y-4 h-full opacity-70 grayscale">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-2xl bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
                                        <Icon className="h-6 w-6" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-600 dark:text-slate-300">
                                        {item.lockedTitle}
                                    </h3>
                                </div>
                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                                    {item.lockedDesc}
                                </p>
                            </div>
                        );
                    }

                    const Icon = item.icon;
                    return (
                        <Link key={idx} href={item.href} className="block h-full cursor-pointer group outline-none">
                            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none p-6 sm:p-8 space-y-4 h-full transition-all duration-300 group-hover:scale-[1.03] group-hover:shadow-2xl group-hover:border-blue-200 dark:group-hover:border-slate-700 ring-4 ring-transparent group-focus-visible:ring-blue-500 dark:group-focus-visible:ring-[#E8601C]">
                                <div className="flex items-center gap-4">
                                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110 ${item.color}`}>
                                        <Icon className="h-6 w-6" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-[#E8601C] transition-colors">
                                        {item.title}
                                    </h3>
                                </div>
                                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
                                    {item.description}
                                </p>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
