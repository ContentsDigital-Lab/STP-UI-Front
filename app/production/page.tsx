"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    ClipboardList, Search, RefreshCw, ChevronDown, ChevronRight, ChevronLeft,
    AlertCircle, User, Package, ArrowRight, MapPin,
    CalendarDays, Printer, QrCode, X, CheckCheck, Wifi, WifiOff, ClipboardCheck,
} from "lucide-react";
import { QrCodeModal } from "@/components/qr/QrCodeModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    const [paneMap,   setPaneMap]   = useState<Map<string, Pane[]>>(new Map());
    const [loading,   setLoading]   = useState(true);
    const [search,    setSearch]    = useState("");
    const [page,      setPage]      = useState(1);
    const [expanded,  setExpanded]  = useState<Set<string>>(new Set());
    const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
    const [qrTarget,  setQrTarget]  = useState<{ code: string; label: string; url: string } | null>(null);
    const [qrPane,    setQrPane]    = useState<Pane | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

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
            setColorMap(loadColorMap());
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

    // Reset to page 1 when search changes
    useEffect(() => { setPage(1); }, [search]);

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
                    <h1 className="flex items-center gap-3 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-normal pt-2 pb-1">
                        <ClipboardCheck className="h-7 w-7 sm:h-8 sm:w-8 shrink-0" />
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                    { label: "บิลทั้งหมด", count: totalBills,     icon: ClipboardList, bg: "bg-slate-50 dark:bg-slate-800/50", iconBg: "bg-slate-100 dark:bg-slate-700/50", iconColor: "text-slate-500 dark:text-slate-400" },
                    { label: "รอตรวจสอบ",  count: pendingBills,   icon: AlertCircle,   bg: "bg-amber-50 dark:bg-amber-950/20", iconBg: "bg-amber-100 dark:bg-amber-900/30", iconColor: "text-amber-600 dark:text-amber-400" },
                    { label: "กำลังผลิต",  count: activeBills,    icon: RefreshCw,     bg: "bg-blue-50 dark:bg-blue-950/20", iconBg: "bg-blue-100 dark:bg-blue-900/30", iconColor: "text-blue-600 dark:text-blue-400" },
                    { label: "เสร็จแล้ว",  count: completedBills, icon: CheckCheck,    bg: "bg-green-50 dark:bg-green-950/20", iconBg: "bg-green-100 dark:bg-green-900/30", iconColor: "text-green-600 dark:text-green-400" },
                ].map(({ label, count, icon: Icon, bg, iconBg, iconColor }) => (
                    <div key={label} className={`rounded-2xl border border-slate-200 dark:border-slate-800 p-5 ${bg} transition-all hover:shadow-md`}>
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`h-9 w-9 rounded-xl ${iconBg} flex items-center justify-center`}>
                                <Icon className={`h-4 w-4 ${iconColor}`} />
                            </div>
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</span>
                        </div>
                        <p className="text-3xl font-bold text-slate-900 dark:text-white">{loading ? "…" : count}</p>
                    </div>
                ))}
            </div>

            {/* Main content card */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
                {/* Search */}
                <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800">
                    <div className="relative w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="ค้นหา ลูกค้า, รหัสบิล, รหัสออเดอร์, วัสดุ, สถานี, สถานะ, ผู้รับผิดชอบ..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-11 pr-10 h-12 w-full rounded-2xl bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 font-medium"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch("")}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    {!loading && (search || filtered.length < bills.length) && (
                        <p className="text-xs text-slate-400 mt-2 pl-1">
                            {search
                                ? <>พบ <span className="font-bold text-slate-600 dark:text-slate-300">{filtered.length}</span> จาก {bills.length} บิล · ค้นหา &ldquo;{search}&rdquo; · <button className="text-blue-600 dark:text-[#E8601C] underline underline-offset-2 font-semibold" onClick={() => setSearch("")}>ล้าง</button></>
                                : <>แสดง {filtered.length} บิล</>
                            }
                        </p>
                    )}
                </div>

            {/* Bill list */}
            {loading ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="px-5 sm:px-6 py-5 flex items-start gap-4 animate-pulse">
                            <div className="h-4 w-4 rounded bg-slate-200 dark:bg-slate-700 mt-0.5 shrink-0" />
                            <div className="flex-1 space-y-2.5">
                                <div className="flex items-center gap-3">
                                    <div className="h-4 w-28 rounded-lg bg-slate-200 dark:bg-slate-700" />
                                    <div className="h-3.5 w-14 rounded-lg bg-slate-100 dark:bg-slate-800" />
                                    <div className="h-3.5 w-24 rounded-lg bg-slate-100 dark:bg-slate-800" />
                                </div>
                                <div className="flex gap-1.5">
                                    <div className="h-5 w-16 rounded-full bg-slate-100 dark:bg-slate-800" />
                                    <div className="h-5 w-20 rounded-full bg-slate-100 dark:bg-slate-800" />
                                </div>
                            </div>
                            <div className="hidden sm:flex gap-6 shrink-0">
                                {[1, 2, 3].map(j => (
                                    <div key={j} className="text-center space-y-1">
                                        <div className="h-5 w-8 rounded bg-slate-200 dark:bg-slate-700 mx-auto" />
                                        <div className="h-3 w-10 rounded bg-slate-100 dark:bg-slate-800 mx-auto" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                    <div className="h-16 w-16 rounded-3xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                        <AlertCircle className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-bold">ไม่พบข้อมูลที่ค้นหา</p>
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
                                            <div className="flex items-center gap-1.5">
                                                <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                                <span className="font-bold text-sm text-slate-900 dark:text-white">{bill.customer}</span>
                                            </div>
                                            <span className="font-mono text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                                #{bill.id.slice(-6).toUpperCase()}
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
                                    {(() => {
                                        const billPanes = bill.orders.flatMap(o => paneMap.get(o._id) ?? []);
                                        const panesDone = billPanes.filter(p => p.currentStatus === "completed").length;
                                        const hasPanes  = billPanes.length > 0;
                                        return (
                                            <div className="hidden sm:flex items-center gap-6 shrink-0 mr-1">
                                                <div className="text-center min-w-[48px]">
                                                    <p className="text-lg font-bold text-slate-900 dark:text-white leading-tight">{bill.orders.length}</p>
                                                    <p className="text-[10px] font-medium text-slate-400 uppercase">ออเดอร์</p>
                                                </div>
                                                <div className="text-center min-w-[48px]">
                                                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400 leading-tight">
                                                        {hasPanes ? billPanes.length : bill.totalGlass}
                                                    </p>
                                                    <p className="text-[10px] font-medium text-slate-400 uppercase">กระจก</p>
                                                </div>
                                                <div className="text-center min-w-[48px]">
                                                    <p className={`text-lg font-bold leading-tight ${panesDone > 0 && panesDone === billPanes.length ? "text-green-600" : panesDone > 0 ? "text-blue-600" : "text-green-600"}`}>
                                                        {hasPanes ? panesDone : bill.completedOrders}
                                                    </p>
                                                    <p className="text-[10px] font-medium text-slate-400 uppercase">เสร็จ</p>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </button>

                                {/* ── Order rows ── */}
                                {isOpen && (
                                    <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-50 dark:divide-slate-800/50 bg-slate-50/30 dark:bg-slate-800/10">
                                        {/* Column headers */}
                                        <div className="px-5 sm:px-8 py-3 flex items-center gap-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-50/80 dark:bg-slate-800/50 backdrop-blur-sm sticky top-0 z-10">
                                            <div className="w-5 shrink-0" /> {/* Spacer for chevron */}
                                            <div className="w-20 shrink-0">รหัส</div>
                                            <div className="w-40 shrink-0 hidden sm:block">วัสดุ / ชิ้น</div>
                                            <div className="flex-1">สถานีปัจจุบัน</div>
                                            <div className="hidden sm:block w-48">เส้นทางสถานี</div>
                                            <div className="w-24 text-right pr-2">สถานะ</div>
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

                                            return (
                                                <div key={order._id} className="relative group/order bg-white dark:bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                    <div
                                                        className="px-5 sm:px-8 py-4 flex items-center gap-4 cursor-pointer"
                                                        onClick={() => orderPanes.length > 0 ? toggleOrder(order._id) : router.push(`/production/${order._id}`)}
                                                    >
                                                        {/* Expand indicator */}
                                                        <div className="w-5 shrink-0 flex justify-center text-slate-300 dark:text-slate-600 group-hover/order:text-slate-500 transition-colors">
                                                            {orderPanes.length > 0 && (
                                                                isOrderOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                                                            )}
                                                        </div>

                                                        {/* Code */}
                                                        <div className="w-20 shrink-0 font-mono text-xs font-bold text-slate-900 dark:text-slate-200">
                                                            #{order.code ?? order._id.slice(-6).toUpperCase()}
                                                        </div>

                                                        {/* Material + pane progress */}
                                                        <div className="w-40 shrink-0 hidden sm:block min-w-0">
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
                                                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${done === orderPanes.length ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
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

                                                        {/* Status */}
                                                        <div className="w-24 flex justify-end shrink-0 pr-2">
                                                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${cfg.cls} px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800`}>
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
                                                            <Printer className="h-4 w-4" />
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
                                                                <QrCode className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            title="ดูรายละเอียด"
                                                            onClick={(e) => { e.stopPropagation(); router.push(`/production/${order._id}`); }}
                                                            className="flex-1 sm:flex-none flex items-center justify-center p-2.5 sm:p-1.5 rounded-xl sm:rounded-lg text-white sm:text-slate-500 bg-blue-600 hover:bg-blue-700 sm:hover:text-blue-600 dark:bg-[#E8601C] sm:dark:hover:text-[#E8601C] sm:bg-transparent transition-colors sm:border-transparent cursor-pointer"
                                                        >
                                                            <ArrowRight className="h-4 w-4" />
                                                        </button>
                                                    </div>

                                                    {/* Inline pane list */}
                                                    {isOrderOpen && orderPanes.length > 0 && (
                                                        <div className="pl-14 sm:pl-[120px] pr-5 sm:pr-8 py-4 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800/50">
                                                            <div className="flex items-center gap-2 mb-3">
                                                                <div className="h-5 w-5 rounded-md bg-blue-100 dark:bg-slate-800 flex items-center justify-center">
                                                                    <Package className="h-3 w-3 text-blue-600 dark:text-slate-400" />
                                                                </div>
                                                                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">รายการกระจก</span>
                                                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{orderPanes.length} ชิ้น</span>
                                                            </div>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                                                                {orderPanes.map(pane => {
                                                                    const pSt = ({
                                                                        pending:            { label: "รอ",          dot: "bg-amber-400",  text: "text-amber-600", bg: "bg-amber-50" },
                                                                        in_progress:        { label: "กำลังทำ",     dot: "bg-blue-500",   text: "text-blue-600", bg: "bg-blue-50" },
                                                                        completed:          { label: "เสร็จ",       dot: "bg-green-500",  text: "text-green-600", bg: "bg-green-50" },
                                                                        awaiting_scan_out:  { label: "รอสแกนออก",  dot: "bg-amber-500",  text: "text-amber-600", bg: "bg-amber-50" },
                                                                    } as Record<string, { label: string; dot: string; text: string; bg: string }>)[pane.currentStatus] ?? { label: pane.currentStatus, dot: "bg-gray-400", text: "text-gray-500", bg: "bg-gray-50" };
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
                                                                            onClick={() => setQrPane(pane)}
                                                                            className="group/pane relative overflow-hidden flex flex-col gap-1.5 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-[#E8601C]/50 hover:shadow-md transition-all text-left"
                                                                        >
                                                                            <div className="flex items-center justify-between w-full">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <QrCode className="h-3.5 w-3.5 text-slate-400 group-hover/pane:text-blue-500 dark:group-hover/pane:text-[#E8601C] transition-colors" />
                                                                                    <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{pane.paneNumber}</span>
                                                                                </div>
                                                                                <span className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${pSt.bg} dark:bg-transparent ${pSt.text}`}>
                                                                                    <span className={`h-1.5 w-1.5 rounded-full shadow-sm ${pSt.dot}`} />
                                                                                    {pSt.label}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center justify-between w-full mt-1">
                                                                                {pane.dimensions && (pane.dimensions.width > 0 || pane.dimensions.height > 0) ? (
                                                                                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 px-1.5 rounded">
                                                                                        {pane.dimensions.width}×{pane.dimensions.height}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span />
                                                                                )}
                                                                                <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 px-1.5 rounded border border-slate-100 dark:border-slate-700">
                                                                                    <MapPin className="h-3 w-3" />
                                                                                    <span className="truncate max-w-[80px] font-medium">{stName}</span>
                                                                                </div>
                                                                            </div>
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
                                                    <span className="text-green-600">{bp.length > 0 ? bd : bill.completedOrders} เสร็จแล้ว</span>
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
                <div className="p-5 sm:p-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        หน้า {page} / {totalPages}
                        <span className="ml-1 opacity-60">({filtered.length} บิล)</span>
                    </span>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="h-9 px-3 rounded-xl border-slate-200 dark:border-slate-800 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex gap-1">
                            {[...Array(totalPages)].map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setPage(i + 1)}
                                    className={`h-9 w-9 rounded-xl flex items-center justify-center text-xs font-bold transition-all ${page === i + 1
                                        ? "bg-blue-600 dark:bg-[#E8601C] text-white shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20"
                                        : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
                                        }`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page === totalPages}
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            className="h-9 px-3 rounded-xl border-slate-200 dark:border-slate-800 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
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
        {qrPane && (
            <QrCodeModal
                code={qrPane.paneNumber}
                label={[
                    qrPane.glassTypeLabel,
                    qrPane.dimensions ? `${qrPane.dimensions.width}×${qrPane.dimensions.height}${qrPane.dimensions.thickness > 0 ? ` (${qrPane.dimensions.thickness}mm)` : ""}` : "",
                ].filter(Boolean).join(" — ")}
                value={qrPane.qrCode || `STDPLUS:${qrPane.paneNumber}`}
                onClose={() => setQrPane(null)}
            />
        )}
        </>
    );
}
