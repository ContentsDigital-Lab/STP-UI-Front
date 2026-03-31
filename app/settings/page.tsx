"use client";

import Link from "next/link";
import { UserCog, ShieldAlert, Users, Bell, Tag, DollarSign, Layers } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { hasPermission, Permission } from "@/lib/auth/permissions";

export default function SettingsPage() {
    const { user } = useAuth();

    const settingsItems: {
        href: string;
        title: string;
        description: string;
        icon: any;
        color: string;
        lockedIcon?: any;
        lockedTitle?: string;
        lockedDesc?: string;
        permission?: Permission;
        hideIfLocked?: boolean;
    }[] = [
        {
            href: "/settings/users",
            title: "User Management",
            description: "Manage administrators, managers, and factory workers. Set permissions and view user activity.",
            icon: UserCog,
            color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10",
            lockedIcon: ShieldAlert,
            lockedTitle: "User Management",
            lockedDesc: "คุณไม่มีสิทธิ์เข้าถึงการจัดการผู้ใช้ จำเป็นต้องมีสิทธิ์ระดับ Administrator หรือ Manager",
            permission: "users:view",
        },
        {
            href: "/settings/customers",
            title: "Customer Management",
            description: "Manage customer records, contact details, and discount rates.",
            icon: Users,
            color: "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10",
            lockedIcon: Users,
            lockedTitle: "Customer Management",
            lockedDesc: "คุณไม่มีสิทธิ์เข้าถึงการจัดการลูกค้า",
            permission: "settings:view", // Using settings:view as a general check for now
        },
        {
            href: "/settings/notifications",
            title: "การแจ้งเตือนเซ็นเซอร์",
            description: "ตั้งค่าระดับเสียงและการแจ้งเตือนต่างๆ ให้เหมาะกับการทำงานของคุณ",
            icon: Bell,
            color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
        },
        {
            href: "/settings/pricing",
            title: "ตั้งค่าราคากระจก",
            description: "กำหนดราคาต่อตารางฟุต และค่าบริการเพิ่มเติม เช่น เจียร เจาะ บาก",
            icon: DollarSign,
            color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
            lockedIcon: DollarSign,
            lockedTitle: "ตั้งค่าราคากระจก",
            lockedDesc: "คุณไม่มีสิทธิ์เข้าถึงการตั้งค่าราคา",
            permission: "settings:manage",
        },
        {
            href: "/settings/job-types",
            title: "จัดการลักษณะงาน",
            description: "กำหนดประเภทงานกระจก เช่น ลามิเนต เทมเปอร์ พร้อมจำนวนแผ่นกระจกดิบที่ใช้ต่อช่อง",
            icon: Layers,
            color: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10",
            lockedIcon: Layers,
            lockedTitle: "จัดการลักษณะงาน",
            lockedDesc: "คุณไม่มีสิทธิ์เข้าถึงการจัดการประเภทงาน",
            permission: "settings:manage",
        },
        {
            href: "/settings/sticker",
            title: "ออกแบบสติ๊กเกอร์",
            description: "จัดการเทมเพลตสติ๊กเกอร์บาร์โค้ด สินค้าและบรรจุภัณฑ์ สำหรับการผลิต",
            icon: Tag,
            color: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10",
            permission: "settings:manage",
            hideIfLocked: true,
        }
    ];

    return (
        <div className="space-y-6 max-w-[1440px] mx-auto w-full">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">การตั้งค่าระบบ</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    จัดการผู้ใช้งาน ข้อมูลลูกค้า และตั้งค่าพารามิเตอร์ของระบบทั้งหมด
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {settingsItems.map((item, idx) => {
                    const isLocked = item.permission && !hasPermission(user, item.permission);

                    if (isLocked && item.hideIfLocked) {
                        return null;
                    }

                    if (isLocked) {
                        const Icon = item.lockedIcon || ShieldAlert;
                        return (
                            <div key={idx} className="rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 p-5 h-full opacity-60 grayscale">
                                <div className="h-10 w-10 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 flex items-center justify-center mb-4">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">
                                    {item.lockedTitle}
                                </h3>
                                <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
                                    {item.lockedDesc}
                                </p>
                            </div>
                        );
                    }

                    const Icon = item.icon;
                    return (
                        <Link key={idx} href={item.href} className="block h-full group outline-none">
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 p-5 h-full transition-all duration-200 group-hover:border-blue-200 dark:group-hover:border-slate-700 group-hover:shadow-sm ring-2 ring-transparent group-focus-visible:ring-blue-500">
                                <div className={`h-10 w-10 rounded-lg flex items-center justify-center mb-4 ${item.color}`}>
                                    <Icon className="h-5 w-5" />
                                </div>
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-1">
                                    {item.title}
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
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
