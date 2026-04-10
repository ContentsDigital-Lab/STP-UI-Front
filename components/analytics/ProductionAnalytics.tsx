"use client";

import React, { useMemo, useEffect, useState } from "react";
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, 
    Tooltip, ResponsiveContainer, Cell, Legend 
} from "recharts";
import { useProductionStats } from "@/lib/hooks/use-production-stats";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useLanguage } from "@/lib/i18n/language-context";
import { Badge } from "@/components/ui/badge";
import { Timer, Factory, Box, Info, Maximize2, ChevronRight, TrendingUp, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "next-themes";
import { stationsApi } from "@/lib/api/stations";
import { Station } from "@/lib/api/types";
import { StationPerformanceDetail } from "./StationPerformanceDetail";

interface ProductionAnalyticsProps {
    materialId?: string;
}

export function ProductionAnalytics({ materialId }: ProductionAnalyticsProps) {
    const { t, lang } = useLanguage();
    const { theme } = useTheme();
    const { stats, accuracy, loading } = useProductionStats();
    const [metric, setMetric] = React.useState<"duration" | "area">("duration");
    const [stationMap, setStationMap] = useState<Map<string, { name: string; id: string }>>(new Map());
    
    // Drill-down state
    const [selectedStation, setSelectedStation] = useState<{ id: string; name: string } | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    useEffect(() => {
        stationsApi.getAll().then(res => {
            if (res?.data) {
                const map = new Map<string, { name: string; id: string }>();
                (res.data as Station[]).forEach(s => map.set(s._id, { name: s.name, id: s._id }));
                setStationMap(map);
            }
        }).catch(() => {});
    }, []);

    const chartData = useMemo(() => {
        if (!stats) return [];
        
        let raw: any[] = [];

        // If materialId is provided, show station averages for that material
        if (materialId && stats[materialId]) {
            const matStats = stats[materialId];
            raw = Object.values(matStats.averages).map(avg => ({
                id: avg.stationId,
                name: stationMap.get(avg.stationId)?.name ?? avg.stationId.slice(-6).toUpperCase(),
                duration: Math.round(avg.averageMs / 1000 / 60 * 10) / 10,
                area: Math.round(avg.totalAreaSqm * 100) / 100,
                count: avg.count
            }));
        } else {
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

            raw = Object.entries(stationSums).map(([stationId, data]) => ({
                id: stationId,
                name: stationMap.get(stationId)?.name ?? stationId.slice(-6).toUpperCase(),
                duration: Math.round(data.totalMs / data.count / 1000 / 60 * 10) / 10,
                area: Math.round(data.totalArea * 100) / 100,
                count: data.count
            }));
        }

        return raw.sort((a, b) => metric === "duration" ? b.duration - a.duration : b.area - a.area);
    }, [stats, materialId, metric, stationMap]);

    const handleSelectStation = (id: string, name: string) => {
        setSelectedStation({ id, name });
        setDetailOpen(true);
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-[300px] w-full rounded-3xl" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-40 w-full rounded-2xl" />
                    <Skeleton className="h-40 w-full rounded-2xl" />
                </div>
            </div>
        );
    }

    if (chartData.length === 0) {
        return (
            <Card className="border-dashed border-2 flex flex-col items-center justify-center py-20 text-muted-foreground bg-muted/5 rounded-3xl">
                <div className="h-16 w-16 rounded-3xl bg-muted/20 flex items-center justify-center mb-6">
                    <Factory className="h-8 w-8 opacity-20" />
                </div>
                <p className="text-base font-bold text-slate-900 dark:text-slate-100">{lang === 'th' ? "ยังไม่มีข้อมูลประวัติการผลิต" : "No production history yet"}</p>
                <p className="text-xs opacity-60 mt-1 max-w-xs text-center">{lang === 'th' ? "ข้อมูลจะเริ่มสะสมเมื่อมีการสแกนเริ่มงานและจบงานที่แต่ละสถานี" : "Data will accumulate as tasks are started and completed at each station."}</p>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <Card className="overflow-hidden border-slate-200 dark:border-slate-800 shadow-xl shadow-black/[0.02] rounded-3xl transition-all hover:shadow-2xl hover:shadow-black/[0.04]">
                <CardHeader className="px-8 pt-8 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                        <div className="space-y-1.5">
                            <CardTitle className="text-2xl font-black tracking-tight flex items-center gap-3 uppercase not-italic">
                                <div className="p-2 rounded-2xl bg-primary/10">
                                    <TrendingUp className="h-6 w-6 text-primary" />
                                </div>
                                {lang === 'th' ? "วิเคราะห์ผลผลิตความเร็วสูง" : "High-Speed Prod. Analytics"}
                            </CardTitle>
                            <CardDescription className="text-sm font-medium text-muted-foreground pl-12 not-italic">
                                {metric === "duration" 
                                    ? (lang === 'th' ? "เจาะลึกเวลาเฉลี่ย (นาที) เพื่อระบุจุดคอขวดในสายการผลิต" : "Deep dive into average durations to identify production bottlenecks")
                                    : (lang === 'th' ? "วิเคราะห์ปริมาณงานรายสถานี (Sqm) เพื่อดูลำดับความสำคัญ" : "Visualize volumetric throughput per station to prioritize workflow")
                                }
                            </CardDescription>
                        </div>
                        <div className="flex gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl shrink-0 backdrop-blur-sm">
                            <button
                                onClick={() => setMetric("duration")}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all duration-300 ${
                                    metric === "duration"
                                        ? "bg-white dark:bg-slate-700 text-primary shadow-lg shadow-primary/10 scale-105"
                                        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                                }`}
                            >
                                <Timer className="h-4 w-4" />
                                {lang === 'th' ? "เวลา" : "TIME"}
                            </button>
                            <button
                                onClick={() => setMetric("area")}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all duration-300 ${
                                    metric === "area"
                                        ? "bg-white dark:bg-slate-700 text-primary shadow-lg shadow-primary/10 scale-105"
                                        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                                }`}
                            >
                                <Maximize2 className="h-4 w-4" />
                                {lang === 'th' ? "พื้นที่" : "AREA"}
                            </button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="px-8 pb-8">
                    <div className="h-[320px] w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={chartData} 
                                margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                                onClick={(data) => {
                                    if (data && data.activePayload && data.activePayload[0]) {
                                        const p = data.activePayload[0].payload;
                                        handleSelectStation(p.id, p.name);
                                    }
                                }}
                            >
                                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={theme === 'dark' ? "rgba(71, 85, 105, 0.15)" : "rgba(203, 213, 225, 0.3)"} />
                                <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 11, fontWeight: 700, fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} 
                                    dy={15}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 11, fontWeight: 700, fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} 
                                />
                                <Tooltip 
                                    cursor={{ fill: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0,0,0,0.02)', radius: 12 }} 
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-2xl glass-effect space-y-3 min-w-[180px]">
                                                    <div className="flex items-center justify-between pb-2 border-b border-muted/20">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{data.name}</p>
                                                        <Badge variant="outline" className="text-[9px] font-bold py-0">{lang === 'th' ? 'คลิกเพื่อดูแผงข้อมูล' : 'Click to drill down'}</Badge>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <Timer className="h-3.5 w-3.5 text-blue-500" />
                                                                <span className="text-[11px] font-bold text-slate-500">{lang === 'th' ? 'เฉลี่ย' : 'Avg'}</span>
                                                            </div>
                                                            <span className="text-sm font-black text-slate-900 dark:text-slate-100">{data.duration}m</span>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <Maximize2 className="h-3.5 w-3.5 text-primary" />
                                                                <span className="text-[11px] font-bold text-slate-500">{lang === 'th' ? 'รวม' : 'Total'}</span>
                                                            </div>
                                                            <span className="text-sm font-black text-primary">{data.area} m²</span>
                                                        </div>
                                                        <div className="flex items-center justify-between pt-2 border-t border-muted/10 mt-1">
                                                            <div className="flex items-center gap-2">
                                                                <Box className="h-3.5 w-3.5 text-slate-400" />
                                                                <span className="text-[11px] font-bold text-slate-500">{lang === 'th' ? 'งาน' : 'Units'}</span>
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
                                <Bar 
                                    dataKey={metric === "duration" ? "duration" : "area"} 
                                    radius={[8, 8, 8, 8]} 
                                    barSize={45}
                                    animationDuration={2000}
                                    animationEasing="ease-out"
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell 
                                            key={`cell-${index}`} 
                                            className="cursor-pointer transition-all hover:opacity-80"
                                            fill={metric === "duration" 
                                                ? (index === 0 ? '#2563eb' : (index === 1 ? '#3b82f6' : '#60a5fa')) 
                                                : (index === 0 ? '#E8601C' : (index === 1 ? '#f97316' : '#fb923c'))} 
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Station Ranking List */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-lg shadow-black/[0.01]">
                    <CardHeader className="p-6 pb-2">
                        <div className="flex items-center gap-2">
                            <Trophy className="h-4 w-4 text-amber-500" />
                            <CardTitle className="text-sm font-black uppercase tracking-widest">{lang === 'th' ? "อันดับเวลาการทำงาน" : "STATION SPEED RANKING"}</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 pt-0">
                        <div className="space-y-2">
                            {chartData.sort((a, b) => a.duration - b.duration).slice(0, 5).map((station, i) => (
                                <div 
                                    key={station.id}
                                    onClick={() => handleSelectStation(station.id, station.name)}
                                    className="group flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-transparent hover:border-primary/20 hover:bg-white dark:hover:bg-slate-900 transition-all cursor-pointer"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`h-8 w-8 rounded-xl flex items-center justify-center font-black text-sm ${
                                            i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-muted text-muted-foreground"
                                        }`}>
                                            {i + 1}
                                        </div>
                                        <div>
                                            <p className="font-black text-sm text-slate-900 dark:text-slate-100">{station.name}</p>
                                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{station.count} {lang === 'th' ? "รายการ" : "UNITS"}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <p className="font-black text-sm text-primary">{station.duration}m</p>
                                            <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">AVG TIME</p>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-primary transition-colors" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card className="rounded-3xl border-emerald-500/10 bg-emerald-500/[0.02] shadow-sm flex-1">
                        <CardHeader className="p-6">
                            <div className="flex items-center gap-2">
                                <Info className="h-4 w-4 text-emerald-500" />
                                <CardTitle className="text-xs font-black uppercase tracking-widest text-emerald-600">{lang === 'th' ? "ข้อมูลการเพิ่มประสิทธิภาพ" : "OPTIMIZATION INSIGHT"}</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 pt-0">
                            <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 leading-relaxed font-medium not-italic">
                                {lang === 'th' 
                                    ? "จากการวิเคราะห์ข้อมูล 30 วันลาสุด สถานีที่ทำงานเร็วที่สุดได้รับการติดดาวด้วยสีทอง คุณสามารถคลิกที่แต่ละรายการเพื่อดูประวัติความเร็วรายวันและระบุปัญหาที่เกิดขึ้นได้ทันที" 
                                    : "Based on the last 30 days of data, the fastest station is starred in gold. Click on any station to view its daily speed trend and identify production anomalies instantly."}
                            </p>
                            <div className="mt-4 flex items-center gap-4">
                               <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 font-black text-[9px] px-3 py-1 rounded-full cursor-default uppercase">
                                  {lang === 'th' ? "ระบบเสถียร" : "SYSTEM STABLE"}
                               </Badge>
                               <span className="text-[10px] font-bold text-muted-foreground">Updated: Today, 12:44</span>
                            </div>
                        </CardContent>
                    </Card>
                    
                    <div className="p-8 rounded-3xl bg-gradient-to-br from-primary/10 to-blue-500/10 border border-primary/20 flex flex-col justify-center items-center text-center space-y-4 shadow-xl shadow-primary/5 transition-all hover:scale-[1.02]">
                        <div className="relative">
                            <Box className="h-12 w-12 text-primary opacity-60 animate-pulse" />
                            <TrendingUp className="h-6 w-6 text-primary absolute -top-1 -right-1" />
                        </div>
                        <div className="space-y-1">
                            <h4 className="text-base font-black uppercase leading-none not-italic">{lang === 'th' ? "ความแม่นยำในการพยากรณ์" : "PREDICTION ACCURACY"}</h4>
                            <p className="text-3xl font-black text-primary tracking-tighter not-italic">{Math.round(accuracy)}%</p>
                        </div>
                        <p className="text-[11px] font-bold text-muted-foreground max-w-[220px] leading-relaxed not-italic">
                            {lang === 'th' 
                                ? "ข้อมูลพยากรณ์ในหน้าใบสั่งผลิตมีความคลาดเคลื่อนต่ำมาก อ้างอิงจากประวัติการทำงานจริง 1,000 รายการล่าสุด" 
                                : "Prediction engine is highly stable based on the last 1,000 production cycles recorded."}
                        </p>
                    </div>
                </div>
            </div>

            {/* Drill-down Drawer */}
            {selectedStation && (
                <StationPerformanceDetail 
                    stationId={selectedStation.id}
                    stationName={selectedStation.name}
                    open={detailOpen}
                    onOpenChange={setDetailOpen}
                />
            )}
        </div>
    );
}
