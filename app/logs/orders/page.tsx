"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { paneLogsApi } from "@/lib/api/pane-logs";
import { activityLogsApi } from "@/lib/api/activity-logs";
import { stationsApi } from "@/lib/api/stations";
import { PaneLog, TimelineEvent, Station, Order, Pane, Worker, ActivityLog } from "@/lib/api/types";
import { useLanguage } from "@/lib/i18n/language-context";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
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
    History,
    Wifi,
    WifiOff,
    RefreshCw,
    ChevronRight,
    ClipboardList,
    Package,
    User,
    Factory,
    CheckCircle2,
    Circle,
    Play,
    AlertTriangle,
    ArrowRightCircle,
    ScanBarcode,
    FileText,
    ArrowDownFromLine,
    ShieldAlert,
    Building2,
    Layers,
    CalendarDays,
    XCircle,
} from "lucide-react";
import Link from "next/link";

const ITEMS_PER_PAGE = 10;

const ACTION_MAP: Record<string, { th: string; en: string; icon: any; cls: string; bulletCls: string }> = {
    scan_in:           { th: "เข้าสถานี",         en: "Entered Station",    icon: ScanBarcode,       cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800", bulletCls: "border-blue-500 text-blue-600" },
    start:             { th: "เริ่มงาน",          en: "Started Work",       icon: Play,              cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800", bulletCls: "border-amber-500 text-amber-600" },
    complete:          { th: "เสร็จสิ้น",         en: "Completed",          icon: CheckCircle2,      cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800", bulletCls: "border-emerald-500 text-emerald-600" },
    scan_out:          { th: "ส่งต่อสถานีถัดไป",   en: "Scanned Out",        icon: ArrowRightCircle,  cls: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800", bulletCls: "border-purple-500 text-purple-600" },
    qc_pass:           { th: "QC ผ่าน",           en: "QC Passed",          icon: CheckCircle2,      cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800", bulletCls: "border-emerald-500 text-emerald-600" },
    qc_fail:           { th: "QC ไม่ผ่าน",        en: "QC Failed",          icon: AlertTriangle,     cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800", bulletCls: "border-red-500 text-red-600" },
    laminate_complete: { th: "ลามิเนตเสร็จสิ้น",   en: "Laminate Complete",  icon: Layers,            cls: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800", bulletCls: "border-cyan-500 text-cyan-600" },
    withdraw:          { th: "เบิกวัสดุ",         en: "Material Withdraw",  icon: ArrowDownFromLine, cls: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800", bulletCls: "border-orange-500 text-orange-600" },
    claim:             { th: "เคลมวัสดุ",         en: "Material Claim",     icon: ShieldAlert,       cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800", bulletCls: "border-red-500 text-red-600" },
    deadline_postponed:{ th: "เลื่อนกำหนดส่ง",    en: "Deadline Postponed", icon: CalendarDays,      cls: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800", bulletCls: "border-sky-500 text-sky-600" },
    claim_entered:     { th: "เปิดเคลม",          en: "Claim Entered",      icon: ShieldAlert,       cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800", bulletCls: "border-red-500 text-red-600" },
    request_cancelled: { th: "ยกเลิกคำขอ",        en: "Request Cancelled",  icon: XCircle,           cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800", bulletCls: "border-red-500 text-red-600" },
};

export default function OrderLogsPage() {
    const { lang } = useLanguage();
    const [logs, setLogs] = useState<TimelineEvent[]>([]);
    const [stations, setStations] = useState<Station[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [actionFilter, setActionFilter] = useState<string>("all");
    const [stationFilter, setStationFilter] = useState<string>("all");
    const [dateFilter, setDateFilter] = useState<string>("all");

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);

    // Timeline Side Sheet
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [selectedOrderLabel, setSelectedOrderLabel] = useState<string>("");
    const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
    const [isTimelineLoading, setIsTimelineLoading] = useState(false);
    const [isTimelineOpen, setIsTimelineOpen] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [logsRes, activityRes, stRes] = await Promise.all([
                paneLogsApi.getAll({ limit: 100 }),
                activityLogsApi.getAll({ limit: 100 }),
                stationsApi.getAll(),
            ]);

            if (logsRes.success && activityRes.success) {
                const paneLogs: TimelineEvent[] = (logsRes.data || []).map(l => ({ ...l, logType: "pane_log" }));
                const actLogs: TimelineEvent[] = (activityRes.data || []).map(l => ({ ...l, logType: "activity_log" }));
                
                const combined = [...paneLogs, ...actLogs].sort((a, b) => 
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
                
                setLogs(combined.slice(0, 100));
                setLastUpdated(new Date());
            }
            if (stRes.success && stRes.data) {
                setStations(stRes.data);
            }
        } catch (error) {
            console.error("Error fetching order logs:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // WebSocket real-time updates
    const { status: wsStatus } = useWebSocket(
        "order",
        ["order:updated", "pane:updated", "log:updated"],
        useCallback(() => {
            fetchData();
        }, [fetchData])
    );

    const stationMap = useMemo(() => {
        const map = new Map<string, string>();
        stations.forEach(s => map.set(s._id, s.name));
        return map;
    }, [stations]);

    // Filter logic
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const searchLower = searchQuery.toLowerCase();

            const orderObj = typeof log.order === "object" && log.order !== null ? (log.order as Order) : null;
            const reqObj = (log.logType === "activity_log" && (log as ActivityLog).request) 
                ? (typeof (log as ActivityLog).request === "object" ? (log as ActivityLog).request : null) 
                : (orderObj && typeof orderObj.request === "object" && orderObj.request !== null ? orderObj.request : null);
            const custObj = orderObj && typeof orderObj.customer === "object" && orderObj.customer !== null ? orderObj.customer : null;
            const paneObj = log.logType === "pane_log" && typeof log.pane === "object" && log.pane !== null ? (log.pane as Pane) : null;
            const workerObj = typeof log.worker === "object" && log.worker !== null ? (log.worker as Worker) : null;

            const orderNum = orderObj?.orderNumber?.toLowerCase() ?? "";
            const orderCode = orderObj?.code?.toLowerCase() ?? "";
            const reqCode = ((reqObj as any)?.requestNumber ?? (reqObj as any)?.code ?? "").toLowerCase();
            const custName = ((reqObj as any)?.customerName ?? (custObj as any)?.name ?? (custObj as any)?.company ?? "").toLowerCase();
            const projName = (reqObj as any)?.project?.toLowerCase() ?? "";
            const paneNum = paneObj?.paneNumber?.toLowerCase() ?? "";
            const workerName = (workerObj?.name ?? workerObj?.username ?? "").toLowerCase();

            const stId = log.logType === "pane_log" ? (typeof log.station === "object" && log.station !== null ? log.station._id : String(log.station || "")) : "";
            const stName = log.logType === "pane_log" ? (typeof log.station === "object" && log.station !== null ? (log.station.name || "") : (stationMap.get(stId) ?? "")) : "system";

            const matchesSearch = !searchQuery ||
                orderNum.includes(searchLower) ||
                orderCode.includes(searchLower) ||
                reqCode.includes(searchLower) ||
                custName.includes(searchLower) ||
                projName.includes(searchLower) ||
                paneNum.includes(searchLower) ||
                workerName.includes(searchLower) ||
                stName.includes(searchLower);
            const logAction = (log as any).action;
            const matchesAction = actionFilter === "all" || logAction === actionFilter;
            const matchesStation = stationFilter === "all" || stId === stationFilter;

            let matchesDate = true;
            if (dateFilter && dateFilter !== "all") {
                const logDate = new Date(log.createdAt);
                const filterDate = new Date(dateFilter);
                if (!isNaN(filterDate.getTime())) {
                    matchesDate = logDate.getFullYear() === filterDate.getFullYear() &&
                                  logDate.getMonth() === filterDate.getMonth() &&
                                  logDate.getDate() === filterDate.getDate();
                }
            }

            return matchesSearch && matchesAction && matchesStation && matchesDate;
        });
    }, [logs, searchQuery, actionFilter, stationFilter, dateFilter, stationMap]);

    const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
    const paginatedLogs = filteredLogs.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const resetFilters = () => {
        setSearchQuery("");
        setActionFilter("all");
        setStationFilter("all");
        setDateFilter("all");
        setCurrentPage(1);
    };

    const hasActiveFilters = searchQuery !== "" || actionFilter !== "all" || stationFilter !== "all" || dateFilter !== "all";

    // Handle Open Order Timeline
    const handleOpenTimeline = async (log: any) => {
        const orderObj = log.order;
        const requestObj = log.request;
        const orderId = typeof orderObj === "object" && orderObj !== null ? orderObj._id : (orderObj || (log as any).orderId);
        const requestId = typeof requestObj === "object" && requestObj !== null ? requestObj._id : (requestObj || (log as any).requestId);

        if (!orderId && !requestId) return;

        let titleLabel = "";
        if (orderId) {
            titleLabel = typeof orderObj === "object" && orderObj !== null ? (orderObj.orderNumber || orderObj.code || `#${String(orderId).slice(-6).toUpperCase()}`) : `#${String(orderId).slice(-6).toUpperCase()}`;
            titleLabel = (lang === "th" ? "ออเดอร์ " : "Order ") + titleLabel;
        } else if (requestId) {
            titleLabel = typeof requestObj === "object" && requestObj !== null ? (requestObj.requestNumber || requestObj.code || `#${String(requestId).slice(-6).toUpperCase()}`) : `#${String(requestId).slice(-6).toUpperCase()}`;
            titleLabel = (lang === "th" ? "บิลคำขอ " : "Request ") + titleLabel;
        }

        setSelectedOrderId(String(orderId || requestId));
        setSelectedOrderLabel(titleLabel);
        setIsTimelineOpen(true);
        setIsTimelineLoading(true);

        try {
            const res = await paneLogsApi.getOrderTimeline(orderId ? { orderId: String(orderId), limit: 100 } : { requestId: String(requestId), limit: 100 });
            if (res.success && res.data) {
                // Sort newest top
                const sorted = [...res.data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                setTimelineEvents(sorted);
            } else {
                setTimelineEvents([]);
            }
        } catch (err) {
            console.error("Failed to fetch order timeline", err);
            setTimelineEvents([]);
        } finally {
            setIsTimelineLoading(false);
        }
    };

    const fmtTime = (dateStr?: string) => {
        if (!dateStr) return "—";
        const d = new Date(dateStr);
        return d.toLocaleTimeString(lang === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    };

    const fmtDate = (dateStr?: string) => {
        if (!dateStr) return "—";
        const d = new Date(dateStr);
        return d.toLocaleDateString(lang === "th" ? "th-TH" : "en-US", { year: "numeric", month: "short", day: "numeric" });
    };

    return (
        <PermissionGuard permission="settings:view">
            <div className="space-y-6 max-w-[1440px] mx-auto w-full pb-12">
                {/* View Mode Toggle Bar */}
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                    <div className="flex items-center gap-2">
                        <Link href="/logs">
                            <Button variant="ghost" size="sm" className="gap-2 text-slate-500 hover:text-slate-900 dark:hover:text-white font-medium">
                                <Package className="h-4 w-4 text-slate-400" />
                                {lang === "th" ? "ประวัติคลังวัสดุ (Material Logs)" : "Material Logs"}
                            </Button>
                        </Link>
                        <div className="h-4 w-px bg-slate-300 dark:bg-slate-700" />
                        <Link href="/logs/orders">
                            <Button variant="secondary" size="sm" className="gap-2 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 font-semibold shadow-sm">
                                <ClipboardList className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                {lang === "th" ? "ประวัติคำขอและออเดอร์ (Request & Order Logs)" : "Request & Order Logs"}
                            </Button>
                        </Link>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                            wsStatus === "open"
                                ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : wsStatus === "connecting"
                                    ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                        }`}>
                            {wsStatus === "open" ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                            <span>{wsStatus === "open" ? (lang === "th" ? "เชื่อมต่อเรียลไทม์" : "Live") : (lang === "th" ? "ออฟไลน์" : "Offline")}</span>
                        </div>
                        {lastUpdated && (
                            <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline">
                                {lang === "th" ? "อัปเดตล่าสุด: " : "Updated: "}
                                {lastUpdated.toLocaleTimeString(lang === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </span>
                        )}
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={fetchData}
                            disabled={isLoading}
                            className="h-8 w-8 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title={lang === "th" ? "รีเฟรชข้อมูล" : "Refresh"}
                        >
                            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin text-blue-600" : ""}`} />
                        </Button>
                    </div>
                </div>

                {/* Header Title */}
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
                        <ClipboardList className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        {lang === "th" ? "ประวัติการทำงานออเดอร์และคำขอ (Order & Request Logs)" : "Order & Request Activity Logs"}
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {lang === "th"
                            ? "ติดตามความเคลื่อนไหวของออเดอร์ กระจกแต่ละแผ่น สถานะการสแกนเข้า-ออก แต่ละสถานีแบบเรียลไทม์"
                            : "Track real-time station activities, scans, and progress for every request, order, and glass pane"}
                    </p>
                </div>

                {/* Filters Section */}
                <div className="bg-white dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-3">
                    <div className="flex flex-col md:flex-row gap-3">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder={lang === "th" ? "ค้นหาเลขบิล REQ-, ออเดอร์ ORD-, กระจก PNE-, ชื่อลูกค้า..." : "Search REQ-, ORD-, PNE-, customer..."}
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="pl-9 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 focus:bg-white dark:focus:bg-slate-900 transition-colors"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {/* Station Filter */}
                        <div className="w-full md:w-[180px]">
                            <Select
                                value={stationFilter}
                                onValueChange={(val) => {
                                    setStationFilter(val || "all");
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger className="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60">
                                    <SelectValue placeholder={lang === "th" ? "ทุกสถานี" : "All Stations"}>
                                        {stationFilter === "all"
                                            ? (lang === "th" ? "ทุกสถานี" : "All Stations")
                                            : (stationMap.get(stationFilter) || stationFilter)}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{lang === "th" ? "ทุกสถานี" : "All Stations"}</SelectItem>
                                    {stations.map(st => (
                                        <SelectItem key={st._id} value={st._id}>{st.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Action Filter */}
                        <div className="w-full md:w-[180px]">
                            <Select
                                value={actionFilter}
                                onValueChange={(val) => {
                                    setActionFilter(val || "all");
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger className="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60">
                                    <SelectValue placeholder={lang === "th" ? "ทุกสถานะ" : "All Actions"}>
                                        {actionFilter === "all"
                                            ? (lang === "th" ? "ทุกสถานะ" : "All Actions")
                                            : (ACTION_MAP[actionFilter]?.[lang === "th" ? "th" : "en"] || actionFilter)}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{lang === "th" ? "ทุกสถานะ" : "All Actions"}</SelectItem>
                                    <SelectItem value="scan_in">{lang === "th" ? "เข้าสถานี" : "Entered Station"}</SelectItem>
                                    <SelectItem value="start">{lang === "th" ? "เริ่มงาน" : "Started Work"}</SelectItem>
                                    <SelectItem value="complete">{lang === "th" ? "เสร็จสิ้น" : "Completed"}</SelectItem>
                                    <SelectItem value="scan_out">{lang === "th" ? "ส่งต่อสถานีถัดไป" : "Scanned Out"}</SelectItem>
                                    <SelectItem value="qc_pass">{lang === "th" ? "QC ผ่าน" : "QC Passed"}</SelectItem>
                                    <SelectItem value="qc_fail">{lang === "th" ? "QC ไม่ผ่าน" : "QC Failed"}</SelectItem>
                                    <SelectItem value="laminate_complete">{lang === "th" ? "ลามิเนตเสร็จสิ้น" : "Laminate Complete"}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Date Filter */}
                        <div className="w-full md:w-[160px]">
                            <Input
                                type="date"
                                value={dateFilter !== "all" ? dateFilter : ""}
                                onChange={(e) => {
                                    setDateFilter(e.target.value || "all");
                                    setCurrentPage(1);
                                }}
                                className="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 w-full"
                            />
                        </div>

                        {hasActiveFilters && (
                            <Button
                                variant="ghost"
                                onClick={resetFilters}
                                className="text-slate-500 hover:text-red-600 dark:hover:text-red-400 px-2.5 h-10"
                                title={lang === "th" ? "ล้างตัวกรอง" : "Reset filters"}
                            >
                                <FilterX className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>

                {/* Table Section */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/75 dark:bg-slate-800/50 hover:bg-slate-50/75 dark:hover:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                                    <TableHead className="w-[140px] font-semibold text-slate-700 dark:text-slate-200">{lang === "th" ? "วันเวลา" : "Date & Time"}</TableHead>
                                    <TableHead className="min-w-[180px] font-semibold text-slate-700 dark:text-slate-200">{lang === "th" ? "บิลคำขอ / ลูกค้า" : "Request / Customer"}</TableHead>
                                    <TableHead className="min-w-[260px] font-semibold text-slate-700 dark:text-slate-200">{lang === "th" ? "ออเดอร์ / กระจก" : "Order / Pane"}</TableHead>
                                    <TableHead className="min-w-[160px] font-semibold text-slate-700 dark:text-slate-200">{lang === "th" ? "สถานี" : "Station"}</TableHead>
                                    <TableHead className="min-w-[180px] font-semibold text-slate-700 dark:text-slate-200">{lang === "th" ? "สถานะ / การทำงาน" : "Action"}</TableHead>
                                    <TableHead className="w-[140px] font-semibold text-slate-700 dark:text-slate-200">{lang === "th" ? "ผู้ดำเนินการ" : "Operator"}</TableHead>
                                    <TableHead className="w-[120px] text-right font-semibold text-slate-700 dark:text-slate-200">{lang === "th" ? "ไทม์ไลน์" : "Timeline"}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    [...Array(8)].map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                                            <TableCell><Skeleton className="h-8 w-36" /></TableCell>
                                            <TableCell><Skeleton className="h-8 w-36" /></TableCell>
                                            <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                                            <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                                            <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : paginatedLogs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-48 text-center text-slate-500 dark:text-slate-400">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <History className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                                                <p className="font-medium">{lang === "th" ? "ไม่พบประวัติการทำงานที่ค้นหา" : "No logs found matching your filters"}</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedLogs.map((log) => {
                                        const orderObj = typeof log.order === "object" && log.order !== null ? (log.order as Order) : null;
                                        const reqObj = (log.logType === "activity_log" && (log as ActivityLog).request) 
                                            ? (typeof (log as ActivityLog).request === "object" ? (log as ActivityLog).request : null) 
                                            : (orderObj && typeof orderObj.request === "object" && orderObj.request !== null ? orderObj.request : null);
                                        const custObj = orderObj && typeof orderObj.customer === "object" && orderObj.customer !== null ? orderObj.customer : null;
                                        const paneObj = log.logType === "pane_log" && typeof log.pane === "object" && log.pane !== null ? (log.pane as Pane) : null;
                                        const workerObj = typeof log.worker === "object" && log.worker !== null ? (log.worker as Worker) : null;

                                        const orderNum = orderObj?.orderNumber || orderObj?.code || (log.order ? `#${String(log.order).slice(-6).toUpperCase()}` : "—");
                                        const reqCode = (reqObj as any)?.requestNumber || (reqObj as any)?.code || "—";
                                        const custName = (reqObj as any)?.customerName || (custObj as any)?.name || (custObj as any)?.company || "—";
                                        const paneNum = paneObj?.paneNumber || (log.logType === "pane_log" && log.pane ? `#${String(log.pane).slice(-6).toUpperCase()}` : "—");
                                        const glassInfo = paneObj?.dimensions ? `${paneObj.dimensions.width}x${paneObj.dimensions.height}` : paneObj?.glassTypeLabel || "";

                                        const stId = log.logType === "pane_log" ? (typeof log.station === "object" && log.station !== null ? log.station._id : String(log.station || "")) : "";
                                        const stName = log.logType === "pane_log" ? (typeof log.station === "object" && log.station !== null ? log.station.name : stationMap.get(stId) ?? "—") : (lang === "th" ? "ระบบ" : "System");
                                        const workerName = workerObj?.name || workerObj?.username || "—";

                                        const logAction = (log as any).action;
                                        const actMeta = ACTION_MAP[logAction] || {
                                            th: logAction,
                                            en: logAction,
                                            icon: Circle,
                                            cls: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
                                        };
                                        const Icon = actMeta.icon;

                                        return (
                                            <TableRow 
                                                key={log._id} 
                                                onClick={() => handleOpenTimeline(log)}
                                                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                                            >
                                                {/* Date & Time */}
                                                <TableCell className="whitespace-nowrap font-mono text-xs text-slate-600 dark:text-slate-300">
                                                    <div className="font-semibold text-slate-900 dark:text-white">{fmtTime(log.createdAt)}</div>
                                                    <div className="text-[11px] text-slate-400">{fmtDate(log.createdAt)}</div>
                                                </TableCell>

                                                {/* Request / Customer */}
                                                <TableCell>
                                                    <div className="flex flex-col gap-1 items-start">
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/60">
                                                            {reqCode}
                                                        </span>
                                                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 line-clamp-1 flex items-center gap-1" title={custName}>
                                                            {custName}
                                                        </span>
                                                    </div>
                                                </TableCell>

                                                {/* Order / Pane */}
                                                <TableCell>
                                                    <div className="flex flex-col gap-1 items-start">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/60">
                                                                {orderNum}
                                                            </span>
                                                            <span className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                                                {paneNum}
                                                            </span>
                                                        </div>
                                                        {glassInfo && (
                                                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                                                {glassInfo}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>

                                                {/* Station */}
                                                <TableCell>
                                                    {stName === "ระบบ" || stName === "System" ? (
                                                        <span className="text-slate-400 dark:text-slate-500">—</span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                                            {stName}
                                                        </span>
                                                    )}
                                                </TableCell>

                                                {/* Action */}
                                                <TableCell>
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${actMeta.cls}`}>
                                                        <Icon className="w-3.5 h-3.5 shrink-0" />
                                                        {lang === "th" ? actMeta.th : actMeta.en}
                                                    </span>
                                                    {((log as any).reason || (log as any).details?.reason) && (
                                                        <div className="text-[11px] text-slate-900 dark:text-slate-100 mt-1 font-medium flex items-center gap-1">
                                                            "{(log as any).reason || (log as any).details?.reason}"
                                                        </div>
                                                    )}
                                                </TableCell>

                                                {/* Operator */}
                                                <TableCell>
                                                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                                                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                        <span className="truncate max-w-[100px]" title={workerName}>{workerName}</span>
                                                    </div>
                                                </TableCell>

                                                {/* Actions / Timeline */}
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleOpenTimeline(log);
                                                        }}
                                                        className="gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 border-blue-200 dark:border-blue-900"
                                                    >
                                                        <Clock className="w-3.5 h-3.5" />
                                                        {lang === "th" ? "ดูไทม์ไลน์" : "Timeline"}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    {!isLoading && totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-xs text-slate-500">
                            <div>
                                {lang === "th"
                                    ? `แสดง ${(currentPage - 1) * ITEMS_PER_PAGE + 1} ถึง ${Math.min(currentPage * ITEMS_PER_PAGE, filteredLogs.length)} จากทั้งหมด ${filteredLogs.length} รายการ`
                                    : `Showing ${(currentPage - 1) * ITEMS_PER_PAGE + 1} to ${Math.min(currentPage * ITEMS_PER_PAGE, filteredLogs.length)} of ${filteredLogs.length} entries`}
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    className="h-8 px-3 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 font-medium"
                                >
                                    <ChevronRight className="h-4 w-4 rotate-180" />
                                    {lang === "th" ? "ก่อนหน้า" : "Previous"}
                                </Button>
                                
                                {(() => {
                                    const pages: (number | string)[] = [];
                                    if (totalPages <= 7) {
                                        for (let i = 1; i <= totalPages; i++) pages.push(i);
                                    } else if (currentPage <= 4) {
                                        pages.push(1, 2, 3, 4, 5, "...", totalPages);
                                    } else if (currentPage >= totalPages - 3) {
                                        pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
                                    } else {
                                        pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
                                    }
                                    
                                    return pages.map((val, idx) => {
                                        if (val === "...") {
                                            return <span key={`dots-${idx}`} className="px-2 text-slate-400 font-bold">...</span>;
                                        }
                                        const pageNum = val as number;
                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => setCurrentPage(pageNum)}
                                                className={`h-8 w-8 rounded-xl flex items-center justify-center text-xs font-semibold transition-colors ${
                                                    currentPage === pageNum
                                                        ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 shadow-sm"
                                                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                }`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    });
                                })()}
                                
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    className="h-8 px-3 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 font-medium"
                                >
                                    {lang === "th" ? "ถัดไป" : "Next"}
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Side Sheet: Order Timeline */}
                <Sheet open={isTimelineOpen} onOpenChange={setIsTimelineOpen}>
                    <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-6 space-y-6">
                        <SheetHeader>
                            <SheetTitle className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                {lang === "th" ? `ไทม์ไลน์ออเดอร์ ${selectedOrderLabel}` : `Order Timeline ${selectedOrderLabel}`}
                            </SheetTitle>
                            <SheetDescription className="text-xs text-slate-500">
                                {lang === "th"
                                    ? "ลำดับประวัติการสแกนและสถานะการผลิตของกระจกทุกแผ่นในออเดอร์นี้ เรียงจากล่าสุดไปเก่าสุด"
                                    : "Chronological activity and scan logs for all glass panes in this order, newest to oldest"}
                            </SheetDescription>
                        </SheetHeader>

                        {isTimelineLoading ? (
                            <div className="space-y-4 pt-4">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="flex gap-3">
                                        <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                                        <div className="space-y-1.5 flex-1">
                                            <Skeleton className="h-4 w-3/4" />
                                            <Skeleton className="h-3 w-1/2" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : timelineEvents.length === 0 ? (
                            <div className="text-center py-12 text-slate-400">
                                <History className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                <p className="text-sm font-medium">{lang === "th" ? "ไม่พบประวัติในออเดอร์นี้" : "No timeline events recorded for this order"}</p>
                            </div>
                        ) : (
                            <div className="relative border-l-2 border-transparent ml-3.5 pl-6 space-y-6 pt-2">
                                {timelineEvents.map((ev: any, idx) => {
                                    const isMat = ev.logType === "material_log";
                                    const actMeta = ACTION_MAP[ev.action || ev.actionType] || {
                                        th: ev.action || ev.actionType || "กิจกรรม",
                                        en: ev.action || ev.actionType || "Activity",
                                        icon: Circle,
                                        cls: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
                                        bulletCls: "border-slate-500 text-slate-600",
                                    };
                                    const Icon = actMeta.icon;

                                    const workerObj = typeof ev.worker === "object" && ev.worker !== null ? ev.worker : null;
                                    const workerName = workerObj?.name || workerObj?.username || "—";

                                    const stId = typeof ev.station === "object" && ev.station !== null ? ev.station._id : String(ev.station || "");
                                    const stName = typeof ev.station === "object" && ev.station !== null ? ev.station.name : stationMap.get(stId) ?? null;

                                    const paneObj = typeof ev.pane === "object" && ev.pane !== null ? ev.pane : null;
                                    const paneNum = paneObj?.paneNumber || (ev.pane ? `#${String(ev.pane).slice(-6).toUpperCase()}` : null);
                                    const glassInfo = paneObj?.dimensions ? `${paneObj.dimensions.width}x${paneObj.dimensions.height}` : paneObj?.glassTypeLabel || null;

                                    return (
                                        <div key={ev._id || idx} className="relative group">
                                            {/* Connecting line to next item */}
                                            {idx !== timelineEvents.length - 1 && (
                                                <div className="absolute left-[-24px] top-[30px] bottom-[-26px] w-[2px] bg-slate-200 dark:bg-slate-800 z-0" />
                                            )}

                                            {/* Bullet icon */}
                                            <div className={`absolute -left-[37px] top-0.5 w-7 h-7 rounded-full flex items-center justify-center border-2 bg-white dark:bg-slate-900 shadow-sm z-10 ${
                                                actMeta.bulletCls || "border-blue-500 text-blue-600"
                                            }`}>
                                                <Icon className="w-3.5 h-3.5" />
                                            </div>

                                            <div className="bg-slate-50/70 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-800 space-y-2 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold border ${actMeta.cls}`}>
                                                        {lang === "th" ? actMeta.th : actMeta.en}
                                                    </span>
                                                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                                                        {fmtDate(ev.createdAt)} · {fmtTime(ev.createdAt)}
                                                    </span>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-medium">
                                                    {paneNum && (
                                                        <span className="bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono font-bold text-blue-600 dark:text-blue-400">
                                                            {paneNum} {glassInfo ? `(${glassInfo})` : ""}
                                                        </span>
                                                    )}
                                                    {stName && (
                                                        <span className="bg-slate-200/70 dark:bg-slate-700/60 px-2 py-0.5 rounded flex items-center gap-1">
                                                            {stName}
                                                        </span>
                                                    )}
                                                    <span className="ml-auto flex items-center gap-1 text-slate-500 dark:text-slate-400">
                                                        <User className="w-3 h-3" />
                                                        {workerName}
                                                    </span>
                                                </div>

                                                {(ev.reason || ev.description || ev.details?.reason) && (
                                                    <div className="text-xs p-2 rounded border bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800">
                                                        {(ev.reason || ev.details?.reason) && <span className="font-semibold text-slate-700 dark:text-slate-300">"{(ev.reason || ev.details?.reason)}" {ev.description ? ": " : ""}</span>}
                                                        {ev.description}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </SheetContent>
                </Sheet>
            </div>
        </PermissionGuard>
    );
}
