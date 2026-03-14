"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Factory, LayoutTemplate, Plus, Pencil, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStationTemplates } from "@/lib/api/station-templates";
import { StationTemplate } from "@/lib/types/station-designer";

export default function StationsPage() {
    const router    = useRouter();
    const [templates, setTemplates] = useState<StationTemplate[]>([]);
    const [loading,   setLoading]   = useState(true);

    useEffect(() => {
        getStationTemplates()
            .then((t) => setTemplates(t))
            .finally(() => setLoading(false));
    }, []);

    const formatDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Factory className="h-6 w-6 text-primary" />
                        สถานีการผลิต
                    </h1>
                    <p className="text-sm text-muted-foreground">จัดการสถานีและกระบวนการผลิต</p>
                </div>
                <Button onClick={() => router.push("/stations/designer")} className="gap-2">
                    <LayoutTemplate className="h-4 w-4" />
                    เปิด Designer
                </Button>
            </div>

            {/* Quick links */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <button
                    onClick={() => router.push("/stations/designer")}
                    className="flex items-center justify-between rounded-xl border bg-card p-4 hover:shadow-md hover:border-primary/40 transition-all text-left"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <LayoutTemplate className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="font-medium text-sm">Station Designer</p>
                            <p className="text-xs text-muted-foreground">ออกแบบกระบวนการผลิตแบบลากวาง</p>
                        </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>

                <button
                    onClick={() => router.push("/stations/workers")}
                    className="flex items-center justify-between rounded-xl border bg-card p-4 hover:shadow-md hover:border-primary/40 transition-all text-left"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                            <Factory className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="font-medium text-sm">Workers</p>
                            <p className="text-xs text-muted-foreground">จัดการพนักงานประจำสถานี</p>
                        </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
            </div>

            {/* Template designs */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">Station Templates ({templates.length})</h2>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push("/stations/designer")}>
                        <Plus className="h-3.5 w-3.5" />
                        สร้างใหม่
                    </Button>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-28 rounded-xl border bg-muted/30 animate-pulse" />
                        ))}
                    </div>
                ) : templates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 space-y-3 border-2 border-dashed rounded-xl">
                        <LayoutTemplate className="h-10 w-10 text-muted-foreground/30" />
                        <div className="text-center">
                            <p className="text-sm font-medium text-muted-foreground">ยังไม่มี Station Template</p>
                            <p className="text-xs text-muted-foreground/70">ใช้ Designer เพื่อสร้างกระบวนการผลิต</p>
                        </div>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push("/stations/designer")}>
                            <LayoutTemplate className="h-3.5 w-3.5" />
                            เปิด Designer
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {templates.map((tmpl) => (
                            <div key={tmpl._id} className="rounded-xl border bg-card p-4 space-y-2.5 hover:shadow-md transition-shadow">
                                <div>
                                    <h3 className="font-medium text-sm truncate">{tmpl.name}</h3>
                                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{tmpl.description || "ไม่มีคำอธิบาย"}</p>
                                </div>
                                <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                                    <Clock className="h-3 w-3" />
                                    <span>{formatDate(tmpl.updatedAt)}</span>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full h-8 gap-1.5"
                                    onClick={() => router.push(`/stations/designer/${tmpl._id}`)}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                    แก้ไขใน Designer
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
