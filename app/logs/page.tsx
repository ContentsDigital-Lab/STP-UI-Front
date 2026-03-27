"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { materialLogsApi } from "@/lib/api/material-logs";
import { productionLogsApi } from "@/lib/api/production-logs";
import { MaterialLog, Order, Material, Worker, Inventory, PaneLog, TimelineEvent, Pane } from "@/lib/api/types";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
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
    RefreshCw,
    ChevronRight,
    TrendingUp,
    TrendingDown,
    Layers,
    User,
    X,
    Cpu,
    CheckCircle2,
    Circle,
    Play,
} from "lucide-react";

const ITEMS_PER_PAGE = 10;

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

    // Timeline (merged MaterialLog + PaneLog)
    const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [selectedMatId, setSelectedMatId] = useState<string>("");

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

    // Refresh timeline when a pane is scanned (pane:updated from "pane" room)
    const selectedMatIdRef = useRef(selectedMatId);
    useEffect(() => { selectedMatIdRef.current = selectedMatId; }, [selectedMatId]);
    useWebSocket("pane", ["pane:updated"], useCallback(() => {
        const mid = selectedMatIdRef.current;
        if (!mid || !isDetailOpen) return;
        productionLogsApi.getTimeline(mid)
            .then(res => { if (res.success) setTimeline(res.data ?? []); })
            .catch(() => {});
    }, [isDetailOpen]));

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

        const filtered = allLogs
            .filter(l => {
                if (getMaterialId(l) !== matId) return false;
                if (hasInventoryRef) return l.referenceId === log.referenceId && !l.referenceType;
                return !l.referenceId || !!l.referenceType;
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setSelectedLog(log);
        setDetailLogs(filtered);
        setDetailInventory(null);
        setSelectedMatId(matId);
        setIsDetailOpen(true);

        // Fetch timeline (MaterialLog + PaneLog merged)
        if (matId) {
            setTimelineLoading(true);
            productionLogsApi.getTimeline(matId)
                .then(res => { if (res.success) setTimeline(res.data ?? []); })
                .catch(() => {})
                .finally(() => setTimelineLoading(false));
        }

        // Fetch current inventory location
        if (hasInventoryRef && log.referenceId) {
            inventoriesApi.getById(log.referenceId)
                .then(res => { if (res.success && res.data) setDetailInventory(res.data); })
                .catch(() => {});
        } else {
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
        if (!meta) return <span className="px-2 py-0.5 rounded-md text-xs bg-slate-100 text-slate-600">{log.actionType}</span>;
        const label = lang === "th" ? meta.th : meta.en;
        const colorMap: Record<string, string> = {
            emerald: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            orange: "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400",
            red: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
            blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
            violet: "bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400",
        };
        return (
            <span className={`text-xs font-medium px-2 py-1 rounded-md ${colorMap[meta.color]}`}>
                {label}
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
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-1 rounded-md">
                #{orderId.slice(-6).toUpperCase()}
            </span>
        );
    };

    const renderReference = (log: MaterialLog) => {
        if (!log.referenceType || !log.referenceId) return <span className="text-slate-300 dark:text-slate-700">—</span>;
        const typeLabel = REF_TYPE_LABELS[log.referenceType];
        const label = typeLabel ? (lang === "th" ? typeLabel.th : typeLabel.en) : log.referenceType;
        const colorClass = log.referenceType === "withdrawal"
            ? "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10"
            : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10";
        return (
            <span className={`text-xs font-medium px-2 py-1 rounded-md ${colorClass}`}>
                {label} #{log.referenceId.slice(-6).toUpperCase()}
            </span>
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
        <div className="space-y-6 max-w-[1440px] mx-auto w-full">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{t.logs}</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {lang === "th"
                            ? "ติดตามความเคลื่อนไหวของวัสดุ ตั้งแต่นำเข้าคลัง ตัด เบิก ไปจนถึงส่งงานลูกค้า"
                            : "Track all material movements — from import, cut, withdraw to customer delivery"}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${wsStatus === "open"
                        ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : wsStatus === "connecting"
                            ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                        }`}>
                        {wsStatus === "open"
                            ? <><Wifi className="h-3 w-3" /> Live</>
                            : wsStatus === "connecting"
                                ? <><RefreshCw className="h-3 w-3 animate-spin" /> {lang === "th" ? "เชื่อมต่อ..." : "Connecting"}</>
                                : <><WifiOff className="h-3 w-3" /> Offline</>
                        }
                    </div>
                    {lastUpdated && (
                        <span className="text-xs text-slate-400 hidden sm:inline">
                            {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: lang === "th" ? "รายการทั้งหมด" : "Total Records", value: filteredLogs.length, accent: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10", icon: History },
                    { label: lang === "th" ? "นำเข้า" : "Imported", value: logs.filter(l => l.actionType === "import").length, accent: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10", icon: ArrowDownRight },
                    { label: lang === "th" ? "เบิกออก" : "Withdrawn", value: logs.filter(l => l.actionType === "withdraw").length, accent: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10", icon: ArrowUpRight },
                    { label: lang === "th" ? "ตัด/เคลม" : "Cut/Claim", value: logs.filter(l => l.actionType === "cut" || l.actionType === "claim").length, accent: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10", icon: Scissors },
                ].map((stat) => (
                    <div key={stat.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center mb-2 ${stat.accent}`}>
                            <stat.icon className="h-4 w-4" />
                        </div>
                        <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-0.5">{stat.label}</p>
                        <p className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{isLoading ? "-" : stat.value.toLocaleString()}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex flex-col lg:flex-row items-stretch lg:items-end gap-3">
                    <div className="relative flex-1 space-y-1.5">
                        <Label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                            <Search className="h-3 w-3" />
                            {lang === "th" ? "ค้นหา" : "Search"}
                        </Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder={lang === "th" ? "ค้นหาด้วยชื่อวัสดุ, ออเดอร์, อ้างอิง..." : "Search material, order, reference..."}
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                className="pl-9 h-10 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-sm"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 lg:flex lg:gap-3">
                        <div className="space-y-1.5 lg:w-40 shrink-0">
                            <Label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">{lang === "th" ? "การกระทำ" : "Action"}</Label>
                            <Select value={actionFilter === "all" ? "" : actionFilter} onValueChange={(v) => { setActionFilter(v || "all"); setCurrentPage(1); }}>
                                <SelectTrigger className="h-10 w-full rounded-xl text-sm border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                    <SelectValue placeholder={lang === "th" ? "ทั้งหมด" : "All"} />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
                                    <SelectItem value="all">{lang === "th" ? "ทุกการกระทำ" : "All Actions"}</SelectItem>
                                    <SelectItem value="import">{lang === "th" ? "นำเข้าคลัง" : "Import"}</SelectItem>
                                    <SelectItem value="withdraw">{lang === "th" ? "เบิกออก" : "Withdraw"}</SelectItem>
                                    <SelectItem value="claim">{lang === "th" ? "เคลม" : "Claim"}</SelectItem>
                                    <SelectItem value="cut">{lang === "th" ? "ตัด/แปรรูป" : "Cut"}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5 lg:w-40 shrink-0">
                            <Label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">{lang === "th" ? "ประเภท" : "Type"}</Label>
                            <Select value={stockTypeFilter === "all" ? "" : stockTypeFilter} onValueChange={(v) => { setStockTypeFilter(v || "all"); setCurrentPage(1); }}>
                                <SelectTrigger className="h-10 w-full rounded-xl text-sm border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                    <SelectValue placeholder={lang === "th" ? "ทั้งหมด" : "All"} />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
                                    <SelectItem value="all">{lang === "th" ? "ทุกประเภท" : "All Types"}</SelectItem>
                                    <SelectItem value="Raw">{lang === "th" ? "วัตถุดิบ (Raw)" : "Raw"}</SelectItem>
                                    <SelectItem value="Reuse">{lang === "th" ? "นำกลับมาใช้ (Reuse)" : "Reuse"}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5 lg:w-44 shrink-0">
                            <Label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">{lang === "th" ? "ช่วงเวลา" : "Period"}</Label>
                            <Select value={dateFilter === "all" ? "" : dateFilter} onValueChange={(v) => { setDateFilter(v || "all"); setCurrentPage(1); }}>
                                <SelectTrigger className="h-10 w-full rounded-xl text-sm border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                    <SelectValue placeholder={lang === "th" ? "ทั้งหมด" : "All"} />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
                                    <SelectItem value="all">{lang === "th" ? "ทุกช่วงเวลา" : "All Time"}</SelectItem>
                                    <SelectItem value="today">{lang === "th" ? "วันนี้" : "Today"}</SelectItem>
                                    <SelectItem value="7days">{lang === "th" ? "7 วันที่ผ่านมา" : "Last 7 Days"}</SelectItem>
                                    <SelectItem value="30days">{lang === "th" ? "30 วันที่ผ่านมา" : "Last 30 Days"}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    {hasActiveFilters && (
                        <Button variant="ghost" onClick={resetFilters} className="h-10 rounded-xl text-slate-500 hover:text-slate-700 px-3 shrink-0 self-end">
                            <FilterX className="h-4 w-4 mr-1.5" />
                            {lang === "th" ? "ล้าง" : "Clear"}
                        </Button>
                    )}
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-100 dark:border-slate-800 hover:bg-transparent">
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 px-4 h-10 whitespace-nowrap">
                                    {lang === "th" ? "วันเวลา" : "Date / Time"}
                                </TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">
                                    {lang === "th" ? "วัสดุ" : "Material"}
                                </TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">
                                    {lang === "th" ? "การกระทำ" : "Action"}
                                </TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10 whitespace-nowrap">
                                    {lang === "th" ? "จำนวน" : "Qty"}
                                </TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10 whitespace-nowrap">
                                    {lang === "th" ? "ประเภท" : "Type"}
                                </TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">
                                    {lang === "th" ? "ออเดอร์" : "Order"}
                                </TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10 whitespace-nowrap">
                                    {lang === "th" ? "สถานที่" : "Location"}
                                </TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">
                                    {lang === "th" ? "อ้างอิง" : "Ref"}
                                </TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10 whitespace-nowrap">
                                    {lang === "th" ? "ผู้ดำเนินการ" : "By"}
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
                                            className="group hover:bg-slate-50/60 dark:hover:bg-slate-800/40 border-slate-100 dark:border-slate-800 transition-colors cursor-pointer"
                                        >
                                            <TableCell className="py-3.5 px-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                                                        {new Date(log.createdAt).toLocaleDateString(
                                                            lang === "th" ? "th-TH" : "en-US",
                                                            { day: "2-digit", month: "short", year: "numeric" }
                                                        )}
                                                    </span>
                                                    <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                                        <Clock className="h-2.5 w-2.5" />
                                                        {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            <TableCell className="py-3.5">
                                                <span className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                    {materialName || "—"}
                                                </span>
                                            </TableCell>

                                            <TableCell className="py-3.5">
                                                {renderActionBadge(log)}
                                            </TableCell>

                                            <TableCell className="py-3.5">
                                                {renderQuantityChanged(log.quantityChanged)}
                                            </TableCell>

                                            <TableCell className="py-3.5">
                                                {(() => {
                                                    const stockType = log.stockType ?? (log.referenceId && !log.referenceType ? invMap.get(log.referenceId)?.stockType : undefined);
                                                    if (!stockType) return <span className="text-slate-300 dark:text-slate-700">—</span>;
                                                    return (
                                                        <span className={`text-xs font-medium px-2 py-1 rounded-md ${stockType === "Raw"
                                                            ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                                            : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                            }`}>
                                                            {stockType}
                                                        </span>
                                                    );
                                                })()}
                                            </TableCell>

                                            <TableCell className="py-3.5">
                                                {renderOrderRef(log)}
                                            </TableCell>

                                            <TableCell className="py-3.5">
                                                {(() => {
                                                    const moveLocs = getMoveLocations(log, moveSourceIds, invMap, parentLogMap, logById);
                                                    if (moveLocs) {
                                                        return (
                                                            <div className="flex items-center gap-1 text-[11px] font-medium text-violet-600 dark:text-violet-400">
                                                                <span className="px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-500/10">{moveLocs.from ?? '?'}</span>
                                                                <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
                                                                <span className="px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-500/10">{moveLocs.to ?? '?'}</span>
                                                            </div>
                                                        );
                                                    }
                                                    const loc = getLocation(log, invMap);
                                                    if (!loc) return <span className="text-slate-300 dark:text-slate-700">—</span>;
                                                    return (
                                                        <span className="text-sm text-slate-600 dark:text-slate-400">{loc}</span>
                                                    );
                                                })()}
                                            </TableCell>

                                            <TableCell className="py-3.5">
                                                {renderReference(log)}
                                            </TableCell>

                                            <TableCell className="py-3.5">
                                                {(() => {
                                                    const name = resolveWorkerName(log.worker, workerMap);
                                                    if (!name) return <span className="text-slate-300 dark:text-slate-700">—</span>;
                                                    return <span className="text-sm text-slate-600 dark:text-slate-300">{name}</span>;
                                                })()}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={9} className="py-16 text-center border-none">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                                <History className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                                            </div>
                                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                                {lang === "th" ? "ไม่พบประวัติการทำรายการ" : "No logs found"}
                                            </p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination */}
                {!isLoading && totalPages > 1 && (
                    <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-xs text-slate-400">{currentPage} / {totalPages}</span>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
                                <ChevronRight className="h-4 w-4 rotate-180" />
                            </Button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(p => p === 1 || p === totalPages || Math.abs(currentPage - p) <= 1)
                                .map((page, i, arr) => {
                                    if (i > 0 && arr[i - 1] !== page - 1) {
                                        return <span key={`e-${page}`} className="px-1 text-xs text-slate-400">…</span>;
                                    }
                                    return (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-medium transition-colors ${currentPage === page ? "bg-blue-600 dark:bg-[#E8601C] text-white" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                                        >
                                            {page}
                                        </button>
                                    );
                                })}
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* ─── Detail Sheet Panel ─────────────────────────────────────────────── */}
        <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
            <SheetContent side="right" showCloseButton={false} className="w-full sm:w-[560px] lg:w-[640px] p-0 flex flex-col gap-0 overflow-hidden bg-white dark:bg-slate-900">

                {/* Panel Header */}
                <SheetHeader className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1 min-w-0">
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                {lang === "th" ? "รายละเอียดการเคลื่อนไหว" : "Movement Detail"}
                            </span>
                            <SheetTitle className="text-lg font-bold text-slate-900 dark:text-white leading-tight truncate">
                                {selectedLog ? getMaterialName(selectedLog) : "—"}
                            </SheetTitle>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                {detailInventory && (
                                    <span className="text-xs font-medium px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                        {detailInventory.location}
                                    </span>
                                )}
                                {detailInventory?.stockType && (
                                    <span className={`text-xs font-medium px-2 py-1 rounded-md ${detailInventory.stockType === "Raw" ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
                                        {detailInventory.stockType}
                                    </span>
                                )}
                                {detailInventory && (
                                    <span className="text-xs font-medium px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                        {lang === "th" ? "คงเหลือ" : "Stock"} {detailInventory.quantity.toLocaleString()}
                                    </span>
                                )}
                            </div>
                            <SheetDescription className="text-sm text-slate-500 mt-1">
                                {lang === "th"
                                    ? `ประวัติการเคลื่อนไหวทั้งหมด ${detailLogs.length} รายการ`
                                    : `${detailLogs.length} movement records in total`}
                            </SheetDescription>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsDetailOpen(false)}
                            className="shrink-0 h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Close</span>
                        </Button>
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto">

                        {/* Summary Stats */}
                        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                                {lang === "th" ? "สรุปการเคลื่อนไหว" : "Movement Summary"}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                <div className={`col-span-2 rounded-lg p-3 ${detailStats.net >= 0
                                    ? "bg-emerald-50 dark:bg-emerald-500/10"
                                    : "bg-red-50 dark:bg-red-500/10"
                                    }`}>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                                        {lang === "th" ? "ยอดสุทธิ" : "Net Change"}
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                        {detailStats.net >= 0
                                            ? <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                            : <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                                        }
                                        <span className={`text-xl font-bold tabular-nums ${detailStats.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                            {detailStats.net >= 0 ? "+" : ""}{detailStats.net.toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                <div className="rounded-lg p-3 bg-slate-50 dark:bg-slate-800/50">
                                    <p className="text-[11px] text-slate-400 mb-0.5">{lang === "th" ? "นำเข้า" : "Import"}</p>
                                    <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">+{detailStats.totalImport.toLocaleString()}</span>
                                </div>
                                <div className="rounded-lg p-3 bg-slate-50 dark:bg-slate-800/50">
                                    <p className="text-[11px] text-slate-400 mb-0.5">{lang === "th" ? "เบิกออก" : "Withdraw"}</p>
                                    <span className="text-base font-bold text-orange-600 dark:text-orange-400 tabular-nums">-{detailStats.totalWithdraw.toLocaleString()}</span>
                                </div>
                                <div className="rounded-lg p-3 bg-slate-50 dark:bg-slate-800/50">
                                    <p className="text-[11px] text-slate-400 mb-0.5">{lang === "th" ? "ตัด/แปรรูป" : "Cut"}</p>
                                    <span className="text-base font-bold text-blue-600 dark:text-blue-400 tabular-nums">-{detailStats.totalCut.toLocaleString()}</span>
                                </div>
                                <div className="rounded-lg p-3 bg-slate-50 dark:bg-slate-800/50">
                                    <p className="text-[11px] text-slate-400 mb-0.5">{lang === "th" ? "เคลม" : "Claim"}</p>
                                    <span className="text-base font-bold text-red-600 dark:text-red-400 tabular-nums">-{detailStats.totalClaim.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Pane Position Summary */}
                        {(() => {
                            const paneLogs = timeline.filter(e => e.logType === "pane_log") as (PaneLog & { logType: "pane_log" })[];
                            if (paneLogs.length === 0) return null;
                            // Latest event per pane
                            const byPane = new Map<string, typeof paneLogs[0]>();
                            for (const e of paneLogs) {
                                const pid = typeof e.pane === "object" ? (e.pane as Pane)._id : String(e.pane);
                                if (!pid) continue;
                                const existing = byPane.get(pid);
                                if (!existing || new Date(e.createdAt) > new Date(existing.createdAt)) byPane.set(pid, e);
                            }
                            const panePositions = [...byPane.values()];
                            return (
                                <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
                                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                                        {lang === "th" ? `กระจกที่ตัดจากวัสดุนี้ (${panePositions.length} ชิ้น)` : `Panes cut from this material (${panePositions.length})`}
                                    </p>
                                    <div className="flex flex-col gap-2">
                                        {panePositions.map(e => {
                                            const pane = typeof e.pane === "object" ? e.pane as Pane : null;
                                            const order = typeof e.order === "object" ? e.order as Order : null;
                                            const worker = typeof e.worker === "object" ? e.worker as Worker : null;
                                            const statusCfg = {
                                                scan_in:  { label: lang === "th" ? "เข้าสถานี" : "At station", cls: "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/30 dark:text-blue-400", dot: "bg-blue-500" },
                                                start:    { label: lang === "th" ? "กำลังทำ"  : "In progress", cls: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400", dot: "bg-amber-500" },
                                                complete: { label: lang === "th" ? "เสร็จสิ้น" : "Complete", cls: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400", dot: "bg-emerald-500" },
                                            }[e.action] ?? { label: e.action, cls: "bg-slate-50 text-slate-600 border-slate-200", dot: "bg-slate-400" };
                                            return (
                                                <div key={e._id} className="flex items-center gap-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 px-3 py-2.5">
                                                    <Cpu className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                                    <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">{pane?.paneNumber ?? "—"}</span>
                                                    <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />
                                                    <span className="text-xs text-slate-500 shrink-0">{e.station}</span>
                                                    <span className={`ml-auto inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusCfg.cls}`}>
                                                        <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                                                        {statusCfg.label}
                                                    </span>
                                                    {order && (
                                                        <span className="text-[10px] font-mono font-bold text-[#1B4B9A] dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-900/40 shrink-0">
                                                            #{(order._id ?? "").slice(-6).toUpperCase()}
                                                        </span>
                                                    )}
                                                    {worker && (
                                                        <span className="text-[10px] text-slate-400 shrink-0 flex items-center gap-0.5">
                                                            <User className="h-3 w-3" />{worker.name ?? worker.username}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Merged Timeline */}
                        <div className="px-6 py-5">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-4">
                                {lang === "th" ? "ไทม์ไลน์ทั้งหมด" : "Full Timeline"}
                                <span className="ml-1.5 normal-case text-slate-300 dark:text-slate-600">
                                    ({lang === "th" ? "เก่าสุดขึ้นก่อน" : "oldest first"})
                                </span>
                            </p>

                            {timelineLoading ? (
                                <div className="flex flex-col gap-3">
                                    {[...Array(4)].map((_, i) => (
                                        <div key={i} className="relative pl-7">
                                            <div className="absolute left-0 top-1.5 w-3 h-3 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
                                            <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 space-y-2">
                                                <div className="h-4 w-24 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                                                <div className="h-3 w-40 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : timeline.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2">
                                        <History className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                                    </div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">{lang === "th" ? "ไม่พบประวัติ" : "No history found"}</p>
                                </div>
                            ) : (
                                <div className="relative">
                                    <div className="absolute left-[5px] top-2 bottom-2 w-0.5 bg-slate-100 dark:bg-slate-800" />
                                    <div className="flex flex-col gap-0">
                                        {timeline.map(event => {
                                            const isMat  = event.logType === "material_log";
                                            const isPane = event.logType === "pane_log";
                                            const matLog  = isMat  ? event as MaterialLog & { logType: "material_log" } : null;
                                            const paneLog = isPane ? event as PaneLog    & { logType: "pane_log"     } : null;

                                            // ── Material Log card ──────────────────────────────
                                            if (matLog) {
                                                const workerName = resolveWorkerName(matLog.worker, workerMap);
                                                const workerRole = typeof matLog.worker === 'object' && matLog.worker ? (matLog.worker as Worker).role : workerMap.get(String(matLog.worker ?? ''))?.role;
                                                const ordId = matLog.order ? (typeof matLog.order === "object" ? ((matLog.order as Order)._id ?? "") : String(matLog.order)) : null;
                                                const stockType = matLog.stockType ?? (matLog.referenceId && !matLog.referenceType ? invMap.get(matLog.referenceId)?.stockType : undefined);
                                                const moveLocs = getMoveLocations(matLog, moveSourceIds, invMap, parentLogMap, logById);
                                                const singleLoc = !moveLocs ? getLocation(matLog, invMap) : null;
                                                return (
                                                    <div key={matLog._id} className="relative pl-7 pb-4">
                                                        <div className="absolute left-0 top-1.5">{renderActionDot(matLog)}</div>
                                                        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800 p-3 hover:border-slate-200 dark:hover:border-slate-700 transition-colors">
                                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                                <div className="flex flex-col gap-1">
                                                                    {renderActionBadge(matLog)}
                                                                    <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                                                                        <Clock className="h-2.5 w-2.5" />
                                                                        {new Date(matLog.createdAt).toLocaleString(lang === "th" ? "th-TH" : "en-US", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                                    </div>
                                                                </div>
                                                                <div className="text-right shrink-0">{renderQuantityChanged(matLog.quantityChanged)}</div>
                                                            </div>
                                                            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-50 dark:border-slate-800">
                                                                {stockType && (
                                                                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${stockType === "Raw" ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>{stockType}</span>
                                                                )}
                                                                {singleLoc && (
                                                                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-md">{singleLoc}</span>
                                                                )}
                                                                {moveLocs && (
                                                                    <div className="flex items-center gap-1 text-[11px] font-medium text-violet-600 dark:text-violet-400">
                                                                        <span className="px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-500/10">{moveLocs.from ?? '?'}</span>
                                                                        <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
                                                                        <span className="px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-500/10">{moveLocs.to ?? '?'}</span>
                                                                    </div>
                                                                )}
                                                                {workerName && (
                                                                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                                                                        <User className="h-2.5 w-2.5 inline mr-1" />{workerName}
                                                                    </span>
                                                                )}
                                                                {ordId && (
                                                                    <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-md">
                                                                        #{ordId.slice(-6).toUpperCase()}
                                                                    </span>
                                                                )}
                                                                {matLog.referenceType && matLog.referenceId && (
                                                                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${matLog.referenceType === "withdrawal" ? "text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-500/10" : "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10"}`}>
                                                                        {REF_TYPE_LABELS[matLog.referenceType]?.[lang] ?? matLog.referenceType} #{matLog.referenceId.slice(-6).toUpperCase()}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            // ── Pane Log card ──────────────────────────────────
                                            if (paneLog) {
                                                const pane   = typeof paneLog.pane   === "object" ? paneLog.pane   as Pane   : null;
                                                const order  = typeof paneLog.order  === "object" ? paneLog.order  as Order  : null;
                                                const worker = typeof paneLog.worker === "object" ? paneLog.worker as Worker : null;
                                                const workerName = worker?.name ?? worker?.username ?? (typeof paneLog.worker === "string" ? workerMap.get(paneLog.worker)?.name : null) ?? null;
                                                const actionCfg = {
                                                    scan_in:  { label: lang === "th" ? "เข้าสถานี"  : "Entered station", icon: <Circle   className="h-3 w-3" />, dot: "bg-blue-500",   cls: "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/40"   },
                                                    start:    { label: lang === "th" ? "เริ่มงาน"   : "Started work",    icon: <Play     className="h-3 w-3" />, dot: "bg-amber-500",  cls: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40" },
                                                    complete: { label: lang === "th" ? "เสร็จสิ้น" : "Completed",       icon: <CheckCircle2 className="h-3 w-3" />, dot: "bg-emerald-500", cls: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40" },
                                                }[paneLog.action];
                                                return (
                                                    <div key={paneLog._id} className="relative pl-7 pb-4">
                                                        <div className={`absolute left-0 top-1.5 w-3 h-3 rounded-full ${actionCfg?.dot ?? "bg-slate-400"}`} />
                                                        <div className="bg-slate-50/50 dark:bg-slate-800/30 rounded-lg border border-slate-100 dark:border-slate-800 p-3 hover:border-slate-200 dark:hover:border-slate-700 transition-colors">
                                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                                <div className="flex flex-col gap-1">
                                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${actionCfg?.cls ?? ""}`}>
                                                                        {actionCfg?.icon}
                                                                        {actionCfg?.label ?? paneLog.action}
                                                                    </span>
                                                                    <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                                                                        <Clock className="h-2.5 w-2.5" />
                                                                        {new Date(paneLog.createdAt).toLocaleString(lang === "th" ? "th-TH" : "en-US", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                                    </div>
                                                                </div>
                                                                <span className="font-mono text-xs font-medium text-slate-600 dark:text-slate-300 shrink-0">{pane?.paneNumber ?? "—"}</span>
                                                            </div>
                                                            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                                                                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md">{paneLog.station}</span>
                                                                {order && (
                                                                    <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-md">
                                                                        #{(order._id ?? "").slice(-6).toUpperCase()}
                                                                    </span>
                                                                )}
                                                                {workerName && (
                                                                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md">
                                                                        <User className="h-2.5 w-2.5 inline mr-1" />{workerName}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                {/* Panel Footer */}
                <div className="shrink-0 px-6 py-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">
                            {lang === "th" ? "ข้อมูล ณ" : "As of"} {lastUpdated?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) ?? "—"}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live
                        </div>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
        </>
    );
}
