"use client";

import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X, Download, QrCode, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QrCodeModalProps {
    /** Sequential display code e.g. "001" */
    code: string;
    /** Human-readable label shown below the QR e.g. "กระจกใส 6mm — บริษัท ABC" */
    label?: string;
    /**
     * Value encoded in the QR.
     * Best practice (from std-plus): store a URL so scanning on any phone opens the record directly.
     * Defaults to the `code` if not provided.
     */
    value?: string;
    onClose: () => void;
}

export function QrCodeModal({ code, label, value, onClose }: QrCodeModalProps) {
    const svgRef   = useRef<HTMLDivElement>(null);
    const qrValue  = value ?? code;

    const handleDownloadPng = () => {
        const svgEl = svgRef.current?.querySelector("svg");
        if (!svgEl) return;

        const SIZE   = 512;
        const svgStr = new XMLSerializer().serializeToString(svgEl);
        const blob   = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
        const url    = URL.createObjectURL(blob);

        const img    = new Image();
        img.onload   = () => {
            const canvas  = document.createElement("canvas");
            canvas.width  = SIZE;
            canvas.height = SIZE + 64; // extra space for text label
            const ctx     = canvas.getContext("2d")!;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, SIZE, SIZE);
            // Print code below QR
            ctx.fillStyle = "#111111";
            ctx.font      = "bold 28px monospace";
            ctx.textAlign = "center";
            ctx.fillText(`#${code}`, SIZE / 2, SIZE + 36);
            if (label) {
                ctx.font      = "18px sans-serif";
                ctx.fillStyle = "#666666";
                ctx.fillText(label, SIZE / 2, SIZE + 60);
            }
            URL.revokeObjectURL(url);
            const a       = document.createElement("a");
            a.download    = `qr-order-${code}.png`;
            a.href        = canvas.toDataURL("image/png");
            a.click();
        };
        img.src = url;
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={onClose}
        >
            <div
                className="bg-card rounded-2xl border shadow-2xl w-full max-w-sm"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <div className="flex items-center gap-2">
                        <QrCode className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">QR Code ออเดอร์</span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded text-muted-foreground/40 hover:text-foreground transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* QR + code */}
                <div className="flex flex-col items-center gap-3 px-5 pb-5">
                    <div ref={svgRef} className="p-4 bg-white rounded-2xl border shadow-inner">
                        <QRCodeSVG
                            value={qrValue}
                            size={200}
                            bgColor="#ffffff"
                            fgColor="#000000"
                            level="H"
                            marginSize={4}
                        />
                    </div>

                    <div className="text-center space-y-0.5">
                        <p className="text-3xl font-mono font-bold tracking-widest text-foreground">
                            #{code}
                        </p>
                        {label && (
                            <p className="text-xs text-muted-foreground">{label}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground/50 font-mono break-all mt-1">
                            {qrValue}
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 w-full pt-1">
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={onClose}
                        >
                            ปิด
                        </Button>
                        {value && value.startsWith("http") && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                onClick={() => window.open(value, "_blank")}
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        <Button
                            size="sm"
                            className="flex-1 gap-1.5"
                            onClick={handleDownloadPng}
                        >
                            <Download className="h-3.5 w-3.5" />
                            ดาวน์โหลด
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
