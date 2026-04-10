"use client";

import { useNode } from "@craftjs/core";
import { useRef, useState, KeyboardEvent } from "react";
import {
    ScanLine, Camera, CheckCircle2, XCircle, Loader2, Hash,
    RotateCcw, User, Package, ClipboardList, AlertCircle,
    ArrowRight, Play, ScanBarcode, AlertTriangle, ShieldCheck
} from "lucide-react";
import { toast } from "sonner";
import { fetchApi } from "@/lib/api/config";
import { panesApi } from "@/lib/api/panes";
import { Pane } from "@/lib/api/types";
import { parseQrScan } from "@/lib/utils/parseQrScan";
import { getStationId, getStationName, isStationMatch } from "@/lib/utils/station-helpers";
import { resolveActivePane } from "@/lib/utils/pane-laminate";
import { withMergedIntoScanRetry } from "@/lib/utils/merged-into-scan";
import { usePreview } from "../PreviewContext";
import { useStationContext } from "../StationContext";
import { CameraScanModal } from "./CameraScanModal";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const CONTEXT_SOURCE: Record<string, "request" | "order" | "pane"> = {
    "/requests": "request",
    "/orders":   "order",
    "/panes":    "pane",
};

const STATUS_MAP: Record<string, { label: string; bg: string; text: string; dot: string }> = {
    pending:            { label: "รอดำเนินการ", bg: "bg-amber-50 dark:bg-amber-900/30",     text: "text-amber-700 dark:text-amber-300",     dot: "bg-amber-500"   },
    in_progress:        { label: "กำลังผลิต",   bg: "bg-blue-50 dark:bg-blue-900/30",       text: "text-blue-700 dark:text-blue-300",       dot: "bg-blue-500"    },
    completed:          { label: "เสร็จแล้ว",   bg: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
    awaiting_scan_out:  { label: "รอสแกนออก",  bg: "bg-amber-50 dark:bg-amber-900/30",     text: "text-amber-700 dark:text-amber-300",     dot: "bg-amber-500"   },
    cancelled:          { label: "ยกเลิก",      bg: "bg-red-50 dark:bg-red-900/30",         text: "text-red-700 dark:text-red-300",         dot: "bg-red-500"     },
    ready:              { label: "พร้อมส่ง",    bg: "bg-violet-50 dark:bg-violet-900/30",   text: "text-violet-700 dark:text-violet-300",   dot: "bg-violet-500"  },
};

const SCAN_ACTION_LABELS: Record<string, { label: string; icon: typeof Play; cls: string }> = {
    scan_in:  { label: "สแกนเข้า",    icon: ScanBarcode,  cls: "bg-blue-600 hover:bg-blue-500 text-white" },
    start:    { label: "เริ่มงาน",     icon: Play,         cls: "bg-amber-600 hover:bg-amber-500 text-white" },
    complete: { label: "เสร็จสิ้น",    icon: CheckCircle2, cls: "bg-emerald-600 hover:bg-emerald-500 text-white" },
};

interface QrScanBlockProps {
    label?:           string;
    placeholder?:     string;
    /** API endpoint — "/orders", "/requests", "/panes", or "/panes/scan" for station scan mode */
    dataSource?:      string;
    /** Auto-PATCH after scan — "none" or "patch" (ignored in scan mode) */
    autoAction?:      "none" | "patch";
    /** JSON string for PATCH body, e.g. '{"status":"in_progress"}' */
    autoActionBody?:  string;
    /** Feedback message shown on successful scan */
    successMessage?:  string;
    /** Show camera button */
    enableCamera?:    boolean;
}

type ScanStatus = "idle" | "loading" | "success" | "error";

function orderIdFromPaneForQueue(pane: Pane): string {
    if (!pane.order) return "__unknown__";
    if (typeof pane.order === "string") return pane.order;
    return (pane.order as { _id?: string })._id ?? "__unknown__";
}

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
    const { stationId, stationName, setOrderData, setRequestData, setPaneData, triggerRefresh, pinQueueOrderToFront } = useStationContext();
    const isScanMode    = dataSource === "/panes/scan";
    const isScanOutMode = dataSource === "/panes/scan-out";
    const contextType   = (isScanMode || isScanOutMode) ? "pane" : (CONTEXT_SOURCE[dataSource] ?? "order");

    const inputRef = useRef<HTMLInputElement>(null);
    const [scanStatus,     setScanStatus]     = useState<ScanStatus>("idle");
    const [message,        setMessage]        = useState("");
    const [showCamera,     setShowCamera]     = useState(false);
    const [scannedRecord,  setScannedRecord]  = useState<Record<string, unknown> | null>(null);
    const [actionLoading,  setActionLoading]  = useState(false);
    const [actionResult,   setActionResult]   = useState<"success" | "error" | null>(null);

    // Scan mode state
    const [scanResult, setScanResult] = useState<{
        pane: Pane;
        log: Record<string, unknown>;
        nextStation?: string;
        message?: string;
    } | null>(null);
    const [lastAction, setLastAction] = useState<string | null>(null);
    const [paneNumber, setPaneNumber] = useState<string | null>(null);

    // Station mismatch confirmation
    const [mismatchInfo, setMismatchInfo] = useState<{
        paneStation: string;
        thisStation: string;
        paneNumber: string;
        action: "scan_in" | "scan_out";
    } | null>(null);

    // ── Pre-check pane's current station before scanning ────────────────────────
    async function checkStationMismatch(pn: string, action: "scan_in" | "scan_out"): Promise<boolean> {
        try {
            const lookupRes = await panesApi.getById(pn);
            if (lookupRes.success && lookupRes.data) {
                const active = resolveActivePane(lookupRes.data);
                const cs = active.currentStation;
                const paneStationStr = getStationName(cs);
                const isHere = !cs || isStationMatch(cs, stationId, stationName);
                if (!isHere) {
                    setMismatchInfo({
                        paneStation: paneStationStr,
                        thisStation: stationName!,
                        paneNumber: pn,
                        action,
                    });
                    setScanStatus("idle");
                    if (inputRef.current) inputRef.current.value = "";
                    return true;
                }
            }
        } catch {
            // lookup failed — proceed with scan anyway
        }
        return false;
    }

    // ── Station scan handler ───────────────────────────────────────────────────
    async function handleStationScan(raw: string) {
        const trimmed = raw.trim();
        if (!trimmed) return;

        const parsed = parseQrScan(trimmed);
        const pn = parsed.type === "pane" ? parsed.value : trimmed.replace(/^STDPLUS:/i, "").trim();

        setScanStatus("loading");
        setMessage("");
        setScanResult(null);
        setScannedRecord(null);
        setLastAction(null);
        setPaneNumber(pn);

        if (!stationId) {
            setScanStatus("error");
            setMessage("ไม่สามารถระบุสถานีได้ — กรุณาเปิดจากหน้าสถานี");
            return;
        }

        if (await checkStationMismatch(pn, "scan_in")) return;

        try {
            const res = await withMergedIntoScanRetry(pn, async (paneNum) => {
                const r = await panesApi.scan(paneNum, { station: stationId, action: "scan_in" });
                if (!r.success) throw new Error(r.message || "สแกนไม่สำเร็จ");
                return r;
            });

            setScanResult(res.data);
            setPaneNumber(res.data.pane.paneNumber);
            pinQueueOrderToFront(orderIdFromPaneForQueue(res.data.pane));
            setPaneData(res.data.pane as unknown as Record<string, unknown>);
            triggerRefresh();
            setLastAction("scan_in");
            setScanStatus("success");
            setMessage("สแกนเข้าสำเร็จ — กดปุ่มด้านล่างเพื่อดำเนินการ");
            if (inputRef.current) inputRef.current.value = "";
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
            setScanStatus("error");
            setMessage(msg);
        }
    }

    async function handleScanAction(action: "scan_in" | "start" | "complete") {
        if (!paneNumber) return;
        setActionLoading(true);
        setActionResult(null);

        const rawStation = scanResult?.pane?.currentStation;
        const station = getStationId(rawStation) || stationId;
        if (!station) {
            setMessage("ไม่สามารถระบุสถานีได้");
            setActionResult("error");
            setActionLoading(false);
            return;
        }

        try {
            const res = await withMergedIntoScanRetry(paneNumber, async (paneNum) => {
                const r = await panesApi.scan(paneNum, { station, action });
                if (!r.success) throw new Error(r.message || "ดำเนินการไม่สำเร็จ");
                return r;
            });

            setScanResult(res.data);
            setPaneNumber(res.data.pane.paneNumber);
            setPaneData(res.data.pane as unknown as Record<string, unknown>);
            triggerRefresh();
            setLastAction(action);
            setActionResult("success");

            if (action === "complete") {
                setMessage(res.data.nextStation
                    ? `เสร็จสิ้น → ส่งต่อไปสถานี ${res.data.nextStation}`
                    : "เสร็จสิ้น — ครบทุกสถานีแล้ว");
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ";
            setMessage(msg);
            setActionResult("error");
        } finally {
            setActionLoading(false);
            setTimeout(() => setActionResult(null), 3000);
        }
    }

    // ── Station scan-out handler ────────────────────────────────────────────────
    async function handleStationScanOut(raw: string) {
        const trimmed = raw.trim();
        if (!trimmed) return;

        const parsed = parseQrScan(trimmed);
        const pn = parsed.type === "pane" ? parsed.value : trimmed.replace(/^STDPLUS:/i, "").trim();

        setScanStatus("loading");
        setMessage("");
        setScanResult(null);
        setScannedRecord(null);
        setLastAction(null);
        setPaneNumber(pn);

        if (!stationId) {
            setScanStatus("error");
            setMessage("ไม่สามารถระบุสถานีได้ — กรุณาเปิดจากหน้าสถานี");
            return;
        }

        if (await checkStationMismatch(pn, "scan_out")) return;

        try {
            const res = await withMergedIntoScanRetry(pn, async (paneNum) => {
                const r = await panesApi.scan(paneNum, { station: stationId, action: "scan_out" });
                if (!r.success) throw new Error(r.message || "สแกนออกไม่สำเร็จ");
                return r;
            });

            setScanResult(res.data);
            setPaneNumber(res.data.pane.paneNumber);
            setPaneData(res.data.pane as unknown as Record<string, unknown>);
            triggerRefresh();
            setLastAction("scan_out");
            setScanStatus("success");
            setMessage(res.data.nextStation
                ? `สแกนออกสำเร็จ → ส่งต่อไปสถานี ${res.data.nextStation}`
                : "สแกนออกสำเร็จ — ครบทุกสถานีแล้ว");
            if (inputRef.current) inputRef.current.value = "";
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
            setScanStatus("error");
            setMessage(msg);
        }
    }

    // ── Force confirm/dismiss for station mismatch ────────────────────────────
    async function handleForceConfirm() {
        if (!mismatchInfo || !stationId) return;
        const { paneNumber: pn, action } = mismatchInfo;
        setMismatchInfo(null);
        setPaneNumber(pn);
        setScanStatus("loading");
        setMessage("");
        setScanResult(null);
        setScannedRecord(null);
        setLastAction(null);

        try {
            const res = await withMergedIntoScanRetry(pn, async (paneNum) => {
                const r = await panesApi.scan(paneNum, {
                    station: stationId!,
                    action,
                    force: true,
                });
                if (!r.success) throw new Error(r.message || "สแกนไม่สำเร็จ");
                return r;
            });

            setScanResult(res.data);
            setPaneNumber(res.data.pane.paneNumber);
            if (action === "scan_in") {
                pinQueueOrderToFront(orderIdFromPaneForQueue(res.data.pane));
            }
            setPaneData(res.data.pane as unknown as Record<string, unknown>);
            triggerRefresh();
            setLastAction(action);
            setScanStatus("success");
            setMessage(
                action === "scan_out"
                    ? (res.data.nextStation
                        ? `สแกนออกสำเร็จ → ส่งต่อไปสถานี ${res.data.nextStation}`
                        : "สแกนออกสำเร็จ — ครบทุกสถานีแล้ว")
                    : "สแกนเข้าสำเร็จ — กดปุ่มด้านล่างเพื่อดำเนินการ",
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
            setScanStatus("error");
            setMessage(msg);
        }
    }

    function handleForceDismiss() {
        setMismatchInfo(null);
        setScanStatus("idle");
        setMessage("");
        setTimeout(() => inputRef.current?.focus(), 50);
    }

    // ── Standard lookup handler (unchanged) ────────────────────────────────────
    async function handleScan(raw: string) {
        if (isScanOutMode) { handleStationScanOut(raw); return; }
        if (isScanMode) { handleStationScan(raw); return; }

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
            } else if (parsed.type === "pane" || dataSource === "/panes") {
                endpoint = `/panes?paneNumber=${encodeURIComponent(parsed.type === "pane" ? parsed.value : parsed.value)}&limit=1`;
            } else {
                endpoint = `${dataSource}?code=${encodeURIComponent(parsed.value)}&limit=1`;
            }

            const res = await fetchApi<{ success: boolean; data: Record<string, unknown> | Record<string, unknown>[] }>(endpoint);

            if (!res.success) throw new Error("ไม่พบข้อมูล");

            const record = Array.isArray(res.data) ? res.data[0] : res.data;
            if (!record) throw new Error("ไม่พบรายการที่ตรงกัน");

            // Smart Mapping: Determine record type and update context properly
            const isPane    = !!record.paneNumber;
            const isOrder   = !!record.orderNumber || (!!record.code && !isPane);
            const isRequest = !!record.requestNumber;

            if (isPane) {
                // Early Validation (Gatekeeper): Don't load panes that are already finished
                const terminalStatuses = ["ready", "completed", "cancelled", "claimed"];
                if (terminalStatuses.includes(String(record.currentStatus))) {
                    setScanStatus("error");
                    setMessage("กระจกแผ่นนี้ถูกตรวจสอบเสร็จสิ้นแล้ว");
                    toast.error(`กระจก ${record.paneNumber} ถูกตรวจสอบเสร็จสิ้นแล้ว`, {
                        description: `สถานะปัจจุบัน: ${String(record.currentStatus).toUpperCase()}`,
                        duration: 5000
                    });
                    return;
                }

                setPaneData(record);
                toast.success(`เปลี่ยนเป็นกระจก: ${record.paneNumber || record.pane_number || record.code || '—'}`, {
                    icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />,
                    duration: 2000
                });
                // Also set order/request if populated in the pane object
                if (record.order && typeof record.order === "object") setOrderData(record.order as Record<string, unknown>);
                if (record.request && typeof record.request === "object") setRequestData(record.request as Record<string, unknown>);
            } else if (isOrder) {
                setOrderData(record);
                setPaneData(null); // Clear selected pane to show order overview
                toast.info(`โหลดข้อมูลออเดอร์: ${record.code || record.orderNumber || '—'}`, { duration: 2000 });
            } else if (isRequest) {
                setRequestData(record);
                setPaneData(null);
                toast.info(`โหลดข้อมูลบิล: ${record.requestNumber || record.code || '—'}`, { duration: 2000 });
            } else {
                // Fallback to dataSource configuration if type is ambiguous
                if (contextType === "order")   setOrderData(record);
                if (contextType === "request") setRequestData(record);
                if (contextType === "pane")    setPaneData(record);
            }

            triggerRefresh();
            setScannedRecord(record);

            if (autoAction === "patch" && record._id) {
                let body: Record<string, unknown> = {};
                try { body = JSON.parse(autoActionBody || "{}"); } catch { /* invalid JSON */ }
                await fetchApi(`${dataSource}/${record._id as string}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                }).catch(() => {});
            }

            setScanStatus("success");
            setMessage(successMessage);
            if (inputRef.current) inputRef.current.value = "";
            setTimeout(() => { setScanStatus("idle"); setMessage(""); }, 3000);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
            setScanStatus("error");
            setMessage(msg);
            setTimeout(() => { setScanStatus("idle"); setMessage(""); }, 3000);
        }
    }

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
            const refreshed = await fetchApi<{ success: boolean; data: Record<string, unknown> }>(`${dataSource}/${scannedRecord._id as string}`);
            if (refreshed.success && refreshed.data) {
                setScannedRecord(refreshed.data);
                if (contextType === "order")   setOrderData(refreshed.data);
                if (contextType === "request") setRequestData(refreshed.data);
                if (contextType === "pane")    setPaneData(refreshed.data);
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
        setScanResult(null);
        setPaneNumber(null);
        setLastAction(null);
        setScanStatus("idle");
        setMessage("");
        setActionResult(null);
        if (contextType === "order")   setOrderData(null);
        if (contextType === "request") setRequestData(null);
        if (contextType === "pane")    setPaneData(null);
        setTimeout(() => inputRef.current?.focus(), 50);
    }

    // ── Preview render ────────────────────────────────────────────────────────
    if (isPreview) {
        // ── SCAN-OUT MODE UI ──
        if (isScanOutMode) {
            const pane = scanResult?.pane;
            const statusCfg = pane?.currentStatus ? (STATUS_MAP[pane.currentStatus] ?? null) : null;

            return (
                <div className="w-full space-y-3">
                    {label && <label className="block text-xs font-semibold text-foreground/70">{label}</label>}

                    {!scanResult && (
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
                            {scanStatus === "error" && (
                                <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 p-3 space-y-2">
                                    <div className="flex items-start gap-1.5 text-red-600 dark:text-red-400 text-xs">
                                        <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                        <span className="font-medium whitespace-pre-line">{message}</span>
                                    </div>
                                    <button
                                        onClick={() => { setScanStatus("idle"); setMessage(""); inputRef.current?.focus(); }}
                                        className="text-[11px] text-red-500 hover:text-red-700 underline"
                                    >
                                        ลองใหม่
                                    </button>
                                </div>
                            )}
                            {stationName && (
                                <p className="text-[10px] text-muted-foreground">📍 สถานี: <span className="font-semibold">{stationName}</span></p>
                            )}
                        </div>
                    )}

                    {scanResult && pane && (
                        <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
                            <div className="flex items-center justify-between px-4 py-3 border-b bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/50">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                                        {pane.paneNumber}
                                    </span>
                                    {statusCfg && (
                                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                                            <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
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
                            <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 flex items-center gap-1">
                                        <ClipboardList className="h-3.5 w-3.5" />เลข Pane
                                    </p>
                                    <p className="text-sm font-medium text-foreground">{pane.paneNumber}</p>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 flex items-center gap-1">
                                        <Package className="h-3.5 w-3.5" />ประเภทกระจก
                                    </p>
                                    <p className="text-sm font-medium text-foreground">{pane.glassTypeLabel || "—"}</p>
                                </div>
                                {pane.dimensions && (
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">ขนาด (WxH)</p>
                                        <p className="text-sm font-medium text-foreground">
                                            {pane.dimensions.width}x{pane.dimensions.height}
                                            {pane.dimensions.thickness ? `x${pane.dimensions.thickness}` : ""}
                                        </p>
                                    </div>
                                )}
                            </div>
                            {scanResult.nextStation && (
                                <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
                                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                                    <span>ส่งต่อไปสถานี <span className="font-bold">{scanResult.nextStation}</span></span>
                                </div>
                            )}
                            <div className="px-4 pb-4">
                                <div className="px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 text-center">
                                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-1.5">
                                        <CheckCircle2 className="h-4 w-4" />
                                        {message || "สแกนออกสำเร็จ"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {showCamera && (
                        <CameraScanModal onScan={handleCameraScan} onClose={() => setShowCamera(false)} />
                    )}

                    {mismatchInfo && (
                        <Dialog open onOpenChange={(open) => { if (!open) handleForceDismiss(); }}>
                            <DialogContent showCloseButton={false} className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                                        <AlertTriangle className="h-5 w-5" />
                                        สถานีไม่ตรงกัน
                                    </DialogTitle>
                                    <DialogDescription className="pt-2 space-y-2">
                                        <span className="block">
                                            Pane นี้อยู่ที่สถานี <strong className="text-foreground">&ldquo;{mismatchInfo.paneStation}&rdquo;</strong>
                                            {" "}แต่คุณกำลังสแกนที่สถานี <strong className="text-foreground">&ldquo;{mismatchInfo.thisStation}&rdquo;</strong>
                                        </span>
                                        <span className="block text-amber-600 dark:text-amber-400 font-medium">
                                            คุณแน่ใจหรือไม่ว่าต้องการดำเนินการต่อ?
                                        </span>
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <Button variant="outline" onClick={handleForceDismiss}>ยกเลิก</Button>
                                    <Button
                                        onClick={handleForceConfirm}
                                        className="bg-amber-600 hover:bg-amber-500 text-white"
                                    >
                                        ดำเนินการต่อ
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            );
        }

        // ── SCAN MODE UI ──
        if (isScanMode) {
            const pane = scanResult?.pane;
            const statusCfg = pane?.currentStatus ? (STATUS_MAP[pane.currentStatus] ?? null) : null;

            return (
                <div className="w-full space-y-3">
                    {label && <label className="block text-xs font-semibold text-foreground/70">{label}</label>}

                    {/* Input (hidden when pane is scanned) */}
                    {!scanResult && (
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
                            {scanStatus === "error" && (
                                <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 p-3 space-y-2">
                                    <div className="flex items-start gap-1.5 text-red-600 dark:text-red-400 text-xs">
                                        <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                        <span className="font-medium whitespace-pre-line">{message}</span>
                                    </div>
                                    <button
                                        onClick={() => { setScanStatus("idle"); setMessage(""); inputRef.current?.focus(); }}
                                        className="text-[11px] text-red-500 hover:text-red-700 underline"
                                    >
                                        ลองใหม่
                                    </button>
                                </div>
                            )}
                            {stationName && (
                                <p className="text-[10px] text-muted-foreground">📍 สถานี: <span className="font-semibold">{stationName}</span></p>
                            )}
                        </div>
                    )}

                    {/* Scanned pane detail */}
                    {scanResult && pane && (
                        <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
                            {/* Header */}
                            <div className={`flex items-center justify-between px-4 py-3 border-b ${
                                lastAction === "complete"
                                    ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/50"
                                    : "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/50"
                            }`}>
                                <div className="flex items-center gap-2">
                                    <Package className={`h-4 w-4 shrink-0 ${
                                        lastAction === "complete" ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400"
                                    }`} />
                                    <span className={`text-sm font-semibold ${
                                        lastAction === "complete" ? "text-emerald-700 dark:text-emerald-300" : "text-blue-700 dark:text-blue-300"
                                    }`}>
                                        {pane.paneNumber}
                                    </span>
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

                            {/* Pane info */}
                            <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 flex items-center gap-1">
                                        <ClipboardList className="h-3.5 w-3.5" />เลข Pane
                                    </p>
                                    <p className="text-sm font-medium text-foreground">{pane.paneNumber}</p>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5 flex items-center gap-1">
                                        <Package className="h-3.5 w-3.5" />ประเภทกระจก
                                    </p>
                                    <p className="text-sm font-medium text-foreground">{pane.glassTypeLabel || "—"}</p>
                                </div>
                                {pane.dimensions && (
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">ขนาด (WxH)</p>
                                        <p className="text-sm font-medium text-foreground">
                                            {pane.dimensions.width}x{pane.dimensions.height}
                                            {pane.dimensions.thickness ? `x${pane.dimensions.thickness}` : ""}
                                        </p>
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">สถานีปัจจุบัน</p>
                                    <p className="text-sm font-medium text-foreground">{resolveField(pane as unknown as Record<string, unknown>, "currentStation")}</p>
                                </div>
                            </div>

                            {/* Next station info after complete */}
                            {lastAction === "complete" && scanResult.nextStation && (
                                <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
                                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                                    <span>ส่งต่อไปสถานี <span className="font-bold">{scanResult.nextStation}</span></span>
                                </div>
                            )}

                            {/* Action buttons */}
                            {pane.currentStatus !== "completed" && lastAction !== "complete" && (
                                <div className="px-4 pb-4 pt-1 space-y-2">
                                    <button
                                        onClick={() => handleScanAction("complete")}
                                        disabled={actionLoading}
                                        className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold transition-all disabled:opacity-60 bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                                    >
                                        {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                        เสร็จสิ้น → ส่งต่อสถานีถัดไป
                                    </button>
                                    <div className="flex gap-2">
                                        {(["scan_in", "start"] as const).map(action => {
                                            const cfg = SCAN_ACTION_LABELS[action];
                                            const Icon = cfg.icon;
                                            const isActive = lastAction === action;
                                            return (
                                                <button
                                                    key={action}
                                                    onClick={() => handleScanAction(action)}
                                                    disabled={actionLoading}
                                                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all disabled:opacity-60 ${
                                                        isActive ? "ring-2 ring-offset-1 ring-primary" : ""
                                                    } ${cfg.cls}`}
                                                >
                                                    <Icon className="h-3 w-3" />
                                                    {cfg.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Completed state */}
                            {(pane.currentStatus === "completed" || lastAction === "complete") && (
                                <div className="px-4 pb-4">
                                    <div className="px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 text-center">
                                        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-1.5">
                                            <CheckCircle2 className="h-4 w-4" />
                                            {message || "เสร็จสิ้นแล้ว"}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Action feedback */}
                            {actionResult === "success" && lastAction !== "complete" && (
                                <div className="px-4 pb-3 flex items-center gap-1.5 text-emerald-600 text-xs">
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                    ดำเนินการสำเร็จ
                                </div>
                            )}
                            {actionResult === "error" && (
                                <div className="px-4 pb-3 flex items-center gap-1.5 text-red-500 text-xs">
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                    {message || "ดำเนินการไม่สำเร็จ"}
                                </div>
                            )}
                        </div>
                    )}

                    {showCamera && (
                        <CameraScanModal onScan={handleCameraScan} onClose={() => setShowCamera(false)} />
                    )}

                    {mismatchInfo && (
                        <Dialog open onOpenChange={(open) => { if (!open) handleForceDismiss(); }}>
                            <DialogContent showCloseButton={false} className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                                        <AlertTriangle className="h-5 w-5" />
                                        สถานีไม่ตรงกัน
                                    </DialogTitle>
                                    <DialogDescription className="pt-2 space-y-2">
                                        <span className="block">
                                            Pane นี้อยู่ที่สถานี <strong className="text-foreground">&ldquo;{mismatchInfo.paneStation}&rdquo;</strong>
                                            {" "}แต่คุณกำลังสแกนที่สถานี <strong className="text-foreground">&ldquo;{mismatchInfo.thisStation}&rdquo;</strong>
                                        </span>
                                        <span className="block text-amber-600 dark:text-amber-400 font-medium">
                                            คุณแน่ใจหรือไม่ว่าต้องการดำเนินการต่อ?
                                        </span>
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <Button variant="outline" onClick={handleForceDismiss}>ยกเลิก</Button>
                                    <Button
                                        onClick={handleForceConfirm}
                                        className="bg-amber-600 hover:bg-amber-500 text-white"
                                    >
                                        ดำเนินการต่อ
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            );
        }

        // ── STANDARD LOOKUP UI (unchanged) ──
        const statusRaw = (contextType === "pane" ? scannedRecord?.currentStatus : scannedRecord?.status) as string | undefined;
        const statusCfg = statusRaw ? (STATUS_MAP[statusRaw] ?? null) : null;

        const orderFields =
            contextType === "pane"
                ? [
                      { icon: <ClipboardList className="h-3.5 w-3.5" />, label: "เลข Pane",       value: resolveField(scannedRecord ?? {}, "paneNumber") },
                      { icon: <Package className="h-3.5 w-3.5" />,       label: "ประเภทกระจก",    value: resolveField(scannedRecord ?? {}, "glassTypeLabel") },
                      { icon: null,                                        label: "ขนาด (WxH)",     value: (() => { const d = (scannedRecord as Record<string, unknown>)?.dimensions as Record<string, number> | undefined; return d ? `${d.width}x${d.height}${d.thickness ? `x${d.thickness}` : ""}` : "—"; })() },
                      { icon: null,                                        label: "สถานีปัจจุบัน", value: resolveField(scannedRecord ?? {}, "currentStation") },
                  ]
                : contextType === "order"
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

                {scannedRecord && (
                    <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
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

                        {autoAction === "none" && (() => {
                            const st = (contextType === "pane" ? scannedRecord.currentStatus : scannedRecord.status) as string | undefined;
                            const patchField = contextType === "pane" ? "currentStatus" : "status";
                            return (
                                <>
                                    {st === "pending" && (
                                        <div className="px-4 pb-4 pt-1">
                                            <button
                                                onClick={() => handleManualAction({ [patchField]: "in_progress" })}
                                                disabled={actionLoading}
                                                className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
                                            >
                                                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                                สแกนเข้าสถานี
                                            </button>
                                        </div>
                                    )}
                                    {st === "in_progress" && (
                                        <div className="px-4 pb-4 pt-1">
                                            <button
                                                onClick={() => handleManualAction({ [patchField]: "completed" })}
                                                disabled={actionLoading}
                                                className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-60"
                                            >
                                                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                                สแกนออก / เสร็จสิ้น
                                            </button>
                                        </div>
                                    )}
                                </>
                            );
                        })()}

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

                {showCamera && (
                    <CameraScanModal onScan={handleCameraScan} onClose={() => setShowCamera(false)} />
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
            <div className="flex flex-wrap items-center gap-1 mb-1">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-[10px] font-medium">
                    <ScanLine className="h-2.5 w-2.5" />
                    {isScanMode ? "QR Station Scan" : isScanOutMode ? "QR Scan Out" : "QR Scan"}
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-mono">
                    <Hash className="h-2.5 w-2.5" />{dataSource}
                </span>
                {isScanMode && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-medium">
                        scan_in → start → complete
                    </span>
                )}
                {isScanOutMode && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] font-medium">
                        scan_out → ส่งต่อสถานีถัดไป
                    </span>
                )}
                {!isScanMode && autoAction === "patch" && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] font-medium">
                        auto-patch
                    </span>
                )}
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium">
                    inline detail
                </span>
            </div>

            <label className="block text-xs font-semibold text-foreground/70">{label}</label>

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

            {(isScanMode || isScanOutMode) ? (
                <div className="rounded-lg border border-muted bg-muted/20 p-3 space-y-2 opacity-50 pointer-events-none">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <div className="h-3 w-20 rounded bg-muted" />
                        <div className={`h-4 w-14 rounded-full ${isScanOutMode ? "bg-amber-100 dark:bg-amber-900/30" : "bg-blue-100 dark:bg-blue-900/30"}`} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="space-y-1">
                                <div className="h-2 w-12 rounded bg-muted" />
                                <div className="h-3 w-20 rounded bg-muted/80" />
                            </div>
                        ))}
                    </div>
                    {isScanMode && (
                        <div className="flex gap-2 pt-1">
                            <div className="flex-1 h-8 rounded-lg bg-blue-200/50 dark:bg-blue-900/20" />
                            <div className="flex-1 h-8 rounded-lg bg-amber-200/50 dark:bg-amber-900/20" />
                            <div className="flex-1 h-8 rounded-lg bg-emerald-200/50 dark:bg-emerald-900/20" />
                        </div>
                    )}
                    {isScanOutMode && (
                        <div className="pt-1">
                            <div className="h-8 w-full rounded-lg bg-emerald-200/50 dark:bg-emerald-900/20" />
                        </div>
                    )}
                </div>
            ) : (
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
            )}

            <p className="text-[10px] text-violet-500 dark:text-violet-400">
                {isScanOutMode
                    ? "📷 สแกน QR เพื่อส่งกระจกออกจากสถานี · scan_out → สถานีถัดไป"
                    : isScanMode
                        ? "📷 สแกน QR เพื่อบันทึกการทำงาน · scan_in → start → complete"
                        : "📷 รองรับกล้อง + เครื่องสแกน · แสดงรายละเอียดหลังสแกน"}
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
