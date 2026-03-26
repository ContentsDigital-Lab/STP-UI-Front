"use client";

import { useNode } from "@craftjs/core";
import { useEffect, useState } from "react";
import { Database, ChevronRight, ChevronDown, Loader2, AlertCircle, Hash, ExternalLink, QrCode as QrCodeIcon, FileText, Package, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { fetchApi } from "@/lib/api/config";
import { panesApi } from "@/lib/api/panes";
import { Pane } from "@/lib/api/types";
import { usePreview } from "../PreviewContext";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { useStationContext } from "../StationContext";
import { STATUS_CONFIG } from "./StatusIndicator";
import { QrCodeModal } from "@/components/qr/QrCodeModal";

const PANE_STATUS_CFG: Record<string, { label: string; dot: string; text: string }> = {
    pending:            { label: "รอ",          dot: "bg-amber-400", text: "text-amber-600" },
    in_progress:        { label: "กำลังทำ",     dot: "bg-blue-500",  text: "text-blue-600" },
    completed:          { label: "เสร็จ",       dot: "bg-green-500", text: "text-green-600" },
    awaiting_scan_out:  { label: "รอสแกนออก",  dot: "bg-amber-500", text: "text-amber-600" },
};

// ── Column definition ─────────────────────────────────────────────────────────
// Stored as JSON string in props so Craft.js can serialize it
export interface ColumnDef {
    key:    string;   // field name from API response
    label:  string;   // Thai header label
    type?:  "text" | "number" | "status" | "date" | "badge" | "currency";
    width?: "auto" | "sm" | "md" | "lg";
}

const EMPTY_COLUMNS: ColumnDef[] = [];
const EMPTY_COLUMNS_STR = JSON.stringify(EMPTY_COLUMNS);

const STATIC_DEFAULT_COLUMNS: ColumnDef[] = [
    { key: "id",     label: "รหัส",   type: "text",     width: "sm" },
    { key: "name",   label: "รายการ", type: "text",     width: "lg" },
    { key: "status", label: "สถานะ",  type: "status",   width: "md" },
    { key: "amount", label: "จำนวน",  type: "number",   width: "sm" },
    { key: "price",  label: "ราคา",   type: "currency", width: "sm" },
];
const STATIC_DEFAULT_COLUMNS_STR = JSON.stringify(STATIC_DEFAULT_COLUMNS);

// Sample rows for preview/design
const SAMPLE_ROWS = [
    { id: "B-001", name: "บิลกระจกใส 3mm × 10 แผ่น",    status: "pending",     amount: 10, date: "2026-03-15", price: 4500  },
    { id: "B-002", name: "กระจกลามิเนต 6mm × 5 แผ่น",   status: "in_progress", amount: 5,  date: "2026-03-14", price: 8200  },
    { id: "B-003", name: "กระจกเทมเปอร์ 10mm × 3 แผ่น", status: "completed",   amount: 3,  date: "2026-03-13", price: 12600 },
    { id: "B-004", name: "กระจกสีชา 5mm × 8 แผ่น",      status: "error",       amount: 8,  date: "2026-03-12", price: 6400  },
];

// min-w-0 + overflow-hidden prevent flex-children from overflowing
const WIDTH_MAP = { sm: "w-16 shrink-0", md: "w-24 shrink-0", lg: "flex-1 min-w-0 overflow-hidden", auto: "flex-1 min-w-0 overflow-hidden" };

// Resolve dot-notation keys and unwrap populated objects (e.g. customer → customer.name)
function resolveValue(row: Record<string, unknown>, key: string): unknown {
    const raw = key.split(".").reduce<unknown>((obj, part) =>
        (obj != null && typeof obj === "object") ? (obj as Record<string, unknown>)[part] : undefined
    , row);
    // If value is a populated object (e.g. { _id, name }), extract .name
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
        const obj = raw as Record<string, unknown>;
        return obj.name ?? obj.username ?? obj.title ?? obj._id ?? JSON.stringify(raw);
    }
    return raw;
}

