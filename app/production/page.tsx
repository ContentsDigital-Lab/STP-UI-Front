"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    ClipboardList, Search, RefreshCw, ChevronDown, ChevronRight, ChevronLeft,
    AlertCircle, Package, ArrowRight, MapPin,
    CalendarDays, Printer, QrCode, X, CheckCheck, Wifi, WifiOff, Trash2,
} from "lucide-react";
import { QrCodeModal } from "@/components/qr/QrCodeModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ordersApi } from "@/lib/api/orders";
import { panesApi } from "@/lib/api/panes";
import { requestsApi } from "@/lib/api/requests";
import { stationsApi } from "@/lib/api/stations";
import { getColorOption } from "@/lib/stations/stations-store";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { Order, OrderRequest, Station, Pane } from "@/lib/api/types";

// ── status config ─────────────────────────────────────────────────────────────
const ORDER_STATUS = {
    pending:     { label: "รอตรวจสอบ", cls: "text-amber-600 dark:text-amber-400",  dot: "bg-amber-400"  },
    in_progress: { label: "กำลังผลิต", cls: "text-blue-600 dark:text-blue-400",    dot: "bg-blue-500"   },
    completed:   { label: "เสร็จแล้ว", cls: "text-green-600 dark:text-green-400",  dot: "bg-green-500"  },
    cancelled:   { label: "ยกเลิก",    cls: "text-red-500 dark:text-red-400",      dot: "bg-red-400"    },
} as const;
type StatusKey = keyof typeof ORDER_STATUS;

