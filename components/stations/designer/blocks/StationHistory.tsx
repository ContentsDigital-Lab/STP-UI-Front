"use client";

import { useNode } from "@craftjs/core";
import { useState, useEffect } from "react";
import { History, Loader2, Package, Clock } from "lucide-react";
import { fetchApi } from "@/lib/api/config";
import { usePreview } from "../PreviewContext";
import { useStationContext } from "../StationContext";
import { useWebSocket } from "@/lib/hooks/use-socket";

interface StationHistoryProps {
    title?:   string;
    maxRows?: number;
}

// Production log entry as returned by GET /production-logs (raw array, not { success, data })
interface ProductionLog {
    _id:         string;
    paneId:      { _id: string; paneNumber: string; glassTypeLabel?: string } | string;
    orderId:     string;
    station:     string;
    action:      string;
    createdAt:   string;
    completedAt?: string;
}

interface CompletedGroup {
    orderId:   string;
    orderCode: string;
    logs:      ProductionLog[];
    latestAt:  string;
}

function fmtDate(iso: string) {
    try {
        return new Date(iso).toLocaleDateString("th-TH", {
            day: "2-digit", month: "short", year: "2-digit",
            hour: "2-digit", minute: "2-digit",
        });
    } catch { return iso; }
}

function getPaneNumber(paneId: ProductionLog["paneId"]): string {
    if (!paneId) return "—";
    if (typeof paneId === "string") return paneId.slice(-6).toUpperCase();
    return paneId.paneNumber ?? "—";
}

