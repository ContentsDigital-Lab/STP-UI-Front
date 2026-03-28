"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft, Loader2, AlertCircle, Factory,
    User, Package, Calendar, MapPin, Hash, Clock,
    Printer, Info, CheckCheck, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ordersApi } from "@/lib/api/orders";
import { panesApi } from "@/lib/api/panes";
import { requestsApi } from "@/lib/api/requests";
import { stationsApi } from "@/lib/api/stations";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { getColorOption } from "@/lib/stations/stations-store";
import { Order, OrderRequest, Station, Pane } from "@/lib/api/types";

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

// ── station journey ───────────────────────────────────────────────────────────
function StationJourney({
    order, stationMap, panes,
}: {
    order: Order;
    stationMap: Map<string, Station>;
    panes: Pane[];
}) {
    const stationIds  = order.stations ?? [];
    const isDone      = order.status === "completed";
    const isCancelled = order.status === "cancelled";
    const total       = panes.length;

    const stationIdxMap = new Map<string, number>();
    stationIds.forEach((sid, i) => {
        stationIdxMap.set(sid, i);
        const s = stationMap.get(sid);
        if (s?.name) stationIdxMap.set(s.name, i);
    });
    const stStats = new Map<string, { here: number; passed: number }>();
    for (const sid of stationIds) stStats.set(sid, { here: 0, passed: 0 });
    if (total > 0) {
        for (const p of panes) {
            const pIdx = stationIdxMap.get(p.currentStation) ?? -1;
            const done = p.currentStatus === "completed";
            for (let i = 0; i < stationIds.length; i++) {
                const s = stStats.get(stationIds[i])!;
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
            {stationIds.map((sid, idx) => {
                const station  = stationMap.get(sid);
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

                return (
                    <div key={sid} className="relative flex items-stretch gap-3 w-full">
                        {/* Left: Timeline Container */}
                        <div className="relative flex flex-col items-center justify-center shrink-0 w-10">
                            {/* Top Line (from previous node) */}
                            {!isFirst && (
                                <div 
                                    className={`absolute top-0 bottom-1/2 w-0.5 ${
                                        isPast || isCur ? "bg-blue-300 dark:bg-orange-500/60" : "bg-slate-200 dark:bg-slate-800"
                                    }`} 
                                />
                            )}
                            {/* Bottom Line (to next node) */}
                            {!isLast && (
                                <div 
                                    className={`absolute top-1/2 bottom-0 w-0.5 ${
                                        isPast ? "bg-blue-300 dark:bg-orange-500/60" : "bg-slate-200 dark:bg-slate-800"
                                    }`} 
                                />
                            )}
                            
                            {/* Node Dot - centered precisely */}
                            <div
                                className={`relative z-10 flex items-center justify-center shrink-0 ${
                                    isCancelled ? "w-4 h-4 rounded-full bg-slate-300 dark:bg-slate-700" :
                                    isCur       ? "w-6 h-6 rounded-full bg-white dark:bg-slate-900 ring-[3px] ring-blue-500 dark:ring-[#E8601C] ring-offset-[3px] ring-offset-white dark:ring-offset-slate-900" :
                                    isPast      ? "w-5 h-5 rounded-full" :
                                                  "w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-700"
                                }`}
                                style={{
                                    ...(isPast && !isCur && !isCancelled ? { backgroundColor: color.swatch } : {})
                                }}
                            >
                                {isCur && (
                                    <div className="h-2 w-2 rounded-full animate-pulse bg-blue-500 dark:bg-[#E8601C]" />
                                )}
                                {isPast && !isCur && !isCancelled && (
                                    <CheckCheck className="h-2.5 w-2.5 text-white" />
                                )}
                            </div>
                        </div>

                        {/* Right: Station Card */}
                        <div className="flex-1 min-w-0 py-1.5">
                            <div
                                className={`rounded-xl p-3.5 border transition-all ${
                                    isCur
                                        ? "bg-white dark:bg-slate-900 shadow-md border-2 border-blue-500 dark:border-[#E8601C]"
                                        : isPast
                                            ? "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800"
                                            : "bg-slate-50 dark:bg-slate-800/20 border-slate-200 dark:border-slate-800"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div
                                            className={`flex items-center justify-center p-2 rounded-lg shrink-0 ${
                                                isCur ? "bg-blue-50 dark:bg-[#E8601C]/10 text-blue-600 dark:text-[#E8601C]" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                                            }`}
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
                                                {station?.name ?? sid}
                                            </span>
                                            {!isCancelled && total > 0 ? (
                                                <div className="text-[11px] font-semibold mt-0.5 flex items-center gap-1">
                                                    {st.here > 0 ? (
                                                        <span className="text-blue-600 dark:text-[#E8601C] flex items-center gap-1">
                                                            <Loader2 className="h-3 w-3 animate-spin" />
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
                                                        <div className="text-[11px] font-semibold mt-0.5 flex items-center gap-1 text-blue-600 dark:text-[#E8601C]">
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
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 shrink-0 relative">
                                            <span className="h-1.5 w-1.5 rounded-full animate-ping absolute left-2 bg-blue-500 dark:bg-[#E8601C]" />
                                            <span className="h-1.5 w-1.5 rounded-full relative bg-blue-500 dark:bg-[#E8601C]" />
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
                                                isPast ? "bg-green-500" : isCur ? "bg-blue-500 dark:bg-[#E8601C]" : "bg-slate-300 dark:bg-slate-600"
                                            }`}
                                            style={{ width: `${pct}%` }}
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
                        const sid = o.stations[o.currentStationIndex ?? 0];
                        const st  = stationMap.get(sid);
                        const colorId = st?.colorId ?? "sky";
                        const color   = getColorOption(colorId);
                        return { name: st?.name ?? sid, color };
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

    const stationMap = new Map(stations.map(s => [s._id, s]));

    const loadPanes = useCallback(async () => {
        const pRes = await panesApi.getAll({ order: id, limit: 100 }).catch(() => null);
        if (pRes?.success) setPanes(pRes.data ?? []);
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
    (order.stations ?? []).forEach((sid, i) => {
        stationLookup.set(sid, i);
        const st = stationMap.get(sid);
        if (st?.name) stationLookup.set(st.name, i);
    });

    const doneStationCount = (() => {
        const ids = order.stations ?? [];
        if (!ids.length || !panes.length) return order.status === "completed" ? ids.length : 0;
        return ids.filter((_, idx) =>
            panes.every(p => p.currentStatus === "completed" || (stationLookup.get(p.currentStation) ?? -1) > idx)
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
                                <span className="break-all">คำสั่งผลิต {order.code ? `#${order.code}` : `#${order._id.slice(-6).toUpperCase()}`}</span>
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
                                <InfoRow icon={User}     label="ลูกค้า"      value={getStr(order.customer)} />
                                <InfoRow icon={Package}  label="วัสดุ"       value={getStr(order.material)} />
                                <InfoRow icon={Hash}     label="จำนวน"       value={`${order.quantity} ชิ้น`} />
                                <InfoRow icon={User}     label="มอบหมายให้"  value={getStr(order.assignedTo)} />
                                <InfoRow icon={Clock}    label="ความสำคัญ"   value={`P${order.priority}`} />
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
                    <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none p-5 sm:p-8 space-y-5 sm:space-y-6 flex flex-col h-full overflow-hidden">
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

                        <div className="overflow-y-auto max-h-[320px] sm:max-h-[400px] flex-1 relative hide-scrollbar px-1 sm:px-2 -mx-1 sm:-mx-2">
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
                                    {order.stations.map((sid, idx) => {
                                        const station = stationMap.get(sid);
                                        const colorId = station?.colorId ?? "sky";
                                        const color   = getColorOption(colorId);
                                        const pHere   = panes.filter(p => (stationLookup.get(p.currentStation) ?? -1) === idx).length;
                                        const pPassed = panes.length > 0 ? panes.filter(p => {
                                            if (p.currentStatus === "completed") return true;
                                            return (stationLookup.get(p.currentStation) ?? -1) > idx;
                                        }).length : 0;
                                        const isDone  = order.status === "completed" || (panes.length > 0 ? pPassed === panes.length : idx < (order.currentStationIndex ?? 0));
                                        const isCur   = order.status !== "completed" && order.status !== "cancelled" && (panes.length > 0 ? pHere > 0 : idx === (order.currentStationIndex ?? 0));
                                        return (
                                            <span
                                                key={sid}
                                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-all ${
                                                    order.status === "cancelled" ? "bg-slate-100 dark:bg-slate-800 text-slate-400 border-transparent opacity-50" :
                                                    isCur   ? "border-blue-500 dark:border-[#E8601C] text-blue-600 dark:text-[#E8601C] bg-blue-50 dark:bg-[#E8601C]/10 shadow-sm" :
                                                    isDone  ? `${color.cls} border-transparent opacity-75` :
                                                              "bg-slate-50 dark:bg-slate-800/30 text-slate-400 border-transparent opacity-50"
                                                }`}
                                            >
                                                <span
                                                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${isCur ? "bg-blue-600 dark:bg-[#E8601C]" : ""}`}
                                                    style={(!isCur && order.status !== "cancelled") ? { backgroundColor: color.swatch } : {}}
                                                />
                                                {station?.name ?? sid}
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
            {panes.length > 0 && (
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/20 dark:shadow-none overflow-hidden mt-6 flex flex-col">
                    <div className="px-5 sm:px-8 py-4 sm:py-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-slate-50/50 dark:bg-slate-900/30">
                        <h2 className="text-base font-bold flex items-center gap-2.5 text-slate-800 dark:text-slate-200">
                            <div className="h-8 w-8 rounded-full bg-blue-50 dark:bg-[#E8601C]/10 flex items-center justify-center">
                                <Package className="h-4 w-4 text-blue-600 dark:text-[#E8601C]" />
                            </div>
                            กระจกแต่ละชิ้น (Panes)
                        </h2>
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
                    </div>
                    
                    <div className="p-4 sm:p-8">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                            {panes.map((pane) => {
                                const stCfg = ({
                                    pending:            { label: "รอ",          dot: "bg-amber-400",  text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50" },
                                    in_progress:        { label: "กำลังทำ",     dot: "bg-blue-500",   text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50" },
                                    completed:          { label: "เสร็จ",       dot: "bg-green-500",  text: "text-green-600 dark:text-green-400", bg: "bg-green-50" },
                                    awaiting_scan_out:  { label: "รอสแกนออก",  dot: "bg-amber-500",  text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50" },
                                } as Record<string, { label: string; dot: string; text: string; bg: string }>)[pane.currentStatus] ?? { label: pane.currentStatus, dot: "bg-gray-400", text: "text-gray-500", bg: "bg-gray-50" };

                                const stationName = (() => {
                                    if (pane.currentStation === "queue") return "คิว";
                                    if (pane.currentStation === "ready") return "พร้อมส่ง";
                                    if (pane.currentStation === "defected") return "ชำรุด";
                                    const st = stationMap.get(pane.currentStation);
                                    return st?.name ?? pane.currentStation;
                                })();

                                return (
                                    <div
                                        key={pane._id}
                                        className="relative overflow-hidden flex flex-col gap-2.5 p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm text-left w-full"
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
                                            {pane.dimensions && (pane.dimensions.width > 0 || pane.dimensions.height > 0) ? (
                                                <span className="text-[11px] font-mono font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                                                    {pane.dimensions.width}×{pane.dimensions.height}
                                                </span>
                                            ) : (
                                                <span />
                                            )}
                                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1 rounded-lg border border-slate-100 dark:border-slate-700/50">
                                                <MapPin className="h-3 w-3" />
                                                <span className="truncate max-w-[100px]">{stationName}</span>
                                            </div>
                                        </div>
                                        {pane.currentStatus === "completed" && (
                                            <div className="absolute top-0 right-0 p-1.5 bg-green-500 rounded-bl-2xl">
                                                <CheckCheck className="h-4 w-4 text-white" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>

        </>
    );
}