// ── Cell renderers ────────────────────────────────────────────────────────────
function CellValue({ col, value }: { col: ColumnDef; value: unknown }) {
    const str = value == null ? "—" : String(value);

    if (col.type === "status") {
        const cfg = STATUS_CONFIG[str] ?? STATUS_CONFIG.pending;
        return (
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
            </span>
        );
    }
    if (col.type === "currency") {
        const num = Number(value);
        return <span className="font-medium text-foreground">{isNaN(num) ? str : num.toLocaleString("th-TH") + " ฿"}</span>;
    }
    if (col.type === "date") {
        try {
            return <span className="text-muted-foreground">{new Date(str).toLocaleDateString("th-TH")}</span>;
        } catch { return <span>{str}</span>; }
    }
    if (col.type === "badge") {
        return <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-[11px] font-mono">{str}</span>;
    }
    if (col.type === "number") {
        return <span className="font-medium tabular-nums">{str}</span>;
    }
    return <span className="text-sm text-foreground/90 block truncate" title={str}>{str}</span>;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface RecordListProps {
    label?:         string;
    dataSource?:    string;    // API endpoint e.g. "/orders", "/requests" or "static"
    columnsJson?:   string;    // JSON string of ColumnDef[]
    idField?:       string;    // which field is the unique ID (for clickable rows)
    navigateTo?:    string;    // navigate to this path on row click, appended with /{id}
    maxRows?:       number;    // max visible rows
    showSearch?:    boolean;
    showHeader?:    boolean;
    selectable?:             boolean;   // when true, clicking a row sets selectedRecord in context instead of navigating
    filterByCurrentStation?: boolean;   // only show orders where stations[currentStationIndex] === current stationId
    showQrColumn?:           boolean;   // show QR code popup button per row (uses row.code or row._id)
    showWorkOrderColumn?:    boolean;   // show ใบงาน link button per row → /production/{_id}/print
    /** @deprecated use showAllRequests to opt-out */
    hideProcessedRequests?:  boolean;
    showAllRequests?:        boolean;   // opt-out: when true, show all requests including processed ones
    /** When true (orders only): eagerly fetch panes and hide orders with 0 pending panes at this station */
    pendingPanesOnly?:       boolean;
}

// ── WebSocket room mapping ────────────────────────────────────────────────────
const DATASOURCE_WS: Record<string, { room: string; events: string[] }> = {
    "/orders":           { room: "order",      events: ["order:updated"]                              },
    "/requests":         { room: "request",    events: ["request:updated"]                            },
    "/panes":            { room: "pane",       events: ["pane:updated"]                               },
    "/claims":           { room: "claim",      events: ["claim:updated"]                              },
    "/withdrawals":      { room: "withdrawal", events: ["withdrawal:updated"]                         },
    "/inventories":      { room: "inventory",  events: ["inventory:updated", "material:updated"]      },
    "/material-logs":    { room: "log",        events: ["log:updated"]                                },
    "/stations":         { room: "station",    events: ["station:updated", "station-template:updated"] },
    "/station-templates":{ room: "station",    events: ["station:updated", "station-template:updated"] },
};

// ── Component ─────────────────────────────────────────────────────────────────
// friendly label map for design mode badge
const SOURCE_LABEL: Record<string, string> = {
    "/orders":            "รายการออเดอร์/คำสั่งผลิต",
    "/requests":          "รายการคำขอ (บิล)",
    "/materials":         "รายการวัสดุ",
    "/workers":           "รายการพนักงาน",
    "/customers":         "รายการลูกค้า",
    "/inventories":       "คลังสินค้า",
    "/panes":             "รายการกระจกแต่ละชิ้น (Pane)",
    "/claims":            "รายการเคลม",
    "/withdrawals":       "รายการเบิกวัสดุ",
    "/material-logs":     "ประวัติการใช้วัสดุ",
    "/notifications":     "การแจ้งเตือน",
    "/stations":          "รายการสถานี",
    "/station-templates": "แม่แบบสถานี",
};

// ── Inline QR popup ───────────────────────────────────────────────────────────
function QrPopup({ code, orderId, onClose }: { code: string; orderId: string; onClose: () => void }) {
    const qrValue = typeof window !== "undefined"
        ? `${window.location.origin}/production/${orderId}`
        : `/production/${orderId}`;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
            <div className="bg-white rounded-2xl border shadow-2xl p-5 flex flex-col items-center gap-3 w-56" onClick={(e) => e.stopPropagation()}>
                <p className="font-mono font-black text-lg tracking-widest text-black">#{code}</p>
                <div className="p-3 bg-white border rounded-xl">
                    <QRCodeSVG value={qrValue} size={160} bgColor="#ffffff" fgColor="#000000" level="H" marginSize={2} />
                </div>
                <p className="text-[10px] text-gray-400 font-mono break-all text-center">{qrValue}</p>
                <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground px-4 py-1.5 rounded-lg border hover:bg-muted/30 w-full">ปิด</button>
            </div>
        </div>
    );
}

