"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Printer, ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ordersApi } from "@/lib/api/orders";
import { panesApi } from "@/lib/api/panes";
import { stationsApi } from "@/lib/api/stations";
import { Order, Material, Pane, Station } from "@/lib/api/types";

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
    return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "numeric", year: "numeric" });
}

// ── Static SVG Glass Renderer (PRO VERSION - HIGH LEGIBILITY) ────────────────
function StaticGlassRenderer({ width, height, holes }: { width: number; height: number; holes: any[] }) {
    const padding = 100; // Increased padding to prevent large labels from cutting off
    const viewBoxW = width + padding * 2;
    const viewBoxH = height + padding * 2;
    
    // Scale labels more conservatively
    const labelSize = Math.max(16, Math.min(width, height) * 0.04);
    const dimSize   = Math.max(18, Math.min(width, height) * 0.05);

    return (
        <svg
            viewBox={`-${padding} -${padding} ${viewBoxW} ${viewBoxH}`}
            className="w-full h-auto max-h-[350px]"
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <filter id="whiteOutlineEffect" x="-20%" y="-20%" width="140%" height="140%">
                    <feMorphology in="SourceAlpha" result="morph" operator="dilate" radius="2" />
                    <feColorMatrix in="morph" result="whitened" type="matrix" values="-1 0 0 0 1, 0 -1 0 0 1, 0 0 -1 0 1, 0 0 0 1 0" />
                    <feMerge>
                        <feMergeNode in="whitened" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* Glass Outline - Extra Bold */}
            <rect
                x={0}
                y={0}
                width={width}
                height={height}
                fill="#f8fafc"
                stroke="#000"
                strokeWidth="4"
            />

            {/* Holes/Slots - Highly Visible */}
            {holes?.map((h: any, i: number) => {
                const x = h.x;
                const y = height - h.y;
                const color = "#d32f2f"; 
                
                if (h.type === 'rectangle' || h.type === 'square') {
                    const w = h.width || 100;
                    const ht = h.height || 60;
                    return (
                        <g key={h.id}>
                            <rect x={x - w/2} y={y - ht/2} width={w} height={ht} fill="none" stroke={color} strokeWidth="3" />
                            <text x={x} y={y} fontSize={labelSize} textAnchor="middle" dominantBaseline="middle" fill={color} fontWeight="900" filter="url(#whiteOutlineEffect)">H{i+1}</text>
                        </g>
                    );
                } else if (h.type === 'slot') {
                    const l = h.length || 80;
                    const w = h.width || 20;
                    return (
                        <g key={h.id}>
                            <rect x={x - l/2} y={y - w/2} width={l} height={w} rx={w/2} fill="none" stroke={color} strokeWidth="3" />
                            <text x={x} y={y} fontSize={labelSize} textAnchor="middle" dominantBaseline="middle" fill={color} fontWeight="900" filter="url(#whiteOutlineEffect)">H{i+1}</text>
                        </g>
                    );
                } else {
                    const r = (h.diameter || 20) / 2;
                    return (
                        <g key={h.id}>
                            <circle cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth="3" />
                            <text x={x} y={y} fontSize={labelSize} textAnchor="middle" dominantBaseline="middle" fill={color} fontWeight="900" filter="url(#whiteOutlineEffect)">H{i+1}</text>
                        </g>
                    );
                }
            })}

            {/* Dimension Arrows - Width (ENHANCED) */}
            <g stroke="#1e293b" strokeWidth="2.5">
                <line x1={0} y1={-45} x2={width} y2={-45} />
                <line x1={0} y1={-55} x2={0} y2={-35} />
                <line x1={width} y1={-55} x2={width} y2={-35} />
                <text 
                    x={width / 2} 
                    y={-50} 
                    fontSize={dimSize} 
                    textAnchor="middle" 
                    fill="#1e3a8a" 
                    fontWeight="900"
                    filter="url(#whiteOutlineEffect)"
                >W = {width}</text>
            </g>

            {/* Dimension Arrows - Height (ENHANCED) */}
            <g stroke="#1e293b" strokeWidth="2.5">
                <line x1={width + 45} y1={0} x2={width + 45} y2={height} />
                <line x1={width + 35} y1={0} x2={width + 55} y2={0} />
                <line x1={width + 35} y1={height} x2={width + 55} y2={height} />
                <text 
                    x={width + 65} 
                    y={height / 2} 
                    fontSize={dimSize} 
                    textAnchor="start" 
                    dominantBaseline="middle" 
                    fill="#1e3a8a" 
                    fontWeight="900" 
                    transform={`rotate(90, ${width + 65}, ${height / 2})`}
                    filter="url(#whiteOutlineEffect)"
                >H = {height}</text>
            </g>
        </svg>
    );
}

