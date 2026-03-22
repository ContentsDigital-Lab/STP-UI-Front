"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    ClipboardList, Search, RefreshCw, ChevronDown, ChevronRight,
    AlertCircle, User, Package, ArrowRight,
    CalendarDays, Printer, QrCode, X, CheckCheck, Wifi, WifiOff,
} from "lucide-react";
import { QrCodeModal } from "@/components/qr/QrCodeModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ordersApi } from "@/lib/api/orders";
import { requestsApi } from "@/lib/api/requests";
import { stationsApi } from "@/lib/api/stations";
import { getColorOption } from "@/lib/stations/stations-store";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { Order, OrderRequest, Station } from "@/lib/api/types";

// ── status config ─────────────────────────────────────────────────────────────
const ORDER_STATUS = {
    pending:     { label: "รอตรวจสอบ", cls: "text-amber-600 dark:text-amber-400",  dot: "bg-amber-400"  },
    in_progress: { label: "กำลังผลิต", cls: "text-blue-600 dark:text-blue-400",    dot: "bg-blue-500"   },
    completed:   { label: "เสร็จแล้ว", cls: "text-green-600 dark:text-green-400",  dot: "bg-green-500"  },
    cancelled:   { label: "ยกเลิก",    cls: "text-red-500 dark:text-red-400",      dot: "bg-red-400"    },
} as const;
type StatusKey = keyof typeof ORDER_STATUS;

const SOCKET_EVENTS = ["order:updated", "order:created", "order:deleted", "request:updated"];

const COLOR_STORAGE_KEY = "std_station_colors";
function loadColorMap(): Record<string, string> {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}"); } catch { return {}; }
}

// ── helpers ───────────────────────────────────────────────────────────────────
const getName = (v: string | { name: string } | null | undefined) =>
    !v ? "—" : typeof v === "object" ? v.name : v;

const getReqId = (r: string | OrderRequest | null | undefined) =>
    !r ? "" : typeof r === "object" ? r._id : r;

function fmtDate(d?: string) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

// ── station dot flow ──────────────────────────────────────────────────────────
function StationFlow({
    stationIds, currentIdx, status, stationMap, colorMap,
}: {
    stationIds: string[];
    currentIdx: number;
    status: string;
    stationMap: Map<string, Station>;
    colorMap: Record<string, string>;
}) {
    if (!stationIds.length) {
        return <span className="text-xs text-muted-foreground/50 italic">ยังไม่กำหนดสถานี</span>;
    }

    const isDone      = status === "completed";
    const isCancelled = status === "cancelled";

    return (
        <div className="flex items-center gap-1 flex-wrap">
            {stationIds.map((sid, idx) => {
                const station  = stationMap.get(sid);
                const colorId  = colorMap[sid] ?? station?.colorId ?? "sky";
                const color    = getColorOption(colorId);
                const isPast   = isDone || idx < currentIdx;
                const isCur    = !isDone && !isCancelled && idx === currentIdx;

                return (
                    <div key={sid} className="flex items-center gap-1">
                        <div className="relative group/dot flex items-center">
                            {/* dot */}
                            <span
                                className={`block rounded-full transition-all ${
                                    isCancelled ? "bg-muted w-2 h-2 opacity-40" :
                                    isCur       ? "w-3 h-3 ring-2 ring-offset-1 ring-current" :
                                    isPast      ? "w-2 h-2 opacity-60" :
                                                  "w-2 h-2 opacity-25"
                                }`}
                                style={{ backgroundColor: isCancelled ? undefined : color.swatch,
                                         // ring color for current
                                         ...(isCur ? { color: color.swatch } : {}) }}
                            />
                            {/* tooltip */}
                            {station && (
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap bg-popover border shadow-sm text-foreground opacity-0 group-hover/dot:opacity-100 pointer-events-none transition-opacity z-10">
                                    {station.name}
                                    {isCur && " ← ปัจจุบัน"}
                                    {isPast && !isDone && " ✓"}
                                </span>
                            )}
                        </div>
                        {idx < stationIds.length - 1 && (
                            <span className="text-muted-foreground/20 text-[10px] leading-none">›</span>
                        )}
                    </div>
                );
            })}
            {isDone && (
                <CheckCheck className="h-3.5 w-3.5 text-green-500 ml-0.5" />
            )}
        </div>
    );
}

