"use client";

import Link from "next/link";
import { UserCog, ShieldAlert, Users, Bell, Tag, Settings } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/auth-context";

export default function SettingsPage() {
    const { user } = useAuth();

    // Only admin and manager should see the user management card
    const hasUserManagementAccess = user?.role === "admin" || user?.role === "manager";

    return (
        <div className="flex flex-col gap-4 sm:gap-6 lg:gap-8 max-w-[1600px] mx-auto w-full overflow-x-hidden">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
                <div>
                    <h1 className="flex items-center gap-3 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-normal pt-2 pb-1">
                        <Settings className="h-7 w-7 sm:h-8 sm:w-8 shrink-0" />
                        Settings</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base font-medium mt-1">Manage your application preferences and system settings.</p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {hasUserManagementAccess ? (
                    <Link href="/settings/users" className="block h-full cursor-pointer transition-transform hover:scale-[1.02]">
                        <Card className="h-full shadow-sm hover:shadow-md transition-shadow bg-card/60 backdrop-blur-sm border-muted/50 border-primary/20">
                            <CardHeader>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                        <UserCog className="h-6 w-6" />
                                    </div>
                                    <CardTitle className="text-xl">User Management</CardTitle>
                                </div>
                                <CardDescription>
                                    Manage administrators, managers, and factory workers. Set permissions and view user activity.
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>
                ) : (
                    <Card className="h-full shadow-sm opacity-60">
                        <CardHeader>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-muted rounded-lg text-muted-foreground">
                                    <ShieldAlert className="h-6 w-6" />
                                </div>
                                <CardTitle className="text-xl text-muted-foreground">User Management</CardTitle>
                            </div>
                            <CardDescription>
                                You do not have permission to access user management. Administrator or Manager access is required.
                            </CardDescription>
                        </CardHeader>
                    </Card>
                )}

                <Link href="/settings/customers" className="block h-full cursor-pointer transition-transform hover:scale-[1.02]">
                    <Card className="h-full shadow-sm hover:shadow-md transition-shadow bg-card/60 backdrop-blur-sm border-muted/50 border-primary/20">
                        <CardHeader>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-accent/10 rounded-lg text-accent">
                                    <Users className="h-6 w-6" />
                                </div>
                                <CardTitle className="text-xl">Customer Management</CardTitle>
                            </div>
                            <CardDescription>
                                Manage customer records, contact details, and discount rates.
                            </CardDescription>
                        </CardHeader>
                    </Card>
                </Link>

                <Link href="/settings/notifications" className="block h-full cursor-pointer transition-transform hover:scale-[1.02]">
                    <Card className="h-full shadow-sm hover:shadow-md transition-shadow bg-card/60 backdrop-blur-sm border-muted/50 border-primary/20">
                        <CardHeader>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500">
                                    <Bell className="h-6 w-6" />
                                </div>
                                <CardTitle className="text-xl">การแจ้งเตือน</CardTitle>
                            </div>
                            <CardDescription>
                                ตั้งค่าเสียงแจ้งเตือนและระดับเสียงตามความสำคัญของการแจ้งเตือน
                            </CardDescription>
                        </CardHeader>
                    </Card>
                </Link>

                {hasUserManagementAccess ? (
                    <Link href="/settings/sticker" className="block h-full cursor-pointer transition-transform hover:scale-[1.02]">
                        <Card className="h-full shadow-sm hover:shadow-md transition-shadow bg-card/60 backdrop-blur-sm border-muted/50 border-primary/20">
                            <CardHeader>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 bg-violet-500/10 rounded-lg text-violet-500">
                                        <Tag className="h-6 w-6" />
                                    </div>
                                    <CardTitle className="text-xl">ออกแบบสติ๊กเกอร์</CardTitle>
                                </div>
                                <CardDescription>
                                    ออกแบบ template สติ๊กเกอร์ QR สำหรับพิมพ์ติดออเดอร์ในการผลิต
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>
                ) : null}
            </div>
        </div>
    );
}
