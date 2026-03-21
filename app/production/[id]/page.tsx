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

// ── color storage ─────────────────────────────────────────────────────────────
const COLOR_STORAGE_KEY = "std_station_colors";
function loadColorMap(): Record<string, string> {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}"); } catch { return {}; }
}

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
        <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
            <div className="p-1.5 rounded-lg bg-muted/50 text-muted-foreground mt-0.5 shrink-0">
                <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">{label}</p>
                <p className="text-sm text-foreground mt-0.5 break-words">{value}</p>
            </div>
        </div>
    );
}

const fmtDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }) : "—";

// ── station journey ───────────────────────────────────────────────────────────
function StationJourney({
    order, stationMap, colorMap,
}: {
    order: Order;
    stationMap: Map<string, Station>;
    colorMap: Record<string, string>;
}) {
    const stationIds  = order.stations ?? [];
    const currentIdx  = order.currentStationIndex ?? 0;
    const isDone      = order.status === "completed";
    const isCancelled = order.status === "cancelled";

    if (!stationIds.length) {
        return (
            <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-6 text-center">
                <Factory className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-xs text-muted-foreground">ยังไม่ได้กำหนดสถานี</p>
            </div>
        );
    }

    return (
        <div className="space-y-1">
            {stationIds.map((sid, idx) => {
                const station  = stationMap.get(sid);
                const colorId  = colorMap[sid] ?? station?.colorId ?? "sky";
                const color    = getColorOption(colorId);
                const isPast   = isDone || idx < currentIdx;
                const isCur    = !isDone && !isCancelled && idx === currentIdx;
                const isFuture = !isDone && !isCancelled && idx > currentIdx;

                return (
                    <div key={sid} className="flex items-stretch gap-3">
                        {/* Left: dot + line */}
                        <div className="flex flex-col items-center w-6 shrink-0">
                            {/* Connector line above */}
                            <div className={`w-px flex-1 mb-1 ${idx === 0 ? "opacity-0" : isPast || isCur ? "bg-border" : "bg-border/30"}`} />
                            {/* Dot */}
                            <div
                                className={`rounded-full shrink-0 flex items-center justify-center transition-all ${
                                    isCancelled ? "w-2.5 h-2.5 bg-muted" :
                                    isCur       ? "w-4 h-4 ring-2 ring-offset-2 shadow-sm" :
                                    isPast      ? "w-3 h-3" :
                                                  "w-2.5 h-2.5 border-2 bg-background"
                                }`}
                                style={{
                                    backgroundColor: isCancelled ? undefined : (isFuture ? undefined : color.swatch),
                                    borderColor:     isFuture ? color.swatch : undefined,
                                    ...(isCur ? { ringColor: color.swatch } : {}),
                                    ...(isCur ? { boxShadow: `0 0 0 2px white, 0 0 0 4px ${color.swatch}` } : {}),
                                }}
                            />
                            {/* Connector line below */}
                            <div className={`w-px flex-1 mt-1 ${idx === stationIds.length - 1 ? "opacity-0" : isPast ? "bg-border" : "bg-border/30"}`} />
                        </div>

                        {/* Right: station info */}
                        <div className={`flex-1 py-1.5 min-w-0 ${idx === stationIds.length - 1 ? "" : ""}`}>
                            <div className={`flex items-center gap-2 ${isCur ? "pb-1" : ""}`}>
                                <span
                                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all ${
                                        isCancelled ? "bg-muted text-muted-foreground" :
                                        isFuture    ? "bg-muted/40 text-muted-foreground/60" :
                                                      color.cls
                                    }`}
                                >
                                    {station?.name ?? sid}
                                </span>
                                {isCur && (
                                    <span className="text-[10px] text-muted-foreground font-medium animate-pulse">← ปัจจุบัน</span>
                                )}
                                {isPast && !isDone && (
                                    <CheckCheck className="h-3 w-3 text-green-500" />
                                )}
                                {isDone && (
                                    <CheckCheck className="h-3 w-3 text-green-500" />
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
    orders, currentOrderId, stationMap, colorMap, onSelect,
}: {
    orders: Order[];
    currentOrderId: string;
    stationMap: Map<string, Station>;
    colorMap: Record<string, string>;
    onSelect: (id: string) => void;
}) {
    if (orders.length <= 1) return null;

    return (
        <div className="rounded-xl border bg-card p-4 space-y-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
                <Factory className="h-4 w-4 text-muted-foreground" />
                ออเดอร์ในบิลเดียวกัน
                <span className="ml-auto text-xs text-muted-foreground font-normal">{orders.length} รายการ</span>
            </h2>
            <div className="divide-y">
                {orders.map((o) => {
                    const isCurrent = o._id === currentOrderId;
                    const cfg = ORDER_STATUS[o.status as keyof typeof ORDER_STATUS] ?? ORDER_STATUS.pending;
                    const curStation = (() => {
                        if (o.status === "completed") return null;
                        if (!o.stations?.length) return null;
                        const sid = o.stations[o.currentStationIndex ?? 0];
                        const st  = stationMap.get(sid);
                        const colorId = colorMap[sid] ?? st?.colorId ?? "sky";
                        const color   = getColorOption(colorId);
                        return { name: st?.name ?? sid, color };
                    })();

                    return (
                        <button
                            key={o._id}
                            className={`w-full flex items-center gap-3 py-2.5 text-left hover:bg-muted/20 transition-colors rounded px-1 -mx-1 ${isCurrent ? "pointer-events-none" : ""}`}
                            onClick={() => !isCurrent && onSelect(o._id)}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`font-mono text-xs font-bold ${isCurrent ? "text-primary" : ""}`}>
                                        #{o.code ?? o._id.slice(-6).toUpperCase()}
                                    </span>
                                    {isCurrent && (
                                        <span className="text-[10px] text-primary font-medium">← กำลังดูอยู่</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    {curStation && (
                                        <span
                                            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${curStation.color.cls}`}
                                        >
                                            <span className="h-1 w-1 rounded-full" style={{ backgroundColor: curStation.color.swatch }} />
                                            {curStation.name}
                                        </span>
                                    )}
                                    <span className={`text-[10px] font-medium ${cfg.cls.split(" ").slice(1).join(" ")}`}>
                                        {cfg.label}
                                    </span>
                                </div>
                            </div>
                            {!isCurrent && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
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
    const [colorMap,   setColorMap]   = useState<Record<string, string>>({});
    const [loading,    setLoading]    = useState(true);
    const [error,      setError]      = useState<string | null>(null);

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
            setColorMap(loadColorMap());
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

    return (
        <div className="space-y-6">

            {/* Back + title */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            <Factory className="h-5 w-5 text-primary shrink-0" />
                            คำสั่งผลิต #{order.code ?? order._id.slice(-6).toUpperCase()}
                        </h1>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.cls}`}>
                            {statusCfg.label}
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground">สร้างเมื่อ {fmtDate(order.createdAt)}</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => router.push(`/production/${id}/print`)}>
                    <Printer className="h-4 w-4" />
                    พิมพ์ใบงาน
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* ── Left ────────────────────────────────────────────── */}
                <div className="space-y-4">

                    {/* Order details */}
                    <div className="rounded-xl border bg-card p-4">
                        <h2 className="text-sm font-semibold mb-2">ข้อมูลออเดอร์</h2>
                        <InfoRow icon={User}     label="ลูกค้า"      value={getStr(order.customer)} />
                        <InfoRow icon={Package}  label="วัสดุ"       value={getStr(order.material)} />
                        <InfoRow icon={Hash}     label="จำนวน"       value={`${order.quantity} ชิ้น`} />
                        <InfoRow icon={User}     label="มอบหมายให้"  value={getStr(order.assignedTo)} />
                        <InfoRow icon={Clock}    label="ความสำคัญ"   value={`P${order.priority}`} />
                    </div>

                    {/* Bill (request) details */}
                    {request && (
                        <div className="rounded-xl border bg-card p-4">
                            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                <Info className="h-4 w-4 text-muted-foreground" />
                                ข้อมูลบิล
                            </h2>
                            <InfoRow icon={Package}  label="ประเภทสินค้า"  value={request.details?.type ?? "—"} />
                            <InfoRow icon={Hash}     label="จำนวน (บิล)"   value={`${request.details?.quantity ?? "—"} ชิ้น`} />
                            <InfoRow icon={Hash}     label="ราคาประมาณ"    value={`฿${(request.details?.estimatedPrice ?? 0).toLocaleString()}`} />
                            <InfoRow icon={Calendar} label="กำหนดส่ง"      value={fmtDate(request.deadline)} />
                            <InfoRow icon={MapPin}   label="สถานที่ส่ง"    value={request.deliveryLocation ?? "—"} />
                        </div>
                    )}

                    {/* Sibling orders in same bill */}
                    <BillOrderList
                        orders={billOrders}
                        currentOrderId={order._id}
                        stationMap={stationMap}
                        colorMap={colorMap}
                        onSelect={(newId) => router.push(`/production/${newId}`)}
                    />
                </div>

                {/* ── Right: station journey ───────────────────────────── */}
                <div className="space-y-4">
                    <div className="rounded-xl border bg-card p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold flex items-center gap-2">
                                <Factory className="h-4 w-4 text-primary" />
                                เส้นทางสถานีการผลิต
                            </h2>
                            {order.stations?.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                    {order.status === "completed"
                                        ? `ผ่านทั้งหมด ${order.stations.length} สถานี`
                                        : `${(order.currentStationIndex ?? 0) + 1} / ${order.stations.length} สถานี`
                                    }
                                </span>
                            )}
                        </div>

                        <StationJourney
                            order={order}
                            stationMap={stationMap}
                            colorMap={colorMap}
                        />

                        {order.status === "completed" && (
                            <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2">
                                <CheckCheck className="h-4 w-4 text-green-600 shrink-0" />
                                <span className="text-sm text-green-700 dark:text-green-400 font-medium">
                                    คำสั่งผลิตนี้เสร็จสมบูรณ์แล้ว
                                </span>
                            </div>
                        )}

                        {order.stations?.length > 0 && (
                            <div className="pt-2 border-t">
                                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-2">
                                    สถานีทั้งหมด
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {order.stations.map((sid, idx) => {
                                        const station = stationMap.get(sid);
                                        const colorId = colorMap[sid] ?? station?.colorId ?? "sky";
                                        const color   = getColorOption(colorId);
                                        const isDone  = order.status === "completed" || idx < (order.currentStationIndex ?? 0);
                                        const isCur   = order.status !== "completed" && idx === (order.currentStationIndex ?? 0);
                                        return (
                                            <span
                                                key={sid}
                                                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium border transition-all ${
                                                    order.status === "cancelled" ? "bg-muted text-muted-foreground border-transparent opacity-40" :
                                                    isCur   ? `${color.cls} border-current shadow-sm` :
                                                    isDone  ? `${color.cls} border-transparent opacity-70` :
                                                              "bg-muted/30 text-muted-foreground border-transparent opacity-50"
                                                }`}
                                            >
                                                <span
                                                    className="h-1.5 w-1.5 rounded-full shrink-0"
                                                    style={{ backgroundColor: order.status === "cancelled" ? undefined : color.swatch }}
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
                <div className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold flex items-center gap-2">
                            <Package className="h-4 w-4 text-primary" />
                            กระจกแต่ละชิ้น (Panes)
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                                {panes.filter(p => p.currentStatus === "completed").length}/{panes.length} เสร็จ
                            </span>
                            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-green-500 transition-all"
                                    style={{ width: `${(panes.filter(p => p.currentStatus === "completed").length / panes.length) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {panes.map((pane) => {
                            const stCfg = {
                                pending:     { label: "รอ",       dot: "bg-amber-400",  text: "text-amber-600 dark:text-amber-400" },
                                in_progress: { label: "กำลังทำ",  dot: "bg-blue-500",   text: "text-blue-600 dark:text-blue-400"   },
                                completed:   { label: "เสร็จ",    dot: "bg-green-500",  text: "text-green-600 dark:text-green-400" },
                            }[pane.currentStatus] ?? { label: pane.currentStatus, dot: "bg-gray-400", text: "text-gray-500" };

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
                                    className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/20 transition-colors"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono font-bold">{pane.paneNumber}</span>
                                            <span className={`flex items-center gap-1 text-[10px] font-medium ${stCfg.text}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${stCfg.dot}`} />
                                                {stCfg.label}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[11px] text-muted-foreground">สถานี: {stationName}</span>
                                            {pane.dimensions && (pane.dimensions.width > 0 || pane.dimensions.height > 0) && (
                                                <span className="text-[10px] text-muted-foreground/60">
                                                    {pane.dimensions.width}x{pane.dimensions.height}
                                                    {pane.dimensions.thickness > 0 && `x${pane.dimensions.thickness}`}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {pane.currentStatus === "completed" && (
                                        <CheckCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
