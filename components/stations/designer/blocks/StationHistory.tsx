"use client";

import { useNode } from "@craftjs/core";
import { useState, useEffect, useCallback, useRef, KeyboardEvent } from "react";
import {
    History, Loader2, Package, Clock, ScanBarcode, Camera,
    CheckCircle2, XCircle, ChevronDown, ChevronRight,
    RotateCcw,
} from "lucide-react";
import { fetchApi } from "@/lib/api/config";
import { panesApi } from "@/lib/api/panes";
import { Pane } from "@/lib/api/types";
import { parseQrScan } from "@/lib/utils/parseQrScan";
import { usePreview } from "../PreviewContext";
import { useStationContext } from "../StationContext";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { CameraScanModal } from "./CameraScanModal";
import { QrCodeModal } from "@/components/qr/QrCodeModal";

interface StationHistoryProps {
    title?:   string;
    maxRows?: number;
}

interface ProductionLog {
    _id:         string;
    paneId:      { _id: string; paneNumber: string; glassTypeLabel?: string } | string;
    orderId:     string;
    station:     string;
    action:      string;
    createdAt:   string;
    completedAt?: string;
}

interface CompletedGroup {
    orderId:   string;
    orderCode: string;
    logs:      ProductionLog[];
    latestAt:  string;
}

function extractOrderId(pane: Pane): string {
    if (!pane.order) return "__unknown__";
    if (typeof pane.order === "string") return pane.order;
    return (pane.order as { _id?: string })._id ?? "__unknown__";
}

function extractOrderLabel(pane: Pane): string {
    if (!pane.order) return "ไม่ระบุออเดอร์";
    if (typeof pane.order === "string") return pane.order.slice(-6).toUpperCase();
    const o = pane.order as unknown as Record<string, unknown>;
    return String(o.orderNumber ?? o.code ?? (o._id as string ?? "").slice(-6).toUpperCase());
}

function fmtDate(iso: string) {
    try {
        return new Date(iso).toLocaleDateString("th-TH", {
            day: "2-digit", month: "short", year: "2-digit",
            hour: "2-digit", minute: "2-digit",
        });
    } catch { return iso; }
}

