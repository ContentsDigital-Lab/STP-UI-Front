"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Printer, ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ordersApi } from "@/lib/api/orders";
import { Order, Material } from "@/lib/api/types";

// ── helpers ───────────────────────────────────────────────────────────────────
const STATION_LABELS: Record<string, string> = {
    cutting:    "ตัดกระจก",
    grinding:   "เจียระนาย",
    drilling:   "เจาะ",
    tempering:  "อบ/เทมเปอร์",
    laminating: "ลามิเนต",
    coating:    "เคลือบ",
    framing:    "ใส่กรอบ",
    inspection: "ตรวจสอบคุณภาพ",
    packing:    "บรรจุ",
    delivery:   "จัดส่ง",
};

const STATUS_LABELS: Record<string, string> = {
    pending:     "รอตรวจสอบ",
    in_progress: "กำลังผลิต",
    completed:   "เสร็จแล้ว",
    cancelled:   "ยกเลิก",
};

function zeroPad(n: number, digits: number) {
    return String(n).padStart(digits, "0");
}

function getStr(v: unknown): string {
    if (!v) return "—";
    if (typeof v === "string") return v;
    if (typeof v === "object") {
        const obj = v as Record<string, string>;
        return obj.name ?? obj.username ?? obj.title ?? "—";
    }
    return "—";
}

function getMaterialSpec(material: unknown): string {
    if (!material || typeof material !== "object") return "";
    const m = material as Material;
    const parts: string[] = [];
    if (m.specDetails?.glassType) parts.push(m.specDetails.glassType);
    if (m.specDetails?.thickness)  parts.push(m.specDetails.thickness);
    if (m.specDetails?.color)      parts.push(m.specDetails.color);
    return parts.join(" / ");
}

