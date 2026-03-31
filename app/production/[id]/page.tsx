"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft, Loader2, AlertCircle, Factory,
    User, Package, Calendar, MapPin, Hash, Clock,
    Printer, Info, CheckCheck, ChevronRight, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ordersApi } from "@/lib/api/orders";
import { panesApi } from "@/lib/api/panes";
import { requestsApi } from "@/lib/api/requests";
import { stationsApi } from "@/lib/api/stations";
import { paneLogsApi } from "@/lib/api/pane-logs";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { getColorOption } from "@/lib/stations/stations-store";
import { Order, OrderRequest, Station, Pane, PaneLog } from "@/lib/api/types";
import { getStationId, getStationName, isStationMatch } from "@/lib/utils/station-helpers";

// ── status config ─────────────────────────────────────────────────────────────
const ORDER_STATUS = {
    pending:     { label: "รอตรวจสอบ", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    in_progress: { label: "กำลังผลิต", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"    },
    completed:   { label: "เสร็จแล้ว", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"},
    cancelled:   { label: "ยกเลิก",    cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"        },
} as const;

// ── helpers ───────────────────────────────────────────────────────────────────
function getStr(v: string | { name: string } | null | undefined): string {
    if (!v) return "—";
    return typeof v === "object" ? (v as { name: string }).name : v;
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
    return (
        <div className="flex items-start gap-3 sm:gap-4 py-2.5 sm:py-4 border-b border-slate-100 dark:border-slate-800/60 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors px-1.5 sm:px-2 -mx-1.5 sm:-mx-2 rounded-xl">
            <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-blue-50 dark:bg-[#E8601C]/10 text-blue-600 dark:text-[#E8601C] shrink-0 mt-0.5">
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] sm:text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{label}</p>
                <p className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200 mt-0.5 sm:mt-1 break-words">{value}</p>
            </div>
        </div>
    );
}

const fmtDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }) : "—";

const fmtTime = (d?: string) => {
    if (!d) return "—";
    return new Date(d).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

function fmtDuration(ms: number): string {
    if (ms <= 0) return "—";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s} วินาที`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} นาที`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (h < 24) return rm > 0 ? `${h} ชม. ${rm} น.` : `${h} ชม.`;
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh > 0 ? `${d} วัน ${rh} ชม.` : `${d} วัน`;
}

// ── station journey ───────────────────────────────────────────────────────────
function StationJourney({
    order, stationMap, panes,
}: {
    order: Order;
    stationMap: Map<string, Station>;
    panes: Pane[];
}) {
    const router      = useRouter();
    const stationIds  = order.stations ?? [];
    const isDone      = order.status === "completed";
    const isCancelled = order.status === "cancelled";
    const total       = panes.length;

    const stationIdxMap = new Map<string, number>();
    stationIds.forEach((ref, i) => {
        const sid = getStationId(ref);
        if (sid) stationIdxMap.set(sid, i);
        const nm = getStationName(ref);
        if (nm) stationIdxMap.set(nm, i);
        const s = sid ? stationMap.get(sid) : undefined;
        if (s?.name) stationIdxMap.set(s.name, i);
    });
    const stStats = new Map<string, { here: number; passed: number }>();
    for (const ref of stationIds) stStats.set(getStationId(ref), { here: 0, passed: 0 });
    if (total > 0) {
        for (const p of panes) {
            const pIdx = stationIdxMap.get(getStationId(p.currentStation)) ?? -1;
            const done = p.currentStatus === "completed";
            for (let i = 0; i < stationIds.length; i++) {
                const s = stStats.get(getStationId(stationIds[i]))!;
                if (done || pIdx > i) s.passed++;
                else if (pIdx === i) s.here++;
            }
        }
    }

    if (!stationIds.length) {
        return (
            <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 p-8 flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-900/30">
                <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                    <Factory className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400">ยังไม่ได้กำหนดสถานี</p>
            </div>
        );
    }

    return (
        <div className="relative w-full">
            {stationIds.map((ref, idx) => {
                const sid      = getStationId(ref);
                const station  = sid ? stationMap.get(sid) : undefined;
                const colorId  = station?.colorId ?? "sky";
                const color    = getColorOption(colorId);
                const st       = stStats.get(sid) ?? { here: 0, passed: 0 };
                const pct      = total > 0 ? Math.round((st.passed / total) * 100) : 0;

                let isPast: boolean, isCur: boolean, isFuture: boolean;
                if (total > 0) {
                    isPast   = isDone || st.passed === total;
                    isCur    = !isDone && !isCancelled && st.here > 0;
                    isFuture = !isDone && !isCancelled && !isPast && !isCur;
                } else {
                    const currentIdx = order.currentStationIndex ?? 0;
                    isPast   = isDone || idx < currentIdx;
                    isCur    = !isDone && !isCancelled && idx === currentIdx;
                    isFuture = !isDone && !isCancelled && idx > currentIdx;
                }

                const isFirst  = idx === 0;
                const isLast   = idx === stationIds.length - 1;
                const active   = isPast || isCur;

                return (
                    <div key={sid || `st-${idx}`} className="relative flex items-stretch gap-3 w-full">
                        {/* Left: Timeline Container */}
                        <div className="relative flex flex-col items-center justify-center shrink-0 w-10">
                            {!isFirst && (
                                <div
                                    className={`absolute top-0 bottom-1/2 w-0.5 ${active ? "" : "bg-slate-200 dark:bg-slate-800"}`}
                                    style={active ? { backgroundColor: color.swatch, opacity: 0.35 } : undefined}
                                />
                            )}
                            {!isLast && (
                                <div
                                    className={`absolute top-1/2 bottom-0 w-0.5 ${isPast ? "" : "bg-slate-200 dark:bg-slate-800"}`}
                                    style={isPast ? { backgroundColor: color.swatch, opacity: 0.35 } : undefined}
                                />
                            )}
                            
                            <div
                                className={`relative z-10 flex items-center justify-center shrink-0 ${
                                    isCancelled ? "w-4 h-4 rounded-full bg-slate-300 dark:bg-slate-700" :
                                    isCur       ? "w-6 h-6 rounded-full bg-white dark:bg-slate-900 ring-offset-[3px] ring-offset-white dark:ring-offset-slate-900" :
                                    isPast      ? "w-5 h-5 rounded-full" :
                                                  "w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-700"
                                }`}
                                style={{
                                    ...(isCur && !isCancelled ? { boxShadow: `0 0 0 3px white, 0 0 0 6px ${color.swatch}` } : {}),
                                    ...(isPast && !isCur && !isCancelled ? { backgroundColor: color.swatch } : {}),
                                }}
                            >
                                {isCur && (
                                    <div className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: color.swatch }} />
                                )}
                                {isPast && !isCur && !isCancelled && (
                                    <CheckCheck className="h-2.5 w-2.5 text-white" />
                                )}
                            </div>
                        </div>

                        {/* Right: Station Card */}
                        <div className="flex-1 min-w-0 py-1.5">
                            <div
                                onClick={() => sid && router.push(`/stations/${sid}?orderId=${order._id}`)}
                                className={`rounded-xl p-3.5 transition-all cursor-pointer hover:shadow-lg hover:scale-[1.01] ${
                                    isCur
                                        ? "bg-white dark:bg-slate-900 shadow-md border-2"
                                        : isPast
                                            ? "border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                                            : "bg-slate-50 dark:bg-slate-800/20 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                                }`}
                                style={{
                                    ...(isCur ? { borderColor: color.swatch } : {}),
                                    ...(isPast ? { backgroundColor: `${color.swatch}0a` } : {}),
                                }}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div
                                            className={`flex items-center justify-center p-2 rounded-lg shrink-0 ${
                                                !(isCur || isPast) ? "bg-slate-100 dark:bg-slate-800 text-slate-400" : ""
                                            }`}
                                            style={isCur || isPast ? { backgroundColor: `${color.swatch}18`, color: color.swatch } : undefined}
                                        >
                                            <Factory className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <span
                                                className={`text-sm font-bold block truncate ${
                                                    isCancelled ? "text-slate-400 line-through" :
                                                    isFuture    ? "text-slate-500 dark:text-slate-400" :
                                                                  "text-slate-800 dark:text-white"
                                                }`}
                                            >
                                                {station?.name ?? getStationName(ref) ?? sid}
                                            </span>
                                            {!isCancelled && total > 0 ? (
                                                <div className="text-[11px] font-semibold mt-0.5 flex items-center gap-1">
                                                    {st.here > 0 ? (
                                                        <span className="flex items-center gap-1" style={{ color: color.swatch }}>
                                                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color.swatch }} />
                                                            {st.here} ชิ้นอยู่ที่นี่
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400 dark:text-slate-500 font-medium">
                                                            0 ชิ้น
                                                        </span>
                                                    )}
                                                </div>
                                            ) : !isCancelled && total === 0 ? (
                                                <>
                                                    {isCur && (
                                                        <div className="text-[11px] font-semibold mt-0.5 flex items-center gap-1" style={{ color: color.swatch }}>
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                            กำลังดำเนินการ...
                                                        </div>
                                                    )}
                                                    {isPast && !isCur && (
                                                        <div className="text-[11px] font-medium text-green-600 dark:text-green-400 mt-0.5 flex items-center gap-1">
                                                            <CheckCheck className="h-3 w-3" />
                                                            เสร็จแล้ว
                                                        </div>
                                                    )}
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                    {isCur && (
                                        <div
                                            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border shrink-0 relative"
                                            style={{ borderColor: `${color.swatch}30`, backgroundColor: `${color.swatch}10` }}
                                        >
                                            <span className="h-1.5 w-1.5 rounded-full animate-ping absolute left-2" style={{ backgroundColor: color.swatch }} />
                                            <span className="h-1.5 w-1.5 rounded-full relative" style={{ backgroundColor: color.swatch }} />
                                            <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">
                                                {total > 0 ? `${st.here} ชิ้น` : "Active"}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {total > 0 && !isCancelled && (
                                    <div className="mt-2.5 w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${
                                                !active ? "bg-slate-300 dark:bg-slate-600" : ""
                                            }`}
                                            style={{
                                                width: `${pct}%`,
                                                ...(active ? { backgroundColor: color.swatch, opacity: isPast ? 0.7 : 1 } : {}),
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ── labeled field row helper ──────────────────────────────────────────────────
function PaneField({ label, value, mono, accent }: { label: string; value: string | null | undefined; mono?: boolean; accent?: string }) {
    if (!value) return null;
    return (
        <div className="flex items-start gap-3 py-2.5 min-w-0">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 w-24 shrink-0 pt-0.5">{label}</span>
            <span className={`text-sm font-medium break-all min-w-0 ${accent ?? "text-slate-800 dark:text-slate-200"} ${mono ? "font-mono" : ""}`}>{value}</span>
        </div>
    );
}

// ── pane detail modal ─────────────────────────────────────────────────────────
function PaneDetailModal({
    pane, stationMap, stationByName, onClose,
}: {
    pane: Pane;
    stationMap: Map<string, Station>;
    stationByName: Map<string, Station>;
    onClose: () => void;
}) {
    const [logs, setLogs] = useState<PaneLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        paneLogsApi.getAll({ paneId: pane._id, limit: 300 })
            .then(res => { if (res.success) setLogs(res.data ?? []); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [pane._id]);

    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    const routing = pane.routing ?? [];

    const stationLogsMap = new Map<string, { scan_in?: PaneLog; start?: PaneLog; complete?: PaneLog }>();
    for (const log of logs) {
        for (let routeIdx = 0; routeIdx < routing.length; routeIdx++) {
            const routeRef = routing[routeIdx];
            const rid = getStationId(routeRef);
            const rname = getStationName(routeRef);
            const stById = rid ? stationMap.get(rid) : undefined;
            const stByName = rname ? stationByName.get(rname) : undefined;
            const stationName = stById?.name ?? stByName?.name ?? rname ?? rid;
            const stationId = stById?._id ?? stByName?._id ?? rid;

            const mapKey = rid || `routing-${routeIdx}`;
            if (
                isStationMatch(log.station, stationId, stationName)
                || isStationMatch(log.station, rid, rname)
            ) {
                if (!stationLogsMap.has(mapKey)) stationLogsMap.set(mapKey, {});
                const entry = stationLogsMap.get(mapKey)!;
                if (log.action === "scan_in" && !entry.scan_in) entry.scan_in = log;
                if (log.action === "start" && !entry.start) entry.start = log;
                if (log.action === "complete" && !entry.complete) entry.complete = log;
                break;
            }
        }
    }

    const curPaneId = getStationId(pane.currentStation);
    const curPaneName = getStationName(pane.currentStation);
    const currentStationIdx = routing.findIndex(routeRef =>
        pane.currentStation != null && isStationMatch(routeRef, curPaneId, curPaneName),
    );

    const isCompleted = pane.currentStatus === "completed";

    const currentStationName = (() => {
        if (typeof pane.currentStation === "string" && pane.currentStation === "queue") return "คิว";
        if (typeof pane.currentStation === "string" && pane.currentStation === "ready") return "พร้อมส่ง";
        if (typeof pane.currentStation === "string" && pane.currentStation === "defected") return "ชำรุด";
        if (pane.currentStation == null) {
            if (pane.currentStatus === "pending") return "คิว";
            if (pane.currentStatus === "completed") return "เสร็จแล้ว";
            if (pane.currentStatus === "claimed") return "ถูกเคลม";
            return "—";
        }
        const pid = getStationId(pane.currentStation);
        const pname = getStationName(pane.currentStation);
        const s = (pid ? stationMap.get(pid) : undefined)
            ?? stationByName.get(pname)
            ?? (pid ? stationByName.get(pid) : undefined);
        return s?.name ?? pname ?? pid;
    })();

    const heroColor = (() => {
        if (isCompleted) return getColorOption("green");
        if (typeof pane.currentStation === "string" && ["queue", "ready", "defected"].includes(pane.currentStation)) {
            return getColorOption("slate");
        }
        if (pane.currentStation == null && (pane.currentStatus === "pending" || pane.currentStatus === "claimed")) {
            return getColorOption("slate");
        }
        if (currentStationIdx >= 0) {
            const routeRef = routing[currentStationIdx];
            const rid = getStationId(routeRef);
            const rname = getStationName(routeRef);
            const station = (rid ? stationMap.get(rid) : undefined)
                ?? (rname ? stationByName.get(rname) : undefined)
                ?? (rid ? stationByName.get(rid) : undefined);
            return getColorOption(station?.colorId ?? "sky");
        }
        return getColorOption("sky");
    })();

    const completedCount = routing.filter((_, idx) =>
        isCompleted || (currentStationIdx >= 0 && idx < currentStationIdx)
    ).length;

    const totalMs = pane.startedAt && pane.completedAt
        ? new Date(pane.completedAt).getTime() - new Date(pane.startedAt).getTime()
        : 0;

    const statusLabel: Record<string, string> = {
        pending: "รอดำเนินการ",
        in_progress: "กำลังดำเนินการ",
        completed: "เสร็จแล้ว",
        awaiting_scan_out: "รอสแกนออก",
        claimed: "ถูกเคลม",
    };

    const dimStr = pane.dimensions && (pane.dimensions.width > 0 || pane.dimensions.height > 0)
        ? `${pane.dimensions.width} × ${pane.dimensions.height}${pane.dimensions.thickness > 0 ? ` × ${pane.dimensions.thickness}` : ""} mm`
        : null;

    const rawGlassStr = pane.rawGlass
        ? [pane.rawGlass.glassType, pane.rawGlass.color, pane.rawGlass.thickness ? `${pane.rawGlass.thickness}mm` : null, pane.rawGlass.sheetsPerPane > 1 ? `${pane.rawGlass.sheetsPerPane} แผ่น/ชิ้น` : null].filter(Boolean).join(" · ")
        : null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-slate-900 w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <Package className="h-5 w-5 text-slate-400 shrink-0" />
                    <span className="text-base font-bold text-slate-900 dark:text-white font-mono flex-1 truncate">{pane.paneNumber || pane._id.slice(-6).toUpperCase()}</span>
                    <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 -mr-1">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">

                    {/* ── HERO: Where is this pane right now? ────── */}
                    <div className="p-5 pb-4">
                        <div className="rounded-2xl p-5" style={{ backgroundColor: `${heroColor.swatch}10` }}>
                            {isCompleted ? (
                                <>
                                    <div className="flex items-center gap-2.5 mb-1.5">
                                        <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${heroColor.swatch}25` }}>
                                            <CheckCheck className="h-4 w-4" style={{ color: heroColor.swatch }} />
                                        </div>
                                        <span className="text-sm font-bold" style={{ color: heroColor.swatch }}>ผลิตเสร็จแล้ว</span>
                                    </div>
                                    {totalMs > 0 && (
                                        <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{fmtDuration(totalMs)}</p>
                                    )}
                                    <p className="text-xs text-slate-500 mt-1">ผ่านแล้ว {routing.length} สถานี</p>
                                </>
                            ) : (
                                <>
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                                        <Factory className="h-3.5 w-3.5" style={{ color: heroColor.swatch }} />
                                        {pane.currentStatus === "awaiting_scan_out" ? "เสร็จแล้ว รอสแกนออกที่" : pane.currentStatus === "pending" ? "รอเริ่มที่" : "อยู่ที่สถานี"}
                                    </p>
                                    <p className="text-2xl font-bold text-slate-800 dark:text-white">{currentStationName}</p>
                                    {pane.currentStatus === "in_progress" && (
                                        <p className="text-xs font-semibold mt-1.5 flex items-center gap-1" style={{ color: heroColor.swatch }}>
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            กำลังดำเนินการ
                                        </p>
                                    )}
                                </>
                            )}

                            {routing.length > 0 && (
                                <div className="flex items-center gap-1.5 mt-4">
                                    <div className="flex items-center flex-1 min-w-0">
                                        {routing.map((routeRef, idx) => {
                                            const rid = getStationId(routeRef);
                                            const rname = getStationName(routeRef);
                                            const st = (rid ? stationMap.get(rid) : undefined)
                                                ?? (rname ? stationByName.get(rname) : undefined)
                                                ?? (rid ? stationByName.get(rid) : undefined);
                                            const dc = getColorOption(st?.colorId ?? "sky");
                                            const dp = isCompleted || (currentStationIdx >= 0 && idx < currentStationIdx);
                                            const dcr = !isCompleted && idx === currentStationIdx;
                                            return (
                                                <div key={rid || `r-${idx}`} className="flex items-center flex-1">
                                                    <div
                                                        className={`shrink-0 rounded-full ${dcr ? "w-3.5 h-3.5 ring-2 ring-white dark:ring-slate-900 animate-pulse" : dp ? "w-2.5 h-2.5" : "w-2 h-2 bg-slate-200 dark:bg-slate-700"}`}
                                                        style={(dp || dcr) ? { backgroundColor: dc.swatch } : undefined}
                                                    />
                                                    {idx < routing.length - 1 && (
                                                        <div
                                                            className={`h-[3px] flex-1 mx-0.5 rounded-full ${dp ? "" : "bg-slate-200 dark:bg-slate-700"}`}
                                                            style={dp ? { backgroundColor: `${dc.swatch}40` } : undefined}
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <span className="text-[11px] font-bold text-slate-400 shrink-0 tabular-nums ml-2">
                                        {isCompleted ? routing.length : completedCount}/{routing.length}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Pane details — labeled fields ──────────── */}
                    <div className="px-5 pb-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">ข้อมูลกระจก</p>
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-1 divide-y divide-slate-100 dark:divide-slate-800/60">
                            <PaneField label="หมายเลข" value={pane.paneNumber} mono />
                            <PaneField label="QR Code" value={pane.qrCode} mono />
                            <PaneField label="สถานะ" value={statusLabel[pane.currentStatus] ?? pane.currentStatus} accent={isCompleted ? "text-green-600 dark:text-green-400" : pane.currentStatus === "in_progress" ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"} />
                            <PaneField label="สถานีปัจจุบัน" value={currentStationName} />
                            <PaneField label="ขนาด" value={dimStr} />
                            <PaneField label="กระจกดิบ" value={rawGlassStr} />
                            {pane.jobType && <PaneField label="ประเภทงาน" value={pane.jobType} />}
                            {pane.customRouting && <PaneField label="เส้นทาง" value="กำหนดเอง (Custom)" accent="text-violet-600 dark:text-violet-400" />}
                            {pane.remakeOf && <PaneField label="ผลิตซ้ำจาก" value={pane.remakeOf} mono accent="text-orange-600 dark:text-orange-400" />}
                        </div>
                    </div>

                    {/* ── Processes ──────────────────────────────── */}
                    {(pane.processes?.length ?? 0) > 0 && (
                        <div className="px-5 pb-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">กระบวนการ</p>
                            <div className="flex flex-wrap gap-1.5">
                                {pane.processes.map((p, i) => (
                                    <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">{p}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Edge tasks ─────────────────────────────── */}
                    {(pane.edgeTasks?.length ?? 0) > 0 && (
                        <div className="px-5 pb-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">งานขอบ</p>
                            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
                                {pane.edgeTasks.map((et, i) => {
                                    const etStatus = et.status === "completed" ? "text-green-600" : et.status === "in_progress" ? "text-blue-600" : "text-slate-400";
                                    return (
                                        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                                            <span className="text-xs font-bold text-slate-500 w-12 shrink-0 uppercase">{et.side}</span>
                                            <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300 flex-1 truncate">{et.edgeProfile}{et.machineType ? ` (${et.machineType})` : ""}</span>
                                            <span className={`text-[10px] font-bold shrink-0 ${etStatus}`}>{et.status === "completed" ? "เสร็จ" : et.status === "in_progress" ? "กำลังทำ" : "รอ"}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Station journey — timeline ────────────── */}
                    {routing.length > 0 && (
                        <div className="px-5 pb-4">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">เส้นทางการผลิต</p>
                            {loading ? (
                                <div className="flex items-center justify-center py-6">
                                    <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {routing.map((routeRef, idx) => {
                                        const rid = getStationId(routeRef);
                                        const rname = getStationName(routeRef);
                                        const mapKey = rid || `routing-${idx}`;
                                        const station = (rid ? stationMap.get(rid) : undefined)
                                            ?? (rname ? stationByName.get(rname) : undefined)
                                            ?? (rid ? stationByName.get(rid) : undefined);
                                        const colorId = station?.colorId ?? "sky";
                                        const color = getColorOption(colorId);
                                        const stLogs = stationLogsMap.get(mapKey) ?? {};
                                        const isCurrent = idx === currentStationIdx && !isCompleted;
                                        const isPassed = isCompleted || (currentStationIdx >= 0 && idx < currentStationIdx);
                                        const isFuture = !isCurrent && !isPassed;

                                        let duration: string | null = null;
                                        if (stLogs.scan_in && stLogs.complete) {
                                            const ms = new Date(stLogs.complete.completedAt ?? stLogs.complete.createdAt).getTime()
                                                - new Date(stLogs.scan_in.createdAt).getTime();
                                            if (ms > 0) duration = fmtDuration(ms);
                                        }

                                        return (
                                            <div
                                                key={mapKey}
                                                className={`px-4 py-3 ${isCurrent ? "" : ""}`}
                                                style={isCurrent ? { backgroundColor: `${color.swatch}08` } : undefined}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className={`shrink-0 rounded-full flex items-center justify-center ${
                                                            isCurrent ? "w-5 h-5" :
                                                            isPassed  ? "w-4 h-4" :
                                                                        "w-3 h-3 bg-slate-200 dark:bg-slate-700"
                                                        }`}
                                                        style={(isPassed || isCurrent) ? { backgroundColor: color.swatch } : undefined}
                                                    >
                                                        {isPassed && <CheckCheck className="h-2 w-2 text-white" />}
                                                        {isCurrent && <div className="h-2 w-2 rounded-full bg-white animate-pulse" />}
                                                    </div>

                                                    <span className={`text-sm font-semibold flex-1 truncate ${isFuture ? "text-slate-300 dark:text-slate-600" : "text-slate-800 dark:text-white"}`}>
                                                        {station?.name ?? rname ?? rid}
                                                    </span>

                                                    {isCurrent && (
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ color: color.swatch, backgroundColor: `${color.swatch}15` }}>
                                                            อยู่ที่นี่
                                                        </span>
                                                    )}
                                                    {isPassed && duration && (
                                                        <span className="text-[11px] font-semibold text-slate-400 shrink-0 tabular-nums">{duration}</span>
                                                    )}
                                                </div>

                                                {/* Timestamps under each station — only for passed stations */}
                                                {isPassed && (
                                                    (stLogs.scan_in || stLogs.complete) ? (
                                                        <div className="ml-8 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                                                            {stLogs.scan_in && <span>เข้า {fmtTime(stLogs.scan_in.createdAt)}</span>}
                                                            {stLogs.start && <span>เริ่ม {fmtTime(stLogs.start.createdAt)}</span>}
                                                            {stLogs.complete && <span className="text-green-500">เสร็จ {fmtTime(stLogs.complete.completedAt ?? stLogs.complete.createdAt)}</span>}
                                                        </div>
                                                    ) : (
                                                        <div className="ml-8 mt-1 text-[10px] text-slate-300 dark:text-slate-600 italic">ไม่มีข้อมูลเวลา</div>
                                                    )
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Timestamps — overall ─────────────────── */}
                    <div className="px-5 pb-5">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">ไทม์ไลน์</p>
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-1 divide-y divide-slate-100 dark:divide-slate-800/60">
                            <PaneField label="สร้างเมื่อ" value={fmtTime(pane.createdAt)} />
                            <PaneField label="เริ่มผลิต" value={pane.startedAt ? fmtTime(pane.startedAt) : null} />
                            <PaneField label="ผลิตเสร็จ" value={pane.completedAt ? fmtTime(pane.completedAt) : null} accent="text-green-600 dark:text-green-400" />
                            <PaneField label="ส่งมอบ" value={pane.deliveredAt ? fmtTime(pane.deliveredAt) : null} accent="text-blue-600 dark:text-blue-400" />
                            {totalMs > 0 && <PaneField label="ระยะเวลารวม" value={fmtDuration(totalMs)} accent="text-slate-800 dark:text-white" />}
                            <PaneField label="อัพเดทล่าสุด" value={fmtTime(pane.updatedAt)} />
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

// ── orders in same bill ───────────────────────────────────────────────────────
function BillOrderList({
    orders, currentOrderId, stationMap, onSelect,
}: {
    orders: Order[];
    currentOrderId: string;
    stationMap: Map<string, Station>;
    onSelect: (id: string) => void;
}) {
    if (orders.length <= 1) return null;

    return (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none p-6 sm:p-8 space-y-4">
            <h2 className="text-base font-bold flex items-center gap-2.5 text-slate-800 dark:text-slate-200">
                <div className="h-8 w-8 rounded-full bg-blue-50 dark:bg-[#E8601C]/10 flex items-center justify-center">
                    <Factory className="h-4 w-4 text-blue-600 dark:text-[#E8601C]" />
                </div>
                ออเดอร์ในบิลเดียวกัน
                <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">{orders.length} รายการ</span>
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {orders.map((o) => {
                    const isCurrent = o._id === currentOrderId;
                    const cfg = ORDER_STATUS[o.status as keyof typeof ORDER_STATUS] ?? ORDER_STATUS.pending;
                    const curStation = (() => {
                        if (o.status === "completed") return null;
                        if (!o.stations?.length) return null;
                        const ref = o.stations[o.currentStationIndex ?? 0];
                        const sid = getStationId(ref);
                        const st  = sid ? stationMap.get(sid) : undefined;
                        const colorId = st?.colorId ?? "sky";
                        const color   = getColorOption(colorId);
                        return { name: st?.name ?? getStationName(ref) ?? sid, color };
                    })();

                    return (
                        <button
                            key={o._id}
                            className={`w-full flex items-center gap-4 py-3 sm:py-4 text-left hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors rounded-2xl px-3 -mx-3 ${isCurrent ? "pointer-events-none bg-blue-50/30 dark:bg-[#E8601C]/5" : "group"}`}
                            onClick={() => !isCurrent && onSelect(o._id)}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2.5">
                                    <span className={`font-mono text-sm font-bold ${isCurrent ? "text-blue-600 dark:text-[#E8601C]" : "text-slate-700 dark:text-slate-300"}`}>
                                        #{o.code ?? o._id.slice(-6).toUpperCase()}
                                    </span>
                                    {isCurrent && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-transparent text-blue-700 dark:text-[#E8601C]">← กำลังดูอยู่</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-1.5">
                                    {curStation && (
                                        <span
                                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${curStation.color.cls}`}
                                        >
                                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: curStation.color.swatch }} />
                                            {curStation.name}
                                        </span>
                                    )}
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-100 dark:border-slate-800 ${cfg.cls}`}>
                                        {cfg.label}
                                    </span>
                                </div>
                            </div>
                            {!isCurrent && <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 dark:group-hover:text-[#E8601C] shrink-0" />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function ProductionDetailPage() {
    const { id }   = useParams<{ id: string }>();
    const router   = useRouter();

    const [order,      setOrder]      = useState<Order | null>(null);
    const [request,    setRequest]    = useState<OrderRequest | null>(null);
    const [billOrders, setBillOrders] = useState<Order[]>([]);
    const [stations,   setStations]   = useState<Station[]>([]);
    const [panes,      setPanes]      = useState<Pane[]>([]);
    const [loading,    setLoading]    = useState(true);
    const [error,      setError]      = useState<string | null>(null);
    const [infoTab,    setInfoTab]    = useState<"order" | "bill">("order");
    const [selectedPane, setSelectedPane] = useState<Pane | null>(null);

    const stationMap = new Map(stations.map(s => [s._id, s]));
    const stationByName = new Map(stations.map(s => [s.name, s]));

    const colorMap: Record<string, string> = (() => {
        if (typeof window === "undefined") return {};
        try { return JSON.parse(localStorage.getItem("std_station_colors") ?? "{}"); } catch { return {}; }
    })();

    const loadPanes = useCallback(async () => {
        // Fetch all panes and filter in frontend to ensure visibility (backend order filter might be unstable)
        const pRes = await panesApi.getAll({ limit: 100 }).catch(() => null);
        if (pRes?.success) {
            const myPanes = (pRes.data ?? []).filter(p => {
                const oid = typeof p.order === "string" ? p.order : (p.order as any)?._id;
                return oid === id;
            });
            setPanes(myPanes);
        }
    }, [id]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [oRes, sRes] = await Promise.all([
                ordersApi.getById(id),
                stationsApi.getAll(),
            ]);
            if (!oRes.success) { setError(oRes.message); return; }
            const o = oRes.data;
            setOrder(o);
            if (sRes.success) setStations(sRes.data ?? []);
            await loadPanes();

            const reqId = o.request && typeof o.request === "object"
                ? (o.request as OrderRequest)._id
                : o.request as string;
            if (reqId) {
                const rr = await requestsApi.getById(reqId).catch(() => null);
                if (rr?.success) {
                    setRequest(rr.data);
                    const allRes = await ordersApi.getAll();
                    if (allRes.success) {
                        const siblings = (allRes.data ?? []).filter(x => {
                            const xReqId = x.request && typeof x.request === "object"
                                ? (x.request as OrderRequest)._id
                                : x.request as string;
                            return xReqId === reqId;
                        });
                        setBillOrders(siblings);
                    }
                }
            }
        } finally {
            setLoading(false);
        }
    }, [id, loadPanes]);

    useEffect(() => { load(); }, [load]);

    useWebSocket("pane", ["pane:updated"], () => { loadPanes(); });

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
    );
    if (error || !order) return (
        <div className="p-6 flex flex-col items-center gap-4">
            <AlertCircle className="h-10 w-10 text-destructive/50" />
            <p className="text-sm text-muted-foreground">{error ?? "ไม่พบข้อมูล"}</p>
            <Button variant="outline" onClick={() => router.back()}>กลับ</Button>
        </div>
    );

    const statusCfg = ORDER_STATUS[order.status as keyof typeof ORDER_STATUS] ?? ORDER_STATUS.pending;

    const stationLookup = new Map<string, number>();
    (order.stations ?? []).forEach((ref, i) => {
        const sid = getStationId(ref);
        if (sid) stationLookup.set(sid, i);
        const nm = getStationName(ref);
        if (nm) stationLookup.set(nm, i);
        const st = sid ? stationMap.get(sid) : undefined;
        if (st?.name) stationLookup.set(st.name, i);
    });

    const doneStationCount = (() => {
        const ids = order.stations ?? [];
        if (!ids.length || !panes.length) return order.status === "completed" ? ids.length : 0;
        return ids.filter((_, idx) =>
            panes.every(p => p.currentStatus === "completed" || (stationLookup.get(getStationId(p.currentStation)) ?? -1) > idx)
        ).length;
    })();

    return (
        <>
        <div className="space-y-6">

            {/* Back + title */}
            <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                    <Button variant="outline" size="sm" className="h-10 w-10 p-0 rounded-xl border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 mt-0.5" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-col sm:flex-row">
                            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                                <Factory className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-[#E8601C] shrink-0" />
                                <span className="break-all">คำสั่งผลิต {order.orderNumber ?? (order.code ? `#${order.code}` : `#${order._id.slice(-6).toUpperCase()}`)}</span>
                            </h1>
                            <span className={`rounded-full px-3 py-1 text-xs font-bold shrink-0 ${statusCfg.cls}`}>
                                {statusCfg.label}
                            </span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">สร้างเมื่อ {fmtDate(order.createdAt)}</p>
                    </div>
                </div>
                <Button className="h-11 rounded-xl gap-2 font-bold w-full sm:w-auto sm:self-end bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 transition-all border-0" onClick={() => router.push(`/production/${id}/print`)}>
                    <Printer className="h-4 w-4" />
                    พิมพ์ใบงาน
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* ── Left ────────────────────────────────────────────── */}
                <div className="space-y-6">

                    {/* Order + Bill toggle card */}
                    <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none p-5 sm:p-8">
                        {/* Tab toggle */}
                        <div className="flex items-center gap-1 sm:gap-1.5 rounded-2xl bg-slate-100/80 dark:bg-slate-800/50 p-1 mb-5 sm:mb-6 w-full sm:w-fit border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm">
                            <button
                                onClick={() => setInfoTab("order")}
                                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                                    infoTab === "order"
                                        ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-[#E8601C] shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
                                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800"
                                }`}
                            >
                                <Factory className="h-4 w-4 shrink-0" />
                                ข้อมูลออเดอร์
                            </button>
                            {request && (
                                <button
                                    onClick={() => setInfoTab("bill")}
                                    className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                                        infoTab === "bill"
                                            ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-[#E8601C] shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800"
                                    }`}
                                >
                                    <Info className="h-4 w-4 shrink-0" />
                                    ข้อมูลบิล
                                </button>
                            )}
                        </div>

                        {/* Order tab */}
                        {infoTab === "order" && (
                            <>
                                <InfoRow icon={User}     label="ลูกค้า"       value={getStr(order.customer)} />
                                <InfoRow icon={Package}  label="วัสดุ"        value={getStr(order.material)} />
                                <InfoRow icon={Hash}     label="จำนวน"        value={`${order.quantity} ชิ้น`} />
                                <InfoRow icon={User}     label="ผู้รับผิดชอบ"  value={getStr(order.assignedTo) || getStr(request?.assignedTo) || "—"} />
                                <InfoRow icon={Clock}    label="ความสำคัญ"    value={`P${order.priority}`} />
                            </>
                        )}

                        {/* Bill tab */}
                        {infoTab === "bill" && request && (
                            <>
                                <InfoRow icon={Package}  label="ประเภทสินค้า"  value={request.details?.type ?? "—"} />
                                <InfoRow icon={Hash}     label="จำนวน (บิล)"   value={`${request.details?.quantity ?? "—"} ชิ้น`} />
                                <InfoRow icon={Hash}     label="ราคาประมาณ"    value={`฿${(request.details?.estimatedPrice ?? 0).toLocaleString()}`} />
                                <InfoRow icon={Calendar} label="กำหนดส่ง"      value={fmtDate(request.deadline)} />
                                <InfoRow icon={MapPin}   label="สถานที่ส่ง"    value={request.deliveryLocation ?? "—"} />
                            </>
                        )}
                    </div>

                    {/* Sibling orders in same bill */}
                    <BillOrderList
                        orders={billOrders}
                        currentOrderId={order._id}
                        stationMap={stationMap}

                        onSelect={(newId) => router.push(`/production/${newId}`)}
                    />
                </div>

                {/* ── Right: station journey ───────────────────────────── */}
                <div className="space-y-6">
                    <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none p-5 sm:p-8 space-y-5 sm:space-y-6">
                        <div className="flex items-center justify-between gap-4">
                            <h2 className="text-base font-bold flex items-center gap-2.5 text-slate-800 dark:text-slate-200">
                                <div className="h-8 w-8 rounded-full bg-blue-50 dark:bg-[#E8601C]/10 flex items-center justify-center text-blue-600 dark:text-[#E8601C]">
                                    <Factory className="h-4 w-4" />
                                </div>
                                เส้นทางสถานีการผลิต
                            </h2>
                            {order.stations?.length > 0 && (
                                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                    {order.status === "completed"
                                        ? `ผ่านแล้ว ${order.stations.length} สถานี`
                                        : `${doneStationCount} / ${order.stations.length} สถานีเสร็จ`
                                    }
                                </span>
                            )}
                        </div>

                        <div className="relative px-1 sm:px-2 -mx-1 sm:-mx-2">
                            <StationJourney
                                order={order}
                                stationMap={stationMap}
        
                                panes={panes}
                            />
                        </div>

                        {order.status === "completed" && (
                            <div className="flex items-center gap-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3 shrink-0">
                                <CheckCheck className="h-4 w-4 text-green-600 shrink-0" />
                                <span className="text-sm text-green-700 dark:text-green-400 font-bold">
                                    คำสั่งผลิตนี้เสร็จสมบูรณ์แล้ว
                                </span>
                            </div>
                        )}

                        {order.stations?.length > 0 && (
                            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wide font-semibold mb-2">
                                    สถานีทั้งหมด
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {order.stations.map((ref, idx) => {
                                        const sid = getStationId(ref);
                                        const station = sid ? stationMap.get(sid) : undefined;
                                        const colorId = station?.colorId ?? "sky";
                                        const color   = getColorOption(colorId);
                                        const pHere   = panes.filter(p => (stationLookup.get(getStationId(p.currentStation)) ?? -1) === idx).length;
                                        const pPassed = panes.length > 0 ? panes.filter(p => {
                                            if (p.currentStatus === "completed") return true;
                                            return (stationLookup.get(getStationId(p.currentStation)) ?? -1) > idx;
                                        }).length : 0;
                                        const isDone   = order.status === "completed" || (panes.length > 0 ? pPassed === panes.length : idx < (order.currentStationIndex ?? 0));
                                        const isCur    = order.status !== "completed" && order.status !== "cancelled" && (panes.length > 0 ? pHere > 0 : idx === (order.currentStationIndex ?? 0));
                                        return (
                                            <span
                                                key={sid || `os-${idx}`}
                                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-all ${
                                                    order.status === "cancelled" ? "bg-slate-100 dark:bg-slate-800 text-slate-400 border-transparent opacity-50" :
                                                    isCur   ? `${color.cls} shadow-sm` :
                                                    isDone  ? `${color.cls} border-transparent opacity-75` :
                                                              "bg-slate-50 dark:bg-slate-800/30 text-slate-400 border-transparent opacity-50"
                                                }`}
                                                style={isCur && order.status !== "cancelled" ? { borderColor: color.swatch } : undefined}
                                            >
                                                <span
                                                    className="h-1.5 w-1.5 rounded-full shrink-0"
                                                    style={order.status !== "cancelled" ? { backgroundColor: color.swatch } : undefined}
                                                />
                                                {station?.name ?? getStationName(ref) ?? sid}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Pane list ─────────────────────────────────────────── */}
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/20 dark:shadow-none overflow-hidden mt-6 flex flex-col">
                <div className="px-5 sm:px-8 py-4 sm:py-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-slate-50/50 dark:bg-slate-900/30">
                    <h2 className="text-base font-bold flex items-center gap-2.5 text-slate-800 dark:text-slate-200">
                        <div className="h-8 w-8 rounded-full bg-blue-50 dark:bg-[#E8601C]/10 flex items-center justify-center">
                            <Package className="h-4 w-4 text-blue-600 dark:text-[#E8601C]" />
                        </div>
                        กระจกแต่ละชิ้น (Panes)
                    </h2>
                    {panes.length > 0 && (
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-slate-500 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                                {panes.filter(p => p.currentStatus === "completed").length}/{panes.length} เสร็จแล้ว
                            </span>
                            <div className="w-24 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden shadow-inner">
                                <div
                                    className="h-full rounded-full bg-green-500 transition-all duration-500"
                                    style={{ width: `${(panes.filter(p => p.currentStatus === "completed").length / panes.length) * 100}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {panes.length === 0 ? (
                    <div className="p-8 sm:p-12 flex flex-col items-center justify-center text-center">
                        <div className="h-14 w-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                            <Package className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                        </div>
                        <p className="text-sm font-bold text-slate-500 dark:text-slate-400">ยังไม่มีกระจกในคำสั่งผลิตนี้</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">กระจกจะปรากฏที่นี่เมื่อถูกสร้างขึ้น ({order.quantity} ชิ้น)</p>
                    </div>
                ) : (
                <div className="p-4 sm:p-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                            {panes.map((pane) => {
                                const stCfg = ({
                                    pending:            { label: "รอ",          dot: "bg-amber-400",  text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50" },
                                    in_progress:        { label: "กำลังทำ",     dot: "bg-blue-500",   text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50" },
                                    completed:          { label: "เสร็จ",       dot: "bg-green-500",  text: "text-green-600 dark:text-green-400", bg: "bg-green-50" },
                                    awaiting_scan_out:  { label: "รอสแกนออก",  dot: "bg-amber-500",  text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50" },
                                    claimed:            { label: "เคลม",       dot: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50" },
                                } as Record<string, { label: string; dot: string; text: string; bg: string }>)[pane.currentStatus] ?? { label: pane.currentStatus, dot: "bg-gray-400", text: "text-gray-500", bg: "bg-gray-50" };

                                const curId = getStationId(pane.currentStation);
                                const curName = getStationName(pane.currentStation);
                                const paneStation = (curId ? stationMap.get(curId) : undefined)
                                    ?? stationByName.get(curName)
                                    ?? (curId ? stationByName.get(curId) : undefined);

                                const stationName = (() => {
                                    if (typeof pane.currentStation === "string") {
                                        if (pane.currentStation === "queue") return "คิว";
                                        if (pane.currentStation === "ready") return "พร้อมส่ง";
                                        if (pane.currentStation === "defected") return "ชำรุด";
                                    }
                                    if (pane.currentStation == null) {
                                        if (pane.currentStatus === "pending") return "คิว";
                                        if (pane.currentStatus === "completed") return "เสร็จแล้ว";
                                        if (pane.currentStatus === "claimed") return "ถูกเคลม";
                                        return curName || "—";
                                    }
                                    return paneStation?.name ?? curName ?? curId;
                                })();

                                const isSpecialStation =
                                    (typeof pane.currentStation === "string" && ["queue", "ready", "defected"].includes(pane.currentStation))
                                    || (pane.currentStation == null && ["pending", "completed", "claimed"].includes(pane.currentStatus));

                                const paneColorId = isSpecialStation ? "slate" : (paneStation?.colorId ?? "sky");
                                const paneColor = getColorOption(paneColorId);

                                return (
                                    <button
                                        type="button"
                                        key={pane._id}
                                        onClick={() => setSelectedPane(pane)}
                                        className="relative overflow-hidden flex flex-col gap-2.5 p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm text-left w-full cursor-pointer hover:border-blue-300 dark:hover:border-[#E8601C]/50 hover:shadow-md transition-all group"
                                    >
                                        <div className="flex items-center justify-between w-full">
                                            <div className="flex items-center gap-2.5">
                                                <Package className="h-4 w-4 text-slate-300" />
                                                <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-200">{pane.paneNumber}</span>
                                            </div>
                                            <span className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg ${stCfg.bg} dark:bg-transparent ${stCfg.text} border border-transparent dark:border-slate-800`}>
                                                <span className={`h-1.5 w-1.5 rounded-full shadow-sm ${stCfg.dot}`} />
                                                {stCfg.label}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between w-full mt-1">
                                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                                {pane.dimensions && (pane.dimensions.width > 0 || pane.dimensions.height > 0) && (
                                                    <span className="text-[11px] font-mono font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                                                        {pane.dimensions.width}×{pane.dimensions.height}
                                                    </span>
                                                )}
                                                {pane.jobType && (
                                                    <span className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-500/20">
                                                        {pane.jobType}
                                                    </span>
                                                )}
                                                {pane.processes?.filter(p => p !== pane.jobType).map(proc => (
                                                    <span key={proc} className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-100 dark:border-sky-500/20">
                                                        {proc}
                                                    </span>
                                                ))}
                                            </div>
                                            <div
                                                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border ${
                                                    isSpecialStation
                                                        ? "text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700/50"
                                                        : paneColor.cls
                                                }`}
                                                style={!isSpecialStation ? { borderColor: `${paneColor.swatch}30` } : undefined}
                                            >
                                                <span
                                                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${isSpecialStation ? "bg-slate-400" : ""}`}
                                                    style={!isSpecialStation ? { backgroundColor: paneColor.swatch } : undefined}
                                                />
                                                <span className="truncate max-w-[100px]">{stationName}</span>
                                            </div>
                                        </div>
                                        {pane.currentStatus === "completed" && (
                                            <div className="absolute top-0 right-0 p-1.5 bg-green-500 rounded-bl-2xl">
                                                <CheckCheck className="h-4 w-4 text-white" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                    </div>
                </div>
                )}
            </div>
        </div>

        {selectedPane && (
            <PaneDetailModal
                pane={selectedPane}
                stationMap={stationMap}
                stationByName={stationByName}

                onClose={() => setSelectedPane(null)}
            />
        )}

        </>
    );
}
