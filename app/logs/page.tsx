"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { materialLogsApi } from "@/lib/api/material-logs";
import { MaterialLog, Order, Material, Worker, Inventory } from "@/lib/api/types";
import { inventoriesApi } from "@/lib/api/inventories";
import { workersApi } from "@/lib/api/workers";
import { useLanguage } from "@/lib/i18n/language-context";
import { useWebSocket } from "@/lib/hooks/use-socket";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import {
    Search,
    FilterX,
    Clock,
    ArrowUpRight,
    ArrowDownRight,
    Scissors,
    FileWarning,
    History,
    Wifi,
    WifiOff,
    Package,
    Link2,
    RefreshCw,
    ChevronRight,
    TrendingUp,
    TrendingDown,
    Layers,
    User,
    X,
    ArrowRightLeft,
} from "lucide-react";

const ITEMS_PER_PAGE = 20;

const ACTION_LABELS: Record<string, { th: string; en: string; color: string }> = {
    import: { th: "นำเข้าคลัง", en: "Import", color: "emerald" },
    import_move: { th: "ย้ายเข้า", en: "Move In", color: "violet" },
    withdraw: { th: "เบิกออก", en: "Withdraw", color: "orange" },
    withdraw_move: { th: "ย้ายออก", en: "Move Out", color: "violet" },
    claim: { th: "เคลม", en: "Claim", color: "red" },
    cut: { th: "ตัด/แปรรูป", en: "Cut", color: "blue" },
};

// Build a set of withdraw log IDs that are parentLogs → these are "move out" sources
function buildMoveSourceIds(logs: MaterialLog[]): Set<string> {
    const ids = new Set<string>();
    logs.forEach(l => {
        if (l.parentLog) {
            const id = typeof l.parentLog === 'object' ? (l.parentLog as MaterialLog)._id : String(l.parentLog);
            ids.add(id);
        }
    });
    return ids;
}

function getEffectiveAction(log: MaterialLog, moveSourceIds: Set<string>): string {
    if (log.actionType === 'import' && log.parentLog) return 'import_move';
    if (log.actionType === 'withdraw' && moveSourceIds.has(log._id)) return 'withdraw_move';
    return log.actionType;
}

const STOCK_TYPE_LABELS: Record<string, { th: string; en: string }> = {
    Raw: { th: "วัตถุดิบ", en: "Raw" },
    Reuse: { th: "นำกลับมาใช้", en: "Reuse" },
};

const REF_TYPE_LABELS: Record<string, { th: string; en: string }> = {
    withdrawal: { th: "เบิก", en: "Withdrawal" },
    claim: { th: "เคลม", en: "Claim" },
};

function getMaterialId(log: MaterialLog): string {
    if (!log.material) return "";
    return typeof log.material === "object"
        ? (log.material as Material)._id
        : String(log.material);
}

function getMaterialName(log: MaterialLog): string {
    if (!log.material) return "—";
    return typeof log.material === "object"
        ? (log.material as Material).name
        : String(log.material);
}

function getLocation(log: MaterialLog, invMap: Map<string, Inventory>): string | null {
    if (!log.referenceId || log.referenceType) return null;
    return invMap.get(log.referenceId)?.location ?? null;
}

function resolveWorkerName(w: MaterialLog['worker'], workerMap: Map<string, Worker>): string | null {
    if (!w) return null;
    if (typeof w === 'object') return (w as Worker).name || (w as Worker).username || null;
    return workerMap.get(String(w))?.name ?? workerMap.get(String(w))?.username ?? null;
}

function getMoveLocations(
    log: MaterialLog,
    moveSourceIds: Set<string>,
    invMap: Map<string, Inventory>,
    parentLogMap: Map<string, MaterialLog>,
    logById: Map<string, MaterialLog>
): { from: string | null; to: string | null } | null {
    if (log.actionType === 'import' && log.parentLog) {
        const to = (log.referenceId && !log.referenceType) ? invMap.get(log.referenceId)?.location ?? null : null;
        const parentId = typeof log.parentLog === 'object' ? (log.parentLog as MaterialLog)._id : String(log.parentLog);
        const parentLog = logById.get(parentId);
        const from = parentLog?.referenceId && !parentLog?.referenceType ? invMap.get(parentLog.referenceId)?.location ?? null : null;
        return { from, to };
    }
    if (log.actionType === 'withdraw' && moveSourceIds.has(log._id)) {
        const from = (log.referenceId && !log.referenceType) ? invMap.get(log.referenceId)?.location ?? null : null;
        const childLog = parentLogMap.get(log._id);
        const to = childLog?.referenceId && !childLog?.referenceType ? invMap.get(childLog.referenceId)?.location ?? null : null;
        return { from, to };
    }
    return null;
}

