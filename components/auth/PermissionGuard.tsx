"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PermissionGuardProps {
    permission: string | string[];
    children: React.ReactNode;
    redirectTo?: string;
    showErrorScreen?: boolean;
}

export function PermissionGuard({
    permission,
    children,
    redirectTo,
    showErrorScreen = true,
}: PermissionGuardProps) {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const slug = user?.role && typeof user.role === 'object' ? user.role.slug : user?.role;
    const isAuthorized = !!(slug === "admin" || 
        (user && (Array.isArray(permission) 
            ? permission.some(p => hasPermission(user, p)) 
            : hasPermission(user, permission))));

    useEffect(() => {
        if (!isLoading && !isAuthorized && redirectTo) {
            router.replace(redirectTo);
        }
    }, [isLoading, isAuthorized, redirectTo, router]);

    if (isLoading) {
        return (
            <div className="flex h-[80vh] w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!isAuthorized) {
        if (redirectTo) {
            return null; // Will redirect
        }

        if (showErrorScreen) {
            return (
                <div className="flex flex-col items-center justify-center py-20 px-4 space-y-4 max-w-md mx-auto text-center">
                    <div className="p-4 rounded-3xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                        <ShieldAlert className="h-12 w-12 text-red-500" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="font-bold text-xl text-slate-900 dark:text-white">ไม่มีสิทธิ์เข้าถึงหน้านี้</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">บทบาทของคุณไม่ได้รับอนุญาตให้ใช้งานส่วนนี้ กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์การเข้าถึง</p>
                    </div>
                    <Button variant="outline" className="rounded-xl px-5 h-11 font-bold border-slate-200 dark:border-slate-800" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        ย้อนกลับ
                    </Button>
                </div>
            );
        }

        return null;
    }

    return <>{children}</>;
}
