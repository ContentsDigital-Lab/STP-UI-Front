"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { PackageOpen, QrCode, CheckCircle2, AlertTriangle, Loader2, X, Layers, Package, Cpu, Camera, Boxes, MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { panesApi } from "@/lib/api/panes";
import { withdrawalsApi } from "@/lib/api/withdrawals";
import { inventoriesApi } from "@/lib/api/inventories";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { useAuth } from "@/lib/auth/auth-context";
import { Pane, Order, Material, Inventory, Withdrawal } from "@/lib/api/types";
import { CameraScanModal } from "@/components/stations/designer/blocks/CameraScanModal";

interface WithdrawModalProps {
    stationId?: string;
    onClose: () => void;
    /** Pre-fill a pane and skip the scan step entirely */
    initialPane?: Pane;
}

type Step = "scan" | "confirm" | "success";

// Extract material ID from string | Material
function matId(m: string | Material | undefined | null): string | null {
    if (!m) return null;
    if (typeof m === "object") return m._id;
    return m;
}

// Material specs label for display
function matSpecs(m: string | Material | undefined | null): string {
    if (!m || typeof m !== "object") return "";
    const s = m.specDetails ?? {};
    return [s.glassType, s.thickness ? `${s.thickness}mm` : null, s.color]
        .filter(Boolean).join(" • ");
}

