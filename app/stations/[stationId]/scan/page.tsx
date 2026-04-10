"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Camera, CheckCircle2, XCircle, Loader2, ArrowRight,
    MapPin, RotateCcw, Package, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { stationsApi } from "@/lib/api/stations";
import { panesApi } from "@/lib/api/panes";
import { Station, Pane } from "@/lib/api/types";
import { parseQrScan } from "@/lib/utils/parseQrScan";
import {
    getStationName,
    isPaneWithdrawn,
    isStationMatch,
    stationNameRequiresWithdrawalBeforeComplete,
} from "@/lib/utils/station-helpers";
import { resolveActivePane } from "@/lib/utils/pane-laminate";
import { withMergedIntoScanRetry } from "@/lib/utils/merged-into-scan";
import type { Html5Qrcode as Html5QrcodeType } from "html5-qrcode";

type ScanState = "ready" | "scanning" | "processing" | "success" | "error";

const STATUS_LABEL: Record<string, string> = {
    pending: "รอดำเนินการ",
    in_progress: "กำลังผลิต",
    completed: "เสร็จแล้ว",
};

export default function MobilePaneScanPage() {
    const params = useParams();
    const stationId = params.stationId as string;

    const [station, setStation] = useState<Station | null>(null);
    const [loadingStation, setLoadingStation] = useState(true);
    const [scanState, setScanState] = useState<ScanState>("ready");
    const [message, setMessage] = useState("");
    const [scannedPane, setScannedPane] = useState<Pane | null>(null);
    const [nextStation, setNextStation] = useState<string | null>(null);
    const [completedCount, setCompletedCount] = useState(0);
    const [mismatchInfo, setMismatchInfo] = useState<{
        paneStation: string;
        thisStation: string;
        paneNumber: string;
    } | null>(null);

    const scannerRef = useRef<Html5QrcodeType | null>(null);
    const scannerRunning = useRef(false);
    const hasScanned = useRef(false);
    const divId = useRef(`pane-scanner-${Math.random().toString(36).slice(2)}`);

    useEffect(() => {
        stationsApi.getById(stationId)
            .then((res) => {
                if (res.success && res.data) setStation(res.data as unknown as Station);
            })
            .catch(() => {})
            .finally(() => setLoadingStation(false));
    }, [stationId]);

    const startCamera = useCallback(async () => {
        hasScanned.current = false;
        scannerRunning.current = false;
        setScanState("scanning");
        setMessage("");
        setScannedPane(null);
        setNextStation(null);

        try {
            const { Html5Qrcode } = await import("html5-qrcode");
            const el = document.getElementById(divId.current);
            if (!el) return;

            if (scannerRef.current && scannerRunning.current) {
                try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch {}
            }

            const scanner = new Html5Qrcode(divId.current);
            scannerRef.current = scanner;

            await scanner.start(
                { facingMode: "environment" },
                { fps: 15, qrbox: { width: 250, height: 250 } },
                (decodedText: string) => {
                    if (hasScanned.current) return;
                    hasScanned.current = true;
                    if ("vibrate" in navigator) navigator.vibrate(100);
                    handlePaneScan(decodedText);
                },
                () => {},
            );

            if (scannerRef.current !== scanner) {
                try { await scanner.stop(); } catch {}
                try { scanner.clear(); } catch {}
                return;
            }
            scannerRunning.current = true;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setScanState("error");
            setMessage(msg.toLowerCase().includes("permission")
                ? "ไม่ได้รับอนุญาตใช้กล้อง — กรุณาอนุญาตในเบราว์เซอร์"
                : "ไม่สามารถเปิดกล้องได้: " + msg);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [station]);

    async function stopCamera() {
        const scanner = scannerRef.current;
        const wasRunning = scannerRunning.current;
        scannerRef.current = null;
        scannerRunning.current = false;
        if (!scanner) return;
        if (wasRunning) {
            try { await scanner.stop(); } catch {}
        }
        try { scanner.clear(); } catch {}
    }

    async function handlePaneScan(raw: string) {
        await stopCamera();
        setScanState("processing");
        setMessage("กำลังตรวจสอบ...");

        const parsed = parseQrScan(raw.trim());
        const paneNumber = parsed.type === "pane"
            ? parsed.value
            : raw.trim().replace(/^STDPLUS:/i, "").trim();

        if (!stationId) {
            setScanState("error");
            setMessage("ไม่สามารถระบุสถานีได้");
            return;
        }

        try {
            const lookupRes = await panesApi.getById(paneNumber);
            if (lookupRes.success && lookupRes.data) {
                const active = resolveActivePane(lookupRes.data);
                const cs = active.currentStation;
                const isHere = !cs || isStationMatch(cs, stationId, station?.name);
                if (!isHere) {
                    setMismatchInfo({
                        paneStation: getStationName(cs),
                        thisStation: station?.name ?? stationId,
                        paneNumber,
                    });
                    setScanState("ready");
                    setMessage("");
                    return;
                }
            }
        } catch {
            // lookup failed — proceed with scan anyway
        }

        await executeScan(paneNumber, false);
    }

    async function executeScan(paneNumber: string, force: boolean) {
        setScanState("processing");
        setMessage("กำลังบันทึก...");

        try {
            const preLookup = await panesApi.getById(paneNumber);
            if (preLookup.success && preLookup.data) {
                const active = resolveActivePane(preLookup.data);
                if (
                    stationNameRequiresWithdrawalBeforeComplete(station?.name) &&
                    !isPaneWithdrawn(active)
                ) {
                    setScanState("error");
                    setMessage("กรุณาเบิกวัสดุก่อนทำเสร็จ");
                    return;
                }
            }

            const res = await withMergedIntoScanRetry(paneNumber, async (pn) => {
                const r = await panesApi.scan(pn, {
                    station: stationId,
                    action: "complete",
                    ...(force ? { force: true } : {}),
                });
                if (!r.success) throw new Error(r.message || "สแกนไม่สำเร็จ");
                return r;
            });

            setScannedPane(res.data.pane);
            const ns = res.data.nextStation ?? null;
            setNextStation(ns ? (typeof ns === "object" ? (ns as { name?: string }).name ?? String(ns) : ns) : null);
            setCompletedCount((c) => c + 1);
            setScanState("success");
            const nextName = ns ? getStationName(ns as string | { _id: string; name: string }) : null;
            setMessage(nextName
                ? `เสร็จสิ้น → ส่งต่อไปสถานี ${nextName}`
                : "เสร็จสิ้น — ครบทุกสถานีแล้ว");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
            setScanState("error");
            setMessage(msg);
        }
    }

    async function handleForceConfirm() {
        if (!mismatchInfo || !stationId) return;
        const pn = mismatchInfo.paneNumber;
        setMismatchInfo(null);
        await executeScan(pn, true);
    }

    function handleForceDismiss() {
        setMismatchInfo(null);
        setScanState("ready");
        setMessage("");
    }

    useEffect(() => {
        return () => { stopCamera(); };
    }, []);

    if (loadingStation) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Header */}
            <div className="border-b bg-card px-4 py-3 flex items-center gap-3 shrink-0">
                <Camera className="h-5 w-5 text-primary" />
                <div className="flex-1 min-w-0">
                    <h1 className="text-sm font-bold text-foreground">สแกน Pane</h1>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span>{station?.name ?? stationId}</span>
                    </div>
                </div>
                {completedCount > 0 && (
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full">
                        {completedCount} เสร็จ
                    </span>
                )}
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">

                {/* READY state */}
                {scanState === "ready" && (
                    <div className="w-full max-w-sm text-center space-y-6">
                        <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                            <Camera className="h-10 w-10 text-primary" />
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-lg font-bold text-foreground">สแกน QR กระจก</h2>
                            <p className="text-sm text-muted-foreground">
                                สแกน QR Code บนกระจกเพื่อบันทึกว่าเสร็จสิ้นที่สถานีนี้
                            </p>
                        </div>
                        <Button onClick={startCamera} size="lg" className="w-full gap-2 py-3 text-sm font-bold">
                            <Camera className="h-4 w-4" />
                            เปิดกล้องสแกน
                        </Button>
                    </div>
                )}

                {/* SCANNING state */}
                {scanState === "scanning" && (
                    <div className="w-full max-w-sm space-y-3">
                        <div
                            id={divId.current}
                            className="w-full rounded-xl overflow-hidden border-2 border-primary/30"
                            style={{ minHeight: 300 }}
                        />
                        <p className="text-center text-xs text-muted-foreground">
                            วาง QR Code ของ Pane ให้อยู่ในกรอบ
                        </p>
                        <Button
                            onClick={() => { stopCamera(); setScanState("ready"); }}
                            variant="outline"
                            className="w-full"
                        >
                            ยกเลิก
                        </Button>
                    </div>
                )}

                {/* PROCESSING state */}
                {scanState === "processing" && (
                    <div className="text-center space-y-3">
                        <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                        <p className="text-sm text-muted-foreground">{message}</p>
                    </div>
                )}

                {/* SUCCESS state */}
                {scanState === "success" && scannedPane && (
                    <div className="w-full max-w-sm space-y-4">
                        <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
                            <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800/50 flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                                    เสร็จสิ้น!
                                </span>
                            </div>

                            <div className="p-4 space-y-3">
                                <div className="flex items-center gap-3">
                                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Pane</p>
                                        <p className="text-lg font-mono font-black text-foreground">{scannedPane.paneNumber}</p>
                                    </div>
                                </div>

                                {scannedPane.glassTypeLabel && (
                                    <div className="text-sm text-muted-foreground">
                                        {scannedPane.glassTypeLabel}
                                        {scannedPane.dimensions && ` — ${scannedPane.dimensions.width}×${scannedPane.dimensions.height}`}
                                    </div>
                                )}

                                <div className="text-xs text-muted-foreground">
                                    สถานะ: <span className="font-semibold">{STATUS_LABEL[scannedPane.currentStatus] ?? scannedPane.currentStatus}</span>
                                </div>

                                {nextStation && (
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 text-xs text-blue-700 dark:text-blue-300">
                                        <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                                        <span>ส่งต่อไปสถานี <span className="font-bold">{nextStation}</span></span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <Button onClick={startCamera} size="lg" className="w-full gap-2 py-3 text-sm font-bold">
                            <RotateCcw className="h-4 w-4" />
                            สแกนชิ้นถัดไป
                        </Button>
                    </div>
                )}

                {/* ERROR state */}
                {scanState === "error" && (
                    <div className="w-full max-w-sm space-y-4">
                        <div className="rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 p-4 space-y-2">
                            <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
                                <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
                                <p className="text-sm font-medium whitespace-pre-line">{message}</p>
                            </div>
                        </div>
                        <Button onClick={startCamera} size="lg" className="w-full gap-2 py-3 text-sm font-bold">
                            <RotateCcw className="h-4 w-4" />
                            ลองใหม่
                        </Button>
                        <Button
                            onClick={() => setScanState("ready")}
                            variant="ghost"
                            className="w-full text-muted-foreground"
                        >
                            กลับหน้าหลัก
                        </Button>
                    </div>
                )}
            </div>

            {mismatchInfo && (
                <Dialog open onOpenChange={(open) => { if (!open) handleForceDismiss(); }}>
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
                            <Button variant="outline" onClick={handleForceDismiss}>ยกเลิก</Button>
                            <Button
                                onClick={handleForceConfirm}
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
