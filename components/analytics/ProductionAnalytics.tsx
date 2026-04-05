"use client";

import React, { useMemo } from "react";
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, 
    Tooltip, ResponsiveContainer, Cell, Legend 
} from "recharts";
import { useProductionStats } from "@/lib/hooks/use-production-stats";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useLanguage } from "@/lib/i18n/language-context";
import { Badge } from "@/components/ui/badge";
import { Timer, Factory, Box, Info, Maximize2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "next-themes";

interface ProductionAnalyticsProps {
    materialId?: string;
}

export function ProductionAnalytics({ materialId }: ProductionAnalyticsProps) {
    const { t, lang } = useLanguage();
    const { theme } = useTheme();
    const { stats, loading } = useProductionStats();
    const [metric, setMetric] = React.useState<"duration" | "area">("duration");

    const chartData = useMemo(() => {
        if (!stats) return [];
        
        // If materialId is provided, show station averages for that material
        if (materialId && stats[materialId]) {
            const matStats = stats[materialId];
            return Object.values(matStats.averages).map(avg => ({
                name: avg.stationId,
                display: avg.stationId.slice(-6).toUpperCase(),
                duration: Math.round(avg.averageMs / 1000 / 60 * 10) / 10,
                area: Math.round(avg.totalAreaSqm * 100) / 100,
                count: avg.count
            })).sort((a, b) => metric === "duration" ? b.duration - a.duration : b.area - a.area);
        }

        // Otherwise, show overall station averages (averaged across all materials)
        const stationSums: Record<string, { totalMs: number; totalArea: number; count: number }> = {};
        Object.values(stats).forEach(matStat => {
            Object.values(matStat.averages).forEach(avg => {
                if (!stationSums[avg.stationId]) stationSums[avg.stationId] = { totalMs: 0, totalArea: 0, count: 0 };
                stationSums[avg.stationId].totalMs += avg.averageMs * avg.count;
                stationSums[avg.stationId].totalArea += avg.totalAreaSqm;
                stationSums[avg.stationId].count += avg.count;
            });
        });

        return Object.entries(stationSums).map(([stationId, data]) => ({
            name: stationId,
            display: stationId.slice(-6).toUpperCase(),
            duration: Math.round(data.totalMs / data.count / 1000 / 60 * 10) / 10,
            area: Math.round(data.totalArea * 100) / 100,
            count: data.count
        })).sort((a, b) => metric === "duration" ? b.duration - a.duration : b.area - a.area);
    }, [stats, materialId, metric]);

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-[300px] w-full rounded-xl" />
            </div>
        );
    }

    if (chartData.length === 0) {
        return (
            <Card className="border-dashed border-2 flex flex-col items-center justify-center py-12 text-muted-foreground bg-muted/5">
                <Factory className="h-10 w-10 mb-4 opacity-20" />
                <p className="text-sm font-medium">{lang === 'th' ? "ยังไม่มีข้อมูลประวัติการผลิต" : "No production history yet"}</p>
                <p className="text-xs opacity-60">{lang === 'th' ? "เริ่มการผลิตที่สถานีเพื่อเก็บข้อมูลเวลา" : "Start production at stations to collect timing data"}</p>
            </Card>
        );
    }

    return (
        <Card className="overflow-hidden border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/20 border-b border-separate border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Factory className="h-5 w-5 text-primary" />
                            {lang === 'th' ? "วิเคราะห์ผลผลิตรายสถานี" : "Station Production Analytics"}
                        </CardTitle>
                        <CardDescription>
                            {metric === "duration" 
                                ? (lang === 'th' ? "เวลาเฉลี่ยที่ใช้ในแต่ละขั้นตอน (นาที)" : "Average time spent per production stage (minutes)")
                                : (lang === 'th' ? "ปริมาณพื้นที่ผลิตรวม (ตารางเมตร)" : "Total production area (square meters)")
                            }
                        </CardDescription>
                    </div>
                    <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
                        <button
                            onClick={() => setMetric("duration")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                metric === "duration"
                                    ? "bg-white dark:bg-slate-700 text-[#E8601C] shadow-sm"
                                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            }`}
                        >
                            <Timer className="h-3.5 w-3.5" />
                            {lang === 'th' ? "เวลา" : "Time"}
                        </button>
                        <button
                            onClick={() => setMetric("area")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                metric === "area"
                                    ? "bg-white dark:bg-slate-700 text-[#E8601C] shadow-sm"
                                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            }`}
                        >
                            <Maximize2 className="h-3.5 w-3.5" />
                            {lang === 'th' ? "พื้นที่ (Sqm)" : "Area (Sqm)"}
                        </button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? "rgba(71, 85, 105, 0.3)" : "rgba(203, 213, 225, 0.4)"} />
                            <XAxis 
                                dataKey="display" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 11, fontWeight: 500, fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} 
                                dy={10}
                            />
                            <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 11, fontWeight: 500, fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} 
                            />
                            <Tooltip 
                                cursor={{ fill: 'rgba(232, 96, 28, 0.05)' }} 
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl shadow-xl space-y-2">
                                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{data.name}</p>
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between gap-4">
                                                        <div className="flex items-center gap-2">
                                                            <Timer className="h-3.5 w-3.5 text-blue-500" />
                                                            <span className="text-[11px] font-medium text-slate-500">{lang === 'th' ? 'เวลาเฉลี่ย' : 'Avg Time'}</span>
                                                        </div>
                                                        <span className="text-xs font-black text-slate-900 dark:text-slate-100">{data.duration}m</span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-4">
                                                        <div className="flex items-center gap-2">
                                                            <Maximize2 className="h-3.5 w-3.5 text-[#E8601C]" />
                                                            <span className="text-[11px] font-medium text-slate-500">{lang === 'th' ? 'พื้นที่รวม' : 'Total Area'}</span>
                                                        </div>
                                                        <span className="text-xs font-black text-[#E8601C]">{data.area} m²</span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100 dark:border-slate-800 mt-1">
                                                        <div className="flex items-center gap-2">
                                                            <Box className="h-3.5 w-3.5 text-slate-400" />
                                                            <span className="text-[11px] font-medium text-slate-500">{lang === 'th' ? 'จำนวน' : 'Panes'}</span>
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-500">{data.count}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Bar dataKey={metric === "duration" ? "duration" : "area"} radius={[6, 6, 0, 0]} barSize={40}>
                                {chartData.map((entry, index) => (
                                    <Cell 
                                        key={`cell-${index}`} 
                                        fill={metric === "duration" ? (index === 0 ? '#2563eb' : 'rgba(37, 99, 235, 0.6)') : (index === 0 ? '#E8601C' : 'rgba(232, 96, 28, 0.6)')} 
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="mt-6 flex items-start gap-2 p-3 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
                    <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                    <p className="text-xs text-blue-700/80 dark:text-blue-300/80 leading-relaxed">
                        {lang === 'th' 
                            ? "คุณสามารถสลับโหมดเพื่อดูทั้ง 'ความเร็วในการผลิต' (นาที) และ 'ปริมาณงานที่ได้' (ตารางเมตร) ของแต่ละสถานี" 
                            : "Switch between 'Production Speed' (minutes) and 'Throughput Volume' (square meters) for each station."}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
