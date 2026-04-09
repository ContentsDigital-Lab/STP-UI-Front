"use client";

import { useNode } from "@craftjs/core";
import { useCallback, useEffect, useRef, useState, KeyboardEvent } from "react";
import { 
    RotateCcw, Camera, ScanBarcode, QrCode, XCircle, CheckCircle2, AlertTriangle, 
    ChevronDown, ChevronRight, Package, Grid3X3, PackageOpen, Loader2, MapPin, 
    Layers, Merge, Bell, CheckCheck, Play, Maximize, Box, ListChecks
} from "lucide-react";
import { toast } from "sonner";
import { panesApi } from "@/lib/api/panes";
import { Pane } from "@/lib/api/types";
import { parseQrScan } from "@/lib/utils/parseQrScan";
import { getStationName, isStationMatch } from "@/lib/utils/station-helpers";
import { isPaneRetiredByMerge, resolveActivePane } from "@/lib/utils/pane-laminate";
import { withMergedIntoScanRetry } from "@/lib/utils/merged-into-scan";
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

function getUrgencyLevel(pane: Pane): "critical" | "warn" | "normal" {
    const o = (typeof pane.order === "object" ? pane.order : null) as any;
    const r = (typeof pane.request === "object" ? pane.request : (o?.request && typeof o.request === "object" ? o.request : null)) as any;
    
    const priority = o?.priority ?? 0;
    const deadline = r?.deadline;

    if (priority >= 3) return "critical";
    if (deadline) {
        const dl = new Date(deadline);
        const now = new Date();
        const diffDays = (dl.getTime() - now.getTime()) / (1000 * 3600 * 24);
        if (diffDays <= 0) return "critical";
        if (diffDays <= 3) return "warn";
    }
    return "normal";
}

function getUrgencyClass(level: "critical" | "warn" | "normal"): string {
    if (level === "critical") return "bg-red-50/80 dark:bg-red-950/20 hover:bg-red-100/80 dark:hover:bg-red-900/30 border-red-100 dark:border-red-900/30";
    if (level === "warn") return "bg-amber-50/80 dark:bg-amber-950/20 hover:bg-amber-100/80 dark:hover:bg-amber-900/30 border-amber-100 dark:border-amber-900/30";
    return "bg-card hover:bg-muted/5 border-border";
}

