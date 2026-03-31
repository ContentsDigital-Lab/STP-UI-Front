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
            panesApi.getAll({ limit: 100 }),
            stationsApi.getAll(),
        ]).then(([oRes, pRes, sRes]) => {
            if (oRes.success) setOrder(oRes.data);
            if (pRes.success) {
                const myPanes = (pRes.data ?? []).filter(p => {
                    const oid = typeof p.order === "string" ? p.order : (p.order as any)?._id;
                    return oid === id;
                });
                setPanes(myPanes);
            }
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
                    @page { size: A4 landscape; margin: 2mm; }
                    body { visibility: hidden; background: white !important; -webkit-print-color-adjust: exact; }
                    #work-order-print-container, #work-order-print-container * { visibility: visible; }
                    #work-order-print-container { position: absolute; top: 0; left: 0; width: 100%; border: none; }
                    .no-print { display: none !important; }
                    .page-break { page-break-after: always; }
                    .section-container { margin-bottom: 0px; border: 1px solid black !important; width: 100%; max-height: 200mm; overflow: hidden; }
                }
                @media screen {
                    .section-container {
                        width: 290mm;
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

                    // Consolidated Spec String
                    const specStr = [
                        getStr(order.material),
                        getMaterialSpec(order.material).match(/\d+(\.\d+)?/)?.[0] ? `${getMaterialSpec(order.material).match(/\d+(\.\d+)?/)?.[0]} มม.` : "",
                        "ใส", // Default if not found
                    ].filter(Boolean).join(" / ");

                    return (
                        <div key={group.signature} className={`section-container bg-white text-black text-[10px] font-sans border border-black ${!isLast ? 'page-break' : ''}`}>
                            
                            {/* 1. Header Grid (High Density) */}
                            <div className="grid grid-cols-[1fr,1.5fr,1fr] border-b border-black">
                                <div className="p-1.5 border-r border-black flex flex-col justify-center">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <img src="/logo.png" alt="Logo" className="h-5 object-contain" />
                                        <h2 className="text-[9px] font-black uppercase leading-none">Standard Plus</h2>
                                    </div>
                                    <p className="text-[7px] text-slate-400">Tel: 042-920-222 | Fax: 042-920-224</p>
                                </div>
                                <div className="p-1.5 border-r border-black flex flex-col items-center justify-center bg-slate-50/30">
                                    <h1 className="text-[11px] font-black underline uppercase">
                                        ใบสั่งผลิตกระจก (แบบที่ {gIdx + 1}/{designGroups.length})
                                    </h1>
                                    <p className="text-[8px] font-bold text-red-600 tracking-widest">{orderCode}</p>
                                </div>
                                <div className="p-1.5 grid grid-cols-2 gap-x-2 text-[7px]">
                                    <div className="font-bold text-slate-500">วันที่:</div> <div>{fmtDate(order.createdAt)}</div>
                                    <div className="font-bold text-slate-500">จน.รวม:</div> <div className="font-bold">{panes.length} แผ่น</div>
                                    <div className="font-bold text-slate-500">พาร์ท:</div> <div className="font-bold">{gIdx + 1}/{designGroups.length}</div>
                                </div>
                            </div>

                            {/* 2. Customer & Job Info Line */}
                            <div className="grid grid-cols-[2fr,1fr,1fr,1fr] border-b border-black bg-white text-[8px]">
                                <div className="p-1 px-2 border-r border-black truncate"><span className="font-bold text-slate-500 uppercase text-[6px] mr-1">ลูกค้า:</span> {getStr(order.customer)}</div>
                                <div className="p-1 px-2 border-r border-black"><span className="font-bold text-slate-500 uppercase text-[6px] mr-1">เบอร์โทร:</span> —</div>
                                <div className="p-1 px-2 border-r border-black"><span className="font-bold text-slate-500 uppercase text-[6px] mr-1">ผู้ขาย:</span> —</div>
                                <div className="p-1 px-2"><span className="font-bold text-slate-500 uppercase text-[6px] mr-1">ใบเสนอราคา:</span> —</div>
                            </div>

                            {/* 3. Consolidated Spec Line */}
                            <div className="flex items-center px-2 py-0.5 bg-slate-50 border-b border-black font-black italic text-[9px]">
                                <span className="text-blue-800 tracking-tight">{specStr}</span>
                                <span className="mx-2 text-slate-300">|</span>
                                <span className="text-slate-600">** {samplePane.jobType || "งานสั่งทำพิเศษ"} **</span>
                                <div className="ml-auto flex items-center gap-2">
                                    <span className="text-[7px] font-black text-red-600 border border-red-600 px-1 rounded-sm bg-white">มอก.</span>
                                </div>
                            </div>

                            {/* 4. MAIN CONTENT (HORIZONTAL SPLIT) */}
                            <div className="flex border-b border-black min-h-[330px]">
                                
                                {/* 4a. Left: Large Technical Draft (Drawing) */}
                                <div className="flex-1 p-2 flex flex-col bg-white overflow-hidden">
                                    <p className="text-[6px] font-black text-slate-300 uppercase italic mb-1 tracking-widest leading-none">TECHNICAL DRAFT / แบบวาดเทคนิค</p>
                                    <div className="flex-1 flex items-center justify-center border border-slate-50 max-h-[350px]">
                                        <StaticGlassRenderer 
                                            width={samplePane.dimensions?.width || 800} 
                                            height={samplePane.dimensions?.height || 600} 
                                            holes={samplePane.holes || []} 
                                        />
                                    </div>
                                </div>

                                {/* 4b. Right: Sidebar (Info + Checklist) */}
                                <div className="w-[260px] border-l border-black flex flex-col bg-slate-50/5">
                                    
                                    {/* Dimension Summary */}
                                    <div className="border-b border-black">
                                        <p className="bg-slate-900 text-white py-0.5 text-[6px] font-black text-center uppercase tracking-widest">Dimension Table</p>
                                        <table className="w-full text-center">
                                            <thead>
                                                <tr className="border-b border-black text-[6px] font-bold text-slate-500 bg-slate-50 uppercase">
                                                    <th className="border-r border-black p-0.5">No.</th>
                                                    <th className="border-r border-black p-0.5">W (กว้าง)</th>
                                                    <th className="border-r border-black p-0.5">H (สูง)</th>
                                                    <th className="p-0.5">QTY</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr className="font-black text-[16px] leading-tight">
                                                    <td className="border-r border-black p-1.5 text-[9px] text-slate-400">{gIdx + 1}</td>
                                                    <td className="border-r border-black p-1.5 text-blue-800">{samplePane.dimensions?.width}</td>
                                                    <td className="border-r border-black p-1.5 text-blue-800">{samplePane.dimensions?.height}</td>
                                                    <td className="p-1.5 text-red-600">{groupQty}</td>
                                                </tr>
                                                <tr className="border-t border-black bg-slate-100/50 text-[6px]">
                                                    <td colSpan={3} className="p-0.5 px-1.5 text-right border-r border-black font-bold uppercase text-slate-500">Total in design</td>
                                                    <td className="p-0.5 font-bold text-[8px] text-red-600">{groupQty}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Checkboxes (Edging, Corner, etc.) */}
                                    <div className="p-2.5 space-y-2.5 flex-1">
                                        <div className="space-y-0.5">
                                            <p className="font-black text-[7px] uppercase text-blue-700 border-b border-blue-100 pb-0.5 mb-1 flex items-center gap-1">
                                                <span className="w-1 h-1 bg-blue-700 rounded-full"></span> 
                                                Edging (เจียร)
                                            </p>
                                            {['เจียริมขัดมัน', 'เจียรหยาบ', 'เจียรปลี', 'เจียรลูกหนู', 'ลับคม'].map((l, i) => (
                                                <div key={l} className="flex items-center gap-1.5">
                                                    <div className={`w-3 h-3 border border-slate-400 bg-white flex items-center justify-center text-[8px] ${i===1?'font-black text-blue-700':'text-transparent'}`}>✓</div>
                                                    <span className={`text-[8px] ${i===1?'font-black text-blue-800 leading-none':'text-slate-600 font-medium leading-none'}`}>{l}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="space-y-0.5 mt-2">
                                            <p className="font-black text-[7px] uppercase text-blue-700 border-b border-blue-100 pb-0.5 mb-1 flex items-center gap-1">
                                                <span className="w-1 h-1 bg-blue-700 rounded-full"></span> 
                                                Corners (คิ้ว)
                                            </p>
                                            <div className="flex items-center gap-1.5 opacity-50">
                                                <div className="w-3 h-3 border border-slate-400 bg-white text-transparent">✓</div>
                                                <span className="text-[8px] text-slate-500 font-medium italic leading-none">ไม่มี / No Details</span>
                                            </div>
                                        </div>

                                        <div className="mt-auto pt-2 border-t border-dashed border-slate-200">
                                            <p className="text-[6px] font-medium text-slate-500 leading-tight">
                                                * ตรวจสอบตำแหน่งมาร์คและขนาดให้ตรงกับหน้างานจริงทุกครั้ง
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 5. Stations & Details (COMPACTED) */}
                            <div className="grid grid-cols-[1.5fr,1fr] border-b border-black bg-slate-50/50 h-8">
                                <div className="p-1 px-2 flex items-center gap-2 border-r border-black overflow-hidden">
                                    <span className="text-[6px] font-black text-slate-400 uppercase tracking-tighter shrink-0">Flow:</span>
                                    <div className="flex items-center gap-1 overflow-hidden">
                                        {stations.map((sid, idx) => {
                                            const sidStr = typeof sid === "string" ? sid : (sid as any)._id;
                                            const label  = stationMap.get(sidStr)?.name ?? sidStr;
                                            return (
                                                <div key={idx} className="flex items-center gap-0.5 shrink-0">
                                                    <span className="text-[7px] font-bold px-1 bg-white border border-slate-200 rounded text-slate-700 truncate max-w-[50px] leading-tight">{label}</span>
                                                    {idx < stations.length-1 && <span className="text-slate-300 text-[6px]">→</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="p-1 px-2 flex items-center gap-2 text-[7px]">
                                    <span className="font-bold text-slate-500 uppercase tracking-tighter shrink-0">Notes:</span>
                                    <div className="flex-1 border-b border-slate-300 border-dashed translate-y-0.5"></div>
                                </div>
                            </div>

                            {/* 6. Footer: Signatures Only (COMPACT) */}
                            <div className="bg-white h-[45px] overflow-hidden flex items-center px-12">
                                <div className="flex-1 flex flex-col items-center">
                                    <div className="w-[180px] border-b border-slate-800 mb-0.5"></div>
                                    <p className="font-black text-[6px] uppercase leading-none">ผู้สั่ง / Approved By</p>
                                </div>
                                <div className="flex-1 flex flex-col items-center">
                                    <div className="w-[180px] border-b border-slate-800 mb-0.5"></div>
                                    <p className="font-black text-[6px] uppercase leading-none">ผู้ผลิต / Produced By</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