// ── Interfaces & Types ────────────────────────────────────────────────────────
interface DesignGroup {
    signature: string;
    panes: Pane[];
}

function getDesignSignature(p: Pane): string {
    const holesStr = JSON.stringify((p.holes || []).map(h => ({ x: h.x, y: h.y, type: h.type, diameter: h.diameter, width: h.width, height: h.height })));
    return `${p.dimensions?.width}x${p.dimensions?.height}-${holesStr}`;
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function WorkOrderPrintPage() {
    const { id }   = useParams<{ id: string }>();
    const router   = useRouter();

    const [order,      setOrder]      = useState<Order | null>(null);
    const [panes,      setPanes]      = useState<Pane[]>([]);
    const [stationMap, setStationMap] = useState<Map<string, Station>>(new Map());
    const [loading,    setLoading]    = useState(true);
    const [baseUrl,    setBaseUrl]    = useState("");

    useEffect(() => {
        setBaseUrl(window.location.origin);
        Promise.all([
            ordersApi.getById(id),
            panesApi.getAll({ order: id, limit: 100 }),
            stationsApi.getAll(),
        ]).then(([oRes, pRes, sRes]) => {
            if (oRes.success) setOrder(oRes.data);
            if (pRes.success) setPanes(pRes.data ?? []);
            if (sRes.success) setStationMap(new Map((sRes.data ?? []).map((s: Station) => [s._id, s])));
        }).finally(() => setLoading(false));
    }, [id]);

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
    );
    if (!order) return (
        <div className="p-6 text-center text-muted-foreground">ไม่พบข้อมูลออเดอร์</div>
    );

    // Group panes by unique design
    const designGroups: DesignGroup[] = [];
    panes.forEach(p => {
        const sig = getDesignSignature(p);
        const existing = designGroups.find(g => g.signature === sig);
        if (existing) {
            existing.panes.push(p);
        } else {
            designGroups.push({ signature: sig, panes: [p] });
        }
    });

    const orderCode    = order.code ?? order._id.slice(-6).toUpperCase();
    const stations     = Array.isArray(order.stations) ? order.stations : [];

    return (
        <>
            {/* ── Print styles ── */}
            <style>{`
                @media print {
                    @page { size: A4 landscape; margin: 5mm; }
                    body { visibility: hidden; background: #white; }
                    #work-order-print-container, #work-order-print-container * { visibility: visible; }
                    #work-order-print-container { position: absolute; top: 0; left: 0; width: 100%; }
                    .no-print { display: none !important; }
                    .page-break { page-break-after: always; }
                    .section-container { margin-bottom: 20px; }
                }
                @media screen {
                    .section-container {
                        width: 297mm;
                        margin: 20px auto;
                        box-shadow: 0 0 20px rgba(0,0,0,0.1);
                        background: white;
                    }
                }
            `}</style>

            {/* ── Screen toolbar ── */}
            <div className="no-print p-4 flex items-center gap-3 bg-slate-50 border-b">
                <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                    กลับ
                </Button>
                <div className="flex-1" />
                <Button className="gap-2" onClick={() => window.print()}>
                    <Printer className="h-4 w-4" />
                    พิมพ์ไปงาน ({designGroups.length} แบบ)
                </Button>
            </div>

            <div id="work-order-print-container">
                {designGroups.map((group, gIdx) => {
                    const samplePane = group.panes[0];
                    const groupQty   = group.panes.length;
                    const isLast     = gIdx === designGroups.length - 1;

                    return (
                        <div key={group.signature} className={`section-container bg-white text-black text-[11px] font-sans ${!isLast ? 'page-break' : ''}`}>
                            {/* 1. Header */}
                            <div className="grid grid-cols-[140px,1fr,1.5fr] border-2 border-black">
                                <div className="p-2 border-r-2 border-black flex items-center justify-center">
                                    <img src="/logo.png" alt="Logo" className="max-w-full h-10 object-contain" />
                                </div>
                                <div className="p-2 border-r-2 border-black leading-tight">
                                    <h2 className="text-[12px] font-black uppercase">Standard Plus Service Co.,LTD</h2>
                                    <p className="text-[9px]">Tel: 042-920-222 | Fax: 042-920-224</p>
                                </div>
                                <div className="p-2 flex flex-col items-center justify-center text-center bg-slate-50">
                                    <h1 className="text-sm font-black underline uppercase">
                                        ใบสั่งผลิตกระจก (แบบที่ {gIdx + 1}/{designGroups.length})
                                    </h1>
                                    <p className="text-[10px] font-bold text-red-600 mt-1">{orderCode}</p>
                                </div>
                            </div>

                            {/* 2. Customer Info */}
                            <div className="grid grid-cols-[3fr,1.5fr,1fr,1.5fr] border-x-2 border-b-2 border-black bg-white">
                                <div className="p-1 px-2 border-r border-black"><span className="font-bold">ลูกค้า:</span> {getStr(order.customer)}</div>
                                <div className="p-1 px-2 border-r border-black"><span className="font-bold">จำนวนกลุ่มนี้:</span> <span className="text-sm text-red-600 font-bold">{groupQty}</span> / {panes.length}</div>
                                <div className="p-1 px-2 border-r border-black"><span className="font-bold">วันที่:</span> {fmtDate(order.createdAt)}</div>
                                <div className="p-1 px-2 font-black text-center bg-slate-50">PART: {gIdx + 1}</div>
                            </div>

                            {/* 3. Glass Spec */}
                            <div className="grid grid-cols-[3fr,1fr,1fr,1fr] border-x-2 border-b-2 border-black font-bold bg-slate-50/30">
                                <div className="p-1 px-2 border-r border-black">ชนิดกระจก: {getStr(order.material)}</div>
                                <div className="p-1 px-2 border-r border-black">หนา: {getMaterialSpec(order.material).match(/\d+(\.\d+)?/)?.[0] || '—'} มม.</div>
                                <div className="p-1 px-2 border-r border-black text-center">สีฟิล์ม: ใส</div>
                                <div className="p-1 px-2 text-center text-red-600">มอก.</div>
                            </div>

                            {/* 4. Main Section (Drawing + Table) */}
                            <div className="grid grid-cols-[1.2fr,300px,150px] border-x-2 border-b-2 border-black min-h-[320px]">
                                {/* Drawing */}
                                <div className="p-2 flex flex-col border-r border-black">
                                    <p className="text-[8px] font-black text-slate-400 italic mb-1 uppercase">Technical Draft (แบบวาดเทคนิค - ความละเอียดสูง)</p>
                                    <div className="flex-1 flex items-center justify-center bg-white border border-slate-100 rounded">
                                        <StaticGlassRenderer 
                                            width={samplePane.dimensions?.width || 800} 
                                            height={samplePane.dimensions?.height || 600} 
                                            holes={samplePane.holes || []} 
                                        />
                                    </div>
                                </div>

                                {/* Dimension Table */}
                                <div className="p-0 border-r border-black flex flex-col">
                                    <p className="p-1 bg-slate-100 text-[8px] font-black border-b border-black text-center">DIMENSION SUMMARY</p>
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-black text-[9px] font-black">
                                                <th className="border-r border-black p-1">Item No.</th>
                                                <th className="border-r border-black p-1">Width (W)</th>
                                                <th className="border-r border-black p-1">Height (H)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr className="border-b border-black text-center font-black">
                                                <td className="border-r border-black p-4 text-[10px] text-slate-400">กลุ่มแบบที่ {gIdx + 1}</td>
                                                <td className="border-r border-black p-4 text-[24px] text-blue-700">{samplePane.dimensions?.width}</td>
                                                <td className="p-4 text-[24px] text-blue-700">{samplePane.dimensions?.height}</td>
                                            </tr>
                                            <tr className="bg-slate-50 font-black border-b border-black">
                                                <td colSpan={2} className="p-2 text-right border-r border-black uppercase text-[9px]">Quantity in this design (แผ่น)</td>
                                                <td className="p-2 text-center text-[18px] text-red-600">{groupQty}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <div className="p-3 mt-auto border-t border-black bg-slate-50/50">
                                        <p className="text-[8px] font-black text-slate-400 uppercase italic">Notes / Special Processing</p>
                                        <div className="h-12 border-b border-slate-300 border-dashed mt-1"></div>
                                    </div>
                                </div>

                                {/* Edging */}
                                <div className="p-2 space-y-1 bg-slate-50/10">
                                    <p className="font-bold underline text-[8px] uppercase">Edging (เจียร)</p>
                                    {['เจียริมขัดมัน', 'เจียรหยาบ', 'เจียรปลี', 'เจียรลูกหนู', 'ลับคม'].map((l, i) => (
                                        <div key={l} className="flex items-center gap-1.5">
                                            <div className={`w-3 h-3 border border-black rounded-sm flex items-center justify-center text-[9px] ${i===1?'font-black':'text-transparent'}`}>✓</div>
                                            <span className="text-[8.5px] font-bold">{l}</span>
                                        </div>
                                    ))}
                                    <div className="mt-8 pt-2 border-t border-dashed border-black/20">
                                         <p className="text-[7px] font-black text-red-600 leading-tight">
                                            * ตรวจสอบตำแหน่งมาร์ค<br/>ให้ตรงกับหน้างานจริง
                                         </p>
                                    </div>
                                </div>
                            </div>

                            {/* 5. Station Sequence */}
                            <div className="border-x-2 border-b-2 border-black p-1.5 px-3 flex items-center gap-4 bg-slate-50/50">
                                <p className="text-[8px] font-black text-slate-400">STATIONS:</p>
                                <div className="flex items-center gap-2">
                                    {stations.map((sid, idx) => {
                                        const sidStr = typeof sid === "string" ? sid : (sid as any)._id;
                                        const label  = stationMap.get(sidStr)?.name ?? sidStr;
                                        return (
                                            <div key={idx} className="flex items-center gap-1.5">
                                                <span className="text-[9px] font-black px-2 py-0.5 bg-white border border-black rounded shadow-sm">{idx+1}. {label}</span>
                                                {idx < stations.length-1 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 6. QR Grid for this group */}
                            <div className="p-3 border-x-2 border-b-2 border-black bg-white">
                                <p className="text-[8px] font-black text-slate-400 mb-2 uppercase italic">Individual QR Codes (สำหรับกระจกกลุ่มนี้จำนวน {groupQty} แผ่น)</p>
                                <div className="grid grid-cols-6 gap-2">
                                    {group.panes.map((p, pIdx) => {
                                        const paneNum = p.paneNumber || `P-${p._id.slice(-4)}`;
                                        const qrVal  = `${baseUrl}/production/${order._id}?pane=${p._id}`;
                                        return (
                                            <div key={p._id} className="flex items-center gap-1.5 border border-slate-200 p-1.5 rounded bg-white">
                                                <QRCodeSVG value={qrVal} size={40} level="L" />
                                                <div className="min-w-0">
                                                    <p className="font-mono font-black text-[8px] truncate">#{paneNum.split('-').pop()}</p>
                                                    <p className="font-mono text-[7px] text-slate-400 truncate">S: {samplePane.dimensions?.width}x{samplePane.dimensions?.height}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 7. Signatures */}
                            <div className="mt-4 flex justify-between px-16 pb-4">
                                <div className="text-center w-40 border-t border-black pt-1 font-bold text-[9px] uppercase">ผู้สั่ง / Approved By</div>
                                <div className="text-center w-40 border-t border-black pt-1 font-bold text-[9px] uppercase">ผู้รับ / Produced By</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
