"use client";

import React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { ProductionAnalytics } from "@/components/analytics/ProductionAnalytics";
import { useLanguage } from "@/lib/i18n/language-context";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { LayoutDashboard, Factory, Timer, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AnalyticsPage() {
    const { lang } = useLanguage();

    return (
        <AppLayout title={lang === 'th' ? "วิเคราะห์การผลิต" : "Production Analytics"}>
            <div className="flex flex-col gap-6 p-4 md:p-8 max-w-7xl mx-auto w-full">
                {/* Breadcrumbs */}
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink href="/dashboard" className="flex items-center gap-1">
                                <LayoutDashboard className="h-3 w-3" />
                                {lang === 'th' ? "แผงควบคุม" : "Dashboard"}
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage className="font-bold text-foreground">
                                {lang === 'th' ? "วิเคราะห์การผลิต" : "Production Analytics"}
                            </BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>

                {/* Header Section */}
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100 uppercase italic">
                        {lang === 'th' ? "วิเคราะห์การผลิต" : "PROD. ANALYTICS"}
                    </h1>
                    <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed font-medium">
                        {lang === 'th' 
                            ? "ข้อมูลเชิงสถิติจากการผลิตจริงที่สถานี เพื่อใช้คำนวณวันส่งมอบและตรวจสอบประสิทธิภาพแต่ละขั้นตอน" 
                            : "Statistical data from actual station production, used to calculate delivery dates and monitor workflow performance."}
                    </p>
                </div>

                {/* Key Metrics Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="bg-[#E8601C]/5 border-[#E8601C]/10 transition-all hover:bg-[#E8601C]/10">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold text-[#E8601C] uppercase tracking-wider flex items-center gap-2">
                                <Factory className="h-3.5 w-3.5" />
                                {lang === 'th' ? "สถานีที่บันทึก" : "ACTIVE STATIONS"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">12</p>
                            <p className="text-[10px] text-muted-foreground mt-1 font-medium italic opacity-60">Connected stations logging data</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-blue-500/5 border-blue-500/10 transition-all hover:bg-blue-500/10">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold text-blue-500 uppercase tracking-wider flex items-center gap-2">
                                <Timer className="h-3.5 w-3.5" />
                                {lang === 'th' ? "ความแม่นยำคาดการณ์" : "PREDICTION ACCURACY"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">94%</p>
                            <p className="text-[10px] text-muted-foreground mt-1 font-medium italic opacity-60">Based on last 30d production</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-emerald-500/5 border-emerald-500/10 transition-all hover:bg-emerald-500/10">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-2">
                                <Target className="h-3.5 w-3.5" />
                                {lang === 'th' ? "ยอดผลิตสะสม" : "TOTAL RECORDS"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">1,248</p>
                            <p className="text-[10px] text-muted-foreground mt-1 font-medium italic opacity-60">Pane cycles logged since launch</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Analytics Component */}
                <div className="grid grid-cols-1 gap-6 mt-2">
                    <ProductionAnalytics />
                </div>
            </div>
        </AppLayout>
    );
}
