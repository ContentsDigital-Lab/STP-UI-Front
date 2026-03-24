"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { FileWarning, QrCode, CheckCircle2, AlertTriangle, Loader2, X, Layers, Package, Cpu, Camera, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { panesApi } from "@/lib/api/panes";
import { claimsApi } from "@/lib/api/claims";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { Pane, Order, Material, Claim } from "@/lib/api/types";
import { CameraScanModal } from "@/components/stations/designer/blocks/CameraScanModal";

interface ClaimModalProps {
    stationId?: string;
    onClose: () => void;
}

// Resize + convert to base64 via canvas (max 800px wide, quality 0.75)
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

export function ClaimModal({ stationId, onClose }: ClaimModalProps) {
    const [paneNumber,   setPaneNumber]   = useState("");
    const [description,  setDescription]  = useState("");
    const [photos,       setPhotos]       = useState<string[]>([]);
    const [pane,         setPane]         = useState<Pane | null>(null);
    const [fetching,     setFetching]     = useState(false);
    const [submitting,   setSubmitting]   = useState(false);
    const [lookupError,  setLookupError]  = useState<string | null>(null);
    const [submitError,  setSubmitError]  = useState<string | null>(null);
    const [success,      setSuccess]      = useState<Claim | null>(null);
    const [showCamera,   setShowCamera]   = useState(false);
    const inputRef   = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    // Listen for claim:updated WebSocket event — backend sends { action, data }
    useWebSocket("claim", ["claim:updated"], useCallback((_event: string, data: unknown) => {
        const payload = data as { action?: string; data?: Claim };
        if (payload?.action === "created" && payload.data) setSuccess(prev => prev ?? payload.data ?? null);
    }, []));

    const lookupPane = async (value: string) => {
        const raw = value.trim().toUpperCase();
        if (!raw) return;
        setLookupError(null);
        setPane(null);
        setFetching(true);
        try {
            const res = await panesApi.getById(raw);
            if (!res.success || !res.data) {
                setLookupError(`ไม่พบกระจก "${raw}" ในระบบ`);
                return;
            }
            setPane(res.data as Pane);
        } catch {
            setLookupError("เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
        } finally {
            setFetching(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") lookupPane(paneNumber);
    };

    // Called by CameraScanModal — strip "STDPLUS:" prefix if present
    const handleQrScan = (raw: string) => {
        const num = raw.replace(/^STDPLUS:/i, "").trim().toUpperCase();
        setPaneNumber(num);
        setShowCamera(false);
        lookupPane(num);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        if (!files.length) return;
        const remaining = 3 - photos.length;
        try {
            const b64s = await Promise.all(files.slice(0, remaining).map(resizeToBase64));
            setPhotos(prev => [...prev, ...b64s]);
        } catch {
            setSubmitError("ไม่สามารถโหลดรูปภาพได้");
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSubmit = async () => {
        if (!pane || !description.trim()) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            // Primary: use /claims/from-pane — backend auto-resolves order/material/worker
            // Fallback: use /orders/:orderId/claims if from-pane fails
            // Note: photos are base64 (not URLs) — omit until upload endpoint is available
            let res = await claimsApi.createFromPane({
                paneNumber: pane.paneNumber,
                description: description.trim(),
            });

            if (!res.success) {
                // Fallback to existing order-scoped endpoint
                const orderId = pane.order
                    ? (typeof pane.order === "object" ? (pane.order as Order)._id : String(pane.order))
                    : null;
                const materialId = pane.material
                    ? (typeof pane.material === "object" ? (pane.material as Material)._id : String(pane.material))
                    : undefined;
                if (orderId) {
                    res = await claimsApi.createForOrder(orderId, {
                        source: "worker",
                        material: materialId,
                        description: description.trim(),
                        pane: pane._id,
                    } as Parameters<typeof claimsApi.createForOrder>[1]);
                }
            }

            if (!res.success) {
                setSubmitError(res.message ?? "ไม่สามารถสร้างรายการเคลมได้");
                return;
            }
            setSuccess(res.data);
        } catch {
            setSubmitError("เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
        } finally {
            setSubmitting(false);
        }
    };

    const reset = () => {
        setPaneNumber("");
        setDescription("");
        setPhotos([]);
        setPane(null);
        setLookupError(null);
        setSubmitError(null);
        setSuccess(null);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const orderObj    = pane?.order    && typeof pane.order    === "object" ? pane.order    as Order    : null;
    const materialObj = pane?.material && typeof pane.material === "object" ? pane.material as Material : null;

    // ── Success screen ─────────────────────────────────────────────────────────
    if (success) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
                <div className="bg-card rounded-2xl border shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b">
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-xl bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
                                <FileWarning className="h-4 w-4 text-red-600 dark:text-red-400" />
                            </div>
                            <p className="text-sm font-bold">เคลมกระจก</p>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="flex flex-col items-center gap-4 px-5 py-8 text-center">
                        <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center">
                            <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <p className="font-bold text-base">ส่งเรื่องเคลมสำเร็จ!</p>
                            {pane && <p className="text-sm text-muted-foreground mt-1">กระจก <span className="font-mono font-bold">{pane.paneNumber}</span> ถูกบันทึกแล้ว</p>}
                            {success.claimNumber
                                ? <p className="text-[11px] text-muted-foreground mt-1">เลขที่เคลม: {success.claimNumber}</p>
                                : <p className="text-[11px] text-muted-foreground mt-1">#{success._id.slice(-8).toUpperCase()}</p>
                            }
                        </div>
                        <div className="flex gap-2 w-full">
                            <Button variant="outline" onClick={reset} className="flex-1 rounded-xl">เคลมชิ้นอื่น</Button>
                            <Button onClick={onClose} className="flex-1 rounded-xl font-bold">เสร็จสิ้น</Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── Main form (single page) ────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="bg-card rounded-2xl border shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-xl bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
                            <FileWarning className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                            <p className="text-sm font-bold">เคลมกระจก</p>
                            <p className="text-[11px] text-muted-foreground">กรอกข้อมูลและส่งเรื่องเคลม</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body — scrollable */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

                    {/* ── 1. Scan pane ── */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                            <QrCode className="h-3 w-3" />
                            สแกนกระจก
                        </label>
                        <div className="flex gap-2">
                            <Input
                                ref={inputRef}
                                value={paneNumber}
                                onChange={e => { setPaneNumber(e.target.value.toUpperCase()); setLookupError(null); if (!e.target.value) setPane(null); }}
                                onKeyDown={handleKeyDown}
                                placeholder="เช่น PNE-0001"
                                className="font-mono font-bold text-sm h-10 uppercase rounded-xl flex-1"
                                disabled={fetching}
                            />
                            {/* Camera scan — always enabled */}
                            <Button
                                variant="outline"
                                onClick={() => setShowCamera(true)}
                                disabled={fetching}
                                className="h-10 px-3 rounded-xl shrink-0"
                                title="สแกน QR ด้วยกล้อง"
                            >
                                <Camera className="h-3.5 w-3.5" />
                            </Button>
                            {/* Manual lookup — enabled only when text typed */}
                            {paneNumber.trim() && (
                                <Button
                                    variant="outline"
                                    onClick={() => lookupPane(paneNumber)}
                                    disabled={fetching}
                                    className="h-10 px-3 rounded-xl shrink-0"
                                    title="ค้นหา"
                                >
                                    {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
                                </Button>
                            )}
                        </div>

                        {/* Lookup error */}
                        {lookupError && (
                            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-xl border border-red-100 dark:border-red-900/30">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                {lookupError}
                            </div>
                        )}

                        {/* Pane info card — shows after successful lookup */}
                        {pane && (
                            <div className="rounded-xl border bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5 space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <Cpu className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                                    <span className="font-mono font-bold text-sm">{pane.paneNumber}</span>
                                    <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                        pane.currentStatus === "completed"
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400"
                                            : pane.currentStatus === "in_progress"
                                            ? "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400"
                                            : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300"
                                    }`}>
                                        {pane.currentStatus === "pending" ? "รอดำเนินการ"
                                            : pane.currentStatus === "in_progress" ? "กำลังทำ"
                                            : pane.currentStatus === "completed" ? "เสร็จแล้ว"
                                            : pane.currentStatus}
                                    </span>
                                </div>
                                {materialObj && (
                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                        <Layers className="h-3 w-3 shrink-0" />{materialObj.name}
                                    </div>
                                )}
                                {orderObj && (
                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                        <Package className="h-3 w-3 shrink-0" />ออเดอร์ #{(orderObj._id ?? "").slice(-6).toUpperCase()}
                                    </div>
                                )}
                                {pane.currentStation && (
                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                                        สถานี: <span className="font-semibold text-foreground">{pane.currentStation}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── 2. Reason ── */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                            <FileWarning className="h-3 w-3" />
                            เหตุผลการเคลม <span className="text-red-500 normal-case">*</span>
                        </label>
                        <Textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="อธิบายปัญหาหรือความเสียหายที่พบ เช่น กระจกแตกร้าว, ขนาดไม่ตรง..."
                            className="resize-none rounded-xl text-sm min-h-[88px]"
                            rows={3}
                        />
                    </div>

                    {/* ── 3. Photos ── */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                            <Camera className="h-3 w-3" />
                            รูปหลักฐาน ({photos.length}/3)
                        </label>

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
                        {showCamera && (
                            <CameraScanModal
                                onScan={handleQrScan}
                                onClose={() => setShowCamera(false)}
                            />
                        )}
                    </div>

                    {/* Submit error */}
                    {submitError && (
                        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-3 py-2.5 rounded-xl border border-red-100 dark:border-red-900/30">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            {submitError}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="shrink-0 px-5 py-4 border-t bg-slate-50/50 dark:bg-slate-900/50">
                    <Button
                        onClick={handleSubmit}
                        disabled={submitting || !pane || !description.trim()}
                        className="w-full h-11 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                    >
                        {submitting
                            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />กำลังส่ง...</>
                            : <><FileWarning className="h-4 w-4 mr-2" />ส่งเรื่องเคลม</>
                        }
                    </Button>
                    {!pane && (
                        <p className="text-center text-[11px] text-muted-foreground mt-2">
                            ค้นหากระจกก่อนเพื่อเปิดใช้งานปุ่มส่ง
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