export function RecordList({
    label        = "รายการข้อมูล",
    dataSource   = "static",
    columnsJson  = STATIC_DEFAULT_COLUMNS_STR,
    idField      = "_id",
    navigateTo   = "",
    maxRows      = 5,
    showSearch   = false,
    showHeader   = true,
    selectable              = false,
    filterByCurrentStation  = false,
    showQrColumn            = false,
    showWorkOrderColumn     = false,
    showAllRequests         = false,
    pendingPanesOnly        = false,
}: RecordListProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const router    = useRouter();
    const [qrRow, setQrRow] = useState<{ code: string; orderId: string } | null>(null);
    const [qrPane, setQrPane] = useState<Pane | null>(null);
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const [rowPanes, setRowPanes] = useState<Pane[]>([]);
    const [rowPanesLoading, setRowPanesLoading] = useState(false);
    const [showAllPanes, setShowAllPanes] = useState(false);
    const { selectedRecord, setSelectedRecord, stationId, stationName, refreshCounter } = useStationContext();
    const isApi     = dataSource && dataSource !== "static";
    // PropertiesPanel stores "production" (no slash) — normalise to "/production"
    const navPath   = navigateTo ? (navigateTo.startsWith("/") ? navigateTo : `/${navigateTo}`) : "";

    const columns: ColumnDef[] = (() => {
        try { return JSON.parse(columnsJson); } catch { return EMPTY_COLUMNS; }
    })();

    // ── Preview: fetch & search ───────────────────────────────────────────────
    const [rows,     setRows]     = useState<Record<string, unknown>[]>([]);
    const [fetching, setFetching] = useState(false);
    const [error,    setError]    = useState("");
    /** orderId → count of pending panes at this station. Used when pendingPanesOnly=true */
    const [pendingCountByOrder, setPendingCountByOrder] = useState<Record<string, number>>({});
    const [query,    setQuery]    = useState("");

    // Auto-filter: when fetching /orders or /panes inside a station context, pass stationId server-side
    const shouldFilterStation = (filterByCurrentStation || (dataSource === "/orders" && !!stationId) || (dataSource === "/panes" && !!stationId)) && !!stationId;

    // Auto pending-only: hide orders/panes that have already been scanned in at this station.
    // Active whenever this RecordList is showing station-filtered orders (shouldFilterStation covers
    // both explicit filterByCurrentStation=true AND auto-detection via stationId in context).
    const effectivePendingOnly = pendingPanesOnly || (dataSource === "/orders" && shouldFilterStation);

    const loadData = () => {
        if (!isApi) { setRows(SAMPLE_ROWS); return; }
        setFetching(true); setError("");
        const url = (shouldFilterStation && dataSource === "/orders")
            ? `/orders?stationId=${encodeURIComponent(stationId!)}`
            : dataSource;

        // Auto-filter processed requests unless user explicitly opts out
        const shouldHideProcessed = dataSource === "/requests" && !showAllRequests;

        const fetchMain = fetchApi<{ success: boolean; data: Record<string, unknown>[] }>(url);
        const fetchOrders = shouldHideProcessed
            ? fetchApi<{ success: boolean; data: Record<string, unknown>[] }>("/orders")
            : Promise.resolve(null);

        Promise.all([fetchMain, fetchOrders])
            .then(([mainRes, ordersRes]) => {
                if (!mainRes.success) { setError("โหลดข้อมูลไม่สำเร็จ"); return; }
                let data = mainRes.data ?? [];
                if (shouldHideProcessed && ordersRes?.success) {
                    // Build set of request IDs that already have an order
                    const processedRequestIds = new Set<string>(
                        (ordersRes.data ?? []).map((o) => {
                            const req = o.request;
                            if (!req) return null;
                            return typeof req === "string" ? req : (req as Record<string, unknown>)._id as string;
                        }).filter(Boolean) as string[]
                    );
                    data = data.filter((r) => !processedRequestIds.has(r._id as string));
                }
                setRows(data);
            })
            .catch(() => setError("ยังไม่มีข้อมูลจาก API — ลองใช้งานจริงเพื่อดูข้อมูล"))
            .finally(() => setFetching(false));
    };

    /** Fetch all panes at this station and count how many are still pending per order.
     *  Only called when pendingPanesOnly=true on an orders datasource. */
    const loadPendingPaneCounts = () => {
        if (!effectivePendingOnly || dataSource !== "/orders" || (!stationId && !stationName)) return;
        panesApi.getAll({ limit: 500 }).then(res => {
            if (!res.success || !Array.isArray(res.data)) return;
            const counts: Record<string, number> = {};
            for (const pane of res.data) {
                const cs = typeof pane.currentStation === "object"
                    ? (pane.currentStation as { _id?: string })?._id
                    : pane.currentStation as string;
                const atStation = cs === stationId || cs === stationName;
                if (!atStation || pane.currentStatus !== "pending") continue;
                const orderId = pane.order
                    ? (typeof pane.order === "string" ? pane.order : (pane.order as { _id?: string })._id ?? "")
                    : "";
                if (!orderId) continue;
                counts[orderId] = (counts[orderId] ?? 0) + 1;
            }
            setPendingCountByOrder(counts);
        }).catch(() => {});
    };

    useEffect(() => {
        loadData();
        loadPendingPaneCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPreview, dataSource, isApi, shouldFilterStation, stationId, refreshCounter, showAllRequests, effectivePendingOnly, stationName]);

    // Real-time updates via WebSocket
    const wsConfig = DATASOURCE_WS[dataSource] ?? { room: "_noop", events: [] };
    useWebSocket(wsConfig.room, wsConfig.events, () => {
        if (isApi) loadData();
    });

    useWebSocket("pane", ["pane:updated"], () => {
        setQrPane(null);
        if (isApi) loadData();
        loadPendingPaneCounts();
        if (!expandedRowId) return;
        const fetchFn = dataSource === "/orders"
            ? panesApi.getAll({ order: expandedRowId, limit: 100 })
            : panesApi.getAll({ request: expandedRowId, limit: 100 });
        fetchFn
            .then(res => setRowPanes(res.success ? res.data ?? [] : []))
            .catch(() => {});
    });

    // Refresh rowPanes when triggerRefresh() is called (e.g. after scan in StationQueueBlock)
    // WebSocket handles real-time for other users; this handles the local user immediately.
    useEffect(() => {
        if (!expandedRowId || !isApi) return;
        if (dataSource !== "/orders" && dataSource !== "/requests") return;
        const fetchFn = dataSource === "/orders"
            ? panesApi.getAll({ order: expandedRowId, limit: 100 })
            : panesApi.getAll({ request: expandedRowId, limit: 100 });
        fetchFn
            .then(res => { if (res.success) setRowPanes(res.data ?? []); })
            .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshCounter, expandedRowId]);

    const filtered = rows
        .filter((r) => {
            if (shouldFilterStation && dataSource === "/orders") {
                const stations = r.stations;
                if (!Array.isArray(stations)) return false;
                const hasStation = stations.some((s) => {
                    const sid = typeof s === "object" && s !== null
                        ? (s as Record<string, unknown>)._id
                        : s;
                    return String(sid) === stationId;
                });
                if (!hasStation) return false;
            }
            if (shouldFilterStation && dataSource === "/panes") {
                const paneStation = r.currentStation;
                if (paneStation && String(paneStation) !== stationId) return false;
            }
            // Hide orders that have no pending panes left at this station
            if (effectivePendingOnly && dataSource === "/orders") {
                const orderId = String(r._id ?? "");
                if (!orderId || (pendingCountByOrder[orderId] ?? 0) === 0) return false;
            }
            if (!query) return true;
            return columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(query.toLowerCase()));
        })
        .slice(0, maxRows);

    const canShowPanes = dataSource === "/orders" || dataSource === "/requests";

    const toggleRowPanes = async (row: Record<string, unknown>) => {
        const rid = String(row._id ?? row[idField] ?? "");
        if (expandedRowId === rid) {
            setExpandedRowId(null);
            setRowPanes([]);
            setShowAllPanes(false);
            return;
        }
        setExpandedRowId(rid);
        setRowPanes([]);
        setRowPanesLoading(true);
        setShowAllPanes(false);
        try {
            if (dataSource === "/orders") {
                const res = await panesApi.getAll({ order: rid, limit: 100 });
                setRowPanes(res.success ? res.data ?? [] : []);
            } else {
                const res = await panesApi.getAll({ request: rid, limit: 100 });
                setRowPanes(res.success ? res.data ?? [] : []);
            }
        } catch {
            setRowPanes([]);
        } finally {
            setRowPanesLoading(false);
        }
    };

    // ── Preview render ────────────────────────────────────────────────────────
    if (isPreview) {
        return (
            <>
            <div className="w-full rounded-xl border bg-card overflow-hidden">
                {/* Header */}
                {showHeader && (
                    <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
                        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                        {fetching
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            : <span className="text-[10px] text-muted-foreground">{filtered.length} รายการ</span>
                        }
                    </div>
                )}
                {/* Search */}
                {showSearch && (
                    <div className="px-4 py-2 border-b">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="ค้นหา..."
                            className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </div>
                )}
                {/* Error — soft warning, not scary red */}
                {error && (
                    <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200/50">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
                    </div>
                )}
                {columns.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">เลือกคอลัมน์ที่ต้องการแสดง</div>
                ) : (
                    <>
                        {/* Column headers */}
                        <div className="overflow-x-auto">
                        <div className="flex items-center gap-4 px-3 sm:px-4 py-2 bg-muted/20 border-b text-[10px] font-semibold text-muted-foreground uppercase tracking-wider min-w-[400px]">
                            {columns.map((c, ci) => (
                                <span key={`phdr-${ci}`} className={WIDTH_MAP[c.width ?? "auto"]}>{c.label}</span>
                            ))}
                            {(showQrColumn || showWorkOrderColumn) && <span className="w-auto shrink-0">จัดการ</span>}
                            {navPath && <span className="w-4" />}
                        </div>
                        {/* Rows */}
                        {fetching ? (
                            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm">กำลังโหลด...</span>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">ไม่มีข้อมูล</div>
                        ) : (
                            <div className="divide-y">
                                {filtered.map((row, i) => {
                                    const rowId = String(row[idField] ?? i);
                                    const isSelected = selectable && selectedRecord && String(selectedRecord[idField] ?? "") === rowId;
                                    const clickable  = selectable || !!navPath;
                                    const rowCls = `flex items-center gap-4 px-3 sm:px-4 py-3 transition-colors min-w-[400px] ${
                                        isSelected
                                            ? "bg-primary/10 border-l-2 border-primary"
                                            : clickable
                                                ? "hover:bg-muted/30 cursor-pointer group"
                                                : ""
                                    }`;

                                    const handleClick = selectable
                                        ? () => setSelectedRecord(isSelected ? null : row)
                                        : undefined;

                                    const rowObjId = String(row._id ?? row[idField] ?? i);
                                    const rowCode  = String(row.code ?? rowObjId.slice(-6).toUpperCase());

                                    const inner = (
                                        <>
                                            {columns.map((c, ci) => (
                                                <span key={`pcell-${i}-${ci}`} className={`${WIDTH_MAP[c.width ?? "auto"]} min-w-0`}>
                                                    <CellValue col={c} value={resolveValue(row, c.key)} />
                                                </span>
                                            ))}
                                            {/* QR + ใบงาน action buttons */}
                                            {(showQrColumn || showWorkOrderColumn) && (
                                                <div className="flex items-center gap-1 ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
                                                    {showQrColumn && (
                                                        <button
                                                            type="button"
                                                            title={`QR #${rowCode}`}
                                                            onClick={() => setQrRow({ code: rowCode, orderId: rowObjId })}
                                                            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                                        >
                                                            <QrCodeIcon className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                    {showWorkOrderColumn && (
                                                        <button
                                                            type="button"
                                                            title="ดูใบงาน"
                                                            onClick={() => router.push(`/production/${rowObjId}/print`)}
                                                            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                                        >
                                                            <FileText className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            {navPath && !selectable && (
                                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />
                                            )}
                                            {isSelected && (
                                                <span className="ml-auto shrink-0 text-[10px] font-medium text-primary">เลือกแล้ว</span>
                                            )}
                                        </>
                                    );

                                    const isExpanded = expandedRowId === rowObjId;
                                    const PANE_PEEK = 3;
                                    const stationPanes = rowPanes.filter(p => {
                                        const cs = typeof p.currentStation === "object"
                                            ? (p.currentStation as { _id?: string })?._id
                                            : p.currentStation as string;
                                        const atStation = cs === stationId || cs === stationName;
                                        if (!atStation) return false;
                                        if (effectivePendingOnly) return p.currentStatus === "pending";
                                        return true;
                                    });
                                    const visiblePanes = showAllPanes ? stationPanes : stationPanes.slice(0, PANE_PEEK);

                                    const handleRowClick = () => {
                                        if (selectable) setSelectedRecord(isSelected ? null : row);
                                        if (canShowPanes) toggleRowPanes(row);
                                    };

                                    const rowEl = navPath && !selectable && !canShowPanes
                                        ? <a key={`row-${rowId}`} href={`${navPath}/${rowId}`} className={rowCls}>{inner}</a>
                                        : <div key={`row-${rowId}`} className={`${rowCls} ${canShowPanes ? "hover:bg-muted/30 cursor-pointer" : ""}`} onClick={handleRowClick}>{inner}</div>;

                                    return (
                                        <div key={rowId}>
                                            {rowEl}
                                            {isExpanded && canShowPanes && (
                                                <div className="px-6 py-2 bg-muted/10 border-b space-y-1.5">
                                                    {rowPanesLoading ? (
                                                        <div className="flex items-center gap-2 py-2 text-muted-foreground">
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                            <span className="text-[11px]">กำลังโหลดกระจก...</span>
                                                        </div>
                                                    ) : stationPanes.length === 0 ? (
                                                        <p className="text-[11px] text-muted-foreground py-1">ไม่มีกระจกที่สถานีนี้</p>
                                                    ) : (
                                                        <>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <Package className="h-3 w-3 text-primary" />
                                                                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">กระจกแต่ละชิ้น</span>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const rid = expandedRowId;
                                                                        if (!rid) return;
                                                                        const param = dataSource === "/requests"
                                                                            ? `request=${rid}`
                                                                            : `ids=${stationPanes.map(p => p._id).join(",")}`;
                                                                        window.open(`/panes/print?${param}`, "_blank");
                                                                    }}
                                                                    title="พิมพ์ QR สติกเกอร์"
                                                                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted ml-auto"
                                                                >
                                                                    <Printer className="h-3 w-3" />
                                                                    พิมพ์ QR
                                                                </button>
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    {stationPanes.filter(p => p.currentStatus === "completed").length}/{stationPanes.length} ชิ้น
                                                                </span>
                                                            </div>
                                                            {visiblePanes.map(pane => {
                                                                const st = PANE_STATUS_CFG[pane.currentStatus] ?? { label: pane.currentStatus, dot: "bg-gray-400", text: "text-gray-500" };
                                                                return (
                                                                    <button
                                                                        key={pane._id}
                                                                        type="button"
                                                                        onClick={() => setQrPane(pane)}
                                                                        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background border border-border/50 hover:bg-muted/60 hover:border-primary/30 transition-colors cursor-pointer text-left"
                                                                    >
                                                                        <QrCodeIcon className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                                                                        <span className="font-mono text-[11px] font-bold shrink-0">{pane.paneNumber}</span>
                                                                        <span className={`flex items-center gap-1 text-[10px] font-medium ${st.text}`}>
                                                                            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                                                                            {st.label}
                                                                        </span>
                                                                        {pane.dimensions && (pane.dimensions.width > 0 || pane.dimensions.height > 0) && (
                                                                            <span className="text-[10px] text-muted-foreground">
                                                                                {pane.dimensions.width}×{pane.dimensions.height}
                                                                                {pane.dimensions.thickness > 0 && ` (${pane.dimensions.thickness}mm)`}
                                                                            </span>
                                                                        )}
                                                                        <span className="ml-auto text-[10px] text-muted-foreground">{pane.currentStation}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                            {stationPanes.length > PANE_PEEK && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setShowAllPanes(v => !v)}
                                                                    className="w-full flex items-center justify-center gap-1 py-1 rounded-lg text-[11px] font-medium text-primary hover:bg-primary/5 transition-colors"
                                                                >
                                                                    {showAllPanes
                                                                        ? <><ChevronDown className="h-3 w-3" /> แสดงน้อยลง</>
                                                                        : <><ChevronRight className="h-3 w-3" /> แสดงทั้งหมด ({stationPanes.length} ชิ้น)</>
                                                                    }
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        </div>
                    </>
                )}
            </div>
            {/* QR popup (order-level) */}
            {qrRow && <QrPopup code={qrRow.code} orderId={qrRow.orderId} onClose={() => setQrRow(null)} />}
            {/* QR modal (pane-level) */}
            {qrPane && (
                <QrCodeModal
                    code={qrPane.paneNumber}
                    label={[
                        qrPane.glassTypeLabel,
                        qrPane.dimensions ? `${qrPane.dimensions.width}×${qrPane.dimensions.height}${qrPane.dimensions.thickness ? ` (${qrPane.dimensions.thickness}mm)` : ""}` : "",
                    ].filter(Boolean).join(" — ")}
                    value={qrPane.qrCode || `STDPLUS:${qrPane.paneNumber}`}
                    onClose={() => setQrPane(null)}
                />
            )}
            </>
        );
    }

    // ── Design mode render ────────────────────────────────────────────────────
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-xl border-2 cursor-grab transition-all overflow-hidden
                ${selected ? "border-primary ring-2 ring-primary/20" : "border-slate-200 dark:border-slate-700 hover:border-primary/30"}`}
        >
            {/* Header */}
            {showHeader && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
                    <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-foreground/70">{label}</p>
                        {isApi && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-[10px] font-medium">
                                <Database className="h-2.5 w-2.5" />{SOURCE_LABEL[dataSource] ?? dataSource}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        {fetching
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            : <span className="text-[10px] text-muted-foreground">{isApi && filtered.length > 0 ? `${filtered.length} รายการ` : `max ${maxRows} แถว`}</span>
                        }
                    </div>
                </div>
            )}
            {/* Search */}
            {showSearch && (
                <div className="px-4 py-2 border-b">
                    <input
                        placeholder="ค้นหา..."
                        className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm pointer-events-none"
                        readOnly
                    />
                </div>
            )}

            {columns.length === 0 ? (
                <div className="px-4 py-6 text-center">
                    <p className="text-sm text-muted-foreground/50">เลือกคอลัมน์ที่ต้องการแสดงจาก Properties</p>
                </div>
            ) : (
                <>
                    {/* Column headers */}
                    <div className="flex items-center gap-3 px-4 py-1.5 bg-muted/10 border-b text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {columns.map((c, ci) => (
                            <span key={`hdr-${ci}`} className={`${WIDTH_MAP[c.width ?? "auto"]} flex items-center gap-1`}>
                                <Hash className="h-2 w-2 opacity-40" />{c.label}
                                <span className="opacity-30 font-normal normal-case">({c.type ?? "text"})</span>
                            </span>
                        ))}
                    </div>

                    {/* Data rows (live or sample fallback) */}
                    {fetching ? (
                        <div className="flex items-center justify-center py-6 text-muted-foreground gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-[10px]">กำลังโหลด...</span>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {(isApi && filtered.length > 0 ? filtered : SAMPLE_ROWS.slice(0, Math.min(3, maxRows))).map((row, i) => (
                                <div key={i} className="flex items-center gap-3 px-4 py-2">
                                    {columns.map((c, ci) => (
                                        <span key={`cell-${i}-${ci}`} className={`${WIDTH_MAP[c.width ?? "auto"]} min-w-0`}>
                                            <CellValue col={c} value={resolveValue(row as Record<string, unknown>, c.key)} />
                                        </span>
                                    ))}
                                    {navPath && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />}
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="px-4 py-1.5 text-[10px] text-muted-foreground/40 italic border-t">
                        {isApi
                            ? `ดึงข้อมูลจริงจาก ${SOURCE_LABEL[dataSource] ?? dataSource}${dataSource === "/orders" ? " · กรองเฉพาะงานสถานีนี้อัตโนมัติ" : ""}`
                            : "ตัวอย่างข้อมูล — เลือกแหล่งข้อมูลเพื่อใช้ข้อมูลจริง"}
                    </div>
                </>
            )}
        </div>
    );
}

RecordList.craft = {
    displayName: "Record List",
    props: {
        label:       "รายการข้อมูล",
        dataSource:  "static",
        columnsJson: STATIC_DEFAULT_COLUMNS_STR,
        idField:     "_id",
        navigateTo:  "",
        maxRows:     5,
        showSearch:  false,
        showHeader:  true,
        selectable:              false,
        filterByCurrentStation:  false,
        showAllRequests:         false,
        showQrColumn:            false,
        showWorkOrderColumn:     false,
        pendingPanesOnly:        false,
    } as RecordListProps,
};
