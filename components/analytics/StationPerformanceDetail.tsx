"use client";

import React from "react";
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, 
    Tooltip as RechartTooltip, ResponsiveContainer, AreaChart, Area
} from "recharts";
import { 
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription 
} from "@/components/ui/sheet";
import { useStationPerformance } from "@/lib/hooks/use-station-performance";
import { useLanguage } from "@/lib/i18n/language-context";
import { useTheme } from "next-themes";
import { 
    Timer, Box, TrendingUp, History, Zap, 
    ChevronRight, AlertCircle, Clock
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface StationPerformanceDetailProps {
    stationId: string | null;
    stationName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function StationPerformanceDetail({ 
    stationId, 
    stationName, 
    open, 
    onOpenChange 
}: StationPerformanceDetailProps) {
    const { lang } = useLanguage();
    const { theme } = useTheme();
    const { performanceData, stats, loading } = useStationPerformance(stationId);

    // Filter to only show the last 20 for the table to keep it readable
    const recentHistory = [...performanceData].reverse().slice(0, 15);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col gap-0 border-l border-slate-200 dark:border-slate-800">
                <SheetHeader className="px-6 py-8 bg-slate-50/50 dark:bg-slate-900/50 border-b border-separate">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <Zap className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <SheetTitle className="text-2xl font-black tracking-tight uppercase italic">
                                {stationName || "STATION"}
                            </SheetTitle>
                            <SheetDescription className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                                {lang === 'th' ? "วิเคราะห์ประสิทธิภาพเชิงลึก" : "In-depth Performance Analysis"}
                            </SheetDescription>
                        </div>
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                    {loading ? (
                        <div className="space-y-6">
                            <Skeleton className="h-[200px] w-full rounded-2xl" />
                            <div className="grid grid-cols-2 gap-4">
                                <Skeleton className="h-24 w-full rounded-2xl" />
                                <Skeleton className="h-24 w-full rounded-2xl" />
                            </div>
                            <Skeleton className="h-[300px] w-full rounded-2xl" />
                        </div>
                    ) : stats ? (
                        <>
                            {/* Summary Metrics */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex flex-col justify-between">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Timer className="h-4 w-4 text-blue-500" />
                                        <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
                                            {lang === 'th' ? "เวลาเฉลี่ย" : "AVG SPEED"}
                                        </span>
                                    </div>
                                    <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{stats.averageMinutes}m</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 flex flex-col justify-between">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Zap className="h-4 w-4 text-emerald-500" />
                                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                                            {lang === 'th' ? "เร็วที่สุด" : "BEST TIME"}
                                        </span>
                                    </div>
                                    <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{stats.bestMinutes}m</p>
                                </div>
                            </div>

                            {/* Trend Chart */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <TrendingUp className="h-4 w-4 text-primary" />
                                        <h3 className="font-bold text-sm">{lang === 'th' ? "แนวโน้มความเร็ว" : "Speed Trend"}</h3>
                                    </div>
                                    <Badge variant="secondary" className="text-[10px] font-bold px-2 py-0">LIVE</Badge>
                                </div>
                                <div className="h-[200px] w-full bg-slate-50/50 dark:bg-muted/10 rounded-3xl p-4 border border-slate-100 dark:border-slate-800">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={performanceData}>
                                            <defs>
                                                <linearGradient id="colorDur" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? "rgba(71, 85, 105, 0.2)" : "rgba(203, 213, 225, 0.3)"} />
                                            <XAxis 
                                                dataKey="label" 
                                                hide 
                                            />
                                            <YAxis 
                                                axisLine={false} 
                                                tickLine={false} 
                                                tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'var(--font-noto-sans-thai), system-ui, sans-serif' }}
                                                unit="m"
                                                tickFormatter={(v) => String(Math.round(v / 1000 / 60))}
                                            />
                                            <RechartTooltip 
                                                content={({ active, payload }) => {
                                                    if (active && payload && payload.length) {
                                                        const d = payload[0].payload;
                                                        return (
                                                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 rounded-xl shadow-xl">
                                                                <p className="text-[10px] font-bold text-muted-foreground uppercase">{d.paneNumber}</p>
                                                                <p className="text-sm font-black text-primary">{Math.round(d.durationMs / 1000 / 60 * 10) / 10}m</p>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                }}
                                            />
                                            <Area 
                                                type="monotone" 
                                                dataKey="durationMs" 
                                                stroke="#2563eb" 
                                                strokeWidth={3}
                                                fillOpacity={1} 
                                                fill="url(#colorDur)" 
                                                animationDuration={1500}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* History Table */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <History className="h-4 w-4 text-primary" />
                                    <h3 className="font-bold text-sm">{lang === 'th' ? "ประวัติการผลิตล่าสุด" : "Recent Production Record"}</h3>
                                </div>
                                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm shadow-black/5">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                                <th className="px-4 py-3 font-bold text-muted-foreground uppercase tracking-widest">{lang === 'th' ? "รหัสกระจก" : "PANE"}</th>
                                                <th className="px-4 py-3 font-bold text-muted-foreground uppercase tracking-widest">{lang === 'th' ? "เวลา" : "TIME"}</th>
                                                <th className="px-4 py-3 font-bold text-muted-foreground uppercase tracking-widest text-right">{lang === 'th' ? "ระยะเวลา" : "DUR."}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {recentHistory.map((item, i) => (
                                                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-muted/5 transition-colors group">
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-2 w-2 rounded-full bg-emerald-500 opacity-40 group-hover:opacity-100 transition-opacity" />
                                                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{item.paneNumber}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-muted-foreground font-medium">
                                                        {item.label}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <Badge variant="outline" className="text-[10px] font-black group-hover:bg-primary group-hover:text-white transition-all border-slate-200 dark:border-slate-800">
                                                            {Math.round(item.durationMs / 1000 / 60 * 10) / 10}m
                                                        </Badge>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4">
                            <AlertCircle className="h-10 w-10 opacity-20" />
                            <p className="text-sm font-medium">{lang === 'th' ? "ไม่พบข้อมูลประวัติสถานีนี้" : "No history found for this station"}</p>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-slate-50/50 dark:bg-slate-900/50 border-t border-separate flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <Clock className="h-4 w-4 text-amber-600" />
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium leading-tight">
                        {lang === 'th' 
                            ? "สถิติคำนวณจากงาน 100 ชิ้นล่าสุดเพื่อความแม่นยำในการคาดการณ์เวลาผลิตจริง" 
                            : "Stats calculated from last 100 units to ensure accuracy in real-world production forecasting."}
                    </p>
                </div>
            </SheetContent>
        </Sheet>
    );
}
