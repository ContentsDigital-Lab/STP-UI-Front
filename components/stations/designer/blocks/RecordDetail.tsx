"use client";

import { useNode } from "@craftjs/core";
import { useEffect, useState } from "react";
import { Database, Loader2, AlertCircle } from "lucide-react";
import { fetchApi } from "@/lib/api/config";
import { usePreview } from "../PreviewContext";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { useStationContext } from "../StationContext";
import { STATUS_CONFIG } from "./StatusIndicator";

// ── Field display config ──────────────────────────────────────────────────────
export interface DetailField {
    key:    string;
    label:  string;
    type?:  "text" | "status" | "date" | "currency" | "number" | "badge";
    span?:  1 | 2;   // column span (1 = half, 2 = full width)
}

const DEFAULT_FIELDS: DetailField[] = [
    { key: "details.type",           label: "ประเภทงาน",   type: "text",     span: 2 },
    { key: "details.estimatedPrice", label: "ราคาประมาณ",  type: "currency", span: 1 },
    { key: "details.quantity",       label: "จำนวน",       type: "number",   span: 1 },
    { key: "customer",               label: "ลูกค้า",      type: "text",     span: 1 },
    { key: "deadline",               label: "กำหนดส่ง",    type: "date",     span: 1 },
    { key: "deliveryLocation",       label: "สถานที่ส่ง",  type: "text",     span: 2 },
];
const DEFAULT_FIELDS_STR = JSON.stringify(DEFAULT_FIELDS);

// ── Shared field resolution (same as RecordList) ──────────────────────────────
function resolveValue(obj: Record<string, unknown>, key: string): unknown {
    const raw = key.split(".").reduce<unknown>((cur, part) =>
        (cur != null && typeof cur === "object") ? (cur as Record<string, unknown>)[part] : undefined
    , obj);
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
        const o = raw as Record<string, unknown>;
        return o.name ?? o.username ?? o.title ?? o._id ?? "—";
    }
    return raw;
}

