"use client";

import React, { useMemo } from "react";
import { useProductionStats } from "@/lib/hooks/use-production-stats";
import { useLanguage } from "@/lib/i18n/language-context";
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from "recharts";
import { Loader2, Timer, AlertCircle } from "lucide-react";

export function ProductionAnalytics({ materialId }: { materialId?: string }) {
    const { stats, loading } = useProductionStats();
    const { t, lang } = useLanguage();

    const chartData = useMemo(() => {
        if (!stats) return [];
        
        let targetStats = materialId ? stats[materialId] : Object.values(stats)[0];
        if (!targetStats) return [];

        return Object.values(targetStats.averages).map(s => ({
            name: `Station ${s.stationId.slice(-4)}`,
            duration: Math.round(s.averageMs / 60000 * 10) / 10, // Minutes
            count: s.count,
            fullId: s.stationId
        }));
    }, [stats, materialId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">กำลังคำนวณค่าเฉลี่ย...</span>
            </div>
        );
    }

    if (chartData.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-3xl opacity-50">
                <AlertCircle className="h-8 w-8 mb-2" />
                <p className="text-sm font-medium">ยังไม่มีข้อมูลการทำงานเพียงพอ</p>
                <p className="text-xs">ต้องมีข้อมูลการ "เริ่ม" และ "เสร็จสิ้น" ในสถานีเพื่อคำนวณค่าเฉลี่ย</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-bold flex items-center gap-2">
                        <Timer className="h-4 w-4 text-[#E8601C]" />
                        {lang === 'th' ? 'เวลาเฉลี่ยรายสถานี' : 'Average Time per Station'}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">หน่วย: นาที (Minutes)</p>
                </div>
            </div>

            <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                        <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fill: "#94a3b8" }} 
                        />
                        <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fill: "#94a3b8" }} 
                        />
                        <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                        />
                        <Bar dataKey="duration" fill="#E8601C" radius={[4, 4, 0, 0]}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fillOpacity={0.8} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {chartData.map((item, i) => (
                    <div key={i} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{item.name}</p>
                        <p className="text-lg font-black text-[#E8601C]">{item.duration} <span className="text-[10px] font-normal text-muted-foreground">นาที</span></p>
                        <p className="text-[9px] text-muted-foreground">จาก {item.count} ตัวอย่าง</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
