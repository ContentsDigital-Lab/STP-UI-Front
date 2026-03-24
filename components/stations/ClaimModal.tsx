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

interface ClaimModalProps {
    stationId?: string;
    onClose: () => void;
}

type Step = "scan" | "detail" | "success";

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
    const [step, setStep] = useState<Step>("scan");
    const [paneNumber, setPaneNumber] = useState("");
    const [description, setDescription] = useState("");
    const [photos, setPhotos] = useState<string[]>([]);
    const [pane, setPane] = useState<Pane | null>(null);
    const [fetching, setFetching] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<Claim | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Listen for claim:created WebSocket event
    useWebSocket("claim", ["claim:created"], useCallback((_event: string, data: unknown) => {
        const payload = data as { data?: Claim };
        if (!payload?.data) return;
        setResult(prev => prev ?? payload.data ?? null);
    }, []));

    const lookupPane = async (value: string) => {
        const raw = value.trim().toUpperCase();
        if (!raw) return;
        setError(null);
        setFetching(true);
        try {
            const res = await panesApi.getById(raw);
            if (!res.success || !res.data) {
                setError(`ไม่พบกระจก "${raw}" ในระบบ`);
                return;
            }
            setPane(res.data as Pane);
            setStep("detail");
        } catch {
            setError("เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
        } finally {
            setFetching(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") lookupPane(paneNumber);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        if (!files.length) return;
        // Max 3 photos
        const remaining = 3 - photos.length;
        const toProcess = files.slice(0, remaining);
        try {
            const b64s = await Promise.all(toProcess.map(resizeToBase64));
            setPhotos(prev => [...prev, ...b64s]);
        } catch {
            setError("ไม่สามารถโหลดรูปภาพได้ กรุณาลองใหม่");
        }
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const removePhoto = (idx: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = async () => {
        if (!pane || !description.trim()) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await claimsApi.createFromPane({
                paneNumber: pane.paneNumber,
                description: description.trim(),
                photos: photos.length ? photos : undefined,
            });
            if (!res.success) {
                setError(res.message ?? "ไม่สามารถสร้างรายการเคลมได้");
                return;
            }
            setResult(res.data);
            setStep("success");
        } catch {
            setError("เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
        } finally {
            setSubmitting(false);
        }
    };

    const reset = () => {
        setStep("scan");
        setPaneNumber("");
        setDescription("");
        setPhotos([]);
        setPane(null);
        setError(null);
        setResult(null);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const orderObj    = pane?.order    && typeof pane.order    === "object" ? pane.order    as Order    : null;
    const materialObj = pane?.material && typeof pane.material === "object" ? pane.material as Material : null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="bg-card rounded-2xl border shadow-2xl w-full max-w-sm overflow-hidden max-h-[90vh] flex flex-col"
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
                            <p className="text-[11px] text-muted-foreground">
                                {step === "scan" ? "สแกนหรือพิมพ์หมายเลขกระจก" : step === "detail" ? "ระบุเหตุผลและหลักฐาน" : "ส่งเรื่องเคลมสำเร็จ"}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1">
                    {/* ── Step 1: Scan ── */}
                    {step === "scan" && (
                        <>
                            <div className="flex flex-col items-center gap-3 py-4">
                                <div className="h-16 w-16 rounded-2xl bg-red-50 dark:bg-red-950/20 flex items-center justify-center">
                                    <QrCode className="h-8 w-8 text-red-500" />
                                </div>
                                <p className="text-sm text-muted-foreground text-center">
                                    สแกน QR หรือพิมพ์หมายเลขกระจกที่ต้องการเคลม
                                </p>
                            </div>
                            <Input
                                ref={inputRef}
                                value={paneNumber}
                                onChange={e => { setPaneNumber(e.target.value.toUpperCase()); setError(null); }}
                                onKeyDown={handleKeyDown}
                                placeholder="เช่น PNE-0001"
                                className="text-center font-mono font-bold text-base h-12 uppercase rounded-xl"
                                disabled={fetching}
                            />
                            {error && (
                                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-3 py-2.5 rounded-xl border border-red-100 dark:border-red-900/30">
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    {error}
                                </div>
                            )}
                            <Button
                                onClick={() => lookupPane(paneNumber)}
                                disabled={!paneNumber.trim() || fetching}
                                className="w-full h-11 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white"
                            >
                                {fetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                {fetching ? "กำลังค้นหา..." : "ค้นหากระจก"}
                            </Button>
                        </>
                    )}

                    {/* ── Step 2: Detail ── */}
                    {step === "detail" && pane && (
                        <>
                            {/* Pane info card */}
                            <div className="rounded-2xl border bg-slate-50 dark:bg-slate-800/50 p-4 space-y-2.5">
                                <div className="flex items-center gap-2">
                                    <Cpu className="h-4 w-4 text-indigo-500 shrink-0" />
                                    <span className="font-mono font-bold text-base">{pane.paneNumber}</span>
                                    <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                        pane.currentStatus === "completed"
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400"
                                            : pane.currentStatus === "in_progress"
                                            ? "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400"
                                            : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600"
                                    }`}>
                                        {pane.currentStatus === "pending" ? "รอดำเนินการ" : pane.currentStatus === "in_progress" ? "กำลังทำ" : pane.currentStatus === "completed" ? "เสร็จแล้ว" : pane.currentStatus}
                                    </span>
                                </div>
                                {materialObj && (
                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                        <Layers className="h-3.5 w-3.5 shrink-0" />
                                        <span>{materialObj.name}</span>
                                    </div>
                                )}
                                {orderObj && (
                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                        <Package className="h-3.5 w-3.5 shrink-0" />
                                        <span>ออเดอร์ #{(orderObj._id ?? "").slice(-6).toUpperCase()}</span>
                                    </div>
                                )}
                                {pane.currentStation && (
                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                                        <span>สถานี: <span className="font-semibold text-foreground">{pane.currentStation}</span></span>
                                    </div>
                                )}
                            </div>

                            {/* Reason */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                                    เหตุผลการเคลม <span className="text-red-500">*</span>
                                </label>
                                <Textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="อธิบายปัญหาหรือความเสียหายที่พบ..."
                                    className="resize-none rounded-xl text-sm min-h-[80px]"
                                    rows={3}
                                />
                            </div>

                            {/* Photos */}
                            <div className="space-y-2">
                                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                                    <Camera className="h-3 w-3" />
                                    รูปหลักฐาน ({photos.length}/3)
                                </label>

                                {photos.length > 0 && (
                                    <div className="flex gap-2 flex-wrap">
                                        {photos.map((src, i) => (
                                            <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 group">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={src} alt={`photo-${i}`} className="w-full h-full object-cover" />
                                                <button
                                                    onClick={() => removePhoto(i)}
                                                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Trash2 className="h-4 w-4 text-white" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {photos.length < 3 && (
                                    <>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            multiple
                                            className="hidden"
                                            onChange={handleFileChange}
                                        />
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-sm text-muted-foreground hover:border-red-300 hover:text-red-600 dark:hover:border-red-700 dark:hover:text-red-400 transition-colors"
                                        >
                                            <ImagePlus className="h-4 w-4 shrink-0" />
                                            ถ่ายรูปหรือเลือกไฟล์ภาพ
                                        </button>
                                    </>
                                )}
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-3 py-2.5 rounded-xl border border-red-100 dark:border-red-900/30">
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    {error}
                                </div>
                            )}

                            <div className="flex gap-2">
                                <Button variant="outline" onClick={reset} className="flex-1 rounded-xl">
                                    ยกเลิก
                                </Button>
                                <Button
                                    onClick={handleSubmit}
                                    disabled={submitting || !description.trim()}
                                    className="flex-1 h-11 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white"
                                >
                                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileWarning className="h-4 w-4 mr-2" />}
                                    {submitting ? "กำลังส่ง..." : "ส่งเรื่องเคลม"}
                                </Button>
                            </div>
                        </>
                    )}

                    {/* ── Step 3: Success ── */}
                    {step === "success" && (
                        <div className="flex flex-col items-center gap-4 py-4 text-center">
                            <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center">
                                <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div>
                                <p className="font-bold text-base">ส่งเรื่องเคลมสำเร็จ!</p>
                                {pane && <p className="text-sm text-muted-foreground mt-1">กระจก <span className="font-mono font-bold">{pane.paneNumber}</span> ถูกบันทึกแล้ว</p>}
                                {result?.claimNumber && <p className="text-[11px] text-muted-foreground mt-1">เลขที่เคลม: {result.claimNumber}</p>}
                                {result && !result.claimNumber && <p className="text-[11px] text-muted-foreground mt-1">#{result._id.slice(-8).toUpperCase()}</p>}
                            </div>
                            <div className="flex gap-2 w-full">
                                <Button variant="outline" onClick={reset} className="flex-1 rounded-xl">
                                    เคลมชิ้นอื่น
                                </Button>
                                <Button onClick={onClose} className="flex-1 rounded-xl font-bold">
                                    เสร็จสิ้น
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
