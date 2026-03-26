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
            a.download    = `qr-${code}.png`;
            a.href        = canvas.toDataURL("image/png");
            a.click();
        };
        img.src = url;
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-sm overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800/50">
                    <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-blue-50 dark:bg-[#E8601C]/10 flex items-center justify-center">
                            <QrCode className="h-4 w-4 text-blue-600 dark:text-[#E8601C]" />
                        </div>
                        <span className="text-base font-bold text-slate-900 dark:text-white tracking-tight">QR Code</span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex flex-col items-center px-6 py-8">
                    {/* QR display */}
                    <div ref={svgRef} className="p-4 bg-white rounded-2xl border border-slate-200/60 shadow-sm ring-4 ring-slate-50 dark:ring-slate-800/30">
                        <QRCodeSVG
                            value={qrValue}
                            size={180}
                            bgColor="#ffffff"
                            fgColor="#000000"
                            level="H"
                            marginSize={4}
                        />
                    </div>

                    <div className="text-center mt-6 space-y-1 w-full px-4">
                        <p className="text-2xl font-mono font-bold tracking-wider text-slate-900 dark:text-white">
                            #{code}
                        </p>
                        {label && (
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate w-full" title={label}>{label}</p>
                        )}
                        <p className="text-[10px] text-slate-400/80 font-mono break-all mt-3 px-2">
                            {qrValue}
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 w-full mt-8">
                        <Button
                            variant="outline"
                            className="flex-1 h-11 rounded-xl border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                            onClick={onClose}
                        >
                            ปิด
                        </Button>
                        {value && value.startsWith("http") && (
                            <Button
                                variant="outline"
                                className="h-11 w-11 shrink-0 p-0 rounded-xl border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                                onClick={() => window.open(value, "_blank")}
                            >
                                <ExternalLink className="h-4 w-4" />
                            </Button>
                        )}
                        <Button
                            className="flex-1 h-11 rounded-xl gap-2 font-semibold bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 transition-all border-0"
                            onClick={handleDownloadPng}
                        >
                            <Download className="h-4 w-4" />
                            ดาวน์โหลด
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
