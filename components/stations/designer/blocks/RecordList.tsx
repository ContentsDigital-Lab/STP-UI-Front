"use client";

import { useNode } from "@craftjs/core";
import { useEffect, useState } from "react";
import { Database, ChevronRight, Loader2, AlertCircle, Hash, ExternalLink } from "lucide-react";
import { fetchApi } from "@/lib/api/config";
import { usePreview } from "../PreviewContext";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { STATUS_CONFIG } from "./StatusIndicator";

// ── Column definition ─────────────────────────────────────────────────────────
// Stored as JSON string in props so Craft.js can serialize it
export interface ColumnDef {
    key:    string;   // field name from API response
    label:  string;   // Thai header label
    type?:  "text" | "number" | "status" | "date" | "badge" | "currency";
    width?: "auto" | "sm" | "md" | "lg";
}

const DEFAULT_COLUMNS: ColumnDef[] = [
    { key: "name",   label: "ชื่อรายการ",  type: "text",   width: "lg" },
    { key: "status", label: "สถานะ",       type: "status", width: "md" },
    { key: "amount", label: "จำนวน",       type: "number", width: "sm" },
];

const DEFAULT_COLUMNS_STR = JSON.stringify(DEFAULT_COLUMNS);

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
}

// ── WebSocket room mapping ────────────────────────────────────────────────────
const DATASOURCE_WS: Record<string, { room: string; events: string[] }> = {
    "/orders":           { room: "order",      events: ["order:updated"]                              },
    "/requests":         { room: "request",    events: ["request:updated"]                            },
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
    "/claims":            "รายการเคลม",
    "/withdrawals":       "รายการเบิกวัสดุ",
    "/material-logs":     "ประวัติการใช้วัสดุ",
    "/notifications":     "การแจ้งเตือน",
    "/stations":          "รายการสถานี",
    "/station-templates": "แม่แบบสถานี",
};

export function RecordList({
    label        = "รายการข้อมูล",
    dataSource   = "static",
    columnsJson  = DEFAULT_COLUMNS_STR,
    idField      = "_id",
    navigateTo   = "",
    maxRows      = 5,
    showSearch   = false,
    showHeader   = true,
}: RecordListProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const isApi     = dataSource && dataSource !== "static";
    // PropertiesPanel stores "production" (no slash) — normalise to "/production"
    const navPath   = navigateTo ? (navigateTo.startsWith("/") ? navigateTo : `/${navigateTo}`) : "";

    const columns: ColumnDef[] = (() => {
        try { return JSON.parse(columnsJson); } catch { return DEFAULT_COLUMNS; }
    })();

    // ── Preview: fetch & search ───────────────────────────────────────────────
    const [rows,     setRows]     = useState<Record<string, unknown>[]>([]);
    const [fetching, setFetching] = useState(false);
    const [error,    setError]    = useState("");
    const [query,    setQuery]    = useState("");

    const loadData = () => {
        if (!isApi) { setRows(SAMPLE_ROWS); return; }
        setFetching(true); setError("");
        fetchApi<{ success: boolean; data: Record<string, unknown>[] }>(dataSource)
            .then((res) => { if (res.success) setRows(res.data ?? []); else setError("โหลดข้อมูลไม่สำเร็จ"); })
            .catch(() => setError("ยังไม่มีข้อมูลจาก API — ลองใช้งานจริงเพื่อดูข้อมูล"))
            .finally(() => setFetching(false));
    };

    useEffect(() => {
        if (!isPreview) return;
        loadData();
    }, [isPreview, dataSource, isApi]);

    // Real-time updates via WebSocket
    const wsConfig = DATASOURCE_WS[dataSource] ?? { room: "_noop", events: [] };
    useWebSocket(wsConfig.room, wsConfig.events, () => {
        if (isPreview && isApi) loadData();
    });

    const filtered = rows
        .filter((r) => {
            if (!query) return true;
            return columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(query.toLowerCase()));
        })
        .slice(0, maxRows);

    // ── Preview render ────────────────────────────────────────────────────────
    if (isPreview) {
        return (
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
                {/* Column headers */}
                <div className="flex items-center gap-4 px-4 py-2 bg-muted/20 border-b text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {columns.map((c, ci) => (
                        <span key={`phdr-${ci}`} className={WIDTH_MAP[c.width ?? "auto"]}>{c.label}</span>
                    ))}
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
                            const Wrapper = navPath
                                ? ({ children }: { children: React.ReactNode }) => (
                                    <a href={`${navPath}/${rowId}`} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer group">
                                        {children}
                                    </a>
                                )
                                : ({ children }: { children: React.ReactNode }) => (
                                    <div className="flex items-center gap-4 px-4 py-3">{children}</div>
                                );
                            return (
                                <Wrapper key={rowId}>
                                    {columns.map((c, ci) => (
                                        <span key={`pcell-${i}-${ci}`} className={`${WIDTH_MAP[c.width ?? "auto"]} min-w-0`}>
                                            <CellValue col={c} value={resolveValue(row, c.key)} />
                                        </span>
                                    ))}
                                    {navPath && (
                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />
                                    )}
                                </Wrapper>
                            );
                        })}
                    </div>
                )}
            </div>
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
                    {navPath && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[10px]">
                            <ExternalLink className="h-2.5 w-2.5" />{navPath}
                        </span>
                    )}
                    <span className="text-[10px] text-muted-foreground/50">max {maxRows} แถว</span>
                </div>
            </div>

            {/* Column headers */}
            <div className="flex items-center gap-3 px-4 py-1.5 bg-muted/10 border-b text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                {columns.map((c, ci) => (
                    <span key={`hdr-${ci}`} className={`${WIDTH_MAP[c.width ?? "auto"]} flex items-center gap-1`}>
                        <Hash className="h-2 w-2 opacity-40" />{c.label}
                        <span className="opacity-30 font-normal normal-case">({c.type ?? "text"})</span>
                    </span>
                ))}
            </div>

            {/* Sample rows (design time) */}
            <div className="divide-y opacity-60">
                {SAMPLE_ROWS.slice(0, Math.min(3, maxRows)).map((row, i) => (
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
            <div className="px-4 py-1.5 text-[10px] text-muted-foreground/40 italic border-t">
                {isApi ? `ดึงข้อมูลจริงจาก ${SOURCE_LABEL[dataSource] ?? dataSource}` : "ตัวอย่างข้อมูล — เลือกแหล่งข้อมูลเพื่อใช้ข้อมูลจริง"}
            </div>
        </div>
    );
}

RecordList.craft = {
    displayName: "Record List",
    props: {
        label:       "รายการข้อมูล",
        dataSource:  "static",
        columnsJson: DEFAULT_COLUMNS_STR,
        idField:     "_id",
        navigateTo:  "",
        maxRows:     5,
        showSearch:  false,
        showHeader:  true,
    } as RecordListProps,
};