export default function MaterialLogsPage() {
    const { t, lang } = useLanguage();
    const [logs, setLogs] = useState<MaterialLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [actionFilter, setActionFilter] = useState<string>("all");
    const [stockTypeFilter, setStockTypeFilter] = useState<string>("all");
    const [dateFilter, setDateFilter] = useState<string>("all");

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);

    // Inventory lookup (for location column)
    const [invMap, setInvMap] = useState<Map<string, Inventory>>(new Map());

    // Worker lookup (for resolving worker IDs to names)
    const [workerMap, setWorkerMap] = useState<Map<string, Worker>>(new Map());

    // Detail panel state
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState<MaterialLog | null>(null);
    const [detailLogs, setDetailLogs] = useState<MaterialLog[]>([]);
    const [detailInventory, setDetailInventory] = useState<Inventory | null>(null);

    const fetchLogs = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await materialLogsApi.getAll();
            if (response.success && response.data) {
                setLogs(response.data);
                setLastUpdated(new Date());
            }
        } catch (error) {
            console.error("Failed to fetch material logs:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLogs();
        // Fetch inventories once to build location lookup map
        inventoriesApi.getAll().then(res => {
            if (res.success && res.data) {
                setInvMap(new Map(res.data.map(inv => [inv._id, inv])));
            }
        }).catch(() => {});
        // Fetch workers once for name resolution
        workersApi.getAll().then(res => {
            if (res.success && res.data) {
                setWorkerMap(new Map(res.data.map(w => [w._id, w])));
            }
        }).catch(() => {});
    }, [fetchLogs]);

    // WebSocket — subscribe to "log" room
    // Server emits only "log:updated" for all actions; payload.action = "created" | "updated" | "deleted"
    const { status: wsStatus } = useWebSocket(
        "log",
        ["log:updated"],
        useCallback((_event: string, data: unknown) => {
            const payload = data as { action?: string; data?: MaterialLog };
            if (!payload?.data) return;

            setLogs(prev => {
                let next = prev;
                if (payload.action === "created") next = [payload.data!, ...prev];
                else if (payload.action === "updated") next = prev.map(l => l._id === payload.data!._id ? payload.data! : l);
                else if (payload.action === "deleted") next = prev.filter(l => l._id !== payload.data!._id);

                // Sync detail panel from updated logs
                setSelectedLog(sel => {
                    if (!sel) return sel;
                    const openMatId = getMaterialId(sel);
                    const filtered = next
                        .filter(l => getMaterialId(l) === openMatId)
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    setDetailLogs(filtered);
                    return sel;
                });

                return next;
            });

            setLastUpdated(new Date());
        }, [])
    );

    const openDetail = useCallback(async (log: MaterialLog, allLogs: MaterialLog[]) => {
        const matId = getMaterialId(log);
        const hasInventoryRef = !!log.referenceId && !log.referenceType;

        // Filter logs: by inventoryId (referenceId without referenceType) if available, else by materialId
        const filtered = allLogs
            .filter(l => {
                if (getMaterialId(l) !== matId) return false;
                if (hasInventoryRef) {
                    return l.referenceId === log.referenceId && !l.referenceType;
                }
                return !l.referenceId || !!l.referenceType;
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setSelectedLog(log);
        setDetailLogs(filtered);
        setDetailInventory(null);
        setIsDetailOpen(true);

        // Fetch current inventory location
        if (hasInventoryRef && log.referenceId) {
            inventoriesApi.getById(log.referenceId)
                .then(res => { if (res.success && res.data) setDetailInventory(res.data); })
                .catch(() => {});
        } else {
            // Fallback: fetch all inventories and find by materialId
            inventoriesApi.getAll()
                .then(res => {
                    if (res.success && res.data) {
                        const match = res.data.find(inv => {
                            const invMatId = typeof inv.material === 'object' ? (inv.material as Material)._id : String(inv.material);
                            return invMatId === matId;
                        });
                        if (match) setDetailInventory(match);
                    }
                })
                .catch(() => {});
        }
    }, []);

    // Pre-compute move source IDs for the whole log list
    const moveSourceIds = useMemo(() => buildMoveSourceIds(logs), [logs]);

    // Map: parentLog ID → the child import_move log (to find destination for withdraw_move)
    const parentLogMap = useMemo(() => {
        const map = new Map<string, MaterialLog>();
        logs.forEach(l => {
            if (l.parentLog) {
                const id = typeof l.parentLog === 'object' ? (l.parentLog as MaterialLog)._id : String(l.parentLog);
                map.set(id, l);
            }
        });
        return map;
    }, [logs]);

    // Map: log._id → log (for resolving parentLog references)
    const logById = useMemo(() => {
        const map = new Map<string, MaterialLog>();
        logs.forEach(l => map.set(l._id, l));
        return map;
    }, [logs]);

    // Filter Logic
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const searchLower = searchQuery.toLowerCase();
            const matName = getMaterialName(log).toLowerCase();
            const orderId = (
                typeof log.order === "object" && log.order !== null
                    ? ((log.order as Order)._id ?? "")
                    : String(log.order ?? "")
            ).toLowerCase();
            const refId = (log.referenceId ?? "").toLowerCase();

            const matchesSearch =
                !searchQuery ||
                matName.includes(searchLower) ||
                orderId.includes(searchLower) ||
                refId.includes(searchLower);

            const matchesAction =
                actionFilter === "all" || log.actionType === actionFilter;

            const matchesStockType =
                stockTypeFilter === "all" || log.stockType === stockTypeFilter;

            let matchesDate = true;
            if (dateFilter !== "all") {
                const logDate = new Date(log.createdAt);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (dateFilter === "today") {
                    matchesDate = logDate >= today;
                } else if (dateFilter === "7days") {
                    const cutoff = new Date();
                    cutoff.setDate(today.getDate() - 7);
                    matchesDate = logDate >= cutoff;
                } else if (dateFilter === "30days") {
                    const cutoff = new Date();
                    cutoff.setDate(today.getDate() - 30);
                    matchesDate = logDate >= cutoff;
                }
            }

            return matchesSearch && matchesAction && matchesStockType && matchesDate;
        });
    }, [logs, searchQuery, actionFilter, stockTypeFilter, dateFilter]);

    const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
    const paginatedLogs = filteredLogs.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const resetFilters = () => {
        setSearchQuery("");
        setActionFilter("all");
        setStockTypeFilter("all");
        setDateFilter("all");
        setCurrentPage(1);
    };

    const hasActiveFilters =
        searchQuery ||
        actionFilter !== "all" ||
        stockTypeFilter !== "all" ||
        dateFilter !== "all";

    // Detail panel stats
    const detailStats = useMemo(() => {
        const totalImport = detailLogs.filter(l => l.actionType === "import").reduce((s, l) => s + l.quantityChanged, 0);
        const totalWithdraw = detailLogs.filter(l => l.actionType === "withdraw").reduce((s, l) => s + Math.abs(l.quantityChanged), 0);
        const totalCut = detailLogs.filter(l => l.actionType === "cut").reduce((s, l) => s + Math.abs(l.quantityChanged), 0);
        const totalClaim = detailLogs.filter(l => l.actionType === "claim").reduce((s, l) => s + Math.abs(l.quantityChanged), 0);
        const net = detailLogs.reduce((s, l) => s + l.quantityChanged, 0);
        return { totalImport, totalWithdraw, totalCut, totalClaim, net };
    }, [detailLogs]);

    // ─── Render helpers ────────────────────────────────────────────────────────

    const renderActionBadge = (log: MaterialLog) => {
        const effectiveAction = getEffectiveAction(log, moveSourceIds);
        const meta = ACTION_LABELS[effectiveAction];
        if (!meta) return <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">{log.actionType}</span>;
        const label = lang === "th" ? meta.th : meta.en;
        const icons: Record<string, React.ReactNode> = {
            import: <ArrowDownRight className="h-3 w-3" />,
            import_move: <ArrowRightLeft className="h-3 w-3" />,
            withdraw: <ArrowUpRight className="h-3 w-3" />,
            withdraw_move: <ArrowRightLeft className="h-3 w-3" />,
            claim: <FileWarning className="h-3 w-3" />,
            cut: <Scissors className="h-3 w-3" />,
        };
        const colorMap: Record<string, string> = {
            emerald: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40",
            orange: "bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-900/40",
            red: "bg-red-50 text-red-700 border-red-100 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/40",
            blue: "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/40",
            violet: "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900/40",
        };
        return (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${colorMap[meta.color]}`}>
                {label} {icons[effectiveAction]}
            </span>
        );
    };

    const renderActionDot = (log: MaterialLog) => {
        const effectiveAction = getEffectiveAction(log, moveSourceIds);
        const dotColor: Record<string, string> = {
            import: "bg-emerald-500",
            import_move: "bg-violet-500",
            withdraw: "bg-orange-500",
            withdraw_move: "bg-violet-500",
            claim: "bg-red-500",
            cut: "bg-blue-500",
        };
        return <div className={`w-3 h-3 rounded-full shrink-0 mt-1.5 ${dotColor[effectiveAction] ?? "bg-slate-400"}`} />;
    };

    const renderQuantityChanged = (qty: number) => {
        const isPositive = qty > 0;
        const colorClass = isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
        const sign = isPositive ? "+" : "";
        return (
            <span className={`text-sm font-bold tabular-nums ${colorClass}`}>
                {sign}{qty.toLocaleString()}
            </span>
        );
    };

    const renderOrderRef = (log: MaterialLog) => {
        if (!log.order) return <span className="text-slate-300 dark:text-slate-700">—</span>;
        const orderId = typeof log.order === "object" && log.order !== null
            ? ((log.order as Order)._id ?? "")
            : String(log.order);
        if (!orderId) return <span className="text-slate-300 dark:text-slate-700">—</span>;
        return (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1B4B9A] dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 rounded-lg border border-blue-100 dark:border-blue-900/40">
                <Package className="h-3 w-3" />
                {orderId.slice(-6).toUpperCase()}
            </span>
        );
    };

    const renderReference = (log: MaterialLog) => {
        if (!log.referenceType || !log.referenceId) return <span className="text-slate-300 dark:text-slate-700">—</span>;
        const typeLabel = REF_TYPE_LABELS[log.referenceType];
        const label = typeLabel ? (lang === "th" ? typeLabel.th : typeLabel.en) : log.referenceType;
        const colorClass = log.referenceType === "withdrawal"
            ? "text-orange-700 bg-orange-50 border-orange-100 dark:text-orange-400 dark:bg-orange-950/30 dark:border-orange-900/40"
            : "text-red-700 bg-red-50 border-red-100 dark:text-red-400 dark:bg-red-950/30 dark:border-red-900/40";
        return (
            <div className="flex flex-col gap-0.5">
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${colorClass}`}>
                    <Link2 className="h-2.5 w-2.5" />
                    {label}
                </span>
                <span className="text-[10px] font-mono text-slate-400 ml-0.5">
                    #{log.referenceId.slice(-6).toUpperCase()}
                </span>
            </div>
        );
    };

    const TableSkeleton = () => (
        <>
            {[...Array(6)].map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-8 w-[90px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[140px]" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[90px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[50px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[60px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[70px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-[90px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                </TableRow>
            ))}
        </>
    );

    // ─── JSX ───────────────────────────────────────────────────────────────────

    return (
        <>
        <div className="flex flex-col gap-6 p-2 md:p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                        {t.logs}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">
                        {lang === "th"
                            ? "ติดตามความเคลื่อนไหวของวัสดุ ตั้งแต่นำเข้าคลัง ตัด เบิก ไปจนถึงส่งงานลูกค้า"
                            : "Track all material movements — from import, cut, withdraw to customer delivery"}
                    </p>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    {/* WebSocket Status */}
                    <div className={`flex items-center gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold border ${wsStatus === "open"
                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/40"
                        : wsStatus === "connecting"
                            ? "bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400 border-yellow-100 dark:border-yellow-900/40"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
                        }`}>
                        {wsStatus === "open"
                            ? <><Wifi className="h-3.5 w-3.5" /> Live</>
                            : wsStatus === "connecting"
                                ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> {lang === "th" ? "กำลังเชื่อมต่อ" : "Connecting"}</>
                                : <><WifiOff className="h-3.5 w-3.5" /> Offline</>
                        }
                    </div>

                    {/* Stats Card */}
                    <div className="flex items-center gap-2 sm:gap-3 bg-white dark:bg-slate-900 p-2 sm:p-3 lg:px-5 lg:py-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                                {lang === "th" ? "รายการทั้งหมด" : "Total Records"}
                            </span>
                            <span className="text-xl font-bold text-slate-900 dark:text-white leading-none">
                                {filteredLogs.length.toLocaleString()}
                            </span>
                        </div>
                        {lastUpdated && (
                            <div className="flex flex-col border-l border-slate-100 dark:border-slate-800 pl-3">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                                    {lang === "th" ? "อัปเดตล่าสุด" : "Last update"}
                                </span>
                                <span className="text-[11px] font-semibold text-slate-500 leading-none">
                                    {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] items-end gap-5">
                    <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                            <Search className="h-3 w-3" />
                            {lang === "th" ? "ค้นหา" : "Search"}
                        </Label>
                        <Input
                            placeholder={lang === "th" ? "ค้นหาด้วยชื่อวัสดุ, ออเดอร์, อ้างอิง..." : "Search material, order, reference..."}
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className="h-12 w-full bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-medium text-sm"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">
                            {lang === "th" ? "การกระทำ" : "Action"}
                        </Label>
                        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v || "all"); setCurrentPage(1); }}>
                            <SelectTrigger className="h-12 w-full bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm">
                                <SelectValue placeholder={lang === "th" ? "ทั้งหมด" : "All"} />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl">
                                <SelectItem value="all" className="font-bold">{lang === "th" ? "ทั้งหมด" : "All"}</SelectItem>
                                <SelectItem value="import" className="font-bold text-emerald-600">{lang === "th" ? "นำเข้าคลัง" : "Import"}</SelectItem>
                                <SelectItem value="withdraw" className="font-bold text-orange-600">{lang === "th" ? "เบิกออก" : "Withdraw"}</SelectItem>
                                <SelectItem value="claim" className="font-bold text-red-600">{lang === "th" ? "เคลม" : "Claim"}</SelectItem>
                                <SelectItem value="cut" className="font-bold text-blue-600">{lang === "th" ? "ตัด/แปรรูป" : "Cut"}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">
                            {lang === "th" ? "ประเภทสต็อก" : "Stock Type"}
                        </Label>
                        <Select value={stockTypeFilter} onValueChange={(v) => { setStockTypeFilter(v || "all"); setCurrentPage(1); }}>
                            <SelectTrigger className="h-12 w-full bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm">
                                <SelectValue placeholder={lang === "th" ? "ทั้งหมด" : "All"} />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl">
                                <SelectItem value="all" className="font-bold">{lang === "th" ? "ทั้งหมด" : "All"}</SelectItem>
                                <SelectItem value="Raw" className="font-bold">{lang === "th" ? "วัตถุดิบ (Raw)" : "Raw"}</SelectItem>
                                <SelectItem value="Reuse" className="font-bold">{lang === "th" ? "นำกลับมาใช้ (Reuse)" : "Reuse"}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">
                            {lang === "th" ? "ช่วงเวลา" : "Period"}
                        </Label>
                        <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v || "all"); setCurrentPage(1); }}>
                            <SelectTrigger className="h-12 w-full bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm">
                                <SelectValue placeholder={lang === "th" ? "ทุกช่วงเวลา" : "All Time"} />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl">
                                <SelectItem value="all" className="font-bold">{lang === "th" ? "ทุกช่วงเวลา" : "All Time"}</SelectItem>
                                <SelectItem value="today" className="font-bold">{lang === "th" ? "วันนี้" : "Today"}</SelectItem>
                                <SelectItem value="7days" className="font-bold">{lang === "th" ? "7 วันที่ผ่านมา" : "Last 7 Days"}</SelectItem>
                                <SelectItem value="30days" className="font-bold">{lang === "th" ? "30 วันที่ผ่านมา" : "Last 30 Days"}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center pb-1">
                        {hasActiveFilters && (
                            <Button variant="ghost" onClick={resetFilters} className="h-10 rounded-xl text-slate-500 hover:text-slate-700 font-bold px-4">
                                <FilterX className="h-4 w-4 mr-2" />
                                {lang === "th" ? "ล้าง" : "Clear"}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                                <TableHead className="font-bold text-xs uppercase tracking-widest py-5 px-6 text-slate-500 dark:text-slate-400 whitespace-nowrap text-center">
                                    {lang === "th" ? "วันเวลา" : "Date / Time"}
                                </TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400 text-center">
                                    {lang === "th" ? "วัสดุ" : "Material"}
                                </TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400 text-center">
                                    {lang === "th" ? "การกระทำ" : "Action"}
                                </TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400 whitespace-nowrap text-center">
                                    {lang === "th" ? "จำนวนที่เปลี่ยน" : "Qty Changed"}
                                </TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400 whitespace-nowrap text-center">
                                    {lang === "th" ? "ประเภทสต็อก" : "Stock Type"}
                                </TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400 text-center">
                                    {lang === "th" ? "ออเดอร์" : "Order"}
                                </TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400 whitespace-nowrap text-center">
                                    {lang === "th" ? "สถานที่จัดเก็บ" : "Location"}
                                </TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400 text-center">
                                    {lang === "th" ? "อ้างอิง" : "Reference"}
                                </TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400 pr-6 whitespace-nowrap text-center">
                                    {lang === "th" ? "ผู้ดำเนินการ" : "Performed By"}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableSkeleton />
                            ) : paginatedLogs.length > 0 ? (
                                paginatedLogs.map((log) => {
                                    const materialName = getMaterialName(log);
                                    return (
                                        <TableRow
                                            key={log._id}
                                            onClick={() => openDetail(log, logs)}
                                            className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 border-slate-100 dark:border-slate-800 transition-colors cursor-pointer"
                                        >
                                            {/* Date/Time */}
                                            <TableCell className="py-4 px-6">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-900 dark:text-white text-[13px]">
                                                        {new Date(log.createdAt).toLocaleDateString(
                                                            lang === "th" ? "th-TH" : "en-US",
                                                            { day: "2-digit", month: "short", year: "numeric" }
                                                        )}
                                                    </span>
                                                    <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 mt-0.5">
                                                        <Clock className="h-3 w-3" />
                                                        {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            {/* Material */}
                                            <TableCell className="py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-[#1B4B9A] transition-colors">
                                                        {materialName || "—"}
                                                    </span>
                                                    {log.stockType && (
                                                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                                                            {log.stockType}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>

                                            {/* Action */}
                                            <TableCell className="py-4">
                                                {renderActionBadge(log)}
                                            </TableCell>

                                            {/* Qty Changed */}
                                            <TableCell className="py-4">
                                                {renderQuantityChanged(log.quantityChanged)}
                                            </TableCell>

                                            {/* Stock Type */}
                                            <TableCell className="py-4">
                                                {(() => {
                                                    const stockType = log.stockType ?? (log.referenceId && !log.referenceType ? invMap.get(log.referenceId)?.stockType : undefined);
                                                    if (!stockType) return <span className="text-slate-300 dark:text-slate-700">—</span>;
                                                    return (
                                                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg border ${stockType === "Raw"
                                                            ? "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                                                            : "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900/40"
                                                            }`}>
                                                            {stockType}
                                                        </span>
                                                    );
                                                })()}
                                            </TableCell>

                                            {/* Order */}
                                            <TableCell className="py-4">
                                                {renderOrderRef(log)}
                                            </TableCell>

                                            {/* Location */}
                                            <TableCell className="py-4">
                                                {(() => {
                                                    const moveLocs = getMoveLocations(log, moveSourceIds, invMap, parentLogMap, logById);
                                                    if (moveLocs) {
                                                        return (
                                                            <div className="flex items-center gap-1 text-[11px] font-semibold text-violet-700 dark:text-violet-400">
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border bg-violet-50 border-violet-100 dark:bg-violet-950/30 dark:border-violet-900/40">
                                                                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
                                                                    {moveLocs.from ?? '?'}
                                                                </span>
                                                                <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border bg-violet-50 border-violet-100 dark:bg-violet-950/30 dark:border-violet-900/40">
                                                                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
                                                                    {moveLocs.to ?? '?'}
                                                                </span>
                                                            </div>
                                                        );
                                                    }
                                                    const loc = getLocation(log, invMap);
                                                    if (!loc) return <span className="text-slate-300 dark:text-slate-700">—</span>;
                                                    const isUpdate = log.quantityChanged === 0 && log.actionType === "import";
                                                    return (
                                                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${isUpdate
                                                            ? "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40"
                                                            : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                                                            }`}>
                                                            <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
                                                            {loc}
                                                        </span>
                                                    );
                                                })()}
                                            </TableCell>

                                            {/* Reference */}
                                            <TableCell className="py-4">
                                                {renderReference(log)}
                                            </TableCell>

                                            {/* Performed By */}
                                            <TableCell className="py-4 pr-6">
                                                {(() => {
                                                    const name = resolveWorkerName(log.worker, workerMap);
                                                    if (!name) return <span className="text-slate-300 dark:text-slate-700">—</span>;
                                                    const role = typeof log.worker === "object" ? (log.worker as Worker).role : workerMap.get(String(log.worker))?.role;
                                                    return (
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{name}</span>
                                                            {role && <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{role}</span>}
                                                        </div>
                                                    );
                                                })()}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={9} className="h-40 text-center">
                                        <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                                            <History className="h-10 w-10 mb-3 opacity-20" />
                                            <p className="font-bold text-sm">
                                                {lang === "th" ? "ไม่พบประวัติการทำรายการ" : "No logs found"}
                                            </p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Hint */}
            {!isLoading && paginatedLogs.length > 0 && (
                <p className="text-center text-[11px] text-slate-400 font-medium -mt-2">
                    {lang === "th" ? "คลิกที่แถวเพื่อดูรายละเอียดการเคลื่อนไหวของวัสดุนั้น" : "Click any row to view the full movement history for that material"}
                </p>
            )}

            {/* Pagination */}
            {!isLoading && totalPages > 1 && (
                <div className="flex justify-center pb-10">
                    <Pagination>
                        <PaginationContent className="bg-white dark:bg-slate-900 p-1.5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                            <PaginationItem>
                                <PaginationPrevious
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    className={`rounded-xl h-9 px-4 font-bold ${currentPage === 1 ? "opacity-50 pointer-events-none" : "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                                />
                            </PaginationItem>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(p => p === 1 || p === totalPages || Math.abs(currentPage - p) <= 1)
                                .map((page, i, arr) => {
                                    if (i > 0 && arr[i - 1] !== page - 1) {
                                        return <PaginationItem key={`e-${page}`}><span className="px-4 py-2 text-slate-400">…</span></PaginationItem>;
                                    }
                                    return (
                                        <PaginationItem key={page}>
                                            <PaginationLink
                                                onClick={() => setCurrentPage(page)}
                                                isActive={currentPage === page}
                                                className={`rounded-xl h-9 w-9 font-bold cursor-pointer ${currentPage === page ? "bg-[#1B4B9A] text-white hover:bg-[#1B4B9A]/90 hover:text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                                            >
                                                {page}
                                            </PaginationLink>
                                        </PaginationItem>
                                    );
                                })}
                            <PaginationItem>
                                <PaginationNext
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    className={`rounded-xl h-9 px-4 font-bold ${currentPage === totalPages ? "opacity-50 pointer-events-none" : "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}
        </div>

        {/* ─── Detail Sheet Panel ─────────────────────────────────────────────── */}
        <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
            <SheetContent side="right" showCloseButton={false} className="w-full sm:w-[560px] lg:w-[640px] p-0 flex flex-col gap-0 overflow-hidden">

                {/* Panel Header */}
                <SheetHeader className="px-7 pt-7 pb-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <div className="h-8 w-8 rounded-xl bg-[#1B4B9A]/10 dark:bg-[#1B4B9A]/20 flex items-center justify-center">
                                    <Layers className="h-4 w-4 text-[#1B4B9A]" />
                                </div>
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                                    {lang === "th" ? "รายละเอียดการเคลื่อนไหว" : "Material Movement Detail"}
                                </span>
                            </div>
                            <SheetTitle className="text-xl font-bold text-slate-900 dark:text-white leading-tight truncate">
                                {selectedLog ? getMaterialName(selectedLog) : "—"}
                            </SheetTitle>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                {/* Current location badge */}
                                {detailInventory && (
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#1B4B9A]/10 text-[#1B4B9A] dark:text-blue-400 border border-[#1B4B9A]/20">
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
                                        {detailInventory.location}
                                    </span>
                                )}
                                {detailInventory?.stockType && (
                                    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${detailInventory.stockType === "Raw" ? "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" : "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900/40"}`}>
                                        {detailInventory.stockType}
                                    </span>
                                )}
                                {detailInventory && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-1 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                                        <Layers className="h-3 w-3" />
                                        {lang === "th" ? "คงเหลือ" : "Stock"} {detailInventory.quantity.toLocaleString()}
                                    </span>
                                )}
                            </div>
                            <SheetDescription className="text-sm text-slate-500 font-medium mt-1">
                                {lang === "th"
                                    ? `ประวัติการเคลื่อนไหวทั้งหมด ${detailLogs.length} รายการ`
                                    : `${detailLogs.length} movement records in total`}
                            </SheetDescription>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsDetailOpen(false)}
                            className="shrink-0 h-8 w-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Close</span>
                        </Button>
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto">

                        {/* Summary Stats */}
                        <div className="px-7 py-5 border-b border-slate-100 dark:border-slate-800">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                                {lang === "th" ? "สรุปการเคลื่อนไหว" : "Movement Summary"}
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                {/* Net */}
                                <div className={`col-span-2 rounded-2xl p-4 border ${detailStats.net >= 0
                                    ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40"
                                    : "bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/40"
                                    }`}>
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
                                        {lang === "th" ? "ยอดสุทธิ (นำเข้า - ออก)" : "Net Change (In - Out)"}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        {detailStats.net >= 0
                                            ? <TrendingUp className="h-5 w-5 text-emerald-600" />
                                            : <TrendingDown className="h-5 w-5 text-red-600" />
                                        }
                                        <span className={`text-2xl font-bold tabular-nums ${detailStats.net >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                                            {detailStats.net >= 0 ? "+" : ""}{detailStats.net.toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                {/* Import */}
                                <div className="rounded-2xl p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
                                        {lang === "th" ? "นำเข้าคลัง" : "Imported"}
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                        <ArrowDownRight className="h-4 w-4 text-emerald-500" />
                                        <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                            +{detailStats.totalImport.toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                {/* Withdraw */}
                                <div className="rounded-2xl p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
                                        {lang === "th" ? "เบิกออก" : "Withdrawn"}
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                        <ArrowUpRight className="h-4 w-4 text-orange-500" />
                                        <span className="text-lg font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                                            -{detailStats.totalWithdraw.toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                {/* Cut */}
                                <div className="rounded-2xl p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
                                        {lang === "th" ? "ตัด/แปรรูป" : "Cut"}
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                        <Scissors className="h-4 w-4 text-blue-500" />
                                        <span className="text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                                            -{detailStats.totalCut.toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                {/* Claim */}
                                <div className="rounded-2xl p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
                                        {lang === "th" ? "เคลม" : "Claimed"}
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                        <FileWarning className="h-4 w-4 text-red-500" />
                                        <span className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">
                                            -{detailStats.totalClaim.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Timeline */}
                        <div className="px-7 py-5">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-5">
                                {lang === "th" ? "ไทม์ไลน์การเคลื่อนไหว" : "Movement Timeline"}
                                <span className="ml-2 normal-case font-bold text-slate-300 dark:text-slate-600">
                                    ({lang === "th" ? "ล่าสุดขึ้นก่อน" : "newest first"})
                                </span>
                            </p>

                            {detailLogs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-600">
                                    <History className="h-10 w-10 mb-3 opacity-20" />
                                    <p className="font-bold text-sm">{lang === "th" ? "ไม่พบประวัติ" : "No history found"}</p>
                                </div>
                            ) : (
                                <div className="relative">
                                    {/* Vertical line */}
                                    <div className="absolute left-[5px] top-2 bottom-2 w-0.5 bg-slate-100 dark:bg-slate-800" />

                                    <div className="flex flex-col gap-0">
                                        {detailLogs.map((log, idx) => {
                                            const workerName = resolveWorkerName(log.worker, workerMap);
                                            const workerRole = typeof log.worker === 'object' && log.worker ? (log.worker as Worker).role : workerMap.get(String(log.worker ?? ''))?.role;
                                            const orderId = log.order
                                                ? (typeof log.order === "object" && log.order !== null
                                                    ? ((log.order as Order)._id ?? "")
                                                    : String(log.order))
                                                : null;
                                            const stockType = log.stockType ?? (log.referenceId && !log.referenceType ? invMap.get(log.referenceId)?.stockType : undefined);
                                            const moveLocs = getMoveLocations(log, moveSourceIds, invMap, parentLogMap, logById);
                                            const singleLoc = !moveLocs ? getLocation(log, invMap) : null;

                                            return (
                                                <div key={log._id} className={`relative pl-7 pb-6 ${idx === detailLogs.length - 1 ? "" : ""}`}>
                                                    {/* Dot on timeline */}
                                                    <div className="absolute left-0 top-1.5">
                                                        {renderActionDot(log)}
                                                    </div>

                                                    {/* Card */}
                                                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                                                        {/* Top row */}
                                                        <div className="flex items-start justify-between gap-3 mb-3">
                                                            <div className="flex flex-col gap-1">
                                                                {renderActionBadge(log)}
                                                                <div className="flex items-center gap-1 text-[11px] text-slate-400 font-bold mt-1">
                                                                    <Clock className="h-3 w-3" />
                                                                    {new Date(log.createdAt).toLocaleString(
                                                                        lang === "th" ? "th-TH" : "en-US",
                                                                        { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                {renderQuantityChanged(log.quantityChanged)}
                                                            </div>
                                                        </div>

                                                        {/* Details row */}
                                                        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-50 dark:border-slate-800">
                                                            {/* Stock Type */}
                                                            {stockType && (
                                                                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${stockType === "Raw"
                                                                    ? "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                                                                    : "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900/40"}`}>
                                                                    {stockType}
                                                                </span>
                                                            )}

                                                            {/* Location — single */}
                                                            {singleLoc && (
                                                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-100 dark:border-slate-700">
                                                                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
                                                                    {singleLoc}
                                                                </span>
                                                            )}

                                                            {/* Location — move from→to */}
                                                            {moveLocs && (
                                                                <div className="flex items-center gap-1 text-[11px] font-semibold text-violet-700 dark:text-violet-400 flex-wrap">
                                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-violet-50 border-violet-100 dark:bg-violet-950/30 dark:border-violet-900/40">
                                                                        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
                                                                        {lang === "th" ? "จาก" : "From"}: {moveLocs.from ?? '?'}
                                                                    </span>
                                                                    <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
                                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-violet-50 border-violet-100 dark:bg-violet-950/30 dark:border-violet-900/40">
                                                                        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
                                                                        {lang === "th" ? "ไปยัง" : "To"}: {moveLocs.to ?? '?'}
                                                                    </span>
                                                                </div>
                                                            )}

                                                            {/* Worker */}
                                                            {workerName && (
                                                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-100 dark:border-slate-700">
                                                                    <User className="h-3 w-3" />
                                                                    {workerName}{workerRole ? ` · ${workerRole}` : ''}
                                                                </span>
                                                            )}

                                                            {/* Order */}
                                                            {orderId && (
                                                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1B4B9A] dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2.5 py-1 rounded-lg border border-blue-100 dark:border-blue-900/40">
                                                                    <Package className="h-3 w-3" />
                                                                    {lang === "th" ? "ออเดอร์" : "Order"} #{orderId.slice(-6).toUpperCase()}
                                                                </span>
                                                            )}

                                                            {/* Reference */}
                                                            {log.referenceType && log.referenceId && (
                                                                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${log.referenceType === "withdrawal"
                                                                    ? "text-orange-700 bg-orange-50 border-orange-100 dark:text-orange-400 dark:bg-orange-950/30 dark:border-orange-900/40"
                                                                    : "text-red-700 bg-red-50 border-red-100 dark:text-red-400 dark:bg-red-950/30 dark:border-red-900/40"
                                                                    }`}>
                                                                    <Link2 className="h-3 w-3" />
                                                                    {REF_TYPE_LABELS[log.referenceType]?.[lang] ?? log.referenceType} #{log.referenceId.slice(-6).toUpperCase()}
                                                                </span>
                                                            )}

                                                            {/* Empty state */}
                                                            {!stockType && !singleLoc && !moveLocs && !workerName && !orderId && !log.referenceType && (
                                                                <span className="text-[11px] text-slate-300 dark:text-slate-700 font-medium italic">
                                                                    {lang === "th" ? "ไม่มีข้อมูลเพิ่มเติม" : "No additional info"}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                {/* Panel Footer */}
                <div className="shrink-0 px-7 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 font-bold">
                            {lang === "th" ? "ข้อมูล ณ เวลา" : "Data as of"} {lastUpdated?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) ?? "—"}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            {lang === "th" ? "อัปเดตอัตโนมัติผ่าน WebSocket" : "Auto-updating via WebSocket"}
                        </div>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
        </>
    );
}