// ── current station label ─────────────────────────────────────────────────────
function CurrentStationBadge({
    order, stationMap, colorMap,
}: {
    order: Order;
    stationMap: Map<string, Station>;
    colorMap: Record<string, string>;
}) {
    if (order.status === "completed") {
        return <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium"><CheckCheck className="h-3 w-3" />เสร็จแล้ว</span>;
    }
    if (order.status === "cancelled") {
        return <span className="text-xs text-muted-foreground/50 italic">ยกเลิก</span>;
    }
    if (!order.stations?.length) {
        return <span className="text-xs text-muted-foreground/50 italic">ยังไม่กำหนด</span>;
    }

    const idx     = order.currentStationIndex ?? 0;
    const sid     = order.stations[idx];
    const station = stationMap.get(sid);
    const colorId = colorMap[sid] ?? station?.colorId ?? "sky";
    const color   = getColorOption(colorId);

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${color.cls}`}
        >
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color.swatch }} />
            {station?.name ?? sid}
            <span className="text-[10px] opacity-60">({idx + 1}/{order.stations.length})</span>
        </span>
    );
}

// ── bill group type ───────────────────────────────────────────────────────────
interface BillGroup {
    id:               string;
    request:          OrderRequest | null;
    customer:         string;
    orders:           Order[];
    totalGlass:       number;
    completedOrders:  number;
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function ProductionPage() {
    const router = useRouter();
    const [orders,    setOrders]    = useState<Order[]>([]);
    const [requests,  setRequests]  = useState<OrderRequest[]>([]);
    const [stations,  setStations]  = useState<Station[]>([]);
    const [colorMap,  setColorMap]  = useState<Record<string, string>>({});
    const [loading,   setLoading]   = useState(true);
    const [search,    setSearch]    = useState("");
    const [expanded,  setExpanded]  = useState<Set<string>>(new Set());
    const [qrTarget,  setQrTarget]  = useState<{ code: string; label: string; url: string } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [oRes, rRes, sRes] = await Promise.all([
                ordersApi.getAll(),
                requestsApi.getAll(),
                stationsApi.getAll(),
            ]);
            if (oRes.success) setOrders(oRes.data ?? []);
            if (rRes.success) setRequests(rRes.data ?? []);
            if (sRes.success) setStations(sRes.data ?? []);
            setColorMap(loadColorMap());
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    // Real-time updates via WebSocket
    const { status: wsStatus } = useWebSocket("production", SOCKET_EVENTS, () => {
        load();
    });

    const stationMap = useMemo(() => new Map(stations.map(s => [s._id, s])), [stations]);

    // Group orders → bills
    const bills = useMemo<BillGroup[]>(() => {
        const map = new Map<string, BillGroup>();
        for (const o of orders) {
            const rid = getReqId(o.request) || `__${o._id}`;
            if (!map.has(rid)) {
                const req      = requests.find(r => r._id === rid)
                    ?? (typeof o.request === "object" ? o.request as OrderRequest : null);
                const customer = getName(req?.customer ?? o.customer);
                map.set(rid, { id: rid, request: req, customer, orders: [], totalGlass: 0, completedOrders: 0 });
            }
            const b = map.get(rid)!;
            b.orders.push(o);
            b.totalGlass += o.quantity ?? 0;
            if (o.status === "completed") b.completedOrders++;
        }
        return Array.from(map.values()).sort((a, b) =>
            (b.request?.createdAt ?? b.orders[0]?.createdAt ?? "")
                .localeCompare(a.request?.createdAt ?? a.orders[0]?.createdAt ?? "")
        );
    }, [orders, requests]);

    // Apply search — ครอบคลุมทุก field
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return bills;
        return bills.filter(b => {
            // bill-level fields
            if (b.customer.toLowerCase().includes(q)) return true;
            if (b.id.toLowerCase().includes(q)) return true;
            if (b.id.slice(-6).toLowerCase().includes(q)) return true;
            if (fmtDate(b.request?.deadline).toLowerCase().includes(q)) return true;
            // order-level fields
            return b.orders.some(o =>
                (o.code ?? "").toLowerCase().includes(q) ||
                o._id.toLowerCase().includes(q) ||
                o._id.slice(-6).toLowerCase().includes(q) ||
                getName(o.material).toLowerCase().includes(q) ||
                getName(o.customer).toLowerCase().includes(q) ||
                getName(o.assignedTo).toLowerCase().includes(q) ||
                (ORDER_STATUS[o.status as StatusKey]?.label ?? "").toLowerCase().includes(q) ||
                (o.stations ?? []).some(sid => {
                    const st = stationMap.get(sid);
                    return st?.name?.toLowerCase().includes(q);
                })
            );
        });
    }, [bills, search, stationMap]);

    const toggle = (id: string) => setExpanded(prev => {
        const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });

    // Summary
    const totalBills     = bills.length;
    const pendingBills   = bills.filter(b => b.orders.some(o => o.status === "pending")).length;
    const activeBills    = bills.filter(b => b.orders.some(o => o.status === "in_progress")).length;
    const completedBills = bills.filter(b => b.orders.length > 0 && b.orders.every(o => o.status === "completed" || o.status === "cancelled")).length;

    return (
        <>
        <div className="flex flex-col gap-4 sm:gap-6 lg:gap-8 max-w-[1600px] mx-auto w-full overflow-x-hidden">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
                <div>
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-normal pt-2 pb-1">
                        ติดตามการผลิต
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base font-medium mt-1">ติดตามสถานะบิล ออเดอร์ และสถานีการผลิต</p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className={`flex items-center gap-1 text-xs ${wsStatus === "open" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                        {wsStatus === "open"
                            ? <Wifi className="h-3.5 w-3.5" />
                            : <WifiOff className="h-3.5 w-3.5" />
                        }
                        <span className="hidden sm:inline">{wsStatus === "open" ? "Live" : "ออฟไลน์"}</span>
                    </span>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                        รีเฟรช
                    </Button>
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: "บิลทั้งหมด", count: totalBills,     dot: "bg-slate-400" },
                    { label: "รอตรวจสอบ",  count: pendingBills,   dot: "bg-amber-400" },
                    { label: "กำลังผลิต",  count: activeBills,    dot: "bg-blue-500"  },
                    { label: "เสร็จแล้ว",  count: completedBills, dot: "bg-green-500" },
                ].map(({ label, count, dot }) => (
                    <div key={label} className="rounded-xl border p-4 bg-card">
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`h-2 w-2 rounded-full ${dot}`} />
                            <span className="text-xs text-muted-foreground">{label}</span>
                        </div>
                        <p className="text-2xl font-bold">{loading ? "…" : count}</p>
                    </div>
                ))}
            </div>

            {/* Search */}
            <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="ค้นหา ลูกค้า, รหัสบิล, รหัสออเดอร์, วัสดุ, สถานี, สถานะ, ผู้รับผิดชอบ..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 pr-10 h-10 w-full"
                />
                {search && (
                    <button
                        onClick={() => setSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Result hint */}
            {!loading && search && (
                <p className="text-xs text-muted-foreground -mt-2">
                    พบ {filtered.length} จาก {bills.length} บิล · ค้นหา &ldquo;{search}&rdquo;
                    {" · "}
                    <button className="text-primary underline underline-offset-2" onClick={() => setSearch("")}>
                        ล้าง
                    </button>
                </p>
            )}

            {/* Bill list */}
            {loading ? (
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-20 rounded-xl border bg-muted/30 animate-pulse" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-xl space-y-3">
                    <AlertCircle className="h-10 w-10 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">ไม่พบข้อมูลที่ค้นหา</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((bill) => {
                        const isOpen = expanded.has(bill.id);
                        const visibleOrders = bill.orders;

                        // Collect unique station ids across all orders in this bill
                        const allStationIds = Array.from(
                            new Set(bill.orders.flatMap(o => o.stations ?? []))
                        );

                        return (
                            <div key={bill.id} className="rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">

                                {/* ── Bill header ── */}
                                <button
                                    className="w-full px-4 py-3.5 flex items-start sm:items-center gap-3 hover:bg-muted/30 transition-colors text-left"
                                    onClick={() => toggle(bill.id)}
                                >
                                    <span className="mt-0.5 sm:mt-0 text-muted-foreground shrink-0">
                                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </span>

                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        {/* Row 1: customer + id + deadline */}
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                            <div className="flex items-center gap-1.5">
                                                <User className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                                                <span className="font-semibold text-sm">{bill.customer}</span>
                                            </div>
                                            <span className="font-mono text-xs text-muted-foreground">
                                                #{bill.id.slice(-6).toUpperCase()}
                                            </span>
                                            {bill.request?.deadline && (
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <CalendarDays className="h-3 w-3" />
                                                    กำหนดส่ง {fmtDate(bill.request.deadline)}
                                                </div>
                                            )}
                                        </div>

                                        {/* Row 2: station dots for all unique stations in this bill */}
                                        {allStationIds.length > 0 && (
                                            <div className="flex items-center gap-1 flex-wrap">
                                                {allStationIds.map((sid) => {
                                                    const station = stationMap.get(sid);
                                                    const colorId = colorMap[sid] ?? station?.colorId ?? "sky";
                                                    const color   = getColorOption(colorId);
                                                    return (
                                                        <span
                                                            key={sid}
                                                            title={station?.name ?? sid}
                                                            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${color.cls}`}
                                                        >
                                                            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color.swatch }} />
                                                            {station?.name ?? sid}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Stats */}
                                    <div className="hidden sm:flex items-center gap-4 shrink-0 text-xs text-muted-foreground mr-1">
                                        <div className="text-center">
                                            <p className="text-base font-bold text-foreground leading-tight">{bill.orders.length}</p>
                                            <p>ออเดอร์</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-base font-bold text-foreground leading-tight">{bill.totalGlass}</p>
                                            <p>กระจก</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-base font-bold text-green-600 leading-tight">{bill.completedOrders}</p>
                                            <p>เสร็จ</p>
                                        </div>
                                    </div>
                                </button>

                                {/* ── Order rows ── */}
                                {isOpen && (
                                    <div className="border-t divide-y bg-muted/5">
                                        {/* Column headers */}
                                        <div className="px-4 sm:px-8 py-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/20">
                                            <span className="w-24 shrink-0">รหัส</span>
                                            <span className="w-36 shrink-0 hidden sm:block">วัสดุ / ชิ้น</span>
                                            <span className="flex-1">สถานีปัจจุบัน</span>
                                            <span className="hidden sm:block w-48">เส้นทางสถานี</span>
                                            <span className="w-24 text-right">สถานะ</span>
                                        </div>

                                        {visibleOrders.length === 0 ? (
                                            <p className="px-8 py-4 text-sm text-muted-foreground italic">ไม่มีออเดอร์ในสถานะนี้</p>
                                        ) : visibleOrders.map((order) => {
                                            const cfg = ORDER_STATUS[order.status as StatusKey] ?? ORDER_STATUS.pending;

                                            return (
                                                <div
                                                    key={order._id}
                                                    className="px-4 sm:px-8 py-3 flex items-center gap-2 hover:bg-muted/20 cursor-pointer transition-colors group"
                                                    onClick={() => router.push(`/production/${order._id}`)}
                                                >
                                                    {/* Code */}
                                                    <span className="w-24 shrink-0 font-mono text-xs font-bold">
                                                        #{order.code ?? order._id.slice(-6).toUpperCase()}
                                                    </span>

                                                    {/* Material */}
                                                    <div className="w-36 shrink-0 hidden sm:block min-w-0">
                                                        <div className="flex items-center gap-1 text-sm truncate">
                                                            <Package className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                                                            <span className="truncate text-xs">{getName(order.material)}</span>
                                                        </div>
                                                        <span className="text-xs text-muted-foreground">{order.quantity} ชิ้น</span>
                                                    </div>

                                                    {/* Current station badge */}
                                                    <div className="flex-1 min-w-0">
                                                        <CurrentStationBadge
                                                            order={order}
                                                            stationMap={stationMap}
                                                            colorMap={colorMap}
                                                        />
                                                    </div>

                                                    {/* Station flow dots */}
                                                    <div className="hidden sm:flex w-48 items-center">
                                                        <StationFlow
                                                            stationIds={order.stations ?? []}
                                                            currentIdx={order.currentStationIndex ?? 0}
                                                            status={order.status}
                                                            stationMap={stationMap}
                                                            colorMap={colorMap}
                                                        />
                                                    </div>

                                                    {/* Status + actions */}
                                                    <div className="w-24 flex items-center justify-end gap-1 shrink-0">
                                                        <span className={`flex items-center gap-1 text-xs font-medium ${cfg.cls}`}>
                                                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                                                            <span className="hidden sm:inline">{cfg.label}</span>
                                                        </span>
                                                        <button
                                                            type="button"
                                                            title="พิมพ์ใบงาน"
                                                            onClick={(e) => { e.stopPropagation(); router.push(`/production/${order._id}/print`); }}
                                                            className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Printer className="h-3.5 w-3.5" />
                                                        </button>
                                                        {order.code && (
                                                            <button
                                                                type="button"
                                                                title="QR Code"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setQrTarget({
                                                                        code:  order.code!,
                                                                        label: `${getName(order.material)} — ${getName(order.customer)}`,
                                                                        url:   `${window.location.origin}/production/${order._id}`,
                                                                    });
                                                                }}
                                                                className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                                                            >
                                                                <QrCode className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Mobile summary */}
                                        <div className="sm:hidden px-4 py-2 flex gap-4 text-xs text-muted-foreground bg-muted/10">
                                            <span>{bill.orders.length} ออเดอร์</span>
                                            <span>{bill.totalGlass} กระจก</span>
                                            <span className="text-green-600">{bill.completedOrders} เสร็จแล้ว</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>

        {qrTarget && (
            <QrCodeModal
                code={qrTarget.code}
                label={qrTarget.label}
                value={qrTarget.url}
                onClose={() => setQrTarget(null)}
            />
        )}
        </>
    );
}
