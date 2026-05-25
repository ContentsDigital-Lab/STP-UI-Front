"use client";

import { useNode } from "@craftjs/core";
import { useState, useEffect, useMemo, useRef } from "react";
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
    Search,
    Camera,
    ImagePlus,
    Trash2,
    FileWarning
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { panesApi } from "@/lib/api/panes";
import { claimsApi } from "@/lib/api/claims";
import { useAuth } from "@/lib/auth/auth-context";
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";

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

function resizeToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const MAX = 800;
                const scale = img.width > MAX ? MAX / img.width : 1;
                const canvas = document.createElement("canvas");
                canvas.width  = Math.round(img.width  * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext("2d")!;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/jpeg", 0.75));
            };
            img.onerror = reject;
            img.src = ev.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

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
    const [customChecklist, setCustomChecklist] = useState<string[]>([]);
    const [newItemText, setNewItemText] = useState("");
    const { user } = useAuth();
    const [photos, setPhotos] = useState<string[]>([]);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Panes from order (if scanned order instead of pane)
    const [panes, setPanes] = useState<any[]>([]);
    const [loadingPanes, setLoadingPanes] = useState(false);
    const [errorFetch, setErrorFetch] = useState<string | null>(null);

    const baseChecklist: string[] = (() => {
        try {
            const parsed = JSON.parse(checklistJson);
            return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_CHECKLIST;
        } catch { return DEFAULT_CHECKLIST; }
    })();

    const checklistItems = [...baseChecklist, ...customChecklist];

    // Reset state when pane changes
    useEffect(() => {
        setChecklist({});
        setReason("");
        setDescription("");
        setStatus("idle");
        setCustomChecklist([]);
        setNewItemText("");
        setPhotos([]);
        setIsConfirmOpen(false);
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
            // Only show panes that are AT this QC station
            if (stationId) {
                const paneCurrentStation = typeof p.currentStation === "object" && p.currentStation !== null
                    ? (p.currentStation as { _id: string })._id
                    : String(p.currentStation ?? "");
                if (paneCurrentStation && paneCurrentStation !== stationId) return false;
            }
            // Filter out terminal states
            const currentStatus = p.currentStatus;
            return currentStatus !== "ready" && currentStatus !== "cancelled" && currentStatus !== "completed";
        });
    }, [panes, stationId]);

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

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        if (!files.length) return;
        const remaining = 3 - photos.length;
        try {
            const b64s = await Promise.all(files.slice(0, remaining).map(resizeToBase64));
            setPhotos(prev => [...prev, ...b64s]);
        } catch {
            toast.error("ไม่สามารถโหลดรูปภาพได้");
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const checkedItems = useMemo(() => {
        return checklistItems.filter(item => checklist[item]);
    }, [checklistItems, checklist]);

    const hasDefects = checkedItems.length > 0;

    const handleClaimSubmit = async () => {
        if (!paneData || !stationId) return;
        const paneNum = paneData.paneNumber as string;
        if (!paneNum) return;

        setIsConfirmOpen(false);
        setStatus("failing");
        try {
            // 1. Station guard: pane must have arrived at THIS QC station
            const currentPaneStation = (paneData as any).currentStation?._id || (paneData as any).currentStation;
            if (currentPaneStation && currentPaneStation !== stationId) {
                const stationLabel = (paneData as any).currentStation?.name || "สถานีอื่น";
                toast.error(`กระจกยังไม่เสร็จกระบวนการ`, {
                    description: `ยังอยู่ที่สถานี: ${stationLabel} — ต้องผ่านทุกสถานีก่อน`,
                    duration: 6000
                });
                setStatus("idle");
                return;
            }

            // 2. Complete the station work first
            const currentStatus = (paneData as any).currentStatus;
            if (currentStatus === "pending") {
                const startRes = await panesApi.scan(paneNum, {
                    station: stationId,
                    action: "start",
                    force: true,
                });
                if (!startRes.success) {
                    toast.error(startRes.message || "ไม่สามารถเริ่มงานที่สถานี QC ได้");
                    return;
                }
            }
            if (currentStatus === "pending" || currentStatus === "in_progress") {
                const completeRes = await panesApi.scan(paneNum, {
                    station: stationId,
                    action: "complete",
                    force: true,
                });
                if (!completeRes.success) {
                    toast.error(completeRes.message || "ไม่สามารถกดเสร็จสิ้นที่สถานี QC ได้");
                    return;
                }
            }

            // 3. Create Claim
            const combinedDescription = `[ปัญหากระจก]: ${checkedItems.join(", ")}${description ? `\nรายละเอียดเพิ่มเติม: ${description}` : ""}`;
            const res = await claimsApi.createFromPane({
                paneNumber: paneNum,
                description: combinedDescription,
                source: "worker",
                reportedBy: user?._id,
                photos: photos.length ? photos : undefined,
                defectCode: reason,
                defectStation: stationId,
            });

            if (res.success) {
                toast.success("บันทึกการแจ้งความเสียหายและส่งเรื่องเคลมแล้ว");
                setPaneData(null); // Clear active pane after success
                triggerRefresh();
            } else {
                toast.error(res.message || "เกิดข้อผิดพลาด");
            }
        } catch (err: any) {
            console.error("QC Claim Error:", err);
            let rawMsg = err?.data?.message || err?.message || "การเชื่อมต่อล้มเหลว";
            let friendlyMsg = rawMsg.replace(/[0-9a-f]{24}/g, (id: string) => {
                if (id === stationId) return `"${stationName || 'สถานีนี้'}"`;
                return "สถานีอื่น";
            });
            if (friendlyMsg.includes("กระจกอยู่ที่สถานี")) {
                friendlyMsg = `กระจกแผ่นนี้ยังไม่ได้สแกนเข้าสู่สถานี ${stationName ? `"${stationName}"` : "นี้"} กรุณาลองกดใหม่อีกครั้ง`;
            }
            if (rawMsg.includes("already completed") || rawMsg.includes("already defected") || rawMsg.includes("already claimed")) {
                friendlyMsg = "กระจกแผ่นนี้ถูกดำเนินการเคลมหรือตรวจสอบเรียบร้อยแล้ว";
                setPaneData(null);
                triggerRefresh();
            }
            toast.error(friendlyMsg);
        } finally {
            setStatus("idle");
        }
    };

    const handleAction = async (action: "qc_pass" | "qc_fail") => {
        if (!paneData || !stationId) return;
        const paneNum = paneData.paneNumber as string;
        if (!paneNum) return;

        setStatus(action === "qc_pass" ? "passing" : "failing");
        try {
            // Station guard: pane must have arrived at THIS QC station
            const currentPaneStation = (paneData as any).currentStation?._id || (paneData as any).currentStation;
            if (currentPaneStation && currentPaneStation !== stationId) {
                const stationLabel = (paneData as any).currentStation?.name || "สถานีอื่น";
                toast.error(`กระจกยังไม่เสร็จกระบวนการ`, {
                    description: `ยังอยู่ที่สถานี: ${stationLabel} — ต้องผ่านทุกสถานีก่อน`,
                    duration: 6000
                });
                setStatus("idle");
                return;
            }

            // 2. API requires station work to be finished (`complete`) before qc_pass / qc_fail.
            //    If still pending, run `start` first so `complete` is valid.
            const currentStatus = (paneData as any).currentStatus;
            if (currentStatus === "pending") {
                const startRes = await panesApi.scan(paneNum, {
                    station: stationId,
                    action: "start",
                    force: true,
                });
                if (!startRes.success) {
                    toast.error(startRes.message || "ไม่สามารถเริ่มงานที่สถานี QC ได้");
                    return;
                }
            }
            if (currentStatus === "pending" || currentStatus === "in_progress") {
                const completeRes = await panesApi.scan(paneNum, {
                    station: stationId,
                    action: "complete",
                    force: true,
                });
                if (!completeRes.success) {
                    toast.error(completeRes.message || "ไม่สามารถกดเสร็จสิ้นที่สถานี QC ได้");
                    return;
                }
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
                    <div className="space-y-3">
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-1">รายการที่ต้องตรวจสอบ</p>
                        <div className="grid gap-0.5">
                            {checklistItems.map((item, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all group border border-transparent
                                        ${checklist[item] 
                                            ? "bg-red-50/30 dark:bg-red-500/5 text-red-700 dark:text-red-400 border-red-100/30 dark:border-red-900/30" 
                                            : "hover:bg-muted/50"}`}
                                >
                                    <Checkbox 
                                        id={`check-${idx}`} 
                                        checked={!!checklist[item]} 
                                        onCheckedChange={() => toggleCheck(item)}
                                        className="h-5 w-5 border-2 rounded-md data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
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

                    {/* Defect Details - Shown inline when there is any defect selected */}
                    {hasDefects && (
                        <div className="space-y-4 border-t border-dashed pt-4 mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
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

                                {/* Photo Proofs */}
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-1">
                                        <Camera className="h-3.5 w-3.5" />
                                        รูปหลักฐาน ({photos.length}/3)
                                    </Label>

                                    <div className="flex gap-2 flex-wrap">
                                        {/* Photo thumbnails */}
                                        {photos.map((src, i) => (
                                            <div key={i} className="relative w-[72px] h-[72px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 group shrink-0">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={src} alt={`photo-${i}`} className="w-full h-full object-cover" />
                                                <button
                                                    onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                                                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Trash2 className="h-4 w-4 text-white" />
                                                </button>
                                            </div>
                                        ))}

                                        {/* Add photo button */}
                                        {photos.length < 3 && (
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="w-[72px] h-[72px] rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-red-300 hover:text-red-500 dark:hover:border-red-700 dark:hover:text-red-400 transition-colors shrink-0"
                                            >
                                                <ImagePlus className="h-5 w-5" />
                                                <span className="text-[9px] font-semibold">ถ่ายรูป</span>
                                            </button>
                                        )}
                                    </div>

                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        multiple
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex gap-2.5 pt-2">
                        {hasDefects ? (
                            <Button
                                onClick={() => setIsConfirmOpen(true)}
                                disabled={!reason || status !== "idle"}
                                className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold gap-2 shadow-lg shadow-red-500/20"
                            >
                                {status === "failing" ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <FileWarning className="h-4 w-4" />
                                )}
                                แจ้งความเสียหาย
                            </Button>
                        ) : (
                            <Button
                                onClick={() => handleAction("qc_pass")}
                                disabled={status !== "idle"}
                                className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 shadow-lg shadow-emerald-500/20"
                            >
                                {status === "passing" ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <CheckCircle2 className="h-4 w-4" />
                                )}
                                อนุมัติ (Pass)
                            </Button>
                        )}
                    </div>
                </div>

                {/* Confirmation Dialog */}
                <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                    <DialogContent className="sm:max-w-md rounded-2xl p-6">
                        <DialogHeader>
                            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <AlertOctagon className="h-5 w-5 text-red-500 animate-pulse" />
                                ยืนยันการแจ้งความเสียหาย
                            </DialogTitle>
                            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
                                คุณแน่ใจหรือไม่ว่าต้องการรายงานความเสียหายสำหรับแผ่นกระจกนี้? แผ่นกระจกนี้จะถูกส่งไปที่หน้าเคลมเพื่อทำการตัดสิน
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4 space-y-3">
                            <div className="rounded-xl border border-red-100 bg-red-50/50 p-4 dark:border-red-900/30 dark:bg-red-950/20">
                                <p className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-widest mb-1.5">รายการปัญหาที่พบ</p>
                                <ul className="list-disc list-inside text-sm text-slate-700 dark:text-slate-300 space-y-1">
                                    {checkedItems.map((item, idx) => (
                                        <li key={idx}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                            {reason && (
                                <div className="text-sm">
                                    <span className="font-semibold text-slate-500">สาเหตุหลัก:</span>{" "}
                                    <span className="font-bold text-foreground">
                                        {DEFECT_REASONS.find(r => r.value === reason)?.label || reason}
                                    </span>
                                </div>
                            )}
                            {description && (
                                <div className="text-sm text-slate-500">
                                    <span className="font-semibold text-slate-700 dark:text-slate-300">รายละเอียดเพิ่มเติม:</span>{" "}
                                    {description}
                                </div>
                            )}
                            {photos.length > 0 && (
                                <div className="text-sm text-slate-500">
                                    <span className="font-semibold text-slate-700 dark:text-slate-300">รูปภาพแนบ:</span> {photos.length} รูป
                                </div>
                            )}
                        </div>
                        <DialogFooter className="flex gap-2 justify-end">
                            <Button 
                                variant="ghost" 
                                onClick={() => setIsConfirmOpen(false)}
                                className="rounded-xl h-11"
                            >
                                ยกเลิก
                            </Button>
                            <Button 
                                onClick={handleClaimSubmit}
                                disabled={status !== "idle"}
                                className="bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl h-11 px-5 shadow-lg shadow-red-500/20"
                            >
                                {status === "failing" ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : null}
                                ยืนยันแจ้งเรื่อง
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
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
