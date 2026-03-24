"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { PackageOpen, QrCode, CheckCircle2, AlertTriangle, Loader2, X, Layers, Package, Cpu, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { panesApi } from "@/lib/api/panes";
import { withdrawalsApi } from "@/lib/api/withdrawals";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { Pane, Order, Material, Withdrawal } from "@/lib/api/types";
import { CameraScanModal } from "@/components/stations/designer/blocks/CameraScanModal";

interface WithdrawModalProps {
    stationId?: string;
    onClose: () => void;
}

type Step = "scan" | "confirm" | "success";

export function WithdrawModal({ stationId, onClose }: WithdrawModalProps) {
    const [step, setStep] = useState<Step>("scan");
    const [paneNumber, setPaneNumber] = useState("");
    const [notes, setNotes] = useState("");
    const [pane, setPane] = useState<Pane | null>(null);
    const [fetching, setFetching] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<Withdrawal | null>(null);
    const [showCamera, setShowCamera] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Listen for withdrawal:updated — backend sends { action, data }
    useWebSocket("withdrawal", ["withdrawal:updated"], useCallback((_event: string, data: unknown) => {
        const payload = data as { action?: string; data?: Withdrawal };
        if (payload?.action === "created" && payload.data) setResult(prev => prev ?? payload.data ?? null);
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
            const p = res.data as Pane;
            if (p.currentStatus === "completed") {
                setError(`กระจก ${raw} เสร็จสิ้นแล้ว ไม่สามารถเบิกได้`);
                return;
            }
            setPane(p);
            setStep("confirm");
        } catch {
            setError("เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
        } finally {
            setFetching(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") lookupPane(paneNumber);
    };

    const handleQrScan = (raw: string) => {
        const num = raw.replace(/^STDPLUS:/i, "").trim().toUpperCase();
        setPaneNumber(num);
        setShowCamera(false);
        lookupPane(num);
    };

    const handleSubmit = async () => {
        if (!pane) return;
        setSubmitting(true);
        setError(null);
        try {
            const orderId = pane.order
                ? (typeof pane.order === "object" ? (pane.order as Order)._id : String(pane.order))
                : null;
            const materialId = pane.material
                ? (typeof pane.material === "object" ? (pane.material as Material)._id : String(pane.material))
                : undefined;

            let res;
            if (orderId && materialId) {
                // Use existing endpoint — works without backend changes
                res = await withdrawalsApi.create({
                    order: orderId,
                    material: materialId,
                    quantity: 1,
                    stockType: "Raw",
                    pane: pane._id,
                    notes: notes.trim() || undefined,
                } as Parameters<typeof withdrawalsApi.create>[0]);
            } else {
                // Fallback: new endpoint (requires backend from-pane route)
                res = await withdrawalsApi.createFromPane({
                    paneNumber: pane.paneNumber,
                    notes: notes.trim() || undefined,
                });
            }

            if (!res.success) {
                setError(res.message ?? "ไม่สามารถสร้างรายการเบิกได้");
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
        setNotes("");
        setPane(null);
        setError(null);
        setResult(null);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    // Helpers
    const orderObj = pane?.order && typeof pane.order === "object" ? pane.order as Order : null;
    const materialObj = pane?.material && typeof pane.material === "object" ? pane.material as Material : null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="bg-card rounded-2xl border shadow-2xl w-full max-w-sm overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b">
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-xl bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center">
                            <PackageOpen className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div>
                            <p className="text-sm font-bold">เบิกกระจก</p>
                            <p className="text-[11px] text-muted-foreground">
                                {step === "scan" ? "สแกนหรือพิมพ์หมายเลขกระจก" : step === "confirm" ? "ยืนยันการเบิก" : "เบิกสำเร็จ"}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="px-5 py-5 space-y-4">
                    {/* ── Step 1: Scan ── */}
                    {step === "scan" && (
                        <>
                            <div className="flex flex-col items-center gap-3 py-4">
                                <div className="h-16 w-16 rounded-2xl bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center">
                                    <QrCode className="h-8 w-8 text-orange-500" />
                                </div>
                                <p className="text-sm text-muted-foreground text-center">
                                    สแกน QR หรือพิมพ์หมายเลขกระจก แล้วกด Enter
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    ref={inputRef}
                                    value={paneNumber}
                                    onChange={e => { setPaneNumber(e.target.value.toUpperCase()); setError(null); }}
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
                                {paneNumber.trim() && (
                                    <Button
                                        variant="outline"
                                        onClick={() => lookupPane(paneNumber)}
                                        disabled={fetching}
                                        className="h-10 px-3 rounded-xl shrink-0"
                                    >
                                        {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
                                    </Button>
                                )}
                            </div>
                            {error && (
                                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-3 py-2.5 rounded-xl border border-red-100 dark:border-red-900/30">
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    {error}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── Step 2: Confirm ── */}
                    {step === "confirm" && pane && (
                        <>
                            {/* Pane info card */}
                            <div className="rounded-2xl border bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <Cpu className="h-4 w-4 text-indigo-500 shrink-0" />
                                    <span className="font-mono font-bold text-base">{pane.paneNumber}</span>
                                    <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                        pane.currentStatus === "pending"
                                            ? "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600"
                                            : "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400"
                                    }`}>
                                        {pane.currentStatus === "pending" ? "รอดำเนินการ" : pane.currentStatus === "in_progress" ? "กำลังทำ" : pane.currentStatus}
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
                                        {orderObj.code && <span className="text-[11px] font-mono text-slate-400">({orderObj.code})</span>}
                                    </div>
                                )}
                                {pane.currentStation && (
                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                                        <span>สถานีปัจจุบัน: <span className="font-semibold text-foreground">{pane.currentStation}</span></span>
                                    </div>
                                )}
                            </div>

                            <Textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="หมายเหตุ (ไม่บังคับ)"
                                className="resize-none rounded-xl text-sm"
                                rows={2}
                            />

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
                                    disabled={submitting}
                                    className="flex-1 h-11 rounded-xl font-bold bg-orange-600 hover:bg-orange-700 text-white"
                                >
                                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PackageOpen className="h-4 w-4 mr-2" />}
                                    {submitting ? "กำลังเบิก..." : "ยืนยันเบิก"}
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
                                <p className="font-bold text-base">เบิกกระจกสำเร็จ!</p>
                                {pane && <p className="text-sm text-muted-foreground mt-1">กระจก <span className="font-mono font-bold">{pane.paneNumber}</span> ถูกเบิกแล้ว</p>}
                                {result && <p className="text-[11px] text-muted-foreground mt-1">#{result._id.slice(-8).toUpperCase()}</p>}
                            </div>
                            <div className="flex gap-2 w-full">
                                <Button variant="outline" onClick={reset} className="flex-1 rounded-xl">
                                    เบิกชิ้นอื่น
                                </Button>
                                <Button onClick={onClose} className="flex-1 rounded-xl font-bold">
                                    เสร็จสิ้น
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {showCamera && (
                <CameraScanModal
                    onScan={handleQrScan}
                    onClose={() => setShowCamera(false)}
                />
            )}
        </div>
    );
}