function fmtDate(d?: string) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function WorkOrderPrintPage() {
    const { id }   = useParams<{ id: string }>();
    const router   = useRouter();

    const [order,   setOrder]   = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [baseUrl, setBaseUrl] = useState("");

    useEffect(() => {
        setBaseUrl(window.location.origin);
        ordersApi.getById(id)
            .then((res) => { if (res.success) setOrder(res.data); })
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
    );
    if (!order) return (
        <div className="p-6 text-center text-muted-foreground">ไม่พบข้อมูลออเดอร์</div>
    );

    const orderCode    = order.code ?? order._id.slice(-6).toUpperCase();
    const orderQrValue = `${baseUrl}/production/${order._id}`;
    const qty          = Math.max(1, order.quantity ?? 1);
    const stations     = Array.isArray(order.stations) ? order.stations : [];

    const statusCls = {
        pending:     "border-amber-400 text-amber-700 bg-amber-50",
        in_progress: "border-blue-400  text-blue-700  bg-blue-50",
        completed:   "border-green-400 text-green-700 bg-green-50",
        cancelled:   "border-red-400   text-red-700   bg-red-50",
    }[order.status] ?? "border-gray-400 text-gray-700 bg-gray-50";

    return (
        <>
            {/* ── Print styles ── */}
            <style>{`
                @media print {
                    @page { size: A4; margin: 10mm; }
                    body { visibility: hidden; }
                    #work-order-print, #work-order-print * { visibility: visible; }
                    #work-order-print { position: absolute; top: 0; left: 0; width: 100%; background: #fff; }
                    .no-print { display: none !important; }
                    .page-break-before { page-break-before: always; }
                }
            `}</style>

            {/* ── Screen toolbar (hidden on print) ── */}
            <div className="no-print flex items-center gap-3 mb-6">
                <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                    กลับ
                </Button>
                <div className="flex-1" />
                <Button className="gap-2" onClick={() => window.print()}>
                    <Printer className="h-4 w-4" />
                    พิมพ์ใบงาน
                </Button>
            </div>

            {/* ── PRINT CONTENT ─────────────────────────────────────────────── */}
            <div id="work-order-print" className="bg-white text-black space-y-6 text-sm font-sans">

                {/* ── Section 1: Header ── */}
                <div className="flex items-start gap-5 border-b-2 border-gray-200 pb-5">
                    {/* Order QR */}
                    <div className="shrink-0 p-3 border-2 border-gray-200 rounded-xl bg-white">
                        <QRCodeSVG value={orderQrValue} size={120} bgColor="#ffffff" fgColor="#000000" level="H" marginSize={2} />
                        <p className="mt-1.5 text-center text-[10px] font-mono font-bold text-gray-500">#{orderCode}</p>
                    </div>

                    {/* Order info */}
                    <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                            <span className="text-3xl font-black font-mono tracking-widest text-black">#{orderCode}</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusCls}`}>
                                {STATUS_LABELS[order.status] ?? order.status}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">ลูกค้า</p>
                                <p className="font-semibold">{getStr(order.customer)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">วัสดุ</p>
                                <p className="font-semibold">{getStr(order.material)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">จำนวน</p>
                                <p className="font-semibold">{qty} ชิ้น</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">วันที่สร้าง</p>
                                <p className="font-semibold">{fmtDate(order.createdAt)}</p>
                            </div>
                            {getMaterialSpec(order.material) && (
                                <div className="col-span-2">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">สเปคกระจก</p>
                                    <p className="font-semibold">{getMaterialSpec(order.material)}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Label */}
                    <div className="shrink-0 text-right">
                        <p className="text-xl font-black text-gray-700">ใบงาน</p>
                        <p className="text-xs text-gray-400 font-mono mt-1">{fmtDate(order.createdAt)}</p>
                    </div>
                </div>

                {/* ── Section 2: Station Flow ── */}
                {stations.length > 0 && (
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">สายการผลิต</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {stations.map((sid, idx) => {
                                const sidStr = typeof sid === "string" ? sid : (sid as Record<string, string>)._id ?? String(sid);
                                const label  = STATION_LABELS[sidStr] ?? sidStr;
                                const done   = idx < (order.currentStationIndex ?? 0);
                                const active = idx === (order.currentStationIndex ?? -1) && order.status === "in_progress";
                                return (
                                    <div key={idx} className="flex items-center gap-1.5">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                            active ? "bg-blue-600 text-white border-blue-600" :
                                            done   ? "bg-gray-100 text-gray-400 border-gray-200" :
                                                     "bg-white text-gray-700 border-gray-300"
                                        }`}>
                                            {idx + 1}. {label}
                                        </span>
                                        {idx < stations.length - 1 && (
                                            <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── Section 3: Glass Piece Grid ── */}
                <div className="page-break-before">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">
                        รายการกระจกแต่ละชิ้น — {qty} ชิ้น
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                        {Array.from({ length: qty }, (_, i) => {
                            const pieceNum    = i + 1;
                            const pieceCode   = `${orderCode}-${zeroPad(pieceNum, 3)}`;
                            const pieceQrVal  = `${baseUrl}/production/${order._id}?piece=${pieceNum}`;
                            return (
                                <div key={pieceNum} className="border-2 border-gray-200 rounded-xl p-3 flex flex-col items-center gap-2 bg-white">
                                    {/* Piece ID */}
                                    <p className="font-mono font-black text-sm tracking-widest text-black">#{pieceCode}</p>

                                    {/* QR */}
                                    <div className="p-2 bg-white border border-gray-100 rounded-lg">
                                        <QRCodeSVG value={pieceQrVal} size={100} bgColor="#ffffff" fgColor="#000000" level="M" marginSize={1} />
                                    </div>

                                    {/* Material */}
                                    <div className="w-full text-center">
                                        <p className="text-xs font-medium text-gray-700">{getStr(order.material)}</p>
                                        {getMaterialSpec(order.material) && (
                                            <p className="text-[10px] text-gray-400 mt-0.5">{getMaterialSpec(order.material)}</p>
                                        )}
                                    </div>

                                    {/* Signature line */}
                                    <div className="w-full border-t border-dashed border-gray-200 pt-2 mt-auto">
                                        <p className="text-[9px] text-gray-300 text-center">ผ่านสถานี _______________</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </>
    );
}
