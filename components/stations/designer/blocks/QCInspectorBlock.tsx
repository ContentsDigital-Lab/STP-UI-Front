"use client";

import { useNode } from "@craftjs/core";
import { useState, useEffect, useMemo } from "react";
import { 
    ShieldCheck, 
    CheckCircle2, 
    XCircle, 
    AlertTriangle, 
    ClipboardCheck, 
    Loader2, 
    RefreshCcw,
    ChevronDown,
    AlertOctagon,
    PackagePlus,
    Plus,
    Search
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { panesApi } from "@/lib/api/panes";
import { useStationContext } from "../StationContext";
import { usePreview } from "../PreviewContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

// ── Types & Constants ─────────────────────────────────────────────────────────

const DEFECT_REASONS = [
    { value: "broken",           label: "แตก / หัก",        icon: <AlertOctagon className="h-4 w-4 text-red-500" /> },
    { value: "chipped",          label: "บิ่น / บิ่นขอบ",    icon: <AlertTriangle className="h-4 w-4 text-orange-500" /> },
    { value: "dimension_wrong",  label: "ขนาดไม่ถูกต้อง",   icon: <RefreshCcw className="h-4 w-4 text-blue-500" /> },
    { value: "scratch",          label: "รอยขีดข่วน / ฟอง",  icon: <AlertTriangle className="h-4 w-4 text-amber-500" /> },
    { value: "stain",            label: "คราบ / กาว",       icon: <AlertTriangle className="h-4 w-4 text-yellow-500" /> },
    { value: "other",            label: "อื่น ๆ",           icon: <AlertCircle className="h-4 w-4 text-slate-500" /> },
];

const DEFAULT_CHECKLIST = [
    "ตรวจสอบขนาด (กว้าง x สูง)",
    "ตรวจสอบความหนา",
    "ตรวจสอบรอยขีดข่วนและฟองอากาศ",
    "ตรวจสอบความใส/ความแกร่ง",
    "ตรวจสอบการเจียรขอบ",
];

interface QCInspectorProps {
    title?: string;
    checklistJson?: string;
    showDescription?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QCInspectorBlock({
    title = "ตรวจสอบคุณภาพ (QC)",
    checklistJson = JSON.stringify(DEFAULT_CHECKLIST),
    showDescription = true,
}: QCInspectorProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const { paneData, paneId, orderId, stationId, stationName, refreshCounter, triggerRefresh, setPaneData } = useStationContext();

    const [checklist, setChecklist] = useState<Record<string, boolean>>({});
    const [status, setStatus] = useState<"idle" | "passing" | "failing">("idle");
    const [reason, setReason] = useState("");
    const [description, setDescription] = useState("");
    const [isFailMode, setIsFailMode] = useState(false);
    const [customChecklist, setCustomChecklist] = useState<string[]>([]);
    const [newItemText, setNewItemText] = useState("");

    // Panes from order (if scanned order instead of pane)
    const [panes, setPanes] = useState<any[]>([]);
    const [loadingPanes, setLoadingPanes] = useState(false);
    const [errorFetch, setErrorFetch] = useState<string | null>(null);

    const baseChecklist: string[] = (() => {
        try { return JSON.parse(checklistJson); } catch { return DEFAULT_CHECKLIST; }
    })();

    const checklistItems = [...baseChecklist, ...customChecklist];

    // Reset state when pane changes
    useEffect(() => {
        setChecklist({});
        setReason("");
        setDescription("");
        setIsFailMode(false);
        setStatus("idle");
        setCustomChecklist([]);
        setNewItemText("");
    }, [paneId]);

    // Fetch panes if order is scanned but no pane is selected
    useEffect(() => {
        const targetOrderId = 
            (paneData as any)?.order?._id || 
            (paneData as any)?.order || 
            (paneData as any)?.orderId || 
            orderId;
        
        // If we have an order but no active pane, or if we want the grid to be ready
        if (targetOrderId && !paneData) {
            setLoadingPanes(true);
            setErrorFetch(null);
            // Fetch panes that are NOT claimed (still in production)
            panesApi.getAll({ 
                order: String(targetOrderId), 
                status_ne: "claimed", 
                limit: 100,
                sort: "paneNumber" 
            })
                .then(res => {
                    const fetched = res.success ? res.data ?? [] : [];
                    setPanes(fetched);
                })
                .catch((err) => {
                    console.error("QC: Failed to fetch panes", err);
                    setErrorFetch("ไม่สามารถโหลดข้อมูลได้");
                    setPanes([]);
                })
                .finally(() => setLoadingPanes(false));
        } else if (!targetOrderId && !paneData) {
            // Only clear panes if we have no order and no selected pane
            setPanes([]);
            setErrorFetch(null);
        }
    }, [paneData, orderId, refreshCounter]);

    const toggleCheck = (item: string) => {
        setChecklist(prev => ({ ...prev, [item]: !prev[item] }));
    };

    const filteredPanes = useMemo(() => {
        return panes.filter(p => {
            // Filter out panes that have reached terminal states for QC station
            // "ready": QC Pass
            // "cancelled": QC Fail (Remade)
            // "completed": Already completed in production
            const currentStatus = p.currentStatus;
            return currentStatus !== "ready" && currentStatus !== "cancelled" && currentStatus !== "completed";
        });
    }, [panes]);

    const addCustomItem = () => {
        const text = newItemText.trim();
        if (!text) return;
        if (checklistItems.includes(text)) {
            toast.error("มีรายการนี้อยู่แล้ว");
            return;
        }
        setCustomChecklist(prev => [...prev, text]);
        setNewItemText("");
    };

    const isAllChecked = checklistItems.every(item => checklist[item]);

    const handleAction = async (action: "qc_pass" | "qc_fail") => {
        if (!paneData || !stationId) return;
        const paneNum = paneData.paneNumber as string;
        if (!paneNum) return;

        setStatus(action === "qc_pass" ? "passing" : "failing");
        try {
            // 1. Auto-Arrival (Scan-In) if pane is at a different station
            const currentPaneStation = (paneData as any).currentStation?._id || (paneData as any).currentStation;
            if (currentPaneStation && currentPaneStation !== stationId) {
                console.log(`QC: Auto-moving pane from ${currentPaneStation} to ${stationId}`);
                await panesApi.scan(paneNum, { 
                    station: stationId, 
                    action: "scan_in", 
                    force: true 
                }).catch((err) => console.warn("QC: Auto-scan-in failed", err));
            }

            // 2. Auto-Finish if not already finished at this station
            const currentStatus = (paneData as any).currentStatus;
            if (currentStatus === "pending" || currentStatus === "in_progress") {
                await panesApi.scan(paneNum, { 
                    station: stationId, 
                    action: "complete", 
                    force: true 
                }).catch((err) => console.warn("QC: Auto-complete failed", err));
            }

            // 3. Final QC Action
            const res = await panesApi.scan(paneNum, {
                station: stationId,
                action,
                force: true,
                reason: action === "qc_fail" ? reason : undefined,
                description: action === "qc_fail" ? description : undefined,
            });

            if (res.success) {
                toast.success(action === "qc_pass" ? "ผ่านการตรวจสอบ QC แล้ว" : "บันทึกงานเสียและสั่งผลิตซ้ำแล้ว");
                if (action === "qc_fail" && res.data?.remadePane) {
                    toast.info(`สร้างกระจกทดแทนแล้ว: ${res.data.remadePane.paneNumber}`, { duration: 5000 });
                }
                setPaneData(null); // Clear active pane after success
                triggerRefresh();
            } else {
                toast.error(res.message || "เกิดข้อผิดพลาด");
            }
        } catch (err: any) {
            console.error("QC Scan Error:", err);
            
            // Clean up technical error messages (Remove ObjectIDs and provide friendly Thai)
            let rawMsg = err?.data?.message || err?.message || "การเชื่อมต่อล้มเหลว";
            
            // Replace MongoDB ObjectIDs (24 hex chars) with friendly terms
            let friendlyMsg = rawMsg.replace(/[0-9a-f]{24}/g, (id: string) => {
                if (id === stationId) return `"${stationName || 'สถานีนี้'}"`;
                return "สถานีอื่น";
            });

            // Translate common backend errors
            if (friendlyMsg.includes("กระจกอยู่ที่สถานี")) {
                friendlyMsg = `กระจกแผ่นนี้ยังไม่ได้สแกนเข้าสู่สถานี ${stationName ? `"${stationName}"` : "นี้"} กรุณาลองกดใหม่อีกครั้ง`;
            }

            if (rawMsg.includes("already completed") || rawMsg.includes("already defected")) {
                friendlyMsg = "กระจกแผ่นนี้ถูกตรวจสอบหรือดำเนินการไปเรียบร้อยแล้วครับ";
                setPaneData(null);
                triggerRefresh();
            }

            toast.error(friendlyMsg);
        } finally {
            setStatus("idle");
        }
    };

    // ── Preview Render ────────────────────────────────────────────────────────
    if (isPreview) {
        if (!paneData) {
            if (loadingPanes) {
                return (
                    <div className="w-full rounded-2xl border-2 border-dashed border-muted bg-muted/5 p-8 flex flex-col items-center justify-center text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary/40 mb-3" />
                        <p className="text-sm font-medium text-muted-foreground">กำลังโหลดรายการกระจก...</p>
                    </div>
                );
            }

            if (panes.length > 0) {
                return (
                    <div className="w-full rounded-2xl border bg-card shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="px-5 py-4 border-b bg-muted/20 flex items-center gap-2.5">
                            <Search className="h-4 w-4 text-primary" />
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-none">เลือกกระจกที่ต้องตรวจสอบ</p>
                        </div>
                        <div className="p-4 grid gap-2 max-h-[300px] overflow-y-auto">
                            {filteredPanes.map(p => (
                                <button
                                    key={p._id || p.id}
                                    onClick={() => setPaneData(p)}
                                    className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                            <ShieldCheck className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold font-mono">{p.paneNumber}</p>
                                            <p className="text-[10px] text-muted-foreground">{p.glassTypeLabel || "—"}</p>
                                        </div>
                                    </div>
                                    <ChevronDown className="h-4 w-4 text-muted-foreground/30 -rotate-90" />
                                </button>
                            ))}
                        </div>
                    </div>
                );
            }

            if (orderId && !loadingPanes && panes.length === 0) {
                return (
                    <div className="w-full rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-muted/5 p-8 flex flex-col items-center justify-center text-center">
                        <div className="h-14 w-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4 ring-1 ring-inset ring-amber-500/20 text-amber-500">
                            {errorFetch ? <AlertTriangle className="h-7 w-7" /> : <PackagePlus className="h-7 w-7" />}
                        </div>
                        <div>
                            <p className="text-sm font-bold text-foreground/80">{errorFetch || "ออเดอร์ไม่มีกระจกที่รอตรวจ"}</p>
                            <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                                {errorFetch ? "เกิดข้อผิดพลาดในการดึงข้อมูลรายการกระจก" : "ไม่พบกระจกที่พร้อมเข้า QC ในออเดอร์นี้ (อาจจะยังผลิตไม่เสร็จ หรือสแกนออกไปแล้ว)"}
                            </p>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="mt-4 h-8 gap-1.5"
                                onClick={() => triggerRefresh()}
                            >
                                <RefreshCcw className="h-3.5 w-3.5" />
                                รีเฟรชข้อมูล
                            </Button>
                        </div>
                    </div>
                );
            }

            return (
                <div className="w-full rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-muted/5 p-8 flex flex-col items-center justify-center text-center">
                    <div className="h-14 w-14 rounded-2xl bg-muted/20 flex items-center justify-center mb-4 ring-1 ring-inset ring-black/5">
                        <ShieldCheck className="h-7 w-7 text-muted-foreground/30" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-foreground/80">รอเริ่มตรวจสอบคุณภาพ</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">สแกน QR ออเดอร์ หรือสแกนแผ่นกระจกโดยตรงเพื่อเริ่มงาน</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="w-full rounded-2xl border bg-card shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Header */}
                <div className="px-5 py-4 border-b bg-muted/20 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">{title}</p>
                            <p className="text-sm font-bold text-foreground font-mono">{(paneData.paneNumber as string) || "—"}</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setPaneData(null)}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                    >
                        <XCircle className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-5 space-y-6">
                    {/* Checklist */}
                    {!isFailMode && (
                        <div className="space-y-3">
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-1">รายการที่ต้องตรวจสอบ</p>
                            <div className="grid gap-0.5">
                                {checklistItems.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all group border border-transparent
                                            ${checklist[item] 
                                                ? "bg-emerald-50/30 dark:bg-emerald-500/5 text-emerald-700 dark:text-emerald-400" 
                                                : "hover:bg-muted/50"}`}
                                    >
                                        <Checkbox 
                                            id={`check-${idx}`} 
                                            checked={!!checklist[item]} 
                                            onCheckedChange={() => toggleCheck(item)}
                                            className="h-5 w-5 border-2 rounded-md data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                                        />
                                        <label
                                            htmlFor={`check-${idx}`}
                                            className="text-sm font-medium flex-1 cursor-pointer select-none"
                                        >
                                            {item}
                                        </label>
                                    </div>
                                ))}
                            </div>

                            {/* Add Custom Item */}
                            <div className="mt-4 pt-4 border-t border-dashed">
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Plus className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                        <input
                                            type="text"
                                            placeholder="เพิ่มรายการตรวจสอบใหม่..."
                                            value={newItemText}
                                            onChange={(e) => setNewItemText(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && addCustomItem()}
                                            className="w-full bg-muted/30 border-none rounded-lg pl-9 pr-3 py-2 text-xs focus:ring-1 focus:ring-primary/20 outline-none"
                                        />
                                    </div>
                                    <button
                                        onClick={addCustomItem}
                                        disabled={!newItemText.trim()}
                                        className="px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-30 transition-colors"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                </div>
                                <p className="text-[9px] text-muted-foreground mt-2 px-1 italic">* รายการพิเศษที่เพิ่มจะอยู่เฉพาะรอบการตรวจสอบนี้เท่านั้น</p>
                            </div>
                        </div>
                    )}

                    {/* Fail Mode UI */}
                    {isFailMode && (
                        <div className="space-y-4 animate-in zoom-in-95 duration-200">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-bold text-red-500 uppercase tracking-widest px-1">สาเหตุที่งานเสีย (Defect)</Label>
                                    <Select value={reason} onValueChange={(val) => setReason(val ?? "")}>
                                        <SelectTrigger className="h-11 rounded-xl border-red-200 dark:border-red-900/30 focus:ring-red-500/20">
                                            <SelectValue placeholder="เลือกสาเหตุที่พบ..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {DEFECT_REASONS.map(r => (
                                                <SelectItem key={r.value} value={r.value}>
                                                    <div className="flex items-center gap-2">
                                                        {r.icon}
                                                        <span>{r.label}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {showDescription && (
                                    <div className="space-y-2">
                                        <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-1">รายละเอียดเพิ่มเติม</Label>
                                        <Textarea 
                                            placeholder="ระบุจุดที่พบปัญหา หรือข้อมูลเพิ่มเติม..."
                                            className="rounded-xl min-h-[100px] resize-none focus:ring-primary/20"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                        />
                                    </div>
                                )}

                                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/20 flex items-start gap-3">
                                    <PackagePlus className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-bold text-red-600 dark:text-red-400">สร้างงานใหม่ทันที (Auto-Remake)</p>
                                        <p className="text-[10px] text-red-500/80 mt-0.5 leading-relaxed">
                                            เมื่อกดบันทึก ระบบจะยกเลิกแผ่นนี้และเริ่มคิวผลิตใหม่ให้กับ Order นี้โดยอัตโนมัติ
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex gap-2.5 pt-2">
                        {!isFailMode ? (
                            <>
                                <Button
                                    onClick={() => handleAction("qc_pass")}
                                    disabled={!isAllChecked || status !== "idle"}
                                    className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 shadow-lg shadow-emerald-500/20"
                                >
                                    {status === "passing" ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <CheckCircle2 className="h-4 w-4" />
                                    )}
                                    อนุมัติ (Pass)
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setIsFailMode(true)}
                                    disabled={status !== "idle"}
                                    className="h-12 w-12 rounded-xl border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/30 dark:hover:bg-red-900/10 p-0"
                                >
                                    <XCircle className="h-5 w-5" />
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    onClick={() => handleAction("qc_fail")}
                                    disabled={!reason || status !== "idle"}
                                    className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold gap-2 shadow-lg shadow-red-500/20"
                                >
                                    {status === "failing" ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <AlertTriangle className="h-4 w-4" />
                                    )}
                                    บันทึกเสีย (Fail & Remake)
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => setIsFailMode(false)}
                                    disabled={status !== "idle"}
                                    className="h-12 px-5 rounded-xl text-muted-foreground"
                                >
                                    ยกเลิก
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Design Render ─────────────────────────────────────────────────────────
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-2xl border-2 transition-all cursor-grab active:cursor-grabbing overflow-hidden shadow-sm
                ${selected ? "border-primary ring-4 ring-primary/10" : "border-slate-200 dark:border-slate-800 hover:border-primary/40"}`}
        >
            <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-foreground/80 uppercase tracking-widest">{title}</span>
                </div>
                <div className="flex gap-1">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                </div>
            </div>
            <div className="p-6 flex flex-col items-center justify-center text-center space-y-3">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <ShieldCheck className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <p className="text-sm font-bold font-mono text-primary flex items-center justify-center gap-1.5">
                        QC INSPECTOR v2
                        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1 px-4 leading-relaxed">
                        ระบบตรวจสอบคุณภาพแบบใหม่ (Checkboxes) + เพิ่มรายการตรวจสอบได้หน้างาน + รองรับการสแกนออเดอร์แล้ว
                    </p>
                </div>
                <div className="w-full flex gap-2 pt-2">
                    <div className="h-8 flex-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20" />
                    <div className="h-8 w-10 rounded-lg bg-red-500/10 border border-red-500/20" />
                </div>
            </div>
        </div>
    );
}

QCInspectorBlock.craft = {
    displayName: "QC Inspector",
    props: {
        title: "ตรวจสอบคุณภาพ (QC)",
        checklistJson: JSON.stringify(DEFAULT_CHECKLIST),
        showDescription: true,
    },
};

function AlertCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}