export function StationHistory({
    title   = "ประวัติการผลิต",
    maxRows = 20,
}: StationHistoryProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const { stationId, stationName, refreshCounter } = useStationContext();

    const [groups,   setGroups]   = useState<CompletedGroup[]>([]);
    const [fetching, setFetching] = useState(false);
    const [error,    setError]    = useState("");

    const loadData = async () => {
        const station = stationName || stationId;
        if (!station) { setGroups([]); return; }
        setFetching(true); setError("");
        try {
            // Fetch in parallel: production logs (complete actions) + orders (for order codes)
            const [logsRes, ordersRes] = await Promise.all([
                fetchApi<{ success: boolean; data: ProductionLog[] } | ProductionLog[]>(
                    `/production-logs?station=${encodeURIComponent(station)}&limit=300`
                ),
                fetchApi<{ success: boolean; data: Record<string, unknown>[] }>(
                    `/orders?stationId=${encodeURIComponent(stationId ?? "")}`
                ),
            ]);

            // Support both { success, data } and raw array response formats
            const logsArray: ProductionLog[] = Array.isArray(logsRes)
                ? logsRes
                : ((logsRes as { success: boolean; data: ProductionLog[] }).data ?? []);

            // Build orderId → orderCode map
            const orderMap = new Map<string, string>();
            if (ordersRes?.success) {
                for (const o of ordersRes.data ?? []) {
                    const id   = String(o._id ?? "");
                    const code = String(o.code ?? o.orderNumber ?? id.slice(-6).toUpperCase());
                    if (id) orderMap.set(id, code);
                }
            }

            // Filter to "complete" actions only, then group by orderId
            const completeLogs = logsArray.filter(l => l.action === "complete");

            const groupMap = new Map<string, ProductionLog[]>();
            for (const log of completeLogs) {
                const oid = log.orderId ?? "";
                if (!oid) continue;
                if (!groupMap.has(oid)) groupMap.set(oid, []);
                groupMap.get(oid)!.push(log);
            }

            const sorted: CompletedGroup[] = [...groupMap.entries()]
                .map(([orderId, logs]) => {
                    const ls = [...logs].sort((a, b) =>
                        (b.completedAt ?? b.createdAt) > (a.completedAt ?? a.createdAt) ? 1 : -1
                    );
                    return {
                        orderId,
                        orderCode: orderMap.get(orderId) ?? orderId.slice(-6).toUpperCase(),
                        logs: ls,
                        latestAt: ls[0]?.completedAt ?? ls[0]?.createdAt ?? "",
                    };
                })
                .sort((a, b) => b.latestAt.localeCompare(a.latestAt))
                .slice(0, maxRows);

            setGroups(sorted);
        } catch {
            setError("โหลดประวัติไม่สำเร็จ");
        } finally {
            setFetching(false);
        }
    };

    useEffect(() => {
        loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPreview, stationId, stationName, maxRows, refreshCounter]);

    useWebSocket("pane", ["pane:updated"], () => { loadData(); });

    // ── Preview render ────────────────────────────────────────────────────────
    if (isPreview) {
        if (!stationId && !stationName) {
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
        if (groups.length === 0) {
            return (
                <div className="w-full rounded-xl border bg-card px-5 py-8 flex flex-col items-center gap-2 text-center">
                    <History className="h-8 w-8 text-muted-foreground/20" />
                    <p className="text-sm font-medium text-muted-foreground">ยังไม่มีกระจกที่เสร็จสิ้น</p>
                    <p className="text-xs text-muted-foreground/60">กระจกที่ผ่านสถานีนี้แล้วจะแสดงที่นี่</p>
                </div>
            );
        }
        return (
            <div className="w-full rounded-xl border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground/60" />
                    <p className="text-sm font-semibold">{title}</p>
                    <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {groups.reduce((s, g) => s + g.logs.length, 0)} ชิ้น
                    </span>
                </div>
                <div className="divide-y">
                    {groups.map((group) => (
                        <div key={group.orderId} className="px-4 py-3">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-mono font-bold text-foreground">#{group.orderCode}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-medium">
                                    {group.logs.length} ชิ้น
                                </span>
                                <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/60">
                                    <Clock className="h-3 w-3" />
                                    {fmtDate(group.latestAt)}
                                </span>
                            </div>
                            <div className="space-y-1">
                                {group.logs.map(log => (
                                    <div key={log._id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-muted/20">
                                        <Package className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                                        <span className="text-xs font-mono text-foreground/80 flex-1">{getPaneNumber(log.paneId)}</span>
                                        <span className="text-[10px] text-muted-foreground/50">
                                            {fmtDate(log.completedAt ?? log.createdAt)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
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
                {fetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
                {groups.length > 0 && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                        {groups.reduce((s, g) => s + g.logs.length, 0)} ชิ้น
                    </span>
                )}
            </div>
            {groups.length > 0 ? (
                <div className="divide-y">
                    {groups.slice(0, 3).map((group) => (
                        <div key={group.orderId} className="px-4 py-2.5">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-xs font-mono font-bold">#{group.orderCode}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-medium">
                                    {group.logs.length} ชิ้น
                                </span>
                            </div>
                            <div className="space-y-0.5">
                                {group.logs.slice(0, 2).map(log => (
                                    <div key={log._id} className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-muted/30">
                                        <Package className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                                        <span className="text-[10px] font-mono text-foreground/70">{getPaneNumber(log.paneId)}</span>
                                    </div>
                                ))}
                                {group.logs.length > 2 && (
                                    <p className="text-[10px] text-muted-foreground/40 pl-1.5">+{group.logs.length - 2} ชิ้น</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="p-4 space-y-2 opacity-50 pointer-events-none">
                    {[1, 2].map((i) => (
                        <div key={i} className="flex flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5">
                            <div className="flex gap-2">
                                <div className="h-3 w-14 rounded bg-muted" />
                                <div className="h-3 w-10 rounded-full bg-green-100 dark:bg-green-900/30" />
                            </div>
                            <div className="h-2.5 w-28 rounded bg-muted/60" />
                        </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground/40 text-center italic pt-1">
                        กระจกที่เสร็จในสถานีนี้ (สูงสุด {maxRows} ออเดอร์)
                    </p>
                </div>
            )}
        </div>
    );
}

StationHistory.craft = {
    displayName: "Station History",
    props: { title: "ประวัติการผลิต", maxRows: 20 } as StationHistoryProps,
};