function FieldValue({ field, value }: { field: DetailField; value: unknown }) {
    const str = value == null ? "—" : String(value);
    if (field.type === "status") {
        const cfg = STATUS_CONFIG[str] ?? STATUS_CONFIG.pending;
        return (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} animate-pulse`} />
                {cfg.label}
            </span>
        );
    }
    if (field.type === "currency") {
        const n = Number(value);
        return <span className="text-sm font-semibold text-foreground">{isNaN(n) ? str : n.toLocaleString("th-TH") + " ฿"}</span>;
    }
    if (field.type === "date") {
        try { return <span className="text-sm text-foreground">{new Date(str).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}</span>; }
        catch { return <span className="text-sm">{str}</span>; }
    }
    if (field.type === "number") {
        return <span className="text-sm font-medium tabular-nums text-foreground">{str}</span>;
    }
    if (field.type === "badge") {
        return <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-0.5 text-xs font-mono">{str}</span>;
    }
    return <span className="text-sm text-foreground break-words">{str}</span>;
}

// ── Sample data ───────────────────────────────────────────────────────────────
const SAMPLE_DATA: Record<string, unknown> = {
    _id: "req-001",
    details: { type: "Tempered 5mm (800×600mm)", estimatedPrice: 12500, quantity: 4 },
    customer: "บริษัท กระจกสยาม จำกัด",
    deadline: "2026-03-20",
    deliveryLocation: "123 ถ.พระราม 4 กรุงเทพฯ",
    status: "pending",
    assignedTo: "สมชาย ใจดี",
};

// ── WebSocket room mapping ────────────────────────────────────────────────────
const ENDPOINT_WS: Record<string, { room: string; events: string[] }> = {
    "/orders":           { room: "order",      events: ["order:updated"]                              },
    "/requests":         { room: "request",    events: ["request:updated"]                            },
    "/claims":           { room: "claim",      events: ["claim:updated"]                              },
    "/withdrawals":      { room: "withdrawal", events: ["withdrawal:updated"]                         },
    "/inventories":      { room: "inventory",  events: ["inventory:updated", "material:updated"]      },
    "/material-logs":    { room: "log",        events: ["log:updated"]                                },
    "/stations":         { room: "station",    events: ["station:updated", "station-template:updated"] },
    "/station-templates":{ room: "station",    events: ["station:updated", "station-template:updated"] },
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface RecordDetailProps {
    title?:      string;
    endpoint?:   string;  // e.g. "/requests" — ID appended from URL param
    idParam?:    string;  // URL search param name containing the record ID
    fieldsJson?: string;  // JSON string of DetailField[]
}

// ── Component ─────────────────────────────────────────────────────────────────
export function RecordDetail({
    title      = "รายละเอียด",
    endpoint   = "/requests",
    idParam    = "id",
    fieldsJson = DEFAULT_FIELDS_STR,
}: RecordDetailProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const { orderData, requestData, selectedRecord } = useStationContext();

    const fields: DetailField[] = (() => {
        try { return JSON.parse(fieldsJson); } catch { return DEFAULT_FIELDS; }
    })();

    // ── Preview: use context data if available, otherwise fetch ───────────────
    const [fetched,  setFetched]  = useState<Record<string, unknown> | null>(null);
    const [fetching, setFetching] = useState(false);
    const [error,    setError]    = useState("");

    // Context shortcut: no extra API call needed when context already has the data
    const contextRecord =
        endpoint === "context"                                               ? selectedRecord :
        (endpoint === "/requests" || endpoint.startsWith("/requests/"))      ? requestData    :
        (endpoint === "/orders"   || endpoint.startsWith("/orders/"))        ? orderData      :
        null;

    const record = contextRecord ?? fetched;

    const loadData = () => {
        // Skip fetch if context already has the data
        if (contextRecord) return;
        const id = new URLSearchParams(window.location.search).get(idParam)
            ?? window.location.pathname.split("/").filter(Boolean).pop();
        if (!id) { setFetched(SAMPLE_DATA); return; }
        setFetching(true);
        fetchApi<{ success: boolean; data: Record<string, unknown> }>(`${endpoint}/${id}`)
            .then((res) => { if (res.success) setFetched(res.data); else setError("โหลดข้อมูลไม่สำเร็จ"); })
            .catch(() => setFetched(SAMPLE_DATA))
            .finally(() => setFetching(false));
    };

    useEffect(() => {
        if (!isPreview) return;
        loadData();
    }, [isPreview, endpoint, idParam, contextRecord]);

    // Real-time updates via WebSocket
    const wsConfig = ENDPOINT_WS[endpoint] ?? { room: "_noop", events: [] };
    useWebSocket(wsConfig.room, wsConfig.events, () => {
        if (isPreview) loadData();
    });

    // ── Preview render ────────────────────────────────────────────────────────
    if (isPreview) {
        const data = record ?? SAMPLE_DATA;
        return (
            <div className="w-full rounded-xl border bg-card overflow-hidden">
                <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                    {fetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {error && <AlertCircle className="h-4 w-4 text-amber-500" />}
                </div>
                <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-4">
                    {fields.map((f, i) => (
                        <div key={i} className={f.span === 2 ? "col-span-2" : "col-span-1"}>
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{f.label}</p>
                            <FieldValue field={f} value={resolveValue(data, f.key)} />
                        </div>
                    ))}
                </div>
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
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
                <p className="text-xs font-semibold text-foreground/70">{title}</p>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-[10px]">
                    <Database className="h-2.5 w-2.5" />
                    {endpoint === "context" ? "จากรายการที่เลือก" : `${endpoint}/{${idParam}}`}
                </span>
            </div>
            <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3 opacity-60">
                {fields.map((f, i) => (
                    <div key={i} className={f.span === 2 ? "col-span-2" : "col-span-1"}>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{f.label}</p>
                        <div className="h-4 rounded bg-muted/60 w-3/4" />
                    </div>
                ))}
            </div>
        </div>
    );
}

RecordDetail.craft = {
    displayName: "Record Detail",
    props: {
        title:      "รายละเอียด",
        endpoint:   "/requests",
        idParam:    "id",
        fieldsJson: DEFAULT_FIELDS_STR,
    } as RecordDetailProps,
};