const SOCKET_EVENTS = ["order:updated", "order:created", "order:deleted", "request:updated"];

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
    stationIds, currentIdx, status, stationMap,
}: {
    stationIds: string[];
    currentIdx: number;
    status: string;
    stationMap: Map<string, Station>;
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
                const colorId  = station?.colorId ?? "sky";
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
    order, stationMap,
}: {
    order: Order;
    stationMap: Map<string, Station>;
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
    const colorId = station?.colorId ?? "sky";
    const color   = getColorOption(colorId);

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${color.cls} max-w-full`}
        >
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color.swatch }} />
            <span className="truncate min-w-0">{station?.name ?? sid}</span>
            <span className="text-[10px] opacity-60 shrink-0">({idx + 1}/{order.stations.length})</span>
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
    const [paneMap,   setPaneMap]   = useState<Map<string, Pane[]>>(new Map());
    const [loading,   setLoading]   = useState(true);
    const [search,    setSearch]    = useState("");
    const [dateFilter, setDateFilter] = useState<string>("all");
    const [page,      setPage]      = useState(1);
    const [expanded,  setExpanded]  = useState<Set<string>>(new Set());
    const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
    const [qrTarget,  setQrTarget]  = useState<{ code: string; label: string; url: string } | null>(null);
    const [filterStatus,  setFilterStatus]  = useState<string>("all");
    const [filterStation, setFilterStation] = useState<string>("all");
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const loadPanes = useCallback(async () => {
        const pRes = await panesApi.getAll({ limit: 100 }).catch(() => null);
        if (pRes?.success) {
            const map = new Map<string, Pane[]>();
            for (const p of pRes.data ?? []) {
                const oid = typeof p.order === "string" ? p.order : (p.order as Order)?._id;
                if (!oid) continue;
                if (!map.has(oid)) map.set(oid, []);
                map.get(oid)!.push(p);
            }
            setPaneMap(map);
        }
    }, []);

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
            await loadPanes();
        } finally {
            setLoading(false);
        }
    }, [loadPanes]);
    useEffect(() => { load(); }, [load]);

    const { status: wsStatus } = useWebSocket("production", [...SOCKET_EVENTS, "pane:updated"], () => {
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

    // Stations actually used by current orders (for filter dropdown)
    const usedStations = useMemo(() => {
        const ids = new Set(orders.flatMap(o => o.stations ?? []));
        return stations.filter(s => ids.has(s._id));
    }, [orders, stations]);

    // Apply filters: status, station (if any), then date, then search
    const filtered = useMemo(() => {
        let result = bills;

        // Status filter
        if (filterStatus !== "all") {
            result = result.filter(b =>
                b.orders.some(o => o.status === filterStatus)
            );
        }

        // Station filter
        if (filterStation !== "all") {
            result = result.filter(b =>
                b.orders.some(o => (o.stations ?? []).includes(filterStation))
            );
        }

        // Date filter
        if (typeof dateFilter !== "undefined" && dateFilter !== "all") {
            result = result.filter(b => {
                const billDateStr = (b.request?.createdAt ?? b.orders[0]?.createdAt ?? "").split("T")[0];
                return billDateStr === dateFilter;
            });
        }

        // Search filter
        const q = search.trim().toLowerCase();
        if (q) {
            result = result.filter(b => {
                if (b.customer.toLowerCase().includes(q)) return true;
                if (b.id.toLowerCase().includes(q)) return true;
                if (b.id.slice(-6).toLowerCase().includes(q)) return true;
                if ((b.request?.requestNumber ?? "").toLowerCase().includes(q)) return true;
                if (fmtDate(b.request?.deadline).toLowerCase().includes(q)) return true;
                return b.orders.some(o =>
                    (o.code ?? "").toLowerCase().includes(q) ||
                    (o.orderNumber ?? "").toLowerCase().includes(q) ||
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
        }

        return result;
    }, [bills, search, stationMap, filterStatus, filterStation, dateFilter]);

    // Reset to page 1 when search, filters or dateFilter change
    useEffect(() => { setPage(1); }, [search, filterStatus, filterStation, dateFilter]);

    const PAGE_SIZE = 10;
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paginated = useMemo(
        () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        [filtered, page]
    );

    const toggle = (id: string) => setExpanded(prev => {
        const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });
    const toggleOrder = (id: string) => setExpandedOrders(prev => {
        const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });

    const confirmDeleteOrder = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const res = await ordersApi.delete(deleteTarget.id);
            if (res.success) {
                setOrders(prev => prev.filter(o => o._id !== deleteTarget.id));
            }
        } catch { /* ignore */ }
        setDeleting(false);
        setDeleteTarget(null);
    };

    // Summary
    const totalBills     = bills.length;
    const pendingBills   = bills.filter(b => b.orders.some(o => o.status === "pending")).length;
    const activeBills    = bills.filter(b => b.orders.some(o => o.status === "in_progress")).length;
    const completedBills = bills.filter(b => b.orders.length > 0 && b.orders.every(o => o.status === "completed" || o.status === "cancelled")).length;

    return (
        <>
        <div className="space-y-6 max-w-[1440px] mx-auto w-full">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        ติดตามการผลิต
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">ติดตามสถานะบิล ออเดอร์ และสถานีการผลิต</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg ${wsStatus === "open" ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10" : "text-slate-400 bg-slate-100 dark:bg-slate-800"}`}>
                        {wsStatus === "open" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                        <span className="hidden sm:inline">{wsStatus === "open" ? "Live" : "ออฟไลน์"}</span>
                    </span>
                    <Button variant="outline" size="sm" className="gap-1.5 rounded-xl h-9 text-sm" onClick={load} disabled={loading}>
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                        รีเฟรช
                    </Button>
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: "บิลทั้งหมด", count: totalBills,     icon: ClipboardList, accent: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10" },
                    { label: "รอตรวจสอบ",  count: pendingBills,   icon: AlertCircle,   accent: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10" },
                    { label: "กำลังผลิต",  count: activeBills,    icon: RefreshCw,     accent: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10" },
                    { label: "เสร็จแล้ว",  count: completedBills, icon: CheckCheck,    accent: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10" },
                ].map(({ label, count, icon: Icon, accent }) => (
                    <div key={label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 p-4 sm:p-5">
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-3 ${accent}`}>
                            <Icon className="h-[18px] w-[18px]" />
                        </div>
                        <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-0.5">{label}</p>
                        <p className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{loading ? "…" : count}</p>
                    </div>
                ))}
            </div>

            {/* Filters row */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="ค้นหา ลูกค้า, รหัสบิล, วัสดุ, สถานี..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 pr-9 h-10 w-full rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                {/* Date filter (Precise) */}
                <div className="relative w-full sm:w-[180px]">
                    <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none z-10" />
                    <Input
                        type="date"
                        value={dateFilter === "all" ? "" : dateFilter}
                        onChange={(e) => setDateFilter(e.target.value || "all")}
                        className="pl-9 h-10 w-full rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
                    />
                </div>

                {/* Clear all filters */}
                {(search || dateFilter !== "all") && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-10 rounded-xl text-slate-400 hover:text-slate-600 px-3 shrink-0"
                        onClick={() => { setSearch(""); setDateFilter("all"); }}
                    >
                        <X className="h-3.5 w-3.5 mr-1" />
                        ล้าง
                    </Button>
                )}
            </div>
            {!loading && (search || dateFilter !== "all") && (
                <p className="text-xs text-slate-400 -mt-4">
                    พบ <span className="font-medium text-slate-600 dark:text-slate-300">{filtered.length}</span> จาก {bills.length} บิล
                </p>
            )}

            {/* Main content card */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 overflow-hidden">

            {/* Bill list */}
            {loading ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="px-4 py-3.5 flex items-center gap-3 animate-pulse">
                            <div className="h-4 w-4 rounded bg-slate-200 dark:bg-slate-700 shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700" />
                                <div className="h-3 w-48 rounded bg-slate-100 dark:bg-slate-800" />
                            </div>
                            <div className="hidden sm:flex gap-4 shrink-0">
                                {[1, 2, 3].map(j => (
                                    <div key={j} className="h-4 w-10 rounded bg-slate-100 dark:bg-slate-800" />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-2">
                    <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <AlertCircle className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">ไม่พบข้อมูลที่ค้นหา</p>
                </div>
            ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paginated.map((bill) => {
                        const isOpen = expanded.has(bill.id);
                        const visibleOrders = bill.orders;

                        // Collect unique station ids across all orders in this bill
                        const allStationIds = Array.from(
                            new Set(bill.orders.flatMap(o => o.stations ?? []))
                        );

                        return (
                            <div key={bill.id} className="group/bill hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">

                                {/* ── Bill header ── */}
                                <button
                                    className="w-full px-5 sm:px-6 py-4 flex items-start sm:items-center gap-3 transition-colors text-left"
                                    onClick={() => toggle(bill.id)}
                                >
                                    <span className="mt-0.5 sm:mt-0 text-slate-400 shrink-0">
                                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </span>

                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        {/* Row 1: customer + id + deadline */}
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                            <span className="font-bold text-sm text-slate-900 dark:text-white">{bill.customer}</span>
                                            <span className="font-mono text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                                {bill.orders[0]?.orderNumber ?? `#${bill.id.slice(-6).toUpperCase()}`}
                                            </span>
                                            {bill.request?.deadline && (
                                                <div className="flex items-center gap-1 text-xs text-slate-400">
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
                                                    const colorId = station?.colorId ?? "sky";
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
                                    {(() => {
                                        const billPanes = bill.orders.flatMap(o => paneMap.get(o._id) ?? []);
                                        const panesDone = billPanes.filter(p => p.currentStatus === "completed").length;
                                        const hasPanes  = billPanes.length > 0;
                                        const doneCount = hasPanes ? panesDone : bill.completedOrders;
                                        return (
                                            <div className="hidden sm:flex items-center gap-4 shrink-0">
                                                <div className="text-center min-w-[40px]">
                                                    <p className="text-lg font-bold text-slate-900 dark:text-white leading-tight">{bill.orders.length}</p>
                                                    <p className="text-[10px] font-medium text-slate-400 uppercase">ออเดอร์</p>
                                                </div>
                                                <div className="text-center min-w-[40px]">
                                                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400 leading-tight">
                                                        {hasPanes ? billPanes.length : bill.totalGlass}
                                                    </p>
                                                    <p className="text-[10px] font-medium text-slate-400 uppercase">กระจก</p>
                                                </div>
                                                <div className="text-center min-w-[40px]">
                                                    <p className={`text-lg font-bold leading-tight ${doneCount > 0 ? "text-green-600 dark:text-green-400" : "text-slate-300 dark:text-slate-600"}`}>
                                                        {doneCount}
                                                    </p>
                                                    <p className="text-[10px] font-medium text-slate-400 uppercase">เสร็จ</p>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </button>

                                {/* ── Order rows ── */}
                                {isOpen && (
                                    <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-50 dark:divide-slate-800/50">
                                        {/* Column headers */}
                                        <div className="px-4 sm:px-6 py-2.5 flex items-center gap-4 text-[11px] font-medium text-slate-400 dark:text-slate-500 bg-slate-50/80 dark:bg-slate-800/30">
                                            <div className="w-5 shrink-0" />
                                            <div className="w-20 shrink-0">รหัส</div>
                                            <div className="w-32 lg:w-40 shrink-0 hidden sm:block">วัสดุ / ชิ้น</div>
                                            <div className="flex-1 min-w-[100px]">สถานีปัจจุบัน</div>
                                            <div className="w-28 md:w-36 lg:w-48 shrink-0 hidden sm:block">เส้นทางสถานี</div>
                                            <div className="w-24 shrink-0 text-right pr-2">สถานะ</div>
                                        </div>

                                        {visibleOrders.length === 0 ? (
                                            <div className="px-8 py-8 flex flex-col items-center justify-center text-center">
                                                <Package className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                                                <p className="text-sm font-medium text-slate-400">ไม่มีออเดอร์ในสถานะนี้</p>
                                            </div>
                                        ) : visibleOrders.map((order) => {
                                            const cfg = ORDER_STATUS[order.status as StatusKey] ?? ORDER_STATUS.pending;
                                            const orderPanes = paneMap.get(order._id) ?? [];
                                            const isOrderOpen = expandedOrders.has(order._id);

                                            const isZeroQty = (order.quantity ?? 0) === 0;

                                            return (
                                                <div key={order._id} className={`relative group/order transition-colors ${isZeroQty ? "opacity-50" : "hover:bg-slate-50/60 dark:hover:bg-slate-800/30"}`}>
                                                    <div
                                                        className="px-4 sm:px-6 py-3 flex items-center gap-4 cursor-pointer"
                                                        onClick={() => orderPanes.length > 0 ? toggleOrder(order._id) : router.push(`/production/${order._id}`)}
                                                    >
                                                        {/* Expand indicator */}
                                                        <div className="w-5 shrink-0 flex justify-center text-slate-300 dark:text-slate-600 group-hover/order:text-slate-500 transition-colors">
                                                            {orderPanes.length > 0 && (
                                                                isOrderOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                                                            )}
                                                        </div>

                                                        {/* Code */}
                                                        <div className={`w-20 shrink-0 font-mono text-xs font-bold ${isZeroQty ? "text-slate-400 dark:text-slate-600" : "text-slate-900 dark:text-slate-200"}`}>
                                                            {order.orderNumber ?? `#${order.code ?? order._id.slice(-6).toUpperCase()}`}
                                                        </div>

                                                        {/* Material + pane progress */}
                                                        <div className="w-32 lg:w-40 shrink-0 hidden sm:block min-w-0">
                                                            <div className="flex items-center gap-1.5 text-sm mb-1">
                                                                <Package className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                                                <span className="truncate font-semibold text-slate-700 dark:text-slate-300">{getName(order.material)}</span>
                                                            </div>
                                                            {(() => {
                                                                if (orderPanes.length > 0) {
                                                                    const done = orderPanes.filter(p => p.currentStatus === "completed").length;
                                                                    return (
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-xs text-slate-500">{order.quantity} ชิ้น</span>
                                                                            <span className={`text-[10px] font-medium ${done === orderPanes.length ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}`}>
                                                                                {done}/{orderPanes.length} เสร็จ
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                }
                                                                return <span className="text-xs text-slate-500">{order.quantity} ชิ้น</span>;
                                                            })()}
                                                        </div>

                                                        {/* Current station badge */}
                                                        <div className="flex-1 min-w-0 flex items-center">
                                                            <CurrentStationBadge
                                                                order={order}
                                                                stationMap={stationMap}

                                                            />
                                                        </div>

                                                        {/* Station flow dots */}
                                                        <div className="hidden sm:flex w-28 md:w-36 lg:w-48 shrink-0 items-center">
                                                            <StationFlow
                                                                stationIds={order.stations ?? []}
                                                                currentIdx={order.currentStationIndex ?? 0}
                                                                status={order.status}
                                                                stationMap={stationMap}

                                                            />
                                                        </div>

                                                        {/* Status */}
                                                        <div className="w-24 flex justify-end shrink-0 pr-2">
                                                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.cls}`}>
                                                                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                                                                <span className="hidden sm:inline">{cfg.label}</span>
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Actions (Inline on mobile, Floating on Desktop) */}
                                                    <div className="flex sm:absolute sm:right-6 sm:top-1/2 sm:-translate-y-1/2 items-center justify-end gap-2 sm:gap-1 px-5 pb-4 sm:px-0 sm:pb-0 opacity-100 sm:opacity-0 sm:group-hover/order:opacity-100 transition-all sm:translate-x-2 sm:group-hover/order:translate-x-0 sm:bg-white/90 sm:dark:bg-slate-900/90 sm:backdrop-blur-md sm:shadow-lg sm:border sm:border-slate-200 sm:dark:border-slate-700 sm:rounded-xl sm:p-1 z-10 w-full sm:w-auto mt-[-8px] sm:mt-0">
                                                        <button
                                                            type="button"
                                                            title="พิมพ์ใบงาน"
                                                            onClick={(e) => { e.stopPropagation(); router.push(`/production/${order._id}/print`); }}
                                                            className="flex-1 sm:flex-none flex items-center justify-center p-2.5 sm:p-1.5 rounded-xl sm:rounded-lg text-slate-500 hover:text-blue-600 dark:hover:text-[#E8601C] bg-slate-50 hover:bg-blue-50 dark:bg-slate-800/50 dark:hover:bg-[#E8601C]/10 transition-colors border border-slate-200/50 dark:border-slate-700/50 sm:border-transparent sm:bg-transparent"
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
                                                                className="flex-1 sm:flex-none flex items-center justify-center p-2.5 sm:p-1.5 rounded-xl sm:rounded-lg text-slate-500 hover:text-blue-600 dark:hover:text-[#E8601C] bg-slate-50 hover:bg-blue-50 dark:bg-slate-800/50 dark:hover:bg-[#E8601C]/10 transition-colors border border-slate-200/50 dark:border-slate-700/50 sm:border-transparent sm:bg-transparent"
                                                            >
                                                                <QrCode className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            title="ลบออเดอร์"
                                                            onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: order._id, label: order.orderNumber ?? order.code ?? order._id.slice(-6).toUpperCase() }); }}
                                                            className="flex-1 sm:flex-none flex items-center justify-center p-2.5 sm:p-1.5 rounded-xl sm:rounded-lg text-slate-500 hover:text-red-600 dark:hover:text-red-400 bg-slate-50 hover:bg-red-50 dark:bg-slate-800/50 dark:hover:bg-red-500/10 transition-colors border border-slate-200/50 dark:border-slate-700/50 sm:border-transparent sm:bg-transparent"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            title="ดูรายละเอียด"
                                                            onClick={(e) => { e.stopPropagation(); router.push(`/production/${order._id}`); }}
                                                            className="flex-1 sm:flex-none flex items-center justify-center p-2.5 sm:p-1.5 rounded-xl sm:rounded-lg text-white sm:text-slate-500 bg-blue-600 hover:bg-blue-700 sm:hover:bg-blue-50 sm:hover:text-blue-600 dark:bg-[#E8601C] dark:hover:bg-orange-600 sm:dark:hover:bg-[#E8601C]/10 sm:dark:hover:text-[#E8601C] sm:bg-transparent transition-colors sm:border-transparent cursor-pointer"
                                                        >
                                                            <ArrowRight className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>

                                                    {/* Inline pane list */}
                                                    {isOrderOpen && orderPanes.length > 0 && (
                                                        <div className="pl-12 sm:pl-[100px] pr-4 sm:pr-6 py-3 bg-slate-50/50 dark:bg-slate-800/10 border-t border-slate-100 dark:border-slate-800/50">
                                                            <div className="flex items-center gap-2 mb-2.5">
                                                                <Package className="h-3.5 w-3.5 text-slate-400" />
                                                                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">รายการกระจก</span>
                                                                <span className="text-[11px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{orderPanes.length} ชิ้น</span>
                                                            </div>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
                                                                {orderPanes.map(pane => {
                                                                    const pSt = ({
                                                                        pending:            { label: "รอ",          dot: "bg-amber-400",  text: "text-amber-600" },
                                                                        in_progress:        { label: "กำลังทำ",     dot: "bg-blue-500",   text: "text-blue-600" },
                                                                        completed:          { label: "เสร็จ",       dot: "bg-green-500",  text: "text-green-600" },
                                                                        awaiting_scan_out:  { label: "รอสแกนออก",  dot: "bg-amber-500",  text: "text-amber-600" },
                                                                    } as Record<string, { label: string; dot: string; text: string }>)[pane.currentStatus] ?? { label: pane.currentStatus, dot: "bg-gray-400", text: "text-gray-500" };
                                                                    const stName = (() => {
                                                                        if (pane.currentStation === "queue") return "คิว";
                                                                        if (pane.currentStation === "ready") return "พร้อมส่ง";
                                                                        if (pane.currentStation === "defected") return "ชำรุด";
                                                                        const st = stationMap.get(pane.currentStation);
                                                                        return st?.name ?? pane.currentStation;
                                                                    })();
                                                                    return (
                                                                        <button
                                                                            key={pane._id}
                                                                            type="button"
                                                                            onClick={() => setQrTarget({
                                                                                code: order.code ?? order._id.slice(-6).toUpperCase(),
                                                                                label: `${getName(order.material)} — ${getName(order.customer)} (ชิ้นที่ ${pane.paneNumber})`,
                                                                                url: `${window.location.origin}/production/${order._id}`
                                                                            })}
                                                                            className="group/pane flex items-center gap-2.5 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800 transition-colors text-left"
                                                                        >
                                                                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                                                <QrCode className="h-3 w-3 text-slate-400 group-hover/pane:text-blue-500 dark:group-hover/pane:text-blue-400 transition-colors shrink-0" />
                                                                                <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200">{pane.paneNumber}</span>
                                                                                {pane.dimensions && (pane.dimensions.width > 0 || pane.dimensions.height > 0) && (
                                                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                                                        {pane.dimensions.width}×{pane.dimensions.height}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <span className="text-[10px] text-slate-400 truncate max-w-[60px]">{stName}</span>
                                                                            <span className={`flex items-center gap-1 text-[10px] ${pSt.text} shrink-0`}>
                                                                                <span className={`h-1.5 w-1.5 rounded-full ${pSt.dot}`} />
                                                                                {pSt.label}
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* Mobile summary */}
                                        {(() => {
                                            const bp = bill.orders.flatMap(o => paneMap.get(o._id) ?? []);
                                            const bd = bp.filter(p => p.currentStatus === "completed").length;
                                            return (
                                                <div className="sm:hidden px-5 py-2.5 flex gap-4 text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/20">
                                                    <span>{bill.orders.length} ออเดอร์</span>
                                                    <span>{bp.length > 0 ? bp.length : bill.totalGlass} กระจก</span>
                                                    <span className={(bp.length > 0 ? bd : bill.completedOrders) > 0 ? "text-green-600" : "text-slate-300 dark:text-slate-600"}>{bp.length > 0 ? bd : bill.completedOrders} เสร็จแล้ว</span>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {/* Pagination */}
            {!loading && totalPages > 1 && (
                <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                        {page} / {totalPages}
                    </span>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="h-8 w-8 p-0 rounded-lg"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter(p => p === 1 || p === totalPages || Math.abs(page - p) <= 1)
                            .map((pg, i, arr) => {
                                const els: React.ReactNode[] = [];
                                if (i > 0 && arr[i - 1] !== pg - 1) {
                                    els.push(<span key={`e-${pg}`} className="px-0.5 text-xs text-slate-400">…</span>);
                                }
                                els.push(
                                    <button
                                        key={pg}
                                        onClick={() => setPage(pg)}
                                        className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-medium transition-colors ${page === pg
                                            ? "bg-blue-600 dark:bg-[#E8601C] text-white"
                                            : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                        }`}
                                    >
                                        {pg}
                                    </button>
                                );
                                return els;
                            })}
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={page === totalPages}
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            className="h-8 w-8 p-0 rounded-lg"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
            </div>
        </div>

        {qrTarget && (
            <QrCodeModal
                code={qrTarget.code}
                label={qrTarget.label}
                value={qrTarget.url}
                onClose={() => setQrTarget(null)}
            />
        )}

        {/* Delete confirmation dialog */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
                        <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <DialogTitle className="text-center">ยืนยันการลบออเดอร์</DialogTitle>
                    <DialogDescription className="text-center">
                        ต้องการลบออเดอร์ <span className="font-semibold text-slate-700 dark:text-slate-300">{deleteTarget?.label}</span> ใช่หรือไม่?
                        การดำเนินการนี้ไม่สามารถย้อนกลับได้
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex gap-2 sm:gap-2">
                    <Button variant="outline" className="flex-1 rounded-xl" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                        ยกเลิก
                    </Button>
                    <Button
                        variant="destructive"
                        className="flex-1 rounded-xl"
                        onClick={confirmDeleteOrder}
                        disabled={deleting}
                    >
                        {deleting ? "กำลังลบ..." : "ลบออเดอร์"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    );
}
