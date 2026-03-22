"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { panesApi } from "@/lib/api/panes";
import { Pane } from "@/lib/api/types";

function fmtDate(d?: string) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

export default function PaneStickerPrintPage() {
    const searchParams = useSearchParams();
    const router       = useRouter();

    const requestId = searchParams.get("request");
    const paneIds   = searchParams.get("ids")?.split(",").filter(Boolean);

    const [panes,   setPanes]   = useState<Pane[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                if (paneIds && paneIds.length > 0) {
                    const results = await Promise.all(
                        paneIds.map(id => panesApi.getById(id))
                    );
                    setPanes(results.filter(r => r.success && r.data).map(r => r.data));
                } else if (requestId) {
                    const res = await panesApi.getAll({ request: requestId, limit: 200 });
                    if (res.success) setPanes(res.data ?? []);
                } else {
                    const res = await panesApi.getAll({ limit: 200 });
                    if (res.success) setPanes(res.data ?? []);
                }
            } catch { /* ignore */ }
            setLoading(false);
        }
        load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestId]);

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
    );

    if (panes.length === 0) return (
        <div className="p-6 text-center text-muted-foreground">ไม่พบข้อมูลกระจก</div>
    );

    const requestInfo = panes[0]?.request;
    const requestLabel = requestInfo && typeof requestInfo === "object"
        ? (requestInfo as unknown as Record<string, unknown>).requestNumber as string ?? ""
        : "";
    const requestType = requestInfo && typeof requestInfo === "object"
        ? ((requestInfo as unknown as Record<string, unknown>).details as Record<string, unknown>)?.type as string ?? ""
        : "";

    return (
        <>
            <style>{`
                @media print {
                    @page { size: A4; margin: 8mm; }
                    body { visibility: hidden; }
                    #pane-sticker-print, #pane-sticker-print * { visibility: visible; }
                    #pane-sticker-print { position: absolute; top: 0; left: 0; width: 100%; background: #fff; }
                    .no-print { display: none !important; }
                    .page-break-before { page-break-before: always; }
                }
            `}</style>

            {/* Screen toolbar */}
            <div className="no-print flex items-center gap-3 mb-6 px-6 pt-6">
                <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                    กลับ
                </Button>
                <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                        QR สติกเกอร์กระจก — {panes.length} ชิ้น
                        {requestLabel && <span className="ml-2 font-medium text-foreground">{requestLabel}</span>}
                        {requestType && <span className="ml-1 text-muted-foreground">({requestType})</span>}
                    </p>
                </div>
                <Button className="gap-2" onClick={() => window.print()}>
                    <Printer className="h-4 w-4" />
                    พิมพ์สติกเกอร์
                </Button>
            </div>

            {/* Print content */}
            <div id="pane-sticker-print" className="bg-white text-black font-sans px-6 pb-8">
                {/* Header */}
                <div className="border-b-2 border-gray-200 pb-4 mb-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-xl font-black text-gray-800">QR สติกเกอร์กระจก</h1>
                            <p className="text-xs text-gray-500 mt-1">
                                {panes.length} ชิ้น
                                {requestLabel && ` • ${requestLabel}`}
                                {requestType && ` • ${requestType}`}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-400">{fmtDate(new Date().toISOString())}</p>
                            <p className="text-[10px] text-gray-300 mt-0.5">สแกน QR เพื่อบันทึกการผลิต</p>
                        </div>
                    </div>
                </div>

                {/* Sticker grid */}
                <div className="grid grid-cols-3 gap-4">
                    {panes.map((pane) => {
                        const qrValue = pane.qrCode || `STDPLUS:${pane.paneNumber}`;
                        return (
                            <div key={pane._id} className="border-2 border-gray-300 rounded-xl p-3 flex flex-col items-center gap-2 bg-white break-inside-avoid">
                                {/* Pane number */}
                                <p className="font-mono font-black text-sm tracking-widest text-black">
                                    {pane.paneNumber}
                                </p>

                                {/* QR code */}
                                <div className="p-2 bg-white border border-gray-100 rounded-lg">
                                    <QRCodeSVG
                                        value={qrValue}
                                        size={110}
                                        bgColor="#ffffff"
                                        fgColor="#000000"
                                        level="M"
                                        marginSize={1}
                                    />
                                </div>

                                {/* Glass info */}
                                <div className="w-full text-center">
                                    {pane.glassTypeLabel && (
                                        <p className="text-xs font-semibold text-gray-700">{pane.glassTypeLabel}</p>
                                    )}
                                    {pane.dimensions && (pane.dimensions.width > 0 || pane.dimensions.height > 0) && (
                                        <p className="text-[10px] text-gray-500 mt-0.5">
                                            {pane.dimensions.width} × {pane.dimensions.height}
                                            {pane.dimensions.thickness > 0 && ` × ${pane.dimensions.thickness}mm`}
                                        </p>
                                    )}
                                </div>

                                {/* Cut line */}
                                <div className="w-full border-t border-dashed border-gray-200 pt-1.5 mt-auto">
                                    <p className="text-[8px] text-gray-300 text-center font-mono">{qrValue}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
