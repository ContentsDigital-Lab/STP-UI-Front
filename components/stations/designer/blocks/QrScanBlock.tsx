"use client";

import { useNode } from "@craftjs/core";
import { useRef, useState, KeyboardEvent } from "react";
import { ScanLine, Camera, CheckCircle2, XCircle, Loader2, Hash } from "lucide-react";
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
    const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
    const [message,    setMessage]    = useState("");
    const [showCamera, setShowCamera] = useState(false);

    // ── Core scan handler (shared by keyboard + camera) ───────────────────────
    async function handleScan(raw: string) {
        const trimmed = raw.trim();
        if (!trimmed) return;

        const parsed = parseQrScan(trimmed);
        setScanStatus("loading");
        setMessage("");

        try {
            let endpoint: string;

            if (parsed.type === "id") {
                // Direct ID lookup
                endpoint = `${dataSource}/${parsed.value}`;
            } else {
                // Code-based: try searching via query param (?code=) or (?search=)
                endpoint = `${dataSource}?code=${encodeURIComponent(parsed.value)}&limit=1`;
            }

            const res = await fetchApi<{ success: boolean; data: Record<string, unknown> | Record<string, unknown>[] }>(endpoint);

            if (!res.success) throw new Error("ไม่พบข้อมูล");

            // data can be a single object (GET /{id}) or array (GET ?code=...)
            const record = Array.isArray(res.data) ? res.data[0] : res.data;
            if (!record) throw new Error("ไม่พบรายการที่ตรงกัน");

            // Populate context
            if (contextType === "order")   setOrderData(record);
            if (contextType === "request") setRequestData(record);
            triggerRefresh();

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
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
            setScanStatus("error");
            setMessage(msg);
        } finally {
            // Auto-reset status after 2.5s
            setTimeout(() => { setScanStatus("idle"); setMessage(""); }, 2500);
        }
    }

    // ── Keyboard: Enter key submits ───────────────────────────────────────────
    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") {
            e.preventDefault();
            handleScan(inputRef.current?.value ?? "");
        }
    }

    // ── Camera scan callback ──────────────────────────────────────────────────
    function handleCameraScan(raw: string) {
        setShowCamera(false);
        handleScan(raw);
    }

    // ── Preview render ────────────────────────────────────────────────────────
    if (isPreview) {
        return (
            <div className="w-full space-y-2">
                {label && (
                    <label className="block text-xs font-semibold text-foreground/70">{label}</label>
                )}

                {/* Input row */}
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

                    {/* Camera button */}
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

                {/* Feedback */}
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
            className={`w-full rounded-xl border-2 p-3 space-y-1.5 cursor-grab transition-all ${
                selected
                    ? "border-primary bg-primary/5"
                    : "border-slate-200 dark:border-slate-700 hover:border-primary/30 bg-card"
            }`}
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

            <p className="text-[10px] text-violet-500 dark:text-violet-400">
                📷 รองรับกล้อง + เครื่องสแกน (Barcode Gun)
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