// ── Component ─────────────────────────────────────────────────────────────────
export function StationQueueBlock({ title = "คิวสถานีนี้" }: StationQueueBlockProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const { stationId, stationName, isLaminateStation, setPaneData, triggerRefresh, refreshCounter, queueFrontOrderId, pinQueueOrderToFront } = useStationContext();

    const inputRef = useRef<HTMLInputElement>(null);
    const guardedPanesRef = useRef<Map<string, Pane>>(new Map());

    const [panes,         setPanes]         = useState<Pane[]>([]);
    const [loading,       setLoading]       = useState(false);
    const [phases,        setPhases]        = useState<Record<string, PanePhase>>({});
    const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
    const [actionResult,  setActionResult]  = useState<Record<string, "success" | "error">>({});
    const [scanError,     setScanError]     = useState<string | null>(null);
    const [showCamera,    setShowCamera]    = useState(false);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [qrPane, setQrPane] = useState<Pane | null>(null);

    const [viewMode,      setViewMode]      = useState<"order" | "cutting">("order");
    const [selectedPanes, setSelectedPanes] = useState<Set<string>>(new Set());
    const [batchLoading,  setBatchLoading]  = useState(false);

    const [mismatchInfo, setMismatchInfo] = useState<{
        paneStation: string;
        thisStation: string;
        paneNumber: string;
    } | null>(null);

    interface LaminateGroup {
        parent: Pane;
        sheets: Pane[];
        sheetsPresent: number;
        sheetsTotal: number;
        sheetsWorking: number;
        ready: boolean;
    }
    const [laminateGroups, setLaminateGroups] = useState<LaminateGroup[]>([]);
    const [laminateSurvivorChoice, setLaminateSurvivorChoice] = useState<Record<string, string>>({});
    const [mergeLoading, setMergeLoading] = useState<Record<string, boolean>>({});
    const [mergeResult, setMergeResult] = useState<Record<string, "success" | "error">>({});

    const fetchPanes = useCallback(async () => {
        if (!stationId && !stationName) return;
        setLoading(true);
        try {
            const res = await panesApi.getAll({ 
                limit: 500,
                populate: "order,order.request" 
            }).catch(() => null);
            if (!res || !res.success || !Array.isArray(res.data)) return;

            const atStation = res.data.filter(p =>
                !isPaneRetiredByMerge(p) &&
                isStationMatch(p.currentStation, stationId, stationName) && p.currentStatus === "in_progress",
            );

            const merged = [...atStation];
            for (const [id, guardedPane] of guardedPanesRef.current.entries()) {
                if (atStation.some(p => p._id === id)) {
                    guardedPanesRef.current.delete(id);
                } else {
                    merged.push(guardedPane);
                }
            }
            setPanes(merged);

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
    useWebSocket("pane", ["pane:updated", "pane:laminated"], () => {
        setQrPane(null);
        fetchPanes();
        if (isLaminateStation) fetchLaminateGroups();
    });

    const fetchLaminateGroups = useCallback(async () => {
        if (!isLaminateStation || !stationId) return;
        try {
            const sheetsRes = await panesApi.getAll({ laminateRole: "sheet", limit: 500 });
            if (!sheetsRes?.success) return;

            const allSheetData = (sheetsRes.data as Pane[]).filter(
                (s) => s.currentStatus !== "claimed" && !isPaneRetiredByMerge(s),
            );

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
                const allSheets = sheetsByParent.get(pid) ?? [];
                const firstSheet = allSheets[0];
                if (!firstSheet) continue;

                const parentPane: Pane =
                    parentRes?.success && parentRes.data
                        ? parentRes.data
                        : ({
                              _id: pid,
                              paneNumber: firstSheet.paneNumber,
                              laminateRole: "parent",
                              currentStation: firstSheet.currentStation,
                              currentStatus: firstSheet.currentStatus,
                              routing: firstSheet.routing,
                              customRouting: firstSheet.customRouting,
                              dimensions: firstSheet.dimensions,
                              glassType: firstSheet.glassType,
                              glassTypeLabel: firstSheet.glassTypeLabel,
                              processes: firstSheet.processes,
                              edgeTasks: firstSheet.edgeTasks,
                              order: firstSheet.order,
                              createdAt: firstSheet.createdAt,
                              updatedAt: firstSheet.updatedAt,
                          } as Pane);

                if (isPaneRetiredByMerge(parentPane)) continue;

                const sheetsTotal = allSheets.length;
                const atStation = allSheets.filter(s =>
                    isStationMatch(s.currentStation, stationId, stationName) &&
                    s.currentStatus !== "completed",
                );
                const sheetsPresent = atStation.length;
                const sheetsWorking = atStation.filter(s => s.currentStatus === "in_progress").length;

                if (sheetsPresent === 0) continue;

                groups.push({
                    parent: parentPane,
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

    useWebSocket("station", ["laminate:ready", "laminate:waiting", "pane:laminated"], () => {
        if (isLaminateStation) fetchLaminateGroups();
        fetchPanes();
    });

    async function handleMerge(parentId: string, group: LaminateGroup) {
        if (!stationId) return;
        const sheets = group.sheets.filter((s) => !isPaneRetiredByMerge(s));
        if (sheets.length === 0) return;

        const chosen =
            laminateSurvivorChoice[parentId] &&
            sheets.some((s) => s.paneNumber === laminateSurvivorChoice[parentId])
                ? laminateSurvivorChoice[parentId]
                : sheets[0].paneNumber;

        const laminateBody =
            sheets.length > 1 ? { laminateSurvivorPaneNumber: chosen } : {};

        setMergeLoading(prev => ({ ...prev, [parentId]: true }));
        setMergeResult(prev => { const n = { ...prev }; delete n[parentId]; return n; });
        try {
            const res = await withMergedIntoScanRetry(chosen, async (pn) => {
                const r = await panesApi.scan(pn, {
                    station: stationId,
                    action: "laminate",
                    ...laminateBody,
                });
                if (!r.success) throw new Error(r.message ?? "ลามิเนตไม่สำเร็จ");
                return r;
            });
            setMergeResult(prev => ({ ...prev, [parentId]: "success" }));
            setLaminateSurvivorChoice((prev) => {
                const n = { ...prev };
                delete n[parentId];
                return n;
            });
            const d = res.data as { survivorPane?: Pane; pane: Pane };
            setPaneData((d.survivorPane ?? d.pane) as unknown as Record<string, unknown>);
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

    const seenPaneIds = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (loading || panes.length === 0) return;
        
        const urgentPanes = panes.filter(p => {
            const pObj = (typeof p.order === "object" ? p.order : null) as any;
            const priority = pObj?.priority ?? 0;
            return priority >= 3 && !seenPaneIds.current.has(p._id);
        });

        if (urgentPanes.length > 0) {
            const target = urgentPanes[0];
            toast.error(`พบงานด่วนใหม่! ${target.paneNumber}`, {
                description: "ลำดับความด่วน P3 ถูกดันขึ้นหัวคิวแล้ว",
                icon: <Bell className="h-4 w-4 text-red-500 animate-bounce" />,
                duration: 10000,
            });

            const audio = new Audio("https://cdn.pixabay.com/audio/2022/03/10/audio_c350718d7c.mp3");
            audio.play().catch(() => console.log("Sound blocked"));
            
            panes.forEach(p => seenPaneIds.current.add(p._id));
        } else {
            panes.forEach(p => seenPaneIds.current.add(p._id));
        }
    }, [panes, loading]);

    const materialGroups = (() => {
        const atStation = panes.filter(p =>
            !isPaneRetiredByMerge(p) &&
            isStationMatch(p.currentStation, stationId, stationName) && 
            p.currentStatus === "in_progress" &&
            p.withdrawal // Show only panes that have been withdrawn
        );
        const map = new Map<string, {
            label: string;
            thickness?: number;
            color?: string;
            glassType?: string;
            materialId?: string;
            material?: any;
            panes: Pane[]
        }>();

        for (const p of atStation) {
            const matObj = (typeof p.material === "object" ? p.material : null) as any;
            const mid = typeof p.material === "string" ? p.material : (matObj?._id || "unknown");
            const glassType = p.glassType || matObj?.specDetails?.glassType || "ทั่วไป";
            const thickness =
                p.dimensions?.thickness ||
                Number(matObj?.specDetails?.thickness ?? 0) ||
                0;
            const color = matObj?.specDetails?.color || "";
            
            const groupKey = `${glassType}-${thickness}-${color}-${mid}`;
            if (!map.has(groupKey)) {
                map.set(groupKey, {
                    label: `${glassType} ${thickness > 0 ? `${thickness}mm` : ""} ${color}`.trim(),
                    thickness,
                    color,
                    glassType,
                    materialId: mid,
                    material: matObj,
                    panes: []
                });
            }
            map.get(groupKey)!.panes.push(p);
        }

        return [...map.entries()]
            .map(([key, v]) => {
                const maxUrgency = v.panes.reduce((max, p) => {
                    const level = getUrgencyLevel(p);
                    if (level === "critical") return "critical";
                    if (level === "warn" && max !== "critical") return "warn";
                    return max;
                }, "normal" as "critical" | "warn" | "normal");

                return { 
                    key, 
                    ...v,
                    maxUrgency,
                    panes: v.panes.sort((a, b) => {
                        const levelA = getUrgencyLevel(a);
                        const levelB = getUrgencyLevel(b);
                        const severity = { critical: 3, warn: 2, normal: 1 };
                        if (levelA !== levelB) return severity[levelB] - severity[levelA];
                        return (b.dimensions?.area ?? 0) - (a.dimensions?.area ?? 0);
                    })
                };
            })
            .sort((a, b) => {
                const severity = { critical: 3, warn: 2, normal: 1 };
                if (a.maxUrgency !== b.maxUrgency) return severity[b.maxUrgency] - severity[a.maxUrgency];
                return a.label.localeCompare(b.label);
            });
    })();

    const orderGroups = (() => {
        const filtered = isLaminateStation
            ? panes.filter(p => {
                if (isPaneRetiredByMerge(p)) return false;
                if (p.laminateRole === "sheet") return false;
                if (p.laminateRole === "parent" && p.currentStatus === "pending") return false;
                return true;
            })
            : panes.filter((p) => !isPaneRetiredByMerge(p));
        const map = new Map<string, { label: string; panes: Pane[]; priority: number; createdAt: string; deadline: string }>();
        for (const p of filtered) {
            const oid   = extractOrderId(p);
            const label = extractOrderLabel(p);
            if (!map.has(oid)) {
                const orderObj = (typeof p.order === "object" ? p.order : null) as any;
                const reqObj   = (typeof orderObj?.request === "object" ? orderObj?.request : null) as any;
                
                map.set(oid, { 
                    label, 
                    panes: [],
                    priority: orderObj?.priority ?? 0,
                    createdAt: orderObj?.createdAt ?? p.createdAt,
                    deadline: orderObj?.deadline || reqObj?.deadline || ""
                });
            }
            map.get(oid)!.panes.push(p);
        }

        return [...map.entries()]
            .map(([orderId, v]) => {
                const maxLevel = v.panes.reduce((max, p) => {
                    const level = getUrgencyLevel(p);
                    if (level === "critical") return "critical";
                    if (level === "warn" && max !== "critical") return "warn";
                    return max;
                }, "normal" as "critical" | "warn" | "normal");

                return { orderId, label: v.label, panes: v.panes, priority: v.priority, createdAt: v.createdAt, deadline: v.deadline, maxUrgency: maxLevel };
            })
            .sort((a, b) => {
                if (queueFrontOrderId) {
                    const aFront = a.orderId === queueFrontOrderId ? 1 : 0;
                    const bFront = b.orderId === queueFrontOrderId ? 1 : 0;
                    if (aFront !== bFront) return bFront - aFront;
                }
                const severity = { critical: 3, warn: 2, normal: 1 };
                if (a.maxUrgency !== b.maxUrgency) return severity[b.maxUrgency] - severity[a.maxUrgency];
                
                if (b.priority !== a.priority) return b.priority - a.priority;
                if (a.deadline && b.deadline) {
                    const dtA = new Date(a.deadline).getTime();
                    const dtB = new Date(b.deadline).getTime();
                    if (dtA !== dtB) return dtA - dtB;
                }
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            });
    })();

    async function handleBatchAction(action: "start" | "complete", panesToProcess: Pane[]) {
        if (!stationId || panesToProcess.length === 0) return;
        setBatchLoading(true);
        setScanError(null);
        try {
            const eligible = panesToProcess.filter((p) => !isPaneRetiredByMerge(p));
            if (eligible.length === 0) {
                setScanError("ไม่มีแผ่นที่ใช้สแกนแบบกลุ่มได้ (รวมลามิเนตแล้วหรือถูกรวมเข้าแผ่นอื่น)");
                return;
            }
            const paneNumbers = eligible.map((p) => p.paneNumber);
            const res = await panesApi.batchScan({ paneNumbers, station: stationId, action });
            if (!res.success) throw new Error(res.message || "ดำเนินการแบบกลุ่มไม่สำเร็จ");
            setSelectedPanes(prev => {
                const n = new Set(prev);
                eligible.forEach((p) => n.delete(p._id));
                return n;
            });
            triggerRefresh();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการทำงานแบบกลุ่ม";
            setScanError(msg);
        } finally {
            setBatchLoading(false);
        }
    }

    function togglePaneSelection(id: string) {
        setSelectedPanes(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function selectAllInGroup(groupPanes: Pane[]) {
        const allSelected = groupPanes.every(p => selectedPanes.has(p._id));
        setSelectedPanes(prev => {
            const next = new Set(prev);
            if (allSelected) groupPanes.forEach(p => next.delete(p._id));
            else groupPanes.forEach(p => next.add(p._id));
            return next;
        });
    }

    async function handleScan(raw: string) {
        const trimmed = raw.trim();
        if (!trimmed) return;
        if (inputRef.current) inputRef.current.value = "";

        const parsed = parseQrScan(trimmed);
        const pn = parsed.type === "pane" ? parsed.value : trimmed.replace(/^STDPLUS:/i, "").trim();
        setScanError(null);

        if (!stationId) { setScanError("ไม่ระบุสถานี"); return; }

        const already = panes.find(p => p.paneNumber === pn || p.paneNumber.endsWith(pn));
        if (already) {
            const oid = extractOrderId(already);
            setCollapsed(prev => { const n = new Set(prev); n.delete(oid); return n; });
            setScanError(`"${pn}" อยู่ในคิวแล้ว`);
            return;
        }

        try {
            const lookupRes = await panesApi.getById(pn);
            if (lookupRes.success && lookupRes.data) {
                const active = resolveActivePane(lookupRes.data);
                const cs = active.currentStation;
                const paneStationStr = getStationName(cs);
                const isHere = !cs || isStationMatch(cs, stationId, stationName);
                if (!isHere) {
                    setMismatchInfo({ paneStation: paneStationStr, thisStation: stationName ?? "", paneNumber: pn });
                    return;
                }
            }
        } catch { /* ignore */ }

        await executeScanIn(pn);
    }

    async function executeScanIn(pn: string, force?: boolean) {
        const tempKey = `scan-${pn}`;
        setActionLoading(prev => ({ ...prev, [tempKey]: true }));
        try {
            const res = await withMergedIntoScanRetry(pn, async (paneNum) => {
                const r = await panesApi.scan(paneNum, {
                    station: stationId!,
                    action: "scan_in",
                    ...(force ? { force: true } : {}),
                });
                if (!r.success) throw new Error(r.message ?? "สแกนไม่สำเร็จ");
                return r;
            });
            const scannedPane = res.data.pane as Pane;
            pinQueueOrderToFront(extractOrderId(scannedPane));
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

    function handleMismatchDismiss() { setMismatchInfo(null); }
    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) { if (e.key === "Enter") handleScan(e.currentTarget.value); }

    async function doAction(pane: Pane, action: "start" | "complete") {
        if (!stationId) { setScanError("ไม่ระบุสถานี"); return; }
        setActionLoading(prev => ({ ...prev, [pane._id]: true }));
        setActionResult(prev => { const n = { ...prev }; delete n[pane._id]; return n; });
        try {
            const res = await withMergedIntoScanRetry(pane.paneNumber, async (paneNum) => {
                const r = await panesApi.scan(paneNum, { station: stationId, action });
                if (!r.success) throw new Error(r.message ?? "ดำเนินการไม่สำเร็จ");
                return r;
            });
            setPaneData(res.data.pane as unknown as Record<string, unknown>);
            if (action === "start") {
                setPhases(prev => ({ ...prev, [pane._id]: "started" }));
                setActionResult(prev => ({ ...prev, [pane._id]: "success" }));
                setTimeout(() => { setActionResult(prev => { const n = { ...prev }; delete n[pane._id]; return n; }); }, 1500);
            } else {
                guardedPanesRef.current.delete(pane._id);
                triggerRefresh();
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
            setActionResult(prev => ({ ...prev, [pane._id]: "error" }));
            setScanError(msg);
            setTimeout(() => { setActionResult(prev => { const n = { ...prev }; delete n[pane._id]; return n; }); }, 3000);
        } finally {
            setActionLoading(prev => { const n = { ...prev }; delete n[pane._id]; return n; });
        }
    }

    if (isPreview) {
        const isCutStation = Boolean(stationName && /ตัด|cut/i.test(stationName));
        const scanningCount = Object.values(actionLoading).filter(Boolean).length;

        return (
            <div className="w-full space-y-3">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <h3 className="text-sm font-bold text-foreground truncate">{title}</h3>
                            {panes.length > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                                    {panes.length} ชิ้น
                                </span>
                            )}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-400">
                                <Bell className="h-2.5 w-2.5" /> Urgency System Active
                            </span>
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

                    {isCutStation && (
                        <div className="flex p-0.5 rounded-xl bg-muted/40 border border-muted w-full sm:w-fit self-start">
                            <button
                                onClick={() => setViewMode("order")}
                                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    viewMode === "order"
                                        ? "bg-white dark:bg-slate-900 shadow-sm text-foreground border border-border"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <Package className="h-3.5 w-3.5" />
                                ตามออเดอร์
                            </button>
                            <button
                                onClick={() => setViewMode("cutting")}
                                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    viewMode === "cutting"
                                        ? "bg-white dark:bg-slate-900 shadow-sm text-foreground border border-border"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <Grid3X3 className="h-3.5 w-3.5" />
                                ตามรุ่นกระจก
                            </button>
                        </div>
                    )}
                </div>

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
                        <span className="sm:hidden text-xs font-medium text-white">สแกนด้วยกล้อง</span>
                    </button>
                </div>

                {scanError && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 px-3 py-2.5">
                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="flex-1 text-xs text-red-600 dark:text-red-400 font-medium whitespace-pre-line">{scanError}</p>
                        <button onClick={() => setScanError(null)} className="text-red-400 hover:text-red-500 shrink-0 transition-colors">
                            <XCircle className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}

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
                                const activeSheets = group.sheets.filter((s) => !isPaneRetiredByMerge(s));
                                const defaultSurvivorPn = activeSheets[0]?.paneNumber ?? "";
                                const survivorPnForGroup =
                                    laminateSurvivorChoice[pid] &&
                                    activeSheets.some((s) => s.paneNumber === laminateSurvivorChoice[pid])
                                        ? laminateSurvivorChoice[pid]
                                        : defaultSurvivorPn;
                                const showSurvivorPick = activeSheets.length > 1;
                                return (
                                    <div key={pid} className={`rounded-xl border overflow-hidden ${
                                        group.ready
                                            ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20"
                                            : "border-border bg-card"
                                    }`}>
                                        <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Layers className={`h-3.5 w-3.5 shrink-0 ${group.ready ? "text-emerald-500" : "text-muted-foreground"}`} />
                                                <span className="font-mono text-xs font-bold text-foreground truncate">{group.parent.paneNumber}</span>
                                            </div>
                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                                group.ready
                                                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                                                    : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                                            }`}>
                                                {group.sheetsPresent}/{group.sheetsTotal} แผ่น
                                            </span>
                                        </div>
                                        {showSurvivorPick ? (
                                            <p className="px-3 py-1.5 text-[10px] text-muted-foreground bg-violet-50/80 dark:bg-violet-950/20 border-b border-border/40">
                                                เลือกสติกเกอร์ที่จะใช้ต่อหลังประกบ (QR ที่ยังสแกนได้)
                                            </p>
                                        ) : null}
                                        <div className="border-t border-border/50 divide-y divide-border/30">
                                            {group.sheets.map(sheet => {
                                                const isHere = isStationMatch(sheet.currentStation, stationId, stationName) && sheet.currentStatus !== "completed";
                                                const isWorking = isHere && sheet.currentStatus === "in_progress";
                                                return (
                                                    <div key={sheet._id} className="flex items-center gap-2 px-3 py-2">
                                                        <span className={`h-2 w-2 rounded-full shrink-0 ${isWorking ? "bg-emerald-500" : isHere ? "bg-amber-400" : "bg-slate-300"}`} />
                                                        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                                            <span className="font-mono text-[11px] text-foreground">
                                                                {sheet.paneNumber}
                                                                {sheet.sheetLabel ? (
                                                                    <span className="text-muted-foreground font-normal ml-1">({sheet.sheetLabel})</span>
                                                                ) : null}
                                                            </span>
                                                            {showSurvivorPick && !isPaneRetiredByMerge(sheet) ? (
                                                                <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                                                                    <input
                                                                        type="radio"
                                                                        name={`lam-survivor-${pid}`}
                                                                        className="h-3.5 w-3.5 accent-violet-600"
                                                                        checked={survivorPnForGroup === sheet.paneNumber}
                                                                        onChange={() =>
                                                                            setLaminateSurvivorChoice((prev) => ({
                                                                                ...prev,
                                                                                [pid]: sheet.paneNumber,
                                                                            }))
                                                                        }
                                                                    />
                                                                    <span className="text-[10px] text-muted-foreground">คงสติกเกอร์นี้</span>
                                                                </label>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="p-2 bg-muted/20 border-t">
                                            {mResult === "success" ? (
                                                <div className="flex items-center justify-center gap-1.5 text-emerald-600 text-xs font-bold py-1.5"><CheckCircle2 className="h-4 w-4" />สำเร็จ</div>
                                            ) : (
                                                <button
                                                    onClick={() => handleMerge(pid, group)}
                                                    disabled={!group.ready || isMerging}
                                                    className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                                                        group.ready ? "bg-violet-600 hover:bg-violet-500 text-white" : "bg-muted text-muted-foreground grayscale"
                                                    }`}
                                                >
                                                    {isMerging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Merge className="h-3.5 w-3.5" />}
                                                    {group.ready ? "ประกบลามิเนต" : "รอแผ่นกระจกครบ"}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {loading && panes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-sm font-medium">กำลังโหลดคิว...</span>
                    </div>
                ) : (viewMode === "order" ? orderGroups : materialGroups).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 border-2 border-dashed border-muted rounded-2xl bg-muted/5">
                        <PackageOpen className="h-10 w-10 text-muted-foreground/30" />
                        <div className="text-center">
                            <p className="text-sm font-bold text-foreground">ยังไม่มีกระจกในคิว</p>
                            <p className="text-xs text-muted-foreground mt-1">สแกน QR เพื่อยืนยันเข้าสถานีเป็นรายการแรก</p>
                        </div>
                    </div>
                ) : viewMode === "order" ? (
                    <div className="space-y-3">
                        {orderGroups.map(({ orderId, label, panes: groupPanes, priority }) => {
                            const isExpanded = !collapsed.has(orderId);
                            const withdrawnCount = groupPanes.filter(p => p.withdrawal).length;
                            const urgencyCls = priority >= 3 
                                ? "border-red-500 dark:border-red-400 bg-red-50/80 dark:bg-red-950/30 shadow-red-200/50 dark:shadow-red-900/20 animate-pulse-subtle" 
                                : priority >= 2 
                                ? "border-amber-400 dark:border-amber-500/60 bg-amber-50/50 dark:bg-amber-900/10 shadow-amber-100/30"
                                : "border-border bg-card shadow-sm";
                            
                            return (
                                <div key={orderId} className={`rounded-xl border overflow-hidden transition-all duration-500 ${urgencyCls}`}>
                                    <button
                                        onClick={() => setCollapsed(prev => {
                                            const next = new Set(prev);
                                            if (next.has(orderId)) next.delete(orderId);
                                            else next.add(orderId);
                                            return next;
                                        })}
                                        className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                                    >
                                        <Package className="h-4 w-4 text-primary shrink-0" />
                                        <div className="flex flex-1 items-center gap-2 min-w-0">
                                            <span className="text-xs font-bold text-foreground truncate">ออเดอร์ {label}</span>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                                priority >= 3 ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400" :
                                                priority >= 2 ? "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400" :
                                                priority >= 1 ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" :
                                                "bg-slate-100 dark:bg-slate-200 text-slate-500 dark:text-slate-600"
                                            }`}>
                                                P{priority}
                                            </span>
                                        </div>
                                        {isCutStation && (
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${withdrawnCount === groupPanes.length ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
                                                เบิก {withdrawnCount}/{groupPanes.length}
                                            </span>
                                        )}
                                        <span className="text-[10px] text-muted-foreground font-medium shrink-0">{groupPanes.length} ชิ้น</span>
                                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                    </button>

                                    {isExpanded && (
                                        <div className="divide-y divide-border/40">
                                            {groupPanes.map(pane => {
                                                const phase = phases[pane._id] ?? "confirmed";
                                                const isLoading = actionLoading[pane._id];
                                                const result = actionResult[pane._id];

                                                return (
                                                    <div key={pane._id} className={`flex items-center gap-4 px-4 py-3 transition-colors border-b last:border-b-0 ${getUrgencyClass(getUrgencyLevel(pane))}`}>
                                                        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${phase === "started" ? "bg-blue-500 animate-pulse" : "bg-amber-400"}`} />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono text-xs font-bold text-foreground leading-none">{pane.paneNumber}</span>
                                                                {isCutStation && !pane.withdrawal && <span className="text-[9px] font-bold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 px-1 rounded">ยังไม่เบิก</span>}
                                                            </div>
                                                            <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                                                                <span>{pane.glassTypeLabel}</span>
                                                                <span className="font-medium opacity-60">{pane.dimensions?.width}×{pane.dimensions?.height}</span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 shrink-0">
                                                            {pane.qrCode && (
                                                                <button onClick={(e) => { e.stopPropagation(); setQrPane(pane); }} className="p-1.5 rounded-lg border hover:bg-muted text-muted-foreground">
                                                                    <QrCode className="h-3.5 w-3.5" />
                                                                </button>
                                                            )}

                                                            {result === "success" ? (
                                                                <div className="h-8 w-8 flex items-center justify-center text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div>
                                                            ) : result === "error" ? (
                                                                <div className="h-8 w-8 flex items-center justify-center text-red-500"><XCircle className="h-5 w-5" /></div>
                                                            ) : (
                                                                <button
                                                                    onClick={() => doAction(pane, phase === "started" ? "complete" : "start")}
                                                                    disabled={isLoading}
                                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale ${
                                                                        phase === "started" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-blue-600 hover:bg-blue-500"
                                                                    }`}
                                                                >
                                                                    {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : phase === "started" ? <CheckCheck className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                                                    <span>{phase === "started" ? "เสร็จ" : "เริ่ม"}</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {materialGroups.map((group) => {
                            const groupSelected = group.panes.filter(p => selectedPanes.has(p._id));
                            const isAllSelected = groupSelected.length === group.panes.length && group.panes.length > 0;
                            const isAnySelected = groupSelected.length > 0;
                            const totalAreaM2 = groupSelected.reduce((sum, p) => sum + (p.dimensions?.area ?? 0), 0) / 1_000_000;
                            const msWidth = Number(group.material?.specDetails?.width ?? 0) || 0;
                            const msLength = Number(group.material?.specDetails?.length ?? 0) || 0;
                            const msAreaM2 = (msWidth * msLength) / 1_000_000;
                            const efficiency = msAreaM2 > 0 ? (totalAreaM2 / msAreaM2) * 100 : 0;

                            return (
                                <div key={group.key} className="rounded-2xl border border-border bg-card overflow-hidden shadow-md">
                                    <div className="px-4 py-3 bg-muted/20 border-b flex items-center gap-3">
                                        <button 
                                            onClick={() => selectAllInGroup(group.panes)}
                                            className={`h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${
                                                isAllSelected ? "bg-primary border-primary text-white" : isAnySelected ? "bg-primary/20 border-primary text-primary" : "bg-background border-muted-foreground/30"
                                            }`}
                                        >
                                            {isAllSelected && <CheckCheck className="h-3.5 w-3.5" />}
                                            {!isAllSelected && isAnySelected && <div className="h-2 w-2 rounded-sm bg-primary" />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-bold text-foreground truncate">{group.label}</h4>
                                            <p className="text-[10px] text-muted-foreground font-medium">{group.panes.length} ชิ้นในระบบ</p>
                                        </div>
                                        {isAnySelected && (
                                            <button 
                                                onClick={() => handleBatchAction("complete", groupSelected)}
                                                disabled={batchLoading}
                                                className="px-4 py-2 flex items-center  rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50"
                                            >
                                                {batchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                                                <span className="ml-2">สำเร็จ {groupSelected.length} ชิ้น</span>
                                            </button>
                                        )}
                                    </div>

                                    {isAnySelected && msAreaM2 > 0 && (
                                        <div className="px-4 py-3 bg-blue-50/50 dark:bg-blue-900/10 border-b border-blue-100/50">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                                                    <Maximize className="h-3.5 w-3.5" />
                                                    <span className="text-[10px] font-bold">ความคุ้มค่าพื้นผิว</span>
                                                </div>
                                                <span className={`text-[11px] font-bold ${efficiency > 90 ? "text-emerald-600" : "text-blue-600"}`}>{efficiency.toFixed(1)}%</span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.min(100, efficiency)}%` }} />
                                            </div>
                                            <div className="flex justify-between mt-1 text-[9px] text-muted-foreground font-medium">
                                                <span>งานรวม: {totalAreaM2.toFixed(3)} m²</span>
                                                <span>แผ่นมาตราฐาน: {msAreaM2.toFixed(3)} m² ({msWidth}×{msLength})</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="divide-y divide-border/40 max-h-[400px] overflow-y-auto">
                                        {group.panes.map(pane => {
                                            const isSelected = selectedPanes.has(pane._id);
                                            const phase = phases[pane._id] ?? "confirmed";
                                            return (
                                                <div 
                                                    key={pane._id}
                                                    onClick={() => togglePaneSelection(pane._id)}
                                                    className={`flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer border-b last:border-b-0 ${isSelected ? "bg-primary/10 dark:bg-primary/20 ring-1 ring-inset ring-primary/20" : getUrgencyClass(getUrgencyLevel(pane))}`}
                                                >
                                                    <div className={`h-4 w-4 rounded border transition-all flex items-center justify-center ${isSelected ? "bg-primary border-primary text-white" : "border-muted-foreground/30"}`}>
                                                        {isSelected && <CheckCheck className="h-2.5 w-2.5" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-xs font-bold text-foreground">{pane.paneNumber}</span>
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold">ORD: {extractOrderLabel(pane)}</span>
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                                                            {pane.dimensions?.width}×{pane.dimensions?.height} mm · Area: {((pane.dimensions?.area ?? 0) / 1_000_000).toFixed(4)} m²
                                                        </div>
                                                    </div>
                                                    <div className="shrink-0 flex items-center gap-2">
                                                        <span className={`h-2 w-2 rounded-full ${phase === "started" ? "bg-blue-500 animate-pulse" : "bg-amber-400"}`} />
                                                        <span className="text-[10px] font-bold text-muted-foreground">{phase === "started" ? "เริ่มแล้ว" : "รอตัด"}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Modals */}
                {showCamera && (
                    <CameraScanModal
                        onScan={(raw) => { setShowCamera(false); handleScan(raw); }}
                        onClose={() => setShowCamera(false)}
                    />
                )}

                {qrPane && (
                    <QrCodeModal
                        code={qrPane.paneNumber}
                        value={qrPane.qrCode}
                        label={`กระจก ${qrPane.paneNumber}`}
                        onClose={() => setQrPane(null)}
                    />
                )}

                {mismatchInfo && (
                    <Dialog open onOpenChange={(open) => { if (!open) handleMismatchDismiss(); }}>
                        <DialogContent showCloseButton={false} className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-amber-600"><AlertTriangle className="h-5 w-5" />สถานีไม่ตรงกัน</DialogTitle>
                                <DialogDescription className="pt-2">
                                    Glass Pane นี้อยู่ที่สถานี &ldquo;{mismatchInfo.paneStation}&rdquo; แต่คุณกำลังสแกนที่ &ldquo;{mismatchInfo.thisStation}&rdquo;
                                    <span className="block mt-2 font-bold text-amber-700">ต้องการดำเนินการต่อหรือไม่?</span>
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter className="gap-2 sm:gap-0">
                                <Button variant="outline" onClick={handleMismatchDismiss}>ยกเลิก</Button>
                                <Button onClick={handleMismatchConfirm} className="bg-amber-600 hover:bg-amber-500 text-white">ยืนยันดำเนินการ</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </div>
        );
    }

    // ── Designer View (Craft.js) ──────────────────────────────────────────────
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

            <p className="text-[11px] font-bold text-foreground mb-2">คิวสถานี ({panes.length})</p>

            {/* Skeleton order groups */}
            <div className="space-y-2 opacity-50 pointer-events-none">
                <div className="rounded-xl border border-muted overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b border-muted">
                        <Package className="h-3.5 w-3.5 text-muted-foreground/60" />
                        <span className="text-[11px] font-bold text-muted-foreground">Preview Queue</span>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50 ml-auto" />
                    </div>
                    <div className="p-4 flex flex-col items-center justify-center gap-2">
                        <Box className="h-8 w-8 text-muted-foreground/20" />
                        <span className="text-[10px] text-muted-foreground">ระบบจำลองการทำงานจริง</span>
                    </div>
                </div>
            </div>

            <p className="text-[10px] text-emerald-500 dark:text-emerald-400 mt-2">
                🏭 คิวกระจกแบ่งตามออเดอร์ · realtime · scan_in → เริ่ม → เสร็จสิ้น
            </p>
        </div>
    );
}

StationQueueBlock.craft = {
    displayName: "Station Queue",
    props: {
        title: "คิวสถานีนี้",
    } as StationQueueBlockProps,
};
