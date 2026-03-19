"use client";

import { useNode } from "@craftjs/core";
import { useState, useEffect } from "react";
import { History, Loader2, ChevronRight, Clock } from "lucide-react";
import { fetchApi } from "@/lib/api/config";
import { usePreview } from "../PreviewContext";
import { useStationContext } from "../StationContext";
import { useWebSocket } from "@/lib/hooks/use-socket";

interface StationHistoryProps {
    title?:    string;
    maxRows?:  number;
}

interface HistoryOrder {
    _id:                 string;
    code?:               string;
    status:              string;
    stations:            string[];
    currentStationIndex?: number;
    customer?:           { name?: string } | string;
    material?:           { name?: string } | string;
    updatedAt:           string;
}

function getName(v: unknown): string {
    if (!v) return "—";
    if (typeof v === "string") return v;
    if (typeof v === "object") return (v as Record<string, string>).name ?? "—";
    return "—";
}

function fmtDate(iso: string) {
    try {
        return new Date(iso).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
}

export function StationHistory({
    title   = "ประวัติการผลิต",
    maxRows = 20,
}: StationHistoryProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const { stationId, refreshCounter } = useStationContext();

    const [rows,     setRows]     = useState<HistoryOrder[]>([]);
    const [fetching, setFetching] = useState(false);
    const [error,    setError]    = useState("");

    const loadData = () => {
        if (!stationId) { setRows([]); return; }
        setFetching(true); setError("");
        fetchApi<{ success: boolean; data: HistoryOrder[] }>("/orders")
            .then((res) => {
                if (!res.success) { setError("โหลดประวัติไม่สำเร็จ"); return; }
                const all = res.data ?? [];
                // Keep orders where this station is in the route AND the order has moved past it
                const history = all.filter((o) => {
                    const idx = o.stations.indexOf(stationId!);
                    if (idx === -1) return false;
                    // Advanced past this station
                    if (o.currentStationIndex !== undefined && o.currentStationIndex > idx) return true;
                    // Completed orders that included this station
                    if (o.status === "completed") return true;
                    return false;
                });
                setRows(history.slice(0, maxRows));
            })
            .catch(() => setError("ไม่สามารถโหลดข้อมูลได้"))
            .finally(() => setFetching(false));
    };

    useEffect(() => {
        if (!isPreview) return;
        loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPreview, stationId, maxRows, refreshCounter]);

    useWebSocket("order", ["order:updated", "order:created"], () => {
        if (isPreview) loadData();
    });

    // ── Preview render ────────────────────────────────────────────────────────
    if (isPreview) {
        if (!stationId) {
            return (
                <div className="w-full rounded-xl border bg-card px-5 py-8 flex flex-col items-center gap-2 text-center">
                    <History className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">ไม่พบ stationId — เปิดผ่านหน้าสถานี</p>
                </div>
            );
        }
        if (fetching) {
            return (
                <div className="w-full rounded-xl border bg-card px-5 py-8 flex flex-col items-center gap-2 text-center">
                    <Loader2 className="h-6 w-6 text-muted-foreground/40 animate-spin" />
                    <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
                </div>
            );
        }
        if (error) {
            return (
                <div className="w-full rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/10 px-5 py-6 text-center">
                    <p className="text-sm text-red-500">{error}</p>
                </div>
            );
        }
        if (rows.length === 0) {
            return (
                <div className="w-full rounded-xl border bg-card px-5 py-8 flex flex-col items-center gap-2 text-center">
                    <History className="h-8 w-8 text-muted-foreground/20" />
                    <p className="text-sm font-medium text-muted-foreground">ยังไม่มีประวัติ</p>
                    <p className="text-xs text-muted-foreground/60">รายการงานที่ผ่านสถานีนี้จะแสดงที่นี่</p>
                </div>
            );
        }
        return (
            <div className="w-full rounded-xl border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground/60" />
                    <p className="text-sm font-semibold">{title}</p>
                    <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{rows.length} รายการ</span>
                </div>
                <div className="divide-y">
                    {rows.map((o) => {
                        const code = o.code ?? o._id.slice(-6).toUpperCase();
                        const stationIdx = o.stations.indexOf(stationId!);
                        const isCompleted = o.status === "completed";
                        return (
                            <div key={o._id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-mono font-semibold text-foreground">{code}</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                            isCompleted
                                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                        }`}>
                                            {isCompleted ? "เสร็จสิ้น" : `สถานีที่ ${(o.currentStationIndex ?? 0) + 1}/${o.stations.length}`}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                        {getName(o.customer)} · {getName(o.material)}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 justify-end">
                                        <Clock className="h-3 w-3" />
                                        {fmtDate(o.updatedAt)}
                                    </div>
                                    {stationIdx >= 0 && (
                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50 justify-end mt-0.5">
                                            <ChevronRight className="h-3 w-3" />
                                            <span>ขั้นที่ {stationIdx + 1}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // ── Design mode ───────────────────────────────────────────────────────────
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-xl border-2 cursor-grab overflow-hidden transition-all
                ${selected ? "border-primary ring-2 ring-primary/20" : "border-slate-200 dark:border-slate-700 hover:border-primary/30"}`}
        >
            <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b">
                <History className="h-3.5 w-3.5 text-muted-foreground/60" />
                <p className="text-xs font-semibold text-foreground/70">{title}</p>
            </div>
            <div className="p-4 space-y-2 opacity-50 pointer-events-none">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
                        <div className="flex-1 space-y-1.5">
                            <div className="flex gap-2">
                                <div className="h-3 w-14 rounded bg-muted" />
                                <div className="h-3 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30" />
                            </div>
                            <div className="h-2.5 w-28 rounded bg-muted/60" />
                        </div>
                        <div className="h-2.5 w-20 rounded bg-muted/40" />
                    </div>
                ))}
                <p className="text-[10px] text-muted-foreground/40 text-center italic pt-1">
                    แสดงออเดอร์ที่ผ่านสถานีนี้แล้ว (สูงสุด {maxRows} รายการ)
                </p>
            </div>
        </div>
    );
}

StationHistory.craft = {
    displayName: "Station History",
    props: { title: "ประวัติการผลิต", maxRows: 20 } as StationHistoryProps,
};
