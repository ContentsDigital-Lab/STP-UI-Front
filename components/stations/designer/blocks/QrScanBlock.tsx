"use client";

import { useNode } from "@craftjs/core";
import { useRef, useState, KeyboardEvent } from "react";
import {
    ScanLine, Camera, CheckCircle2, XCircle, Loader2, Hash,
    RotateCcw, User, Package, ClipboardList, AlertCircle,
} from "lucide-react";
import { fetchApi } from "@/lib/api/config";
import { parseQrScan } from "@/lib/utils/parseQrScan";
import { usePreview } from "../PreviewContext";
import { useStationContext } from "../StationContext";
import { CameraScanModal } from "./CameraScanModal";

/** Context type determined from the datasource */
const CONTEXT_SOURCE: Record<string, "request" | "order"> = {
    "/requests": "request",
    "/orders":   "order",
};

const STATUS_MAP: Record<string, { label: string; bg: string; text: string; dot: string }> = {
    pending:     { label: "รอดำเนินการ", bg: "bg-amber-50 dark:bg-amber-900/30",   text: "text-amber-700 dark:text-amber-300",   dot: "bg-amber-500" },
    in_progress: { label: "กำลังผลิต",   bg: "bg-blue-50 dark:bg-blue-900/30",     text: "text-blue-700 dark:text-blue-300",     dot: "bg-blue-500"  },
    completed:   { label: "เสร็จแล้ว",   bg: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
    cancelled:   { label: "ยกเลิก",      bg: "bg-red-50 dark:bg-red-900/30",       text: "text-red-700 dark:text-red-300",       dot: "bg-red-500"   },
};

interface QrScanBlockProps {
    label?:           string;
    placeholder?:     string;
    /** API endpoint to look up — "/orders" or "/requests" */
    dataSource?:      string;
    /** Auto-PATCH after scan — "none" or "patch" */
    autoAction?:      "none" | "patch";
    /** JSON string for PATCH body, e.g. '{"status":"in_progress"}' */
    autoActionBody?:  string;
    /** Feedback message shown on successful scan */
    successMessage?:  string;
    /** Show camera button */
    enableCamera?:    boolean;
}

type ScanStatus = "idle" | "loading" | "success" | "error";

/** Resolve a dotted key against a record, returning a display string */
function resolveField(record: Record<string, unknown>, key: string): string {
    const val = key.split(".").reduce<unknown>(
        (cur, part) => (cur != null && typeof cur === "object" ? (cur as Record<string, unknown>)[part] : undefined),
        record,
    );
    if (val == null) return "—";
    if (typeof val === "object" && !Array.isArray(val)) {
        const o = val as Record<string, unknown>;
        return String(o.name ?? o.username ?? o.title ?? o._id ?? "—");
    }
    return String(val);
}

export function QrScanBlock({
    label           = "สแกน QR ออเดอร์",
    placeholder     = "วาง QR หรือพิมพ์รหัส แล้วกด Enter...",
    dataSource      = "/orders",
    autoAction      = "none",
    autoActionBody  = "",
    successMessage  = "โหลดข้อมูลสำเร็จ!",
    enableCamera    = true,
}: QrScanBlockProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const { setOrderData, setRequestData, triggerRefresh } = useStationContext();
    const contextType = CONTEXT_SOURCE[dataSource] ?? "order";

    const inputRef = useRef<HTMLInputElement>(null);
    const [scanStatus,     setScanStatus]     = useState<ScanStatus>("idle");
    const [message,        setMessage]        = useState("");
    const [showCamera,     setShowCamera]     = useState(false);
    const [scannedRecord,  setScannedRecord]  = useState<Record<string, unknown> | null>(null);
    const [actionLoading,  setActionLoading]  = useState(false);
    const [actionResult,   setActionResult]   = useState<"success" | "error" | null>(null);

    // ── Core scan handler (shared by keyboard + camera) ───────────────────────
    async function handleScan(raw: string) {
        const trimmed = raw.trim();
        if (!trimmed) return;

        const parsed = parseQrScan(trimmed);
        setScanStatus("loading");
        setMessage("");
        setScannedRecord(null);
        setActionResult(null);

        try {
            let endpoint: string;

            if (parsed.type === "id") {
                endpoint = `${dataSource}/${parsed.value}`;
            } else {
                endpoint = `${dataSource}?code=${encodeURIComponent(parsed.value)}&limit=1`;
            }

            const res = await fetchApi<{ success: boolean; data: Record<string, unknown> | Record<string, unknown>[] }>(endpoint);

            if (!res.success) throw new Error("ไม่พบข้อมูล");

            const record = Array.isArray(res.data) ? res.data[0] : res.data;
            if (!record) throw new Error("ไม่พบรายการที่ตรงกัน");

            // Populate context + local state
            if (contextType === "order")   setOrderData(record);
            if (contextType === "request") setRequestData(record);
            triggerRefresh();
            setScannedRecord(record);

            // Auto-action: PATCH with configured body
            if (autoAction === "patch" && record._id) {
                let body: Record<string, unknown> = {};
                try { body = JSON.parse(autoActionBody || "{}"); } catch { /* invalid JSON — skip */ }
                await fetchApi(`${dataSource}/${record._id as string}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                }).catch(() => { /* non-critical */ });
            }

            setScanStatus("success");
            setMessage(successMessage);
            if (inputRef.current) inputRef.current.value = "";
            // Reset only the scan status badge after 3s — keep scannedRecord
            setTimeout(() => { setScanStatus("idle"); setMessage(""); }, 3000);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
            setScanStatus("error");
            setMessage(msg);
            setTimeout(() => { setScanStatus("idle"); setMessage(""); }, 3000);
        }
    }

    // ── Manual PATCH action from detail panel button ───────────────────────────
    async function handleManualAction(body: Record<string, unknown>) {
        if (!scannedRecord?._id) return;
        setActionLoading(true);
        setActionResult(null);
        try {
            const res = await fetchApi<{ success: boolean }>(`${dataSource}/${scannedRecord._id as string}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.success) throw new Error("อัปเดตไม่สำเร็จ");
            // Refresh record
            const refreshed = await fetchApi<{ success: boolean; data: Record<string, unknown> }>(`${dataSource}/${scannedRecord._id as string}`);
            if (refreshed.success && refreshed.data) {
                setScannedRecord(refreshed.data);
                if (contextType === "order")   setOrderData(refreshed.data);
                if (contextType === "request") setRequestData(refreshed.data);
                triggerRefresh();
            }
            setActionResult("success");
        } catch {
            setActionResult("error");
        } finally {
            setActionLoading(false);
            setTimeout(() => setActionResult(null), 3000);
        }
    }

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") {
            e.preventDefault();
            handleScan(inputRef.current?.value ?? "");
        }
    }

    function handleCameraScan(raw: string) {
        setShowCamera(false);
        handleScan(raw);
    }

    function clearRecord() {
        setScannedRecord(null);
        setScanStatus("idle");
        setMessage("");
        setActionResult(null);
        if (contextType === "order")   setOrderData(null);
        if (contextType === "request") setRequestData(null);
        setTimeout(() => inputRef.current?.focus(), 50);
    }

    // ── Preview render ────────────────────────────────────────────────────────
    if (isPreview) {
        const statusRaw = scannedRecord?.status as string | undefined;
        const statusCfg = statusRaw ? (STATUS_MAP[statusRaw] ?? null) : null;

        // Order fields to display
        const orderFields =
            contextType === "order"
                ? [
                      { icon: <ClipboardList className="h-3.5 w-3.5" />, label: "รหัสออเดอร์", value: resolveField(scannedRecord ?? {}, "code") },
                      { icon: <User className="h-3.5 w-3.5" />,          label: "ลูกค้า",       value: resolveField(scannedRecord ?? {}, "customer") },
                      { icon: <Package className="h-3.5 w-3.5" />,       label: "วัสดุ",        value: resolveField(scannedRecord ?? {}, "material") },
                      { icon: null,                                        label: "จำนวน",        value: resolveField(scannedRecord ?? {}, "quantity") },
                      { icon: <User className="h-3.5 w-3.5" />,          label: "ผู้รับผิดชอบ", value: resolveField(scannedRecord ?? {}, "assignedTo") },
                  ]
                : [
                      { icon: <ClipboardList className="h-3.5 w-3.5" />, label: "ประเภทงาน",  value: resolveField(scannedRecord ?? {}, "details.type") },
                      { icon: <User className="h-3.5 w-3.5" />,          label: "ลูกค้า",      value: resolveField(scannedRecord ?? {}, "customer") },
                      { icon: null,                                        label: "จำนวน",       value: resolveField(scannedRecord ?? {}, "details.quantity") },
                      { icon: null,                                        label: "ราคาประมาณ",  value: resolveField(scannedRecord ?? {}, "details.estimatedPrice") },
                      { icon: null,                                        label: "สถานที่ส่ง",  value: resolveField(scannedRecord ?? {}, "deliveryLocation") },
                  ];

        return (
            <div className="w-full space-y-3">
                {label && (
                    <label className="block text-xs font-semibold text-foreground/70">{label}</label>
                )}

                {/* ── Scan input (hidden when record is loaded) ── */}
                {!scannedRecord && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    placeholder={placeholder}
                                    onKeyDown={handleKeyDown}
                                    disabled={scanStatus === "loading"}
                                    autoComplete="off"
                                    className="w-full rounded-lg border bg-background pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
                                />
                                {scanStatus === "loading" && (
                                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
                                )}
                            </div>
                            {enableCamera && (
                                <button
                                    onClick={() => setShowCamera(true)}
                                    disabled={scanStatus === "loading"}
                                    title="สแกนด้วยกล้อง"
                                    className="shrink-0 rounded-lg border border-input bg-background px-3 py-2.5 hover:bg-muted transition-colors disabled:opacity-60"
                                >
                                    <Camera className="h-4 w-4 text-muted-foreground" />
                                </button>
                            )}
                        </div>

                        {scanStatus === "success" && (
                            <div className="flex items-center gap-1.5 text-emerald-600 text-xs">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                <span>{message}</span>
                            </div>
                        )}
                        {scanStatus === "error" && (
                            <div className="flex items-center gap-1.5 text-red-500 text-xs">
                                <XCircle className="h-3.5 w-3.5 shrink-0" />
                                <span>{message}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Inline detail panel ── */}
                {scannedRecord && (
                    <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800/50">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">สแกนสำเร็จ</span>
                                {statusCfg && (
                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot} animate-pulse`} />
                                        {statusCfg.label}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={clearRecord}
                                title="สแกนใหม่"
                                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                                สแกนใหม่
                            </button>
                        </div>

                        {/* Fields grid */}
                        <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3">
                            {orderFields.map((f, i) => {
                                if (f.value === "—") return null;
                                return (
                                    <div key={i} className="min-w-0">
                                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 flex items-center gap-1">
                                            {f.icon}
                                            {f.label}
                                        </p>
                                        <p className="text-sm font-medium text-foreground truncate">{f.value}</p>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Scan-in button (shown when autoAction is "none" so worker confirms manually) */}
                        {autoAction === "none" && scannedRecord.status === "pending" && (
                            <div className="px-4 pb-4 pt-1">
                                <button
                                    onClick={() => handleManualAction({ status: "in_progress" })}
                                    disabled={actionLoading}
                                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
                                >
                                    {actionLoading
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <CheckCircle2 className="h-4 w-4" />
                                    }
                                    สแกนเข้าสถานี
                                </button>
                            </div>
                        )}
                        {autoAction === "none" && scannedRecord.status === "in_progress" && (
                            <div className="px-4 pb-4 pt-1">
                                <button
                                    onClick={() => handleManualAction({ status: "completed" })}
                                    disabled={actionLoading}
                                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-60"
                                >
                                    {actionLoading
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <CheckCircle2 className="h-4 w-4" />
                                    }
                                    สแกนออก / เสร็จสิ้น
                                </button>
                            </div>
                        )}

                        {/* Action result feedback */}
                        {actionResult === "success" && (
                            <div className="px-4 pb-4 flex items-center gap-1.5 text-emerald-600 text-xs">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                อัปเดตสำเร็จ
                            </div>
                        )}
                        {actionResult === "error" && (
                            <div className="px-4 pb-4 flex items-center gap-1.5 text-red-500 text-xs">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                อัปเดตไม่สำเร็จ
                            </div>
                        )}
                    </div>
                )}

                {/* Camera modal */}
                {showCamera && (
                    <CameraScanModal
                        onScan={handleCameraScan}
                        onClose={() => setShowCamera(false)}
                    />
                )}
            </div>
        );
    }

    // ── Design mode render ────────────────────────────────────────────────────
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full cursor-grab transition-all rounded-xl p-1 ${selected ? "ring-2 ring-primary/30" : "hover:ring-1 hover:ring-primary/20"}`}
        >
            {/* Badge row */}
            <div className="flex flex-wrap items-center gap-1 mb-1">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-[10px] font-medium">
                    <ScanLine className="h-2.5 w-2.5" />
                    QR Scan
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-mono">
                    <Hash className="h-2.5 w-2.5" />{dataSource}
                </span>
                {autoAction === "patch" && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] font-medium">
                        auto-patch
                    </span>
                )}
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium">
                    inline detail
                </span>
            </div>

            <label className="block text-xs font-semibold text-foreground/70">{label}</label>

            {/* Fake input preview */}
            <div className="flex items-center gap-2 pointer-events-none">
                <div className="flex-1 rounded-lg border border-muted bg-background px-3 py-2.5 text-sm text-muted-foreground/40 flex items-center gap-2">
                    <ScanLine className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{placeholder}</span>
                </div>
                {enableCamera && (
                    <div className="shrink-0 rounded-lg border border-muted bg-background px-3 py-2.5">
                        <Camera className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                )}
            </div>

            {/* Detail panel preview skeleton */}
            <div className="rounded-lg border border-muted bg-muted/20 p-3 space-y-2 opacity-50 pointer-events-none">
                <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <div className="h-3 w-24 rounded bg-muted" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="space-y-1">
                            <div className="h-2 w-12 rounded bg-muted" />
                            <div className="h-3 w-20 rounded bg-muted/80" />
                        </div>
                    ))}
                </div>
            </div>

            <p className="text-[10px] text-violet-500 dark:text-violet-400">
                📷 รองรับกล้อง + เครื่องสแกน · แสดงรายละเอียดหลังสแกน
            </p>
        </div>
    );
}

QrScanBlock.craft = {
    displayName: "QR Scan",
    props: {
        label:          "สแกน QR ออเดอร์",
        placeholder:    "วาง QR หรือพิมพ์รหัส แล้วกด Enter...",
        dataSource:     "/orders",
        autoAction:     "none",
        autoActionBody: "",
        successMessage: "โหลดข้อมูลสำเร็จ!",
        enableCamera:   true,
    } as QrScanBlockProps,
};
