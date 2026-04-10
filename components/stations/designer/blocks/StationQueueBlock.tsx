"use client";

import { useNode } from "@craftjs/core";
import { useCallback, useEffect, useRef, useState, KeyboardEvent } from "react";
import { 
    RotateCcw, Camera, ScanBarcode, QrCode, XCircle, CheckCircle2, AlertTriangle, 
    ChevronDown, ChevronRight, Package, Grid3X3, PackageOpen, Loader2, MapPin, 
    Layers, Merge, Bell, CheckCheck, Play, Maximize, Box, ListChecks, Database,
    PackageCheck, Package2, AlertCircle
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
    const hiddenPanesRef = useRef<Set<string>>(new Set());

    const [panes,         setPanes]         = useState<Pane[]>([]);
    const [loading,       setLoading]       = useState(false);
    const [phases,        setPhases]        = useState<Record<string, PanePhase>>({});
    const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
    const [actionResult,  setActionResult]  = useState<Record<string, "success" | "error">>({});
    const [scanError,     setScanError]     = useState<string | null>(null);
    const [showCamera,    setShowCamera]    = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [showAllOrders, setShowAllOrders] = useState<Set<string>>(new Set());

    // Persistence for expanded state
    useEffect(() => {
        if (!stationId) return;
        const key = `std_queue_expanded_${stationId}`;
        const saved = localStorage.getItem(key);
        if (saved) {
            try { setExpanded(new Set(JSON.parse(saved))); } catch (e) { console.error(e); }
        }
    }, [stationId]);

    useEffect(() => {
        if (!stationId) return;
        const key = `std_queue_expanded_${stationId}`;
        localStorage.setItem(key, JSON.stringify(Array.from(expanded)));
    }, [expanded, stationId]);
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
                !hiddenPanesRef.current.has(p._id) &&
                isStationMatch(p.currentStation, stationId, stationName) && 
                (p.currentStatus === "in_progress" || p.currentStatus === "pending" || p.currentStatus === "awaiting_scan_out"),
            );

            // Reconcile guarded panes with actual data
            for (const [id, guardedPane] of guardedPanesRef.current.entries()) {
                // Find if this pane exists in the FRESH server response (even if filtered out above)
                const freshData = res.data.find(p => p._id === id);
                
                if (freshData) {
                    const isStillHere = isStationMatch(freshData.currentStation, stationId, stationName) && 
                                      (freshData.currentStatus === "in_progress" || freshData.currentStatus === "pending" || freshData.currentStatus === "awaiting_scan_out");
                    
                    if (!isStillHere) {
                        // Server explicitly says it's gone or finished (e.g. ready/completed/claimed) -> delete from guard
                        guardedPanesRef.current.delete(id);
                    } else {
                        // Update guard with fresh data
                        guardedPanesRef.current.set(id, freshData);
                    }
                } else {
                    // IF THE FETCH WAS SUCCESSFUL but the pane IS NOT FOUND in the result set,
                    // we assume it has moved to another station or reached a terminal state (ready/completed).
                    // This allows the sidebar to clear instantly after a successful PASS/FAIL.
                    guardedPanesRef.current.delete(id);
                }
            }

            const merged = [...atStation];
            for (const [id, guardedPane] of guardedPanesRef.current.entries()) {
                if (!atStation.some(p => p._id === id)) {
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
    }, { debounceMs: 500 });

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
    }, { debounceMs: 500 });

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
                    station: stationId!,
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
            p.currentStatus === "in_progress"
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
            
            const thicknessRaw = p.dimensions?.thickness || matObj?.specDetails?.thickness || 0;
            const thickness = typeof thicknessRaw === 'number' ? thicknessRaw : parseFloat(thicknessRaw) || 0;
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

        const allGroups = [...map.entries()]
            .map(([orderId, v]) => {
                const maxLevel = v.panes.reduce((max, p) => {
                    const level = getUrgencyLevel(p);
                    if (level === "critical") return "critical";
                    if (level === "warn" && max !== "critical") return "warn";
                    return max;
                }, "normal" as "critical" | "warn" | "normal");

                const withdrawnCount = v.panes.filter(p => !!p.withdrawal).length;
                const hasStartedPane = v.panes.some(p => phases[p._id] === "started");
                const isPinned = orderId === queueFrontOrderId;

                return { 
                    orderId, 
                    label: v.label, 
                    panes: v.panes, 
                    priority: v.priority, 
                    createdAt: v.createdAt, 
                    deadline: v.deadline, 
                    maxUrgency: maxLevel,
                    withdrawnCount,
                    totalCount: v.panes.length,
                    isActive: hasStartedPane || maxLevel === "critical" || isPinned
                };
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

        return {
            activeGroups: allGroups.filter(g => g.isActive),
            pendingGroups: allGroups.filter(g => !g.isActive)
        };
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

            if (action === "complete") {
                const completedIds = new Set(eligible.map(p => p._id));
                // Add to hidden guard
                eligible.forEach(p => hiddenPanesRef.current.add(p._id));
                setTimeout(() => {
                    eligible.forEach(p => hiddenPanesRef.current.delete(p._id));
                }, 10_000);

                // Optimistic UI updates
                setPanes(prev => prev.filter(p => !completedIds.has(p._id)));
                setPhases(prev => {
                    const next = { ...prev };
                    completedIds.forEach(id => delete next[id]);
                    return next;
                });
            } else if (action === "start") {
                setPhases(prev => {
                    const next = { ...prev };
                    eligible.forEach(p => { next[p._id] = "started"; });
                    return next;
                });
            }

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
            setExpanded(prev => { const n = new Set(prev); n.add(oid); return n; });
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
                // Add to hidden guard to prevent flickering during refetch
                hiddenPanesRef.current.add(pane._id);
                setTimeout(() => { hiddenPanesRef.current.delete(pane._id); }, 10_000);

                // Optimistic UI update: Remove from local state immediately
                setPanes(prev => prev.filter(p => p._id !== pane._id));
                setPhases(prev => {
                    const next = { ...prev };
                    delete next[pane._id];
                    return next;
                });
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
                                        <div className="px-3 py-2 bg-muted/20 flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <Merge className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-[10px] text-muted-foreground italic">รวมกระจกเข้าด้วยกัน</span>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant={group.ready ? "default" : "outline"}
                                                disabled={!group.ready || isMerging}
                                                onClick={() => handleMerge(pid, group)}
                                                className={`h-8 px-4 rounded-lg font-bold transition-all ${
                                                    group.ready && !isMerging
                                                        ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                                                        : ""
                                                }`}
                                            >
                                                {isMerging ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                                ) : mResult === "success" ? (
                                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                                ) : (
                                                    <Merge className="h-3.5 w-3.5 mr-1.5" />
                                                )}
                                                {isMerging ? "กำลังรวม..." : mResult === "success" ? "สำเร็จ" : "รวมแผ่น"}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    {/* View: Cutting (Material Groups) */}
                    {isCutStation && viewMode === "cutting" ? (
                        materialGroups.length === 0 ? (
                            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground space-y-2 border-2 border-dashed rounded-2xl bg-muted/10">
                                <Box className="h-8 w-8 opacity-20" />
                                <p className="text-sm">ไม่มีงานรอตัดในคิว</p>
                            </div>
                        ) : (
                            materialGroups.map(group => {
                                const gSelected = group.panes.every(p => selectedPanes.has(p._id));
                                const someSelected = group.panes.some(p => selectedPanes.has(p._id));
                                return (
                                    <div key={group.key} className={`rounded-2xl border overflow-hidden transition-all ${getUrgencyClass(group.maxUrgency)}`}>
                                        <div className="px-4 py-3 border-b flex items-center justify-between gap-3 bg-muted/5">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <button 
                                                    onClick={() => selectAllInGroup(group.panes)}
                                                    className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                        gSelected ? "bg-primary border-primary" : someSelected ? "bg-primary/20 border-primary" : "border-muted-foreground/30 hover:border-primary/50"
                                                    }`}
                                                >
                                                    {gSelected && <CheckCheck className="h-3.5 w-3.5 text-primary-foreground font-bold" />}
                                                    {!gSelected && someSelected && <div className="h-1.5 w-1.5 bg-primary rounded-sm" />}
                                                </button>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="font-bold text-sm truncate">{group.label}</span>
                                                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">{group.panes.length} ชิ้น</span>
                                                </div>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => handleBatchAction("complete", group.panes.filter(p => selectedPanes.has(p._id)))}
                                                disabled={!someSelected || batchLoading}
                                                className="h-8 px-3 rounded-lg font-bold"
                                            >
                                                {batchLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCheck className="h-3.5 w-3.5 mr-1.5" />}
                                                ทำเสร็จที่เลือก
                                            </Button>
                                        </div>
                                        <div className="divide-y divide-border/40">
                                            {group.panes.map(pane => {
                                                const isSel = selectedPanes.has(pane._id);
                                                const urg = getUrgencyLevel(pane);
                                                return (
                                                    <div 
                                                        key={pane._id}
                                                        onClick={() => togglePaneSelection(pane._id)}
                                                        className={`group flex items-center justify-between gap-4 px-4 py-3 cursor-pointer transition-all hover:bg-muted/10 ${isSel ? "bg-primary/[0.03]" : ""}`}
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                                                                isSel ? "bg-primary border-primary" : "border-muted-foreground/20 group-hover:border-primary/40"
                                                            }`}>
                                                                {isSel && <CheckCheck className="h-2.5 w-2.5 text-primary-foreground font-bold" />}
                                                            </div>
                                                            <div className="flex flex-col min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono text-[13px] font-bold text-foreground">{pane.paneNumber}</span>
                                                                    {urg === "critical" && (
                                                                        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" title="งานด่วน P3" />
                                                                    )}
                                                                </div>
                                                                <span className="text-[11px] text-muted-foreground">
                                                                    {pane.dimensions?.width} × {pane.dimensions?.height} mm
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3 shrink-0">
                                                            {!pane.withdrawal && (
                                                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 font-bold text-[9px] border border-amber-500/20">
                                                                    <AlertCircle className="h-3 w-3" />
                                                                    ยังไม่เบิก
                                                                </span>
                                                            )}
                                                            {pane.withdrawal && (
                                                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 font-bold text-[9px] border border-emerald-500/20">
                                                                    <PackageCheck className="h-3 w-3" />
                                                                    เบิกแล้ว
                                                                </span>
                                                            )}
                                                             <div className="text-right flex flex-col items-end">
                                                                <span className="text-[10px] font-bold text-foreground">
                                                                    ออเดอร์: {extractOrderLabel(pane)}
                                                                </span>
                                                                {pane.withdrawal && typeof pane.withdrawal === "object" && pane.withdrawal.stockType && (
                                                                    <span className="text-[9px] text-muted-foreground">
                                                                        จาก: {pane.withdrawal.stockType === "Raw" ? "วัตถุดิบ" : "นำกลับมาใช้"}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setQrPane(pane); }}
                                                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                                            >
                                                                <QrCode className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })
                        )
                    ) : (
                        /* View: Order (Standard Mode) */
                        (() => {
                            const { activeGroups, pendingGroups } = orderGroups;
                            if (activeGroups.length === 0 && pendingGroups.length === 0) {
                                return (
                                    <div className="py-16 flex flex-col items-center justify-center text-muted-foreground space-y-3 border-2 border-dashed rounded-3xl bg-muted/5 transition-all hover:bg-muted/10">
                                        <PackageOpen className="h-10 w-10 opacity-20" />
                                        <div className="text-center">
                                            <p className="text-sm font-bold">ไม่มีงานค้างที่สถานีนี้</p>
                                            <p className="text-[11px] opacity-60">สแกนรหัสกระจกด้านบนเพื่อจัดคิวทำงาน</p>
                                        </div>
                                    </div>
                                );
                            }

                            const renderOrderCard = (group: any, isCompact = false) => {
                                const isExpanded = expanded.has(group.orderId);
                                const isShowAll = showAllOrders.has(group.orderId);
                                const urgCls = getUrgencyClass(group.maxUrgency);
                                const PANE_LIMIT = 5;
                                const hasMore = group.panes.length > PANE_LIMIT;
                                const displayedPanes = isShowAll ? group.panes : group.panes.slice(0, PANE_LIMIT);

                                return (
                                    <div key={group.orderId} className={`rounded-2xl border transition-all overflow-hidden ${urgCls} ${!isExpanded ? "shadow-none" : "shadow-sm shadow-black/5"} ${isExpanded && isCompact ? "md:col-span-2 lg:col-span-3 xl:col-span-4" : ""}`}>
                                        <div 
                                            className={`${isCompact ? "px-3 py-2.5" : "px-4 py-3"} flex items-center justify-between gap-3 cursor-pointer group`}
                                            onClick={() => setExpanded(prev => {
                                                const n = new Set(prev);
                                                if (n.has(group.orderId)) n.delete(group.orderId);
                                                else n.add(group.orderId);
                                                return n;
                                            })}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className={`${isCompact ? "h-7 w-7" : "h-8 w-8"} rounded-xl bg-muted/40 flex items-center justify-center transition-colors group-hover:bg-muted/60`}>
                                                    <Package className={`${isCompact ? "h-3.5 w-3.5" : "h-4 w-4"} ${group.maxUrgency === "critical" ? "text-red-500 animate-pulse" : "text-muted-foreground"}`} />
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className={`font-bold tracking-tight truncate ${isCompact ? "text-[13px]" : "text-sm"}`}>ออเดอร์ {group.label}</h4>
                                                        {group.priority >= 3 && (
                                                            <span className="px-1.5 py-0.5 rounded-lg bg-red-500 text-white text-[9px] font-black uppercase tracking-tighter shadow-sm animate-pulse">URGENT</span>
                                                        )}
                                                    </div>
                                                    <div className={`flex items-center gap-x-2 gap-y-1 flex-wrap font-medium text-muted-foreground ${isCompact ? "text-[9px]" : "text-[10px]"}`}>
                                                        <span className="font-bold text-foreground/40">{group.panes.length} ชิ้น</span>
                                                        {group.withdrawnCount === group.totalCount ? (
                                                            <span className="flex items-center gap-1 text-emerald-600">
                                                                <PackageCheck className="h-2.5 w-2.5" />
                                                                {isCompact ? "ครบ" : "เบิกครบ"}
                                                            </span>
                                                        ) : (
                                                            <span className="flex items-center gap-1 text-amber-600">
                                                                {group.withdrawnCount}/{group.totalCount}
                                                            </span>
                                                        )}
                                                        {group.deadline && (
                                                            <span className="flex items-center gap-1">
                                                                <AlertTriangle className={`h-2.5 w-2.5 ${group.maxUrgency === "critical" ? "text-red-500" : "text-amber-500"}`} />
                                                                {new Date(group.deadline).toLocaleDateString("th-TH", { day: 'numeric', month: 'short' })}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`p-1.5 rounded-full transition-all ${!isExpanded ? "" : "bg-muted shadow-inner rotate-180"}`}>
                                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="divide-y divide-border/30 border-t border-border/40 bg-background">
                                                {displayedPanes.map((pane: any) => {
                                                    const phase = phases[pane._id] || "confirmed";
                                                    const isLoading = actionLoading[pane._id];
                                                    const res = actionResult[pane._id];
                                                    const urg = getUrgencyLevel(pane);

                                                    return (
                                                        <div key={pane._id} className="group/item flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-muted/[0.03] transition-colors">
                                                            <div className="flex items-center gap-4 min-w-0">
                                                                <div className="relative">
                                                                    <div className={`h-10 w-10 flex items-center justify-center rounded-xl bg-background border transition-all ${phase === 'started' ? 'border-primary ring-4 ring-primary/5 bg-primary/5' : 'border-border/60 group-hover/item:border-border'}`}>
                                                                        {phase === 'started' ? <Play className="h-4 w-4 text-primary fill-primary/10" /> : <ListChecks className="h-4 w-4 text-muted-foreground/40" />}
                                                                    </div>
                                                                    <div className={`absolute -bottom-1 -left-1 h-4 w-4 flex items-center justify-center rounded-full border-2 border-white dark:border-slate-800 shadow-sm ${pane.withdrawal ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} title={pane.withdrawal ? "เบิกวัสดุแล้ว" : "ยังไม่ได้เบิกวัสดุ"}>
                                                                        {pane.withdrawal ? (
                                                                            <PackageCheck className="h-2 w-2 text-white" />
                                                                        ) : (
                                                                            <PackageOpen className="h-2 w-2 text-slate-400 dark:text-slate-500" />
                                                                        )}
                                                                    </div>
                                                                    {urg === "critical" && (
                                                                        <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 border-2 border-white dark:border-slate-800" />
                                                                    )}
                                                                </div>
                                                                <div className="flex flex-col min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-mono text-sm font-black text-foreground">{pane.paneNumber}</span>
                                                                        {pane.laminateRole === "parent" && (
                                                                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-violet-600/10 text-violet-600 border border-violet-600/20 uppercase tracking-tighter">LAM</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
                                                                        <span>{pane.dimensions?.width}×{pane.dimensions?.height}</span>
                                                                        {pane.dimensions?.thickness && (
                                                                            <span className="opacity-40">({pane.dimensions.thickness}mm)</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <button
                                                                    onClick={() => setQrPane(pane)}
                                                                    className="p-2 rounded-xl text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-all"
                                                                    title="ดู QR"
                                                                >
                                                                    <QrCode className="h-4 w-4" />
                                                                </button>
                                                                
                                                                {phase === "confirmed" ? (
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => doAction(pane, "start")}
                                                                        disabled={isLoading}
                                                                        className="h-9 px-4 rounded-xl font-bold bg-secondary hover:bg-secondary/80 text-foreground shadow-sm"
                                                                    >
                                                                        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span>เริ่มผลิต</span>}
                                                                    </Button>
                                                                ) : (
                                                                    <div className="flex items-center gap-1 bg-primary/5 rounded-xl p-1 border border-primary/10">
                                                                        <Button
                                                                            size="sm"
                                                                            onClick={() => doAction(pane, "complete")}
                                                                            disabled={isLoading}
                                                                            className={`h-7 px-3 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all shadow-sm ${
                                                                                res === "success" 
                                                                                    ? "bg-emerald-500 hover:bg-emerald-500 text-white" 
                                                                                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                                                                            }`}
                                                                        >
                                                                            {isLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : res === "success" ? <CheckCheck className="h-3 w-3 mr-1.5" /> : null}
                                                                            ทำเสร็จ
                                                                        </Button>
                                                                        <button
                                                                            onClick={() => setPhases(prev => ({ ...prev, [pane._id]: "confirmed" }))}
                                                                            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-primary/10 transition-colors text-primary/40 hover:text-primary"
                                                                            title="ย้อนกลับ"
                                                                        >
                                                                            <RotateCcw className="h-3 w-3" />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                {hasMore && (
                                                    <div className="p-2 bg-muted/5 flex justify-center border-t border-border/20">
                                                        <Button
                                                            variant="ghost" 
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setShowAllOrders(prev => {
                                                                    const n = new Set(prev);
                                                                    if (n.has(group.orderId)) n.delete(group.orderId);
                                                                    else n.add(group.orderId);
                                                                    return n;
                                                                });
                                                            }}
                                                            className="text-[10px] font-bold h-7 hover:bg-muted transition-all text-primary/70 hover:text-primary"
                                                        >
                                                            {isShowAll ? (
                                                                <>แสดงน้อยลง</>
                                                            ) : (
                                                                <>แสดงอีก {group.panes.length - PANE_LIMIT} รายการ...</>
                                                            )}
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            };

                            return (
                                <div className="space-y-8 pb-10">
                                    {activeGroups.length > 0 && (
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 px-2">
                                                <div className="h-5 w-1 bg-primary rounded-full" />
                                                <h3 className="text-sm font-black uppercase tracking-widest text-foreground">งานในมือและงานด่วน ({activeGroups.length})</h3>
                                            </div>
                                            <div className="space-y-4">
                                                {activeGroups.map(group => renderOrderCard(group, false))}
                                            </div>
                                        </div>
                                    )}

                                    {pendingGroups.length > 0 && (
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 px-2">
                                                <div className="h-5 w-1 bg-muted-foreground/30 rounded-full" />
                                                <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">คิวงานถัดไป ({pendingGroups.length})</h3>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                                {pendingGroups.map(group => renderOrderCard(group, true))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()
                    )}
                </div>

                {showCamera && (
                    <CameraScanModal
                        onScan={(raw) => { handleScan(raw); setShowCamera(false); }}
                        onClose={() => setShowCamera(false)}
                    />
                )}
                {qrPane && (
                    <QrCodeModal 
                        code={qrPane.paneNumber}
                        label={`${qrPane.glassTypeLabel ?? ''} ${qrPane.dimensions?.width ?? ''}×${qrPane.dimensions?.height ?? ''}`.trim()}
                        value={qrPane.qrCode || `STDPLUS:${qrPane.paneNumber}`}
                        onClose={() => setQrPane(null)}
                    />
                )}

                <Dialog open={!!mismatchInfo} onOpenChange={(open) => !open && handleMismatchDismiss()}>
                    <DialogContent className="max-w-xs sm:max-w-sm rounded-3xl p-6">
                        <DialogHeader>
                            <div className="h-14 w-14 rounded-2xl bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
                            </div>
                            <DialogTitle className="text-center font-black text-xl tracking-tight">สถานีไม่ตรงกัน</DialogTitle>
                            <div className="space-y-4 pt-4">
                                <div className="p-4 rounded-2xl bg-muted/40 border border-muted flex flex-col items-center gap-1">
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">กระจกหมายเลข</span>
                                    <span className="font-mono text-lg font-black">{mismatchInfo?.paneNumber}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3 pb-2">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[9px] font-bold text-muted-foreground uppercase opacity-60">สถานีปัจจุบัน</span>
                                        <span className="text-sm font-bold truncate text-foreground">{mismatchInfo?.paneStation || "ไม่ระบุ"}</span>
                                    </div>
                                    <div className="flex flex-col gap-1 border-l pl-3 border-border/50">
                                        <span className="text-[9px] font-bold text-muted-foreground uppercase opacity-60">สถานีนี้</span>
                                        <span className="text-sm font-bold truncate text-primary">{mismatchInfo?.thisStation}</span>
                                    </div>
                                </div>
                                <DialogDescription className="text-center text-xs leading-relaxed font-medium">
                                    กระจกชิ้นนี้ถูกกำหนดให้หยุดที่อื่น แต่คุณกำลังสแกนเข้าสถานีนี้ ต้องการบังคับดึงงานมาที่สถานีนี้หรือไม่?
                                </DialogDescription>
                            </div>
                        </DialogHeader>
                        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-2">
                            <Button variant="outline" onClick={handleMismatchDismiss} className="w-full rounded-xl border-2 font-bold h-11">ยกเลิก</Button>
                            <Button onClick={handleMismatchConfirm} className="w-full rounded-xl font-bold h-11 bg-amber-600 hover:bg-amber-700 text-white border-0 shadow-lg shadow-amber-600/20 underline decoration-white/20">ดึงเข้าสถานีนี้</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        );
    }

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-xl border-2 sm:border-3 p-4 border-dashed transition-all
                ${selected ? "border-primary bg-primary/5 ring-4 ring-primary/10 scale-[0.99]" : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"}`}
        >
            <div className="flex items-center gap-2 mb-3">
                <Grid3X3 className="h-4 w-4 text-primary opacity-60" />
                <p className="text-xs font-black uppercase tracking-widest text-foreground/40">{title}</p>
            </div>
            
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed rounded-3xl bg-muted/5 opacity-50">
                <ScanBarcode className="h-10 w-10 text-muted-foreground/30" />
                <div>
                    <p className="text-sm font-bold text-foreground/40">Queue Interaction Block</p>
                    <p className="text-[11px] text-muted-foreground/50 max-w-[200px] mx-auto mt-1">แสดงรายการงานที่แสกนเข้าสถานี และปุ่มเริ่มผลิต/ทำเสร็จ (สแตติกในโหมดออกแบบ)</p>
                </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-dashed border-border/40 flex items-center justify-between">
                <span className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-tighter">Production Station Logic</span>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[9px] font-black text-slate-400">
                    <Database className="h-2.5 w-2.5" /> LIVE CONNECTED
                </span>
            </div>
        </div>
    );
}

StationQueueBlock.craft = {
    displayName: "Station Queue",
    props: {
        title: "คิวสถานีนี้",
    },
};
