"use client";

import Link from "next/link";
import { UserCog, ShieldAlert, Users, Bell } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/auth-context";

export default function SettingsPage() {
    const { user } = useAuth();

    // Only admin and manager should see the user management card
    const hasUserManagementAccess = user?.role === "admin" || user?.role === "manager";

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
                <p className="text-muted-foreground">Manage your application preferences and system settings.</p>
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
            </div>
        </div>
    );
}
