"use client";

import { useNode } from "@craftjs/core";
import { useEffect, useState } from "react";
import { Database, Loader2, AlertCircle, Package, ChevronDown, ChevronRight, Printer, QrCode } from "lucide-react";
import { QrCodeModal } from "@/components/qr/QrCodeModal";
import { fetchApi } from "@/lib/api/config";
import { panesApi } from "@/lib/api/panes";
import { Pane } from "@/lib/api/types";
import { usePreview } from "../PreviewContext";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { useStationContext } from "../StationContext";
import { getStationName, isStationMatch } from "@/lib/utils/station-helpers";
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

// ── Pane list for record detail ───────────────────────────────────────────────
const PANE_PREVIEW_COUNT = 3;
const PANE_STATUS: Record<string, { label: string; dot: string; text: string }> = {
    pending:            { label: "รอ",          dot: "bg-amber-400", text: "text-amber-600" },
    in_progress:        { label: "กำลังทำ",     dot: "bg-blue-500",  text: "text-blue-600" },
    completed:          { label: "เสร็จ",       dot: "bg-green-500", text: "text-green-600" },
    awaiting_scan_out:  { label: "รอสแกนออก",  dot: "bg-amber-500", text: "text-amber-600" },
};

function PaneListSection({ record, endpoint, showPaneQr: showPaneQrProp = true }: { record: Record<string, unknown> | null; endpoint: string; showPaneQr?: boolean }) {
    const [panes, setPanes] = useState<Pane[]>([]);
    const [loading, setLoading] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [qrPane, setQrPane] = useState<Pane | null>(null);
    const { stationId, stationName, isOrderReleaseStation } = useStationContext();

    const showPaneQr = showPaneQrProp && !isOrderReleaseStation;

    const recordLooksLikeOrder = !!record && ("stations" in record || "currentStationIndex" in record || "code" in record);
    const isOrderEndpoint = endpoint === "/orders" || endpoint.startsWith("/orders/") || (endpoint === "context" && recordLooksLikeOrder);
    const isRequestEndpoint = (endpoint === "/requests" || endpoint.startsWith("/requests/") || (endpoint === "context" && !recordLooksLikeOrder)) && !isOrderEndpoint;

    const fetchPanes = async (recordId: string): Promise<{ success: boolean; data: Pane[] }> => {
        if (isOrderEndpoint) {
            return panesApi.getAll({ order: recordId, limit: 100 });
        }
        if (isRequestEndpoint) {
            return panesApi.getAll({ request: recordId, limit: 100 });
        }
        return { success: true, data: [] };
    };

    useEffect(() => {
        if (!record) { setPanes([]); return; }
        const id = record._id as string | undefined;
        if (!id) { setPanes([]); return; }
        setLoading(true);
        setShowAll(false);
        fetchPanes(id)
            .then(res => setPanes(res.success ? res.data ?? [] : []))
            .catch(() => setPanes([]))
            .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [record, endpoint, isRequestEndpoint, isOrderEndpoint]);

    useWebSocket("pane", ["pane:updated"], () => {
        if (!record?._id) return;
        fetchPanes(record._id as string)
            .then(res => setPanes(res.success ? res.data ?? [] : []))
            .catch(() => {});
    });

    if (!isRequestEndpoint && !isOrderEndpoint) return null;
    if (loading) return (
        <div className="px-5 py-3 border-t flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">กำลังโหลดกระจก...</span>
        </div>
    );

    const stationPanes = (stationId || stationName)
        ? panes.filter(p => isStationMatch(p.currentStation, stationId, stationName))
        : panes;

    if (stationPanes.length === 0) return null;

    const visible = showAll ? stationPanes : stationPanes.slice(0, PANE_PREVIEW_COUNT);
    const hasMore = stationPanes.length > PANE_PREVIEW_COUNT;
    const done = stationPanes.filter(p => p.currentStatus === "completed").length;

    return (
        <div className="border-t">
            <div className="px-5 py-2.5 flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-2">
                    <Package className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold">กระจกแต่ละชิ้น</span>
                    <span className="text-[10px] text-muted-foreground">{stationPanes.length} ชิ้น</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            const id = record?._id as string | undefined;
                            if (!id) return;
                            const param = isRequestEndpoint ? `request=${id}` : `ids=${stationPanes.map(p => p._id).join(",")}`;
                            window.open(`/panes/print?${param}`, "_blank");
                        }}
                        title="พิมพ์ QR สติกเกอร์"
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
                    >
                        <Printer className="h-3 w-3" />
                        พิมพ์ QR
                    </button>
                    <span className="text-[10px] text-muted-foreground">
                        {done}/{stationPanes.length} ชิ้น
                    </span>
                </div>
            </div>
            <div className="px-5 py-2 space-y-1.5">
                {visible.map(pane => {
                    const st = PANE_STATUS[pane.currentStatus] ?? { label: pane.currentStatus, dot: "bg-gray-400", text: "text-gray-500" };
                    return showPaneQr ? (
                        <button
                            key={pane._id}
                            type="button"
                            onClick={() => setQrPane(pane)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/60 hover:border-primary/30 transition-colors cursor-pointer text-left"
                        >
                            <QrCode className="h-3 w-3 text-muted-foreground/50 shrink-0" />
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
                            <span className="ml-auto text-[10px] text-muted-foreground">{getStationName(pane.currentStation)}</span>
                        </button>
                    ) : (
                        <div
                            key={pane._id}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50 text-left"
                        >
                            <Package className="h-3 w-3 text-muted-foreground/50 shrink-0" />
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
                            <span className="ml-auto text-[10px] text-muted-foreground">{getStationName(pane.currentStation)}</span>
                        </div>
                    );
                })}
                {hasMore && (
                    <button
                        type="button"
                        onClick={() => setShowAll(v => !v)}
                        className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium text-primary hover:bg-primary/5 transition-colors"
                    >
                        {showAll ? (
                            <><ChevronDown className="h-3 w-3" /> แสดงน้อยลง</>
                        ) : (
                            <><ChevronRight className="h-3 w-3" /> แสดงทั้งหมด ({stationPanes.length} ชิ้น)</>
                        )}
                    </button>
                )}
            </div>
            {showPaneQr && qrPane && (
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
        </div>
    );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface RecordDetailProps {
    title?:      string;
    endpoint?:   string;
    idParam?:    string;
    fieldsJson?: string;
    showPaneQr?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function RecordDetail({
    title      = "รายละเอียด",
    endpoint   = "/requests",
    idParam    = "id",
    fieldsJson = DEFAULT_FIELDS_STR,
    showPaneQr = true,
}: RecordDetailProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const { orderData, requestData, paneData, selectedRecord } = useStationContext();

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
        (endpoint === "/panes"    || endpoint.startsWith("/panes/"))         ? paneData       :
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
        loadData();
    }, [isPreview, endpoint, idParam, contextRecord]);

    // Real-time updates via WebSocket
    const wsConfig = ENDPOINT_WS[endpoint] ?? { room: "_noop", events: [] };
    useWebSocket(wsConfig.room, wsConfig.events, () => {
        loadData();
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
                {contextRecord && <PaneListSection record={contextRecord} endpoint={endpoint} showPaneQr={showPaneQr} />}
            </div>
        );
    }

    // ── Design mode render ────────────────────────────────────────────────────
    const designData = record ?? SAMPLE_DATA;
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-xl border-2 cursor-grab transition-all overflow-hidden
                ${selected ? "border-primary ring-2 ring-primary/20" : "border-slate-200 dark:border-slate-700 hover:border-primary/30"}`}
        >
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
                <p className="text-xs font-semibold text-foreground/70">{title}</p>
                <div className="flex items-center gap-1.5">
                    {fetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-[10px]">
                        <Database className="h-2.5 w-2.5" />
                        {endpoint === "context" ? "จากรายการที่เลือก" : `${endpoint}/{${idParam}}`}
                    </span>
                </div>
            </div>
            <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3">
                {fields.map((f, i) => (
                    <div key={i} className={f.span === 2 ? "col-span-2" : "col-span-1"}>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{f.label}</p>
                        <FieldValue field={f} value={resolveValue(designData, f.key)} />
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
        showPaneQr: true,
    } as RecordDetailProps,
};
