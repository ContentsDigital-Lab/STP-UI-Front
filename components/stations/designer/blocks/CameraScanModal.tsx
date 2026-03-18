"use client";

import { useEffect, useRef, useState } from "react";
import { X, Camera, Loader2, AlertCircle } from "lucide-react";
import type { Html5Qrcode as Html5QrcodeType } from "html5-qrcode";

interface CameraScanModalProps {
    onScan: (rawValue: string) => void;
    onClose: () => void;
}

/**
 * CameraScanModal — opens the device camera and scans for QR codes using
 * html5-qrcode. Calls onScan(rawValue) on first successful decode then closes.
 *
 * Lazy-imports html5-qrcode so it doesn't bloat the initial bundle.
 */
export function CameraScanModal({ onScan, onClose }: CameraScanModalProps) {
    const scannerRef = useRef<Html5QrcodeType | null>(null);
    const divId = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`);
    const [status, setStatus] = useState<"init" | "scanning" | "error">("init");
    const [errorMsg, setErrorMsg] = useState("");
    const hasScanned = useRef(false);

    useEffect(() => {
        let mounted = true;

        async function startScanner() {
            try {
                // Dynamic import to keep initial bundle small
                const { Html5Qrcode } = await import("html5-qrcode");
                if (!mounted) return;

                const scanner = new Html5Qrcode(divId.current);
                scannerRef.current = scanner;

                await scanner.start(
                    { facingMode: "environment" },
                    { fps: 15, qrbox: { width: 250, height: 250 } },
                    (decodedText: string) => {
                        if (hasScanned.current) return;
                        hasScanned.current = true;
                        // Vibrate on mobile if supported
                        if ("vibrate" in navigator) navigator.vibrate(100);
                        onScan(decodedText);
                        onClose();
                    },
                    () => { /* ignore scan failures */ }
                );
                if (mounted) setStatus("scanning");
            } catch (err: unknown) {
                if (!mounted) return;
                const msg = err instanceof Error ? err.message : String(err);
                if (msg.toLowerCase().includes("permission")) {
                    setErrorMsg("ไม่ได้รับอนุญาตใช้กล้อง — กรุณาอนุญาตในเบราว์เซอร์");
                } else {
                    setErrorMsg("ไม่สามารถเปิดกล้องได้: " + msg);
                }
                setStatus("error");
            }
        }

        startScanner();

        return () => {
            mounted = false;
            const scanner = scannerRef.current;
            if (scanner?.stop) {
                scanner.stop().then(() => scanner.clear()).catch(() => { });
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <div className="flex items-center gap-2">
                        <Camera className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">สแกน QR ด้วยกล้อง</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full p-1 hover:bg-muted transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Camera viewport */}
                <div className="relative bg-black">
                    {status === "init" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white z-10 py-16">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <p className="text-sm">กำลังเปิดกล้อง...</p>
                        </div>
                    )}
                    {status === "error" && (
                        <div className="py-12 px-6 flex flex-col items-center gap-3 text-center">
                            <AlertCircle className="h-10 w-10 text-red-400" />
                            <p className="text-sm text-red-300">{errorMsg}</p>
                            <button
                                onClick={onClose}
                                className="mt-2 px-4 py-2 rounded-lg bg-muted text-sm font-medium"
                            >
                                ปิด
                            </button>
                        </div>
                    )}
                    {/* html5-qrcode mounts its stream here */}
                    <div
                        id={divId.current}
                        className="w-full"
                        style={{ minHeight: status === "error" ? 0 : 300 }}
                    />
                </div>

                {status === "scanning" && (
                    <p className="text-center text-xs text-muted-foreground py-3 px-4">
                        วางโค้ดให้อยู่ในกรอบเพื่อสแกน
                    </p>
                )}
            </div>
        </div>
    );
}
