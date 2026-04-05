"use client";

import { useNode } from "@craftjs/core";
import { useCallback, useEffect, useRef, useState, KeyboardEvent } from "react";
import {
    ScanBarcode, Camera, CheckCircle2, XCircle, Loader2,
    Package, RotateCcw, ListChecks, MapPin,
    ChevronDown, ChevronRight, Play, CheckCheck, PackageOpen, QrCode,
    AlertTriangle, Layers, Merge, Timer,
} from "lucide-react";
import { panesApi } from "@/lib/api/panes";
import { Pane } from "@/lib/api/types";
import { parseQrScan } from "@/lib/utils/parseQrScan";
import { getStationName, isStationMatch } from "@/lib/utils/station-helpers";
import { usePreview } from "../PreviewContext";
import { useStationContext } from "../StationContext";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { CameraScanModal } from "./CameraScanModal";
import { QrCodeModal } from "@/components/qr/QrCodeModal";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────
interface StationQueueBlockProps {
    title?: string;
}

/** Local phase for each in_progress pane.
 *  Backend only has in_progress for both "scan_in done" and "start done" states,
 *  so we track the distinction in component state. */
type PanePhase = "confirmed" | "started";

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Component ─────────────────────────────────────────────────────────────────
export function StationQueueBlock({ title = "คิวสถานีนี้" }: StationQueueBlockProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const { stationId, stationName, isLaminateStation, setPaneData, triggerRefresh, refreshCounter } = useStationContext();

    const inputRef = useRef<HTMLInputElement>(null);
    /**
     * Panes scanned in this session that may not pass the station filter yet
     * (backend can store currentStation as slug, ObjectId, or display name —
     * we keep these panes visible until they naturally appear via fetchPanes or
     * are explicitly completed / after a 60-second grace period).
     */
    const guardedPanesRef = useRef<Map<string, Pane>>(new Map());

    const [panes,         setPanes]         = useState<Pane[]>([]);
    const [loading,       setLoading]       = useState(false);
    const [phases,        setPhases]        = useState<Record<string, PanePhase>>({});
    const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
    const [actionResult,  setActionResult]  = useState<Record<string, "success" | "error">>({});
    const [now,           setNow]           = useState(Date.now());
    const [scanError,     setScanError]     = useState<string | null>(null);
    const [showCamera,    setShowCamera]    = useState(false);
    /** Set of orderId that are manually collapsed */
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    /** Pane whose QR code is being displayed */
    const [qrPane, setQrPane] = useState<Pane | null>(null);

    /** Station mismatch confirmation */
    const [mismatchInfo, setMismatchInfo] = useState<{
        paneStation: string;
        thisStation: string;
        paneNumber: string;
    } | null>(null);

    // ── Laminate pairing board state ──────────────────────────────────────────
    interface LaminateGroup {
        parent: Pane;
        sheets: Pane[];
        sheetsPresent: number;
        sheetsTotal: number;
        sheetsWorking: number;
        ready: boolean;
    }
    const [laminateGroups, setLaminateGroups] = useState<LaminateGroup[]>([]);
    const [mergeLoading, setMergeLoading] = useState<Record<string, boolean>>({});
    const [mergeResult, setMergeResult] = useState<Record<string, "success" | "error">>({});

    // ── Fetch in_progress panes at this station ───────────────────────────────
    const fetchPanes = useCallback(async () => {
        if (!stationId && !stationName) return;
        setLoading(true);
        try {
            const res = await panesApi.getAll({ limit: 300 }).catch(() => null);
            if (!res || !res.success || !Array.isArray(res.data)) return;

            const atStation = res.data.filter(p =>
                isStationMatch(p.currentStation, stationId, stationName) && p.currentStatus === "in_progress",
            );

            // Merge: keep locally-scanned panes the filter hasn't matched yet
            // (backend may use a different currentStation format: slug vs ObjectId vs name)
            const merged = [...atStation];
            for (const [id, guardedPane] of guardedPanesRef.current.entries()) {
                if (atStation.some(p => p._id === id)) {
                    // Now properly returned by API — remove from guard
                    guardedPanesRef.current.delete(id);
                } else {
                    merged.push(guardedPane);
                }
            }
            setPanes(merged);

            // Sync local phase map: add "confirmed" for new panes, remove stale ones
            setPhases(prev => {
                const next = { ...prev };
                const currentIds = new Set(merged.map(p => p._id));
                for (const id of Object.keys(next)) {
                    if (!currentIds.has(id)) delete next[id];
                }
                for (const p of merged) {
                    if (!next[p._id]) next[p._id] = "confirmed";
                }
                return next;
            });
        } finally {
            setLoading(false);
        }
    }, [stationId, stationName]);

    useEffect(() => { fetchPanes(); }, [fetchPanes, refreshCounter]);
    useWebSocket("pane", ["pane:updated"], () => { setQrPane(null); fetchPanes(); if (isLaminateStation) fetchLaminateGroups(); });

    // ── Live timer update ─────────────────────────────────────────────────────
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    // ── Laminate: fetch parent/sheet groups at this station ───────────────────
    const fetchLaminateGroups = useCallback(async () => {
        if (!isLaminateStation || !stationId) return;
        try {
            const sheetsRes = await panesApi.getAll({ laminateRole: "sheet", limit: 500 });
            if (!sheetsRes?.success) return;

            const allSheetData = sheetsRes.data.filter(s => s.currentStatus !== "claimed");

            const sheetsByParent = new Map<string, Pane[]>();
            for (const s of allSheetData) {
                const pid = typeof s.parentPane === "string" ? s.parentPane : (s.parentPane as Pane)?._id;
                if (!pid) continue;
                if (!sheetsByParent.has(pid)) sheetsByParent.set(pid, []);
                sheetsByParent.get(pid)!.push(s);
            }

            const parentIds = [...sheetsByParent.keys()].filter(pid => {
                const sheets = sheetsByParent.get(pid)!;
                return sheets.some(s =>
                    isStationMatch(s.currentStation, stationId, stationName) &&
                    s.currentStatus !== "completed",
                );
            });

            const parentResults = await Promise.all(
                parentIds.map(pid => panesApi.getById(pid).catch(() => null)),
            );

            const groups: LaminateGroup[] = [];
            for (let i = 0; i < parentIds.length; i++) {
                const pid = parentIds[i];
                const parentRes = parentResults[i];
                if (!parentRes?.success) continue;

                const allSheets = sheetsByParent.get(pid) ?? [];
                const sheetsTotal = allSheets.length;
                const atStation = allSheets.filter(s =>
                    isStationMatch(s.currentStation, stationId, stationName) &&
                    s.currentStatus !== "completed",
                );
                const sheetsPresent = atStation.length;
                const sheetsWorking = atStation.filter(s => s.currentStatus === "in_progress").length;

                if (sheetsPresent === 0) continue;

                groups.push({
                    parent: parentRes.data,
                    sheets: allSheets,
                    sheetsPresent,
                    sheetsTotal,
                    sheetsWorking,
                    ready: sheetsPresent >= sheetsTotal && sheetsWorking >= sheetsTotal && sheetsTotal > 0,
                });
            }

            setLaminateGroups(groups);
        } catch { /* ignore */ }
    }, [isLaminateStation, stationId, stationName]);

    useEffect(() => { if (isLaminateStation) fetchLaminateGroups(); }, [fetchLaminateGroups, refreshCounter]);

    // Laminate WebSocket events
    useWebSocket("station", ["laminate:ready", "laminate:waiting", "pane:laminated"], () => {
        if (isLaminateStation) fetchLaminateGroups();
        fetchPanes();
    });

    // ── Laminate merge action ─────────────────────────────────────────────────
    async function handleMerge(parentPaneNumber: string, parentId: string) {
        if (!stationId) return;
        setMergeLoading(prev => ({ ...prev, [parentId]: true }));
        setMergeResult(prev => { const n = { ...prev }; delete n[parentId]; return n; });
        try {
            const res = await panesApi.scan(parentPaneNumber, { station: stationId, action: "laminate" });
            if (!res.success) throw new Error(res.message ?? "ลามิเนตไม่สำเร็จ");
            setMergeResult(prev => ({ ...prev, [parentId]: "success" }));
            setPaneData(res.data.pane as unknown as Record<string, unknown>);
            triggerRefresh();
            setTimeout(() => {
                setMergeResult(prev => { const n = { ...prev }; delete n[parentId]; return n; });
                fetchLaminateGroups();
            }, 2000);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
            setScanError(msg);
            setMergeResult(prev => ({ ...prev, [parentId]: "error" }));
            setTimeout(() => {
                setMergeResult(prev => { const n = { ...prev }; delete n[parentId]; return n; });
            }, 3000);
        } finally {
            setMergeLoading(prev => { const n = { ...prev }; delete n[parentId]; return n; });
        }
    }

    // ── Group panes by order ──────────────────────────────────────────────────
    const orderGroups = (() => {
        const filtered = isLaminateStation
            ? panes.filter(p => {
                if (p.laminateRole === "sheet") return false;
                if (p.laminateRole === "parent" && p.currentStatus === "pending") return false;
                return true;
            })
            : panes;
        const map = new Map<string, { label: string; panes: Pane[] }>();
        for (const p of filtered) {
            const oid   = extractOrderId(p);
            const label = extractOrderLabel(p);
            if (!map.has(oid)) map.set(oid, { label, panes: [] });
            map.get(oid)!.panes.push(p);
        }
        return [...map.entries()].map(([orderId, v]) => ({ orderId, label: v.label, panes: v.panes }));
    })();

    // ── Scan → scan_in ───────────────────────────────────────────────────────
    async function handleScan(raw: string) {
        const trimmed = raw.trim();
        if (!trimmed) return;
        if (inputRef.current) inputRef.current.value = "";

        const parsed = parseQrScan(trimmed);
        const pn = parsed.type === "pane" ? parsed.value : trimmed.replace(/^STDPLUS:/i, "").trim();
        setScanError(null);

        if (!stationId) { setScanError("ไม่ระบุสถานี — กรุณาเปิดจากหน้าสถานี"); return; }

        // Already in queue (already in_progress)?
        const already = panes.find(p => p.paneNumber === pn || p.paneNumber.endsWith(pn));
        if (already) {
            const oid = extractOrderId(already);
            setCollapsed(prev => { const n = new Set(prev); n.delete(oid); return n; });
            setScanError(`"${pn}" อยู่ในคิวแล้ว — ดูในรายการด้านล่าง`);
            return;
        }

        // Pre-check: verify the pane's current station matches this station
        try {
            const lookupRes = await panesApi.getById(pn);
            if (lookupRes.success && lookupRes.data) {
                const cs = lookupRes.data.currentStation;
                const paneStationStr = getStationName(cs);
                const isHere = !cs || isStationMatch(cs, stationId, stationName);
                if (!isHere) {
                    setMismatchInfo({
                        paneStation: paneStationStr,
                        thisStation: stationName ?? "",
                        paneNumber: pn,
                    });
                    return;
                }
            }
        } catch {
            // lookup failed — proceed with scan anyway
        }

        await executeScanIn(pn);
    }

    async function executeScanIn(pn: string, force?: boolean) {
        const tempKey = `scan-${pn}`;
        setActionLoading(prev => ({ ...prev, [tempKey]: true }));
        try {
            const res = await panesApi.scan(pn, {
                station: stationId!,
                action: "scan_in",
                ...(force ? { force: true } : {}),
            });
            if (!res.success) throw new Error(res.message ?? "สแกนไม่สำเร็จ");

            const scannedPane = res.data.pane;

            guardedPanesRef.current.set(scannedPane._id, { ...scannedPane, currentStatus: "in_progress" });
            const pid = scannedPane._id;
            setTimeout(() => { guardedPanesRef.current.delete(pid); }, 60_000);

            setPanes(prev => prev.some(p => p._id === scannedPane._id) ? prev : [...prev, scannedPane]);
            setPhases(prev => prev[scannedPane._id] ? prev : { ...prev, [scannedPane._id]: "confirmed" });

            setPaneData(scannedPane as unknown as Record<string, unknown>);
            triggerRefresh();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
            setScanError(msg);
        } finally {
            setActionLoading(prev => { const n = { ...prev }; delete n[tempKey]; return n; });
        }
    }

    async function handleMismatchConfirm() {
        if (!mismatchInfo) return;
        const pn = mismatchInfo.paneNumber;
        setMismatchInfo(null);
        await executeScanIn(pn, true);
    }

    function handleMismatchDismiss() {
        setMismatchInfo(null);
    }

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") handleScan(e.currentTarget.value);
    }

    // ── Per-pane action (start / complete) ────────────────────────────────────
    async function doAction(pane: Pane, action: "start" | "complete") {
        if (!stationId) { setScanError("ไม่ระบุสถานี"); return; }
        setActionLoading(prev => ({ ...prev, [pane._id]: true }));
        setActionResult(prev => { const n = { ...prev }; delete n[pane._id]; return n; });
        try {
            const res = await panesApi.scan(pane.paneNumber, { station: stationId, action });
            if (!res.success) throw new Error(res.message ?? "ดำเนินการไม่สำเร็จ");
            setPaneData(res.data.pane as unknown as Record<string, unknown>);

            if (action === "start") {
                // Advance local phase; pane stays in queue
                setPhases(prev => ({ ...prev, [pane._id]: "started" }));
                setActionResult(prev => ({ ...prev, [pane._id]: "success" }));
                setTimeout(() => {
                    setActionResult(prev => { const n = { ...prev }; delete n[pane._id]; return n; });
                }, 1500);
            } else {
                // complete → pane leaves the queue, remove guard so fetchPanes can clean it up
                guardedPanesRef.current.delete(pane._id);
                triggerRefresh();
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
            setActionResult(prev => ({ ...prev, [pane._id]: "error" }));
            setScanError(msg);
            setTimeout(() => {
                setActionResult(prev => { const n = { ...prev }; delete n[pane._id]; return n; });
            }, 3000);
        } finally {
            setActionLoading(prev => { const n = { ...prev }; delete n[pane._id]; return n; });
        }
    }

    // ── Designer preview ──────────────────────────────────────────────────────
    if (!isPreview) {
        return (
            <div
                ref={(ref) => { ref && connect(drag(ref)); }}
                className={`rounded-xl border-2 p-3 select-none cursor-grab active:cursor-grabbing transition-colors ${
                    selected ? "border-primary bg-primary/5" : "border-dashed border-muted-foreground/30 hover:border-primary/50"
                }`}
            >
                <div className="flex flex-wrap items-center gap-1 mb-2">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium">
                        <ListChecks className="h-2.5 w-2.5" />
                        Station Queue
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-medium">
                        scan_in → เริ่ม → เสร็จสิ้น
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-medium">
                        grouped by order
                    </span>
                </div>

                {/* Scan input preview */}
                <div className="flex items-center gap-2 pointer-events-none mb-2">
                    <div className="flex-1 rounded-xl border border-muted bg-background px-3 py-2 flex items-center gap-2">
                        <ScanBarcode className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                        <span className="text-[11px] text-muted-foreground/40 truncate">สแกน QR เพื่อยืนยันกระจกเข้าสถานีนี้...</span>
                    </div>
                    <div className="shrink-0 rounded-xl border border-muted bg-background p-2">
                        <Camera className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                </div>

                {/* Skeleton order groups */}
                <div className="space-y-2 opacity-50 pointer-events-none">
                    {([
                        { order: "ORD-001", rows: [{ phase: "started", w: "w-20" }, { phase: "started", w: "w-16" }] },
                        { order: "ORD-002", rows: [{ phase: "confirmed", w: "w-24" }] },
                    ] as const).map((g, i) => (
                        <div key={i} className="rounded-xl border border-muted overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b border-muted">
                                <Package className="h-3 w-3 text-muted-foreground/60" />
                                <span className="text-[11px] font-bold text-muted-foreground">ออเดอร์ {g.order}</span>
                                <span className="text-[10px] text-muted-foreground ml-auto">{g.rows.length} ชิ้น</span>
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                            </div>
                            <div className="divide-y divide-muted/30">
                                {g.rows.map((row, j) => (
                                    <div key={j} className="flex items-center gap-3 px-3 py-2">
                                        <span className={`h-2 w-2 rounded-full shrink-0 ${row.phase === "started" ? "bg-blue-500" : "bg-amber-400"}`} />
                                        <div className={`h-3 ${row.w} rounded bg-muted`} />
                                        <div className="ml-auto">
                                            <div className={`h-6 w-20 rounded-lg ${row.phase === "started" ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-blue-100 dark:bg-blue-900/30"}`} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <p className="text-[10px] text-emerald-500 dark:text-emerald-400 mt-2">
                    🏭 คิวกระจกแบ่งตามออเดอร์ · realtime · scan_in → เริ่ม → เสร็จสิ้น
                </p>
            </div>
        );
    }

    // ── Live UI ───────────────────────────────────────────────────────────────
    const scanningCount = Object.values(actionLoading).filter(Boolean).length;

    // Cut station: withdrawal must exist before worker can start
    const isCutStation = Boolean(
        stationName && /ตัด|cut/i.test(stationName)
    );

    return (
        <div className="w-full space-y-3">

            {/* Header */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-sm font-bold text-foreground truncate">{title}</h3>
                    {panes.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                            {panes.length} ชิ้น
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {stationName && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <MapPin className="h-3 w-3" />{stationName}
                        </span>
                    )}
                    <button
                        onClick={fetchPanes}
                        disabled={loading}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
                        title="รีเฟรช"
                    >
                        <RotateCcw className={`h-3.5 w-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
                    </button>
                </div>
            </div>

            {/* Scan input */}
            <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-2">
                <div className="relative flex-1 min-w-0">
                    <ScanBarcode className={`absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none ${scanningCount > 0 ? "text-primary animate-pulse" : "text-muted-foreground/50"}`} />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="สแกน QR เพื่อยืนยันกระจกเข้าสถานีนี้..."
                        onKeyDown={handleKeyDown}
                        autoComplete="off"
                        autoFocus
                        className="w-full rounded-xl border bg-background pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/40"
                    />
                </div>
                <button
                    onClick={() => setShowCamera(true)}
                    title="สแกนด้วยกล้อง"
                    className="shrink-0 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 sm:bg-background sm:hover:bg-muted sm:border sm:border-input px-2.5 sm:px-3 py-2.5 transition-colors flex items-center justify-center gap-1.5 sm:w-auto"
                >
                    <Camera className="h-4 w-4 text-white sm:text-muted-foreground" />
                    <span className="sm:hidden text-xs font-medium text-white">สแกนเข้าด้วยกล้อง</span>
                </button>
            </div>

            {/* Scan error banner */}
            {scanError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 px-3 py-2.5">
                    <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="flex-1 text-xs text-red-600 dark:text-red-400 font-medium whitespace-pre-line">{scanError}</p>
                    <button onClick={() => setScanError(null)} className="text-red-400 hover:text-red-500 shrink-0 transition-colors">
                        <XCircle className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            {/* Laminate pairing board */}
            {isLaminateStation && laminateGroups.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 text-violet-500" />
                        <h4 className="text-xs font-bold text-foreground">บอร์ดจับคู่ลามิเนต</h4>
                        <span className="text-[10px] text-muted-foreground">{laminateGroups.length} ชุด</span>
                    </div>
                    <div className="space-y-2">
                        {laminateGroups.map(group => {
                            const pid = group.parent._id;
                            const isMerging = mergeLoading[pid];
                            const mResult = mergeResult[pid];
                            return (
                                <div key={pid} className={`rounded-xl border overflow-hidden ${
                                    group.ready
                                        ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20"
                                        : group.sheetsPresent >= group.sheetsTotal
                                            ? "border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/10"
                                            : "border-border bg-card"
                                }`}>
                                    <div className="px-3 py-2.5 flex items-center gap-2">
                                        <Layers className={`h-3.5 w-3.5 shrink-0 ${group.ready ? "text-emerald-500" : "text-muted-foreground"}`} />
                                        <div className="flex-1 min-w-0">
                                            <span className="font-mono text-xs font-bold text-foreground">{group.parent.paneNumber}</span>
                                            {group.parent.dimensions && (
                                                <span className="text-[10px] text-muted-foreground ml-1.5">
                                                    {group.parent.dimensions.width}×{group.parent.dimensions.height}
                                                </span>
                                            )}
                                        </div>
                                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                            group.ready
                                                ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                                                : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                                        }`}>
                                            {group.sheetsPresent}/{group.sheetsTotal} แผ่น
                                        </span>
                                    </div>
                                    <div className="border-t border-border/50 divide-y divide-border/30">
                                        {group.sheets.map(sheet => {
                                            const isHere = isStationMatch(sheet.currentStation, stationId, stationName) && sheet.currentStatus !== "completed";
                                            const isWorking = isHere && sheet.currentStatus === "in_progress";
                                            return (
                                                <div key={sheet._id} className="flex items-center gap-2 px-3 py-1.5">
                                                    <span className={`h-2 w-2 rounded-full shrink-0 ${
                                                        isWorking ? "bg-emerald-500" : isHere ? "bg-amber-400" : "bg-slate-300 dark:bg-slate-600"
                                                    }`} />
                                                    <span className="font-mono text-[11px] font-medium text-foreground">
                                                        {sheet.paneNumber}
                                                    </span>
                                                    {sheet.sheetLabel && (
                                                        <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                                                            Sheet {sheet.sheetLabel}
                                                        </span>
                                                    )}
                                                    <span className={`ml-auto text-[10px] font-medium ${
                                                        isWorking
                                                            ? "text-emerald-600 dark:text-emerald-400"
                                                            : isHere
                                                                ? "text-amber-600 dark:text-amber-400"
                                                                : "text-muted-foreground"
                                                    }`}>
                                                        {isWorking ? "เข้างานแล้ว" : isHere ? "มาถึง — รอสแกนเข้า" : getStationName(sheet.currentStation) || "อยู่ระหว่างทาง"}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="border-t border-border/50 px-3 py-2">
                                        {mResult === "success" ? (
                                            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                                <CheckCircle2 className="h-4 w-4" />
                                                <span className="text-xs font-semibold">ลามิเนตสำเร็จ!</span>
                                            </div>
                                        ) : mResult === "error" ? (
                                            <div className="flex items-center gap-1.5 text-red-500">
                                                <XCircle className="h-4 w-4" />
                                                <span className="text-xs font-medium">ผิดพลาด</span>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleMerge(group.parent.paneNumber, pid)}
                                                disabled={!group.ready || isMerging}
                                                className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all active:scale-[0.98] ${
                                                    group.ready
                                                        ? "bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white"
                                                        : "bg-muted text-muted-foreground cursor-not-allowed"
                                                }`}
                                            >
                                                {isMerging
                                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    : <Merge className="h-3.5 w-3.5" />
                                                }
                                                {group.ready
                                                    ? "ประกบลามิเนต"
                                                    : group.sheetsPresent < group.sheetsTotal
                                                        ? `รอแผ่นดิบ ${group.sheetsPresent}/${group.sheetsTotal}`
                                                        : `รอสแกนเข้างาน ${group.sheetsWorking}/${group.sheetsTotal}`
                                                }
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Queue content */}
            {loading && panes.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">กำลังโหลด...</span>
                </div>
            ) : !stationId && !stationName ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                    <MapPin className="h-8 w-8 opacity-30" />
                    <p className="text-sm font-medium">ไม่ได้เปิดจากหน้าสถานี</p>
                    <p className="text-xs opacity-60">Block นี้ต้องใช้งานจากหน้าสถานีเท่านั้น</p>
                </div>
            ) : orderGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                    <Package className="h-8 w-8 opacity-30" />
                    <p className="text-sm font-medium">ยังไม่มีกระจกในคิว</p>
                    <p className="text-xs opacity-60 text-center">สแกน QR กระจกจาก "รายการข้อมูล" เพื่อยืนยันเข้าสถานีนี้</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {orderGroups.map(({ orderId, label, panes: groupPanes }) => {
                        const isExpanded   = !collapsed.has(orderId); // default open
                        const startedCount = groupPanes.filter(p => (phases[p._id] ?? "confirmed") === "started").length;
                        const confirmedCount = groupPanes.length - startedCount;
                        const withdrawnCount = isCutStation ? groupPanes.filter(p => p.withdrawal).length : groupPanes.length;

                        return (
                            <div key={orderId} className="rounded-xl border border-border overflow-hidden">
                                {/* Order header row */}
                                <button
                                    type="button"
                                    onClick={() => setCollapsed(prev => {
                                        const next = new Set(prev);
                                        if (next.has(orderId)) next.delete(orderId);
                                        else next.add(orderId);
                                        return next;
                                    })}
                                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left border-b border-border/50"
                                >
                                    <Package className="h-3.5 w-3.5 text-primary shrink-0" />
                                    <span className="text-xs font-bold text-foreground flex-1 truncate">ออเดอร์ {label}</span>
                                    {startedCount > 0 && (
                                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-semibold shrink-0">
                                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                                            {startedCount} กำลังทำ
                                        </span>
                                    )}
                                    {confirmedCount > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-semibold shrink-0">
                                            {confirmedCount} รอ
                                        </span>
                                    )}
                                    {isCutStation && (
                                        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                                            withdrawnCount === groupPanes.length
                                                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                                : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
                                        }`}>
                                            <PackageOpen className="h-2.5 w-2.5" />
                                            เบิกแล้ว {withdrawnCount}/{groupPanes.length}
                                        </span>
                                    )}
                                    <span className="text-[10px] text-muted-foreground shrink-0">{groupPanes.length} ชิ้น</span>
                                    {isExpanded
                                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    }
                                </button>

                                {/* Pane rows */}
                                {isExpanded && (
                                    <div className="divide-y divide-border/40">
                                        {groupPanes.map(pane => {
                                            const phase     = phases[pane._id] ?? "confirmed";
                                            const isLoading = actionLoading[pane._id];
                                            const result    = actionResult[pane._id];

                                            return (
                                                <div
                                                    key={pane._id}
                                                    className="flex items-center gap-3 px-3 py-2.5 bg-card hover:bg-muted/10 transition-colors"
                                                >
                                                    {/* Phase dot */}
                                                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                                                        phase === "started" ? "bg-blue-500 animate-pulse" : "bg-amber-400"
                                                    }`} />

                                                    {/* Pane info */}
                                                    <div className="flex-1 min-w-0">
                                                        {/* Line 1: pane number + sheet label + withdrawal badge */}
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-mono text-xs font-bold text-foreground leading-none shrink-0">
                                                                {pane.paneNumber}
                                                            </span>
                                                            {pane.laminateRole === "sheet" && pane.sheetLabel && (
                                                                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 shrink-0">
                                                                    Sheet {pane.sheetLabel}
                                                                </span>
                                                            )}
                                                            {isCutStation && (
                                                                pane.withdrawal
                                                                    ? <span className="whitespace-nowrap text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">เบิกแล้ว</span>
                                                                    : <span className="whitespace-nowrap text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 shrink-0">ยังไม่เบิก</span>
                                                            )}
                                                        </div>
                                                        {/* Line 2: glass type label + dimensions */}
                                                        {(pane.glassTypeLabel || (pane.dimensions && (pane.dimensions.width > 0 || pane.dimensions.height > 0))) && (
                                                            <div className="flex items-center gap-1 mt-0.5 min-w-0">
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
                                                        )}
                                                        {/* Line 3: phase status */}
                                                        <span className={`text-[10px] font-medium mt-0.5 block ${
                                                            phase === "started"
                                                                ? "text-blue-600 dark:text-blue-400 font-bold"
                                                                : "text-amber-600 dark:text-amber-400"
                                                        }`}>
                                                            {phase === "started" ? (
                                                                <span className="flex items-center gap-1">
                                                                    <Timer className="h-3 w-3" />
                                                                    กำลังดำเนินการ: {
                                                                        (() => {
                                                                            const start = new Date(pane.updatedAt).getTime();
                                                                            const diff = Math.max(0, Math.floor((now - start) / 1000));
                                                                            const h = Math.floor(diff / 3600);
                                                                            const m = Math.floor((diff % 3600) / 60);
                                                                            const s = diff % 60;
                                                                            return `${h > 0 ? `${h}:` : ""}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                                                                        })()
                                                                    }
                                                                </span>
                                                            ) : "ยืนยันแล้ว — รอเริ่ม"}
                                                        </span>
                                                    </div>

                                                    {/* QR code button */}
                                                    {pane.qrCode && (
                                                        <button
                                                            onClick={() => setQrPane(pane)}
                                                            title="แสดง QR Code กระจก"
                                                            className="shrink-0 p-1.5 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                                        >
                                                            <QrCode className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}

                                                    {/* Action button */}
                                                    {result === "success" ? (
                                                        <span className="shrink-0 flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-semibold animate-in fade-in">
                                                            <CheckCircle2 className="h-4 w-4" />
                                                            สำเร็จ
                                                        </span>
                                                    ) : result === "error" ? (
                                                        <span className="shrink-0 flex items-center gap-1 text-red-500 text-xs font-medium">
                                                            <XCircle className="h-4 w-4" />
                                                            ผิดพลาด
                                                        </span>
                                                    ) : phase === "confirmed" ? (
                                                        <button
                                                            onClick={() => doAction(pane, "start")}
                                                            disabled={isLoading || (isCutStation && !pane.withdrawal)}
                                                            title={isCutStation && !pane.withdrawal ? "ต้องเบิกกระจกก่อนเริ่มตัด" : undefined}
                                                            className="shrink-0 flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                                                        >
                                                            {isLoading
                                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                : <Play className="h-3.5 w-3.5" />
                                                            }
                                                            <span className="hidden sm:inline">เริ่มดำเนินการ</span>
                                                            <span className="sm:hidden">เริ่ม</span>
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => doAction(pane, "complete")}
                                                            disabled={isLoading}
                                                            className="shrink-0 flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                                                        >
                                                            {isLoading
                                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                : <CheckCheck className="h-3.5 w-3.5" />
                                                            }
                                                            <span className="hidden sm:inline">เสร็จสิ้น</span>
                                                            <span className="sm:hidden">เสร็จ</span>
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Camera modal */}
            {showCamera && (
                <CameraScanModal
                    onScan={(raw) => { setShowCamera(false); handleScan(raw); }}
                    onClose={() => setShowCamera(false)}
                />
            )}

            {/* QR code modal */}
            {qrPane && (
                <QrCodeModal
                    code={qrPane.paneNumber}
                    value={qrPane.qrCode}
                    label={`กระจก ${qrPane.paneNumber}`}
                    onClose={() => setQrPane(null)}
                />
            )}

            {/* Station mismatch confirmation */}
            {mismatchInfo && (
                <Dialog open onOpenChange={(open) => { if (!open) handleMismatchDismiss(); }}>
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
                            <Button variant="outline" onClick={handleMismatchDismiss}>ยกเลิก</Button>
                            <Button
                                onClick={handleMismatchConfirm}
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

StationQueueBlock.craft = {
    displayName: "Station Queue",
    props: {
        title: "คิวสถานีนี้",
    } as StationQueueBlockProps,
};