export function WithdrawModal({ stationId, onClose, initialPane }: WithdrawModalProps) {
    const { user } = useAuth();
    const [step, setStep] = useState<Step>(initialPane ? "confirm" : "scan");
    const [paneNumber, setPaneNumber] = useState("");
    const [pane, setPane] = useState<Pane | null>(initialPane ?? null);
    const [fetching, setFetching] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<Withdrawal | null>(null);
    const [showCamera, setShowCamera] = useState(false);

    // Inventory matching state
    const [matchingInvs, setMatchingInvs] = useState<Inventory[]>([]);
    const [selectedInv, setSelectedInv] = useState<Inventory | null>(null);
    const [loadingInv, setLoadingInv] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (initialPane) {
            fetchMatchingInventory(initialPane);
        } else {
            inputRef.current?.focus();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Listen for withdrawal:updated — backend sends { action, data }
    useWebSocket("withdrawal", ["withdrawal:updated"], useCallback((_event: string, data: unknown) => {
        const payload = data as { action?: string; data?: Withdrawal };
        if (payload?.action === "created" && payload.data) setResult(prev => prev ?? payload.data ?? null);
    }, []));

    // Fetch inventories matching pane's rawGlass spec (or fallback to material ID)
    const fetchMatchingInventory = useCallback(async (p: Pane) => {
        setLoadingInv(true);
        try {
            const res = await inventoriesApi.getAll();
            if (!res.success) return;

            let matches: Inventory[];
            if (p.rawGlass?.glassType) {
                // New path: match by rawGlass spec (glassType + optional thickness + color)
                const rg = p.rawGlass;
                matches = res.data.filter(inv => {
                    if (inv.quantity <= 0) return false;
                    const mat = typeof inv.material === "object" ? inv.material as Material : null;
                    if (!mat?.specDetails) return false;
                    const typeMatch = (mat.specDetails.glassType ?? "").toLowerCase() === rg.glassType.toLowerCase();
                    const thicknessMatch = !rg.thickness || parseInt(mat.specDetails.thickness ?? "0") === rg.thickness;
                    const colorMatch = !rg.color ||
                        (mat.specDetails.color ?? "").toLowerCase().includes(rg.color.toLowerCase()) ||
                        rg.color.toLowerCase().includes((mat.specDetails.color ?? "").toLowerCase());
                    return typeMatch && thicknessMatch && colorMatch;
                });
            } else {
                // Fallback: match by pane.material ID
                const pMatId = matId(p.material);
                matches = pMatId
                    ? res.data.filter(inv => matId(inv.material) === pMatId && inv.quantity > 0)
                    : [];
            }

            matches.sort((a, b) => {
                if (a.stockType !== b.stockType) return a.stockType === "Raw" ? -1 : 1;
                return b.quantity - a.quantity;
            });
            setMatchingInvs(matches);
            setSelectedInv(matches[0] ?? null);
        } finally {
            setLoadingInv(false);
        }
    }, []);

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
            fetchMatchingInventory(p);
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
            // Prefer material from selected inventory slot (rawGlass flow) over pane.material
            const materialId = selectedInv ? matId(selectedInv.material) : matId(pane.material);
            const sheetsNeeded = pane.rawGlass?.sheetsPerPane ?? 1;

            const res = await withdrawalsApi.create({
                order: orderId ?? undefined,
                material: materialId ?? undefined,
                withdrawnBy: user?._id,
                quantity: sheetsNeeded,
                stockType: selectedInv?.stockType ?? "Raw",
                pane: pane._id,
            } as Parameters<typeof withdrawalsApi.create>[0]);

            if (!res.success) {
                setError(res.message ?? "ไม่สามารถสร้างรายการเบิกได้");
                return;
            }
            setResult(res.data);
            setStep("success");
            // Link withdrawal ID back to the pane record
            panesApi.update(pane._id, { withdrawal: res.data._id } as Parameters<typeof panesApi.update>[1]).catch(() => {/* non-critical */});
        } catch (e) {
            setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
        } finally {
            setSubmitting(false);
        }
    };

    const reset = () => {
        setStep("scan");
        setPaneNumber("");

        setPane(null);
        setError(null);
        setResult(null);
        setMatchingInvs([]);
        setSelectedInv(null);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    // Helpers
    const orderObj = pane?.order && typeof pane.order === "object" ? pane.order as Order : null;
    const materialObj = pane?.material && typeof pane.material === "object" ? pane.material as Material : null;
    const invMaterialObj = (inv: Inventory) => typeof inv.material === "object" ? inv.material as Material : null;

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
                            <div className="rounded-2xl border bg-slate-50 dark:bg-slate-800/50 p-4 space-y-2.5">
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
                                        {matSpecs(materialObj) && (
                                            <span className="text-[11px] text-slate-400">{matSpecs(materialObj)}</span>
                                        )}
                                    </div>
                                )}
                                {pane.dimensions && (
                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>
                                        <span>{pane.dimensions.width} × {pane.dimensions.height} × {pane.dimensions.thickness} mm</span>
                                    </div>
                                )}
                                {orderObj && (
                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                        <Package className="h-3.5 w-3.5 shrink-0" />
                                        <span>ออเดอร์ {orderObj.orderNumber ?? `#${(orderObj._id ?? "").slice(-6).toUpperCase()}`}</span>
                                    </div>
                                )}
                            </div>

                            {/* ── rawGlass info banner ── */}
                            {pane.rawGlass?.glassType && (
                                <div className="flex items-center gap-2 text-xs bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 px-3 py-2 rounded-xl">
                                    <Boxes className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                    <span className="text-blue-700 dark:text-blue-300 font-medium">
                                        ต้องการ <span className="font-bold">{pane.rawGlass.glassType}{pane.rawGlass.color ? ` ${pane.rawGlass.color}` : ''}{pane.rawGlass.thickness ? ` ${pane.rawGlass.thickness}mm` : ''}</span>
                                        {' × '}<span className="font-bold">{pane.rawGlass.sheetsPerPane} แผ่น</span>
                                    </span>
                                </div>
                            )}

                            {/* ── Inventory matching section ── */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                                        <Boxes className="h-3 w-3" />
                                        สต็อกที่จะตัด
                                    </p>
                                    {!loadingInv && (
                                        <button
                                            onClick={() => fetchMatchingInventory(pane)}
                                            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                                        >
                                            <RefreshCw className="h-2.5 w-2.5" />
                                            รีเฟรช
                                        </button>
                                    )}
                                </div>

                                {loadingInv ? (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-3 justify-center">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        กำลังโหลดสต็อก...
                                    </div>
                                ) : matchingInvs.length === 0 ? (
                                    <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-3 py-2.5 rounded-xl border border-red-100 dark:border-red-900/30">
                                        <AlertTriangle className="h-4 w-4 shrink-0" />
                                        ไม่พบสต็อกวัสดุที่ตรงกัน — ไม่สามารถเบิกได้
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        {matchingInvs.slice(0, 3).map(inv => {
                                            const iMat = invMaterialObj(inv);
                                            const isSelected = selectedInv?._id === inv._id;
                                            return (
                                                <button
                                                    key={inv._id}
                                                    onClick={() => setSelectedInv(inv)}
                                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                                                        isSelected
                                                            ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-600"
                                                            : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50 dark:bg-slate-800/50"
                                                    }`}
                                                >
                                                    <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                                        isSelected ? "border-orange-500" : "border-slate-300 dark:border-slate-600"
                                                    }`}>
                                                        {isSelected && <div className="h-2.5 w-2.5 rounded-full bg-orange-500" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-semibold text-foreground truncate">
                                                                {iMat?.name ?? (typeof inv.material === "string" ? inv.material.slice(-6) : "—")}
                                                            </span>
                                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                                                                inv.stockType === "Raw"
                                                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                                                                    : "bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400"
                                                            }`}>
                                                                {inv.stockType === "Raw" ? "วัตถุดิบ" : "นำกลับมาใช้"}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            {inv.location && (
                                                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                                    <MapPin className="h-2.5 w-2.5" />{inv.location}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="shrink-0 text-right">
                                                        <span className={`text-base font-bold ${
                                                            pane.rawGlass?.sheetsPerPane && inv.quantity < pane.rawGlass.sheetsPerPane
                                                                ? "text-red-500"
                                                                : inv.quantity <= 5 ? "text-amber-600" : "text-emerald-600 dark:text-emerald-400"
                                                        }`}>
                                                            {inv.quantity}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground block">
                                                            {pane.rawGlass?.sheetsPerPane && pane.rawGlass.sheetsPerPane > 1 ? `/ ${pane.rawGlass.sheetsPerPane} แผ่น` : 'ชิ้น'}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                        {matchingInvs.length > 3 && (
                                            <p className="text-[11px] text-muted-foreground text-center">
                                                +{matchingInvs.length - 3} รายการอื่น
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>


                            {selectedInv && pane.rawGlass?.sheetsPerPane && selectedInv.quantity < pane.rawGlass.sheetsPerPane && (
                                <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-3 py-2.5 rounded-xl border border-red-100 dark:border-red-900/30">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                    สต็อกไม่เพียงพอ — มี {selectedInv.quantity} แผ่น ต้องการ {pane.rawGlass.sheetsPerPane} แผ่น
                                </div>
                            )}

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
                                    disabled={
                                        submitting ||
                                        loadingInv ||
                                        (!loadingInv && matchingInvs.length === 0) ||
                                        !!(selectedInv && pane.rawGlass?.sheetsPerPane && selectedInv.quantity < pane.rawGlass.sheetsPerPane)
                                    }
                                    className="flex-1 h-11 rounded-xl font-bold bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
                                {selectedInv && (
                                    <p className="text-[11px] text-muted-foreground mt-1">
                                        ตัดสต็อก: {typeof selectedInv.material === "object" ? (selectedInv.material as Material).name : "—"}
                                        {selectedInv.location ? ` (${selectedInv.location})` : ""}
                                    </p>
                                )}
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