function getPaneNumber(paneId: ProductionLog["paneId"]): string {
    if (!paneId) return "—";
    if (typeof paneId === "string") return paneId.slice(-6).toUpperCase();
    return paneId.paneNumber ?? "—";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StationHistory({
    title   = "ประวัติการผลิต",
    maxRows = 20,
}: StationHistoryProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const { stationId, stationName, refreshCounter, triggerRefresh } = useStationContext();
    const inputRef = useRef<HTMLInputElement>(null);

    // ── Awaiting scan_out (completed panes still at this station) ────────
    const [awaitingPanes,   setAwaitingPanes]   = useState<Pane[]>([]);
    const [awaitingLoading, setAwaitingLoading] = useState(false);
    const [scanError,       setScanError]       = useState<string | null>(null);
    const [actionLoading,   setActionLoading]   = useState<Record<string, boolean>>({});
    const [actionResult,    setActionResult]    = useState<Record<string, "success" | "error">>({});
    const [showCamera,      setShowCamera]      = useState(false);
    const [collapsedOrders, setCollapsedOrders] = useState<Set<string>>(new Set());
    const [qrPane,          setQrPane]          = useState<Pane | null>(null);

    // ── Production log history ──────────────────────────────────────────
    const [groups,   setGroups]   = useState<CompletedGroup[]>([]);
    const [fetching, setFetching] = useState(false);
    const [error,    setError]    = useState("");

    // ── Fetch completed panes awaiting scan_out ─────────────────────────
    const fetchAwaiting = useCallback(async () => {
        if (!stationId && !stationName) return;
        setAwaitingLoading(true);
        try {
            const res = await panesApi.getAll({ limit: 300 });
            if (!res.success || !Array.isArray(res.data)) return;
            const atStation = res.data.filter(p => {
                const cs = typeof p.currentStation === "object"
                    ? (p.currentStation as { _id?: string })?._id
                    : p.currentStation as string;
                return (cs === stationId || cs === stationName) && p.currentStatus === "awaiting_scan_out";
            });
            setAwaitingPanes(atStation);

            // Auto-close QR modal if the displayed pane was scanned out
            setQrPane(prev => {
                if (!prev) return null;
                return atStation.some(p => p._id === prev._id) ? prev : null;
            });
        } finally {
            setAwaitingLoading(false);
        }
    }, [stationId, stationName]);

    // ── Fetch production log history ────────────────────────────────────
    const loadHistory = async () => {
        const station = stationName || stationId;
        if (!station) { setGroups([]); return; }
        setFetching(true); setError("");
        try {
            const [logsRes, ordersRes] = await Promise.all([
                fetchApi<{ success: boolean; data: ProductionLog[] } | ProductionLog[]>(
                    `/production-logs?station=${encodeURIComponent(station)}&limit=300`
                ),
                fetchApi<{ success: boolean; data: Record<string, unknown>[] }>(
                    `/orders?stationId=${encodeURIComponent(stationId ?? "")}`
                ),
            ]);

            const logsArray: ProductionLog[] = Array.isArray(logsRes)
                ? logsRes
                : ((logsRes as { success: boolean; data: ProductionLog[] }).data ?? []);

            const orderMap = new Map<string, string>();
            if (ordersRes?.success) {
                for (const o of ordersRes.data ?? []) {
                    const id   = String(o._id ?? "");
                    const code = String(o.code ?? o.orderNumber ?? id.slice(-6).toUpperCase());
                    if (id) orderMap.set(id, code);
                }
            }

            const completeLogs = logsArray.filter(l => l.action === "complete");

            const groupMap = new Map<string, ProductionLog[]>();
            for (const log of completeLogs) {
                const oid = log.orderId ?? "";
                if (!oid) continue;
                if (!groupMap.has(oid)) groupMap.set(oid, []);
                groupMap.get(oid)!.push(log);
            }

            const sorted: CompletedGroup[] = [...groupMap.entries()]
                .map(([orderId, logs]) => {
                    const ls = [...logs].sort((a, b) =>
                        (b.completedAt ?? b.createdAt) > (a.completedAt ?? a.createdAt) ? 1 : -1
                    );
                    return {
                        orderId,
                        orderCode: orderMap.get(orderId) ?? orderId.slice(-6).toUpperCase(),
                        logs: ls,
                        latestAt: ls[0]?.completedAt ?? ls[0]?.createdAt ?? "",
                    };
                })
                .sort((a, b) => b.latestAt.localeCompare(a.latestAt))
                .slice(0, maxRows);

            setGroups(sorted);
        } catch {
            setError("โหลดประวัติไม่สำเร็จ");
        } finally {
            setFetching(false);
        }
    };

    useEffect(() => {
        fetchAwaiting();
        loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPreview, stationId, stationName, maxRows, refreshCounter]);

    useWebSocket("pane", ["pane:updated"], () => {
        fetchAwaiting();
        loadHistory();
    });

    // ── Group awaiting panes by order ───────────────────────────────────
    const awaitingGroups = (() => {
        const map = new Map<string, { label: string; panes: Pane[] }>();
        for (const p of awaitingPanes) {
            const oid   = extractOrderId(p);
            const label = extractOrderLabel(p);
            if (!map.has(oid)) map.set(oid, { label, panes: [] });
            map.get(oid)!.panes.push(p);
        }
        return [...map.entries()].map(([orderId, v]) => ({ orderId, label: v.label, panes: v.panes }));
    })();

    // ── Scan out via QR input ───────────────────────────────────────────
    async function handleScanOut(raw: string) {
        const trimmed = raw.trim();
        if (!trimmed) return;
        if (inputRef.current) inputRef.current.value = "";

        const parsed = parseQrScan(trimmed);
        const pn = parsed.type === "pane" ? parsed.value : trimmed.replace(/^STDPLUS:/i, "").trim();
        setScanError(null);

        if (!stationName) { setScanError("ไม่ระบุชื่อสถานี"); return; }

        const target = awaitingPanes.find(p => p.paneNumber === pn || p.paneNumber.endsWith(pn));
        if (!target) {
            setScanError(`"${pn}" ไม่อยู่ในรายการรอสแกนออก`);
            return;
        }

        await doScanOut(target);
    }

    // ── Per-pane scan_out action ────────────────────────────────────────
    async function doScanOut(pane: Pane) {
        if (!stationName) { setScanError("ไม่ระบุชื่อสถานี"); return; }
        setActionLoading(prev => ({ ...prev, [pane._id]: true }));
        setActionResult(prev => { const n = { ...prev }; delete n[pane._id]; return n; });
        try {
            const res = await panesApi.scan(pane.paneNumber, { station: stationName, action: "scan_out" });
            if (!res.success) throw new Error(res.message ?? "สแกนออกไม่สำเร็จ");
            setActionResult(prev => ({ ...prev, [pane._id]: "success" }));
            setTimeout(() => {
                setAwaitingPanes(prev => prev.filter(p => p._id !== pane._id));
                setActionResult(prev => { const n = { ...prev }; delete n[pane._id]; return n; });
                triggerRefresh();
                loadHistory();
            }, 1200);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
            setScanError(msg);
            setActionResult(prev => ({ ...prev, [pane._id]: "error" }));
            setTimeout(() => {
                setActionResult(prev => { const n = { ...prev }; delete n[pane._id]; return n; });
            }, 3000);
        } finally {
            setActionLoading(prev => { const n = { ...prev }; delete n[pane._id]; return n; });
        }
    }

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") handleScanOut(e.currentTarget.value);
    }

    // ── Shared scan input + error banner ────────────────────────────────
    const scanInputEl = (
        <>
            <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="relative flex-1 min-w-0">
                    <ScanBarcode className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-muted-foreground/50" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="สแกน QR เพื่อสแกนออก..."
                        onKeyDown={handleKeyDown}
                        autoComplete="off"
                        className="w-full rounded-xl border bg-background pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/40"
                    />
                </div>
                <button
                    onClick={() => setShowCamera(true)}
                    title="สแกนด้วยกล้อง"
                    className="shrink-0 rounded-xl border border-input bg-background px-2.5 sm:px-3 py-2 sm:py-2.5 hover:bg-muted transition-colors"
                >
                    <Camera className="h-4 w-4 text-muted-foreground" />
                </button>
            </div>
            {scanError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 px-3 py-2.5">
                    <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="flex-1 text-xs text-red-600 dark:text-red-400 font-medium whitespace-pre-line">{scanError}</p>
                    <button onClick={() => setScanError(null)} className="text-red-400 hover:text-red-500 shrink-0 transition-colors">
                        <XCircle className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}
        </>
    );

    // ── Preview render ────────────────────────────────────────────────────
    if (isPreview) {
        if (!stationId && !stationName) {
            return (
                <div className="w-full rounded-xl border bg-card px-5 py-8 flex flex-col items-center gap-2 text-center">
                    <History className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">ไม่พบ stationId — เปิดผ่านหน้าสถานี</p>
                </div>
            );
        }

        const totalAwaiting = awaitingPanes.length;
        const totalHistory  = groups.reduce((s, g) => s + g.logs.length, 0);
        const isEmpty       = totalAwaiting === 0 && totalHistory === 0 && !fetching && !awaitingLoading;

        if (isEmpty) {
            return (
                <div className="w-full space-y-3">
                    {scanInputEl}
                    <div className="rounded-xl border bg-card px-5 py-8 flex flex-col items-center gap-2 text-center">
                        <History className="h-8 w-8 text-muted-foreground/20" />
                        <p className="text-sm font-medium text-muted-foreground">ยังไม่มีกระจกที่เสร็จสิ้น</p>
                        <p className="text-xs text-muted-foreground/60">กระจกที่ผ่านสถานีนี้แล้วจะแสดงที่นี่</p>
                    </div>
                    {showCamera && (
                        <CameraScanModal
                            onScan={(raw) => { setShowCamera(false); handleScanOut(raw); }}
                            onClose={() => setShowCamera(false)}
                        />
                    )}
                </div>
            );
        }

        return (
            <div className="w-full space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-sm font-bold text-foreground truncate">{title}</h3>
                        {totalAwaiting > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                {totalAwaiting} รอสแกนออก
                            </span>
                        )}
                    </div>
                    <button
                        onClick={() => { fetchAwaiting(); loadHistory(); }}
                        disabled={fetching || awaitingLoading}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
                        title="รีเฟรช"
                    >
                        <RotateCcw className={`h-3.5 w-3.5 text-muted-foreground ${(fetching || awaitingLoading) ? "animate-spin" : ""}`} />
                    </button>
                </div>

                {/* Scan-out input */}
                {scanInputEl}

                {/* ── Awaiting scan_out section ──────────────────────────── */}
                {awaitingLoading && awaitingPanes.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">กำลังโหลด...</span>
                    </div>
                ) : awaitingGroups.length > 0 ? (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-widest">รอสแกนออก</span>
                            <div className="flex-1 h-px bg-border" />
                        </div>
                        {awaitingGroups.map(({ orderId, label, panes: groupPanes }) => {
                            const isExpanded = !collapsedOrders.has(orderId);
                            return (
                                <div key={orderId} className="rounded-xl border border-amber-200 dark:border-amber-800/50 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setCollapsedOrders(prev => {
                                            const next = new Set(prev);
                                            if (next.has(orderId)) next.delete(orderId);
                                            else next.add(orderId);
                                            return next;
                                        })}
                                        className="w-full flex items-center gap-2 px-3 py-2.5 bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors text-left border-b border-amber-200/50 dark:border-amber-800/30"
                                    >
                                        <Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                        <span className="text-xs font-bold text-foreground flex-1 truncate">ออเดอร์ {label}</span>
                                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium shrink-0">{groupPanes.length} ชิ้น</span>
                                        {isExpanded
                                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        }
                                    </button>
                                    {isExpanded && (
                                        <div className="divide-y divide-amber-100 dark:divide-amber-900/20">
                                            {groupPanes.map(pane => {
                                                const isLoading = actionLoading[pane._id];
                                                const result    = actionResult[pane._id];
                                                return (
                                                    <div
                                                        key={pane._id}
                                                        className="flex items-center gap-3 px-3 py-2.5 bg-card hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors cursor-pointer"
                                                        onClick={() => setQrPane(pane)}
                                                    >
                                                        <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-amber-400" />
                                                        <div className="flex-1 min-w-0 overflow-hidden">
                                                            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                                                                <span className="font-mono text-xs font-bold text-foreground leading-none shrink-0">
                                                                    {pane.paneNumber}
                                                                </span>
                                                                {pane.glassTypeLabel && (
                                                                    <span className="text-[10px] text-muted-foreground truncate">{pane.glassTypeLabel}</span>
                                                                )}
                                                                {pane.dimensions && (pane.dimensions.width > 0 || pane.dimensions.height > 0) && (
                                                                    <span className="text-[10px] text-muted-foreground/60 shrink-0">
                                                                        {pane.dimensions.width}×{pane.dimensions.height}
                                                                        {pane.dimensions.thickness > 0 && ` (${pane.dimensions.thickness}mm)`}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-[10px] font-medium mt-0.5 block text-amber-600 dark:text-amber-400">
                                                                เสร็จแล้ว — รอสแกนออก
                                                            </span>
                                                        </div>
                                                        {result === "success" ? (
                                                            <span className="shrink-0 flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-semibold animate-in fade-in">
                                                                <CheckCircle2 className="h-4 w-4" />
                                                                ส่งแล้ว
                                                            </span>
                                                        ) : result === "error" ? (
                                                            <span className="shrink-0 flex items-center gap-1 text-red-500 text-xs font-medium">
                                                                <XCircle className="h-4 w-4" />
                                                                ผิดพลาด
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : null}

                {/* ── History section (production logs) ───────────────────── */}
                {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/10 px-4 py-3 text-center">
                        <p className="text-xs text-red-500">{error}</p>
                    </div>
                )}

                {groups.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-widest">เสร็จสิ้นแล้ว</span>
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-[10px] text-muted-foreground">
                                {totalHistory} ชิ้น
                            </span>
                        </div>
                        <div className="rounded-xl border bg-card overflow-hidden">
                            <div className="divide-y">
                                {groups.map((group) => (
                                    <div key={group.orderId} className="px-4 py-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xs font-mono font-bold text-foreground">#{group.orderCode}</span>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-medium">
                                                {group.logs.length} ชิ้น
                                            </span>
                                            <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/60">
                                                <Clock className="h-3 w-3" />
                                                {fmtDate(group.latestAt)}
                                            </span>
                                        </div>
                                        <div className="space-y-1">
                                            {group.logs.map(log => (
                                                <div key={log._id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-muted/20">
                                                    <Package className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                                                    <span className="text-xs font-mono text-foreground/80 flex-1">{getPaneNumber(log.paneId)}</span>
                                                    <span className="text-[10px] text-muted-foreground/50">
                                                        {fmtDate(log.completedAt ?? log.createdAt)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* QR code modal */}
                {qrPane && (
                    <QrCodeModal
                        code={qrPane.paneNumber}
                        label={[
                            qrPane.glassTypeLabel,
                            qrPane.dimensions ? `${qrPane.dimensions.width}×${qrPane.dimensions.height}${qrPane.dimensions.thickness > 0 ? ` (${qrPane.dimensions.thickness}mm)` : ""}` : "",
                        ].filter(Boolean).join(" — ")}
                        value={qrPane.qrCode || `STDPLUS:${qrPane.paneNumber}`}
                        onClose={() => setQrPane(null)}
                    />
                )}

                {/* Camera modal */}
                {showCamera && (
                    <CameraScanModal
                        onScan={(raw) => { setShowCamera(false); handleScanOut(raw); }}
                        onClose={() => setShowCamera(false)}
                    />
                )}
            </div>
        );
    }

    // ── Design mode ───────────────────────────────────────────────────────
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-xl border-2 cursor-grab overflow-hidden transition-all
                ${selected ? "border-primary ring-2 ring-primary/20" : "border-slate-200 dark:border-slate-700 hover:border-primary/30"}`}
        >
            <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b">
                <History className="h-3.5 w-3.5 text-muted-foreground/60" />
                <p className="text-xs font-semibold text-foreground/70">{title}</p>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] font-medium">
                    scan_out
                </span>
                {fetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
            </div>

            {/* Scan input preview */}
            <div className="px-3 pt-2 pb-1">
                <div className="flex items-center gap-2 pointer-events-none">
                    <div className="flex-1 rounded-xl border border-muted bg-background px-3 py-2 flex items-center gap-2">
                        <ScanBarcode className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                        <span className="text-[11px] text-muted-foreground/40 truncate">สแกน QR เพื่อสแกนออก...</span>
                    </div>
                    <div className="shrink-0 rounded-xl border border-muted bg-background p-2">
                        <Camera className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                </div>
            </div>

            {/* Skeleton content */}
            <div className="p-3 space-y-2 opacity-50 pointer-events-none">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-amber-600/60 uppercase tracking-widest">รอสแกนออก</span>
                    <div className="flex-1 h-px bg-muted" />
                </div>
                {[{ w: "w-20" }, { w: "w-16" }].map((row, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-muted">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-amber-400" />
                        <div className={`h-3 ${row.w} rounded bg-muted`} />
                        <div className="ml-auto h-6 w-16 rounded-lg bg-amber-100 dark:bg-amber-900/30" />
                    </div>
                ))}
                <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] font-semibold text-green-600/60 uppercase tracking-widest">เสร็จสิ้นแล้ว</span>
                    <div className="flex-1 h-px bg-muted" />
                </div>
                {[1, 2].map((i) => (
                    <div key={i} className="flex flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5">
                        <div className="flex gap-2">
                            <div className="h-3 w-14 rounded bg-muted" />
                            <div className="h-3 w-10 rounded-full bg-green-100 dark:bg-green-900/30" />
                        </div>
                        <div className="h-2.5 w-28 rounded bg-muted/60" />
                    </div>
                ))}
            </div>

            <p className="text-[10px] text-amber-500 dark:text-amber-400 px-3 pb-2">
                🏭 เสร็จงาน → รอสแกนออก → ส่งไปสถานีถัดไป
            </p>
        </div>
    );
}

StationHistory.craft = {
    displayName: "Station History",
    props: { title: "ประวัติการผลิต", maxRows: 20 } as StationHistoryProps,
};
