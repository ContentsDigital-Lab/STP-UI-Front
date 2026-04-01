"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ordersApi } from "@/lib/api/orders";
import { panesApi } from "@/lib/api/panes";
import { stationsApi } from "@/lib/api/stations";
import { Order, Material, Pane, Station, OrderRequest } from "@/lib/api/types";
import { HoleData } from "@/lib/api/types";

// ── helpers ───────────────────────────────────────────────────────────────────

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
  if (m.specDetails?.thickness) parts.push(m.specDetails.thickness);
  if (m.specDetails?.color) parts.push(m.specDetails.color);
  return parts.join(" / ");
}

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

// ── Static SVG Glass Renderer (PRO VERSION - HIGH LEGIBILITY) ────────────────
// holes from backend may be an integer (count only) or full HoleData[]
function normalizeHoles(
  holesRaw: HoleData[] | number | undefined | null,
  notchesRaw?: HoleData[] | number | undefined | null
): {
  arr: HoleData[];
  count: number;
} {
  const hArr = Array.isArray(holesRaw) ? holesRaw : [];
  const nArr = Array.isArray(notchesRaw) ? notchesRaw : [];
  const hCount = typeof holesRaw === "number" ? holesRaw : hArr.length;
  const nCount = typeof notchesRaw === "number" ? notchesRaw : nArr.length;
  
  return { 
    arr: [...hArr, ...nArr], 
    count: hCount + nCount 
  };
}

function StaticGlassRenderer({
  width,
  height,
  holes: holesRaw,
  notches: notchesRaw,
}: {
  width: number;
  height: number;
  holes: HoleData[] | number | undefined;
  notches?: HoleData[] | number | undefined;
}) {
  const { arr: holes, count: holeCount } = normalizeHoles(holesRaw, notchesRaw);
  const padding = 100; // Increased padding to prevent large labels from cutting off
  const viewBoxW = width + padding * 2;
  const viewBoxH = height + padding * 2;

  // Scale labels more conservatively
  const labelSize = Math.max(16, Math.min(width, height) * 0.04);
  const dimSize = Math.max(18, Math.min(width, height) * 0.05);

  return (
    <svg
      viewBox={`-${padding} -${padding} ${viewBoxW} ${viewBoxH}`}
      className="w-full h-auto max-h-[350px]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter
          id="whiteOutlineEffect"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
        >
          <feMorphology
            in="SourceAlpha"
            result="morph"
            operator="dilate"
            radius="2"
          />
          <feColorMatrix
            in="morph"
            result="whitened"
            type="matrix"
            values="-1 0 0 0 1, 0 -1 0 0 1, 0 0 -1 0 1, 0 0 0 1 0"
          />
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

      {/* No position data — show count as centred label */}
      {holeCount > 0 && holes.length === 0 && (
        <g>
          <text
            x={width / 2}
            y={height / 2 - dimSize}
            fontSize={dimSize * 1.2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#d32f2f"
            fontWeight="900"
            filter="url(#whiteOutlineEffect)"
          >
            {holeCount} รู / บาก
          </text>
          <text
            x={width / 2}
            y={height / 2 + dimSize * 0.6}
            fontSize={dimSize * 0.7}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#888"
            filter="url(#whiteOutlineEffect)"
          >
            (ตำแหน่งรอข้อมูลจาก backend)
          </text>
        </g>
      )}

      {/* Holes/Slots - Highly Visible (position data available) */}
      {holes?.map((h: HoleData, i: number) => {
        const x = h.x;
        const y = height - h.y;
        const color = "#d32f2f";

        // Calculate shape bounds
        const shapeW = h.type === "rectangle" ? (h.width || 100) : h.type === "slot" ? (h.length || 80) : (h.diameter || 20);
        const shapeH = h.type === "rectangle" ? (h.height || 60) : h.type === "slot" ? (h.width || 20) : (h.diameter || 20);

        // Calculate distance from glass edges to SHAPE edges (not center)
        const leftEdgeDist = h.x - shapeW / 2;
        const rightEdgeDist = width - (h.x + shapeW / 2);
        const isLeft = leftEdgeDist <= rightEdgeDist;
        const xDist = Math.max(0, isLeft ? leftEdgeDist : rightEdgeDist);
        const drawXDim = xDist > 2; // > 2mm from edge means it's not touching

        const topEdgeDist = y - shapeH / 2;
        const bottomEdgeDist = height - (y + shapeH / 2);
        const isTop = topEdgeDist <= bottomEdgeDist;
        const yDist = Math.max(0, isTop ? topEdgeDist : bottomEdgeDist);
        const drawYDim = yDist > 2;
        
        const dimColor = "#64748b"; // slate-500
        const lineProps = { stroke: dimColor, strokeWidth: "1.5", strokeDasharray: "4 4" };
        const textProps = { fill: dimColor, fontSize: dimSize * 0.6, fontWeight: "600", filter: "url(#whiteOutlineEffect)" };

        const renderDimensions = (
          <g className="hole-dimensions">
            {/* X-Distance to Edge of Shape */}
            {drawXDim ? (
              <>
                {isLeft ? (
                  <line x1={0} y1={y} x2={h.x - shapeW / 2} y2={y} {...lineProps} />
                ) : (
                  <line x1={h.x + shapeW / 2} y1={y} x2={width} y2={y} {...lineProps} />
                )}
                <text
                  x={isLeft ? xDist / 2 : width - xDist / 2}
                  y={y - 8}
                  textAnchor="middle"
                  {...textProps}
                >
                  {xDist.toFixed(0)}
                </text>
              </>
            ) : (
              /* X-Depth for edge cutouts */
              <g>
                {isLeft ? (
                  <line x1={0} y1={y - shapeH / 2 - 12} x2={shapeW} y2={y - shapeH / 2 - 12} {...lineProps} stroke="#d32f2f" />
                ) : (
                  <line x1={width} y1={y - shapeH / 2 - 12} x2={width - shapeW} y2={y - shapeH / 2 - 12} {...lineProps} stroke="#d32f2f" />
                )}
                <text
                  x={isLeft ? shapeW / 2 : width - shapeW / 2}
                  y={y - shapeH / 2 - 20}
                  textAnchor="middle"
                  {...textProps}
                  fill="#d32f2f"
                >
                  ลึก {shapeW.toFixed(0)}
                </text>
              </g>
            )}

            {/* Y-Distance to Edge of Shape */}
            {drawYDim ? (
              <>
                {isTop ? (
                  <line x1={x} y1={0} x2={x} y2={y - shapeH / 2} {...lineProps} />
                ) : (
                  <line x1={x} y1={y + shapeH / 2} x2={x} y2={height} {...lineProps} />
                )}
                <text
                  x={x + 8}
                  y={isTop ? yDist / 2 : height - yDist / 2}
                  textAnchor="start"
                  dominantBaseline="middle"
                  {...textProps}
                >
                  {yDist.toFixed(0)}
                </text>
              </>
            ) : (
              /* Y-Depth for edge cutouts */
              <g>
                {isTop ? (
                  <line x1={x - shapeW / 2 - 12} y1={0} x2={x - shapeW / 2 - 12} y2={shapeH} {...lineProps} stroke="#d32f2f" />
                ) : (
                  <line x1={x - shapeW / 2 - 12} y1={height} x2={x - shapeW / 2 - 12} y2={height - shapeH} {...lineProps} stroke="#d32f2f" />
                )}
                <text
                  x={x - shapeW / 2 - 20}
                  y={isTop ? shapeH / 2 : height - shapeH / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  {...textProps}
                  fill="#d32f2f"
                >
                  ลึก {shapeH.toFixed(0)}
                </text>
              </g>
            )}
          </g>
        );

        let sizeLabel = "";
        let sizeYOffset = 0;
        if (h.type === "rectangle") {
          sizeLabel = `${h.width || 100}x${h.height || 60}`;
          sizeYOffset = (h.height || 60) / 2 + 10;
        } else if (h.type === "slot") {
          sizeLabel = `${h.length || 80}x${h.width || 20}`;
          sizeYOffset = (h.width || 20) / 2 + 10;
        } else if (h.type === "circle" || !h.type) {
          sizeLabel = `Ø${h.diameter || 20}`;
          sizeYOffset = ((h.diameter || 20) / 2) + 10;
        }

        const renderSizeText = sizeLabel && (
          <text
            x={x}
            y={y + sizeYOffset + dimSize * 0.6}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#d32f2f"
            fontSize={dimSize * 0.7}
            fontWeight="900"
            filter="url(#whiteOutlineEffect)"
          >
            {sizeLabel}
          </text>
        );
        // --- End Dimensions ---

        if (h.type === "rectangle") {
          const w = h.width || 100;
          const ht = h.height || 60;
          return (
            <g key={h.id}>
              {renderDimensions}
              <rect
                x={x - w / 2}
                y={y - ht / 2}
                width={w}
                height={ht}
                fill="none"
                stroke={color}
                strokeWidth="3"
              />
              <text
                x={x}
                y={y}
                fontSize={labelSize}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={color}
                fontWeight="900"
                filter="url(#whiteOutlineEffect)"
              >
                H{i + 1}
              </text>
              {renderSizeText}
            </g>
          );
        } else if (h.type === "slot") {
          const l = h.length || 80;
          const w = h.width || 20;
          return (
            <g key={h.id}>
              {renderDimensions}
              <rect
                x={x - l / 2}
                y={y - w / 2}
                width={l}
                height={w}
                rx={w / 2}
                fill="none"
                stroke={color}
                strokeWidth="3"
              />
              <text
                x={x}
                y={y}
                fontSize={labelSize}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={color}
                fontWeight="900"
                filter="url(#whiteOutlineEffect)"
              >
                H{i + 1}
              </text>
              {renderSizeText}
            </g>
          );
        } else if (h.type === "custom" && h.points && h.points.length >= 3) {
          const pts = h.points as { x: number; y: number }[];
          const polyPoints = pts
            .map((pt) => `${x + pt.x},${y - pt.y}`)
            .join(" ");
          return (
            <g key={h.id}>
              {renderDimensions}
              <polygon
                points={polyPoints}
                fill="none"
                stroke={color}
                strokeWidth="3"
              />
              <text
                x={x}
                y={y}
                fontSize={labelSize}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={color}
                fontWeight="900"
                filter="url(#whiteOutlineEffect)"
              >
                N{i + 1}
              </text>
              {renderSizeText}
            </g>
          );
        } else {
          const r = (h.diameter || 20) / 2;
          return (
            <g key={h.id}>
              {renderDimensions}
              <circle
                cx={x}
                cy={y}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth="3"
              />
              <text
                x={x}
                y={y}
                fontSize={labelSize}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={color}
                fontWeight="900"
                filter="url(#whiteOutlineEffect)"
              >
                H{i + 1}
              </text>
              {renderSizeText}
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
        >
          W = {width}
        </text>
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
        >
          H = {height}
        </text>
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
  const { arr: holesArr, count: holesCount } = normalizeHoles(
    p.holes as HoleData[] | number | undefined,
    p.notches as HoleData[] | number | undefined
  );
  const holesStr =
    holesArr.length > 0
      ? JSON.stringify(
          holesArr.map((h) => ({
            x: h.x,
            y: h.y,
            type: h.type,
            diameter: h.diameter,
            width: h.width,
            height: h.height,
          })),
        )
      : String(holesCount);
  return `${p.dimensions?.width}x${p.dimensions?.height}-${holesStr}`;
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function WorkOrderPrintPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<Order | null>(null);
  const [panes, setPanes] = useState<Pane[]>([]);
  const [stationMap, setStationMap] = useState<Map<string, Station>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("[PrintPage] ── START ──  orderId:", id);
    Promise.all([ordersApi.getById(id), stationsApi.getAll()])
      .then(async ([oRes, sRes]) => {
        console.log(
          "[PrintPage] orderRes success:",
          oRes.success,
          "data:",
          oRes.data,
        );
        if (!oRes.success) {
          console.warn("[PrintPage] order fetch failed:", oRes.message);
          return;
        }
        const order = oRes.data;
        setOrder(order);

        if (sRes.success)
          setStationMap(
            new Map((sRes.data ?? []).map((s: Station) => [s._id, s])),
          );

        // Panes are linked to the request (not the order) — resolve request ID first
        const reqId =
          order.request == null
            ? null
            : typeof order.request === "string"
              ? order.request
              : (order.request as OrderRequest)._id;

        console.log(
          "[PrintPage] order.request raw:",
          order.request,
          "→ reqId:",
          reqId,
        );

        if (reqId) {
          // Fetch panes by request — these contain the original design with holes
          const pRes = await panesApi.getAll({ request: reqId, limit: 200 });
          console.log(
            "[PrintPage] panes by request success:",
            pRes.success,
            "count:",
            pRes.data?.length,
            "data:",
            pRes.data?.slice(0, 3).map((p) => ({
              _id: p._id,
              order: p.order,
              request: p.request,
              holes: typeof p.holes === 'number' ? p.holes : (p.holes?.length ?? 0),
              notches: typeof p.notches === 'number' ? p.notches : (p.notches?.length ?? 0),
            })),
          );
          if (pRes.success && (pRes.data ?? []).length > 0) {
            setPanes(pRes.data ?? []);
            return;
          }
        }

        // Fallback: fetch all panes and filter client-side
        // (backend ?request= and ?order= filters are both unstable)
        console.log(
          "[PrintPage] falling back to all-panes client-side filter, reqId:",
          reqId,
          "orderId:",
          id,
        );
        const allRes = await panesApi.getAll({ limit: 500 });
        console.log(
          "[PrintPage] allPanes success:",
          allRes.success,
          "total:",
          allRes.data?.length,
        );
        if (allRes.success) {
          const allPanes = allRes.data ?? [];

          // 1st priority: filter by order ID
          let found = allPanes.filter((p) => {
            const oid =
              typeof p.order === "string"
                ? p.order
                : (p.order as unknown as Record<string, string>)?._id;
            return oid === id;
          });
          console.log("[PrintPage] panes by order filter:", found.length);

          // 2nd priority: filter by request ID (covers panes with order: null)
          if (found.length === 0 && reqId) {
            found = allPanes.filter((p) => {
              const rid =
                typeof p.request === "string"
                  ? p.request
                  : (p.request as unknown as Record<string, string>)?._id;
              return rid === reqId;
            });
            console.log(
              "[PrintPage] panes by request client-side filter:",
              found.length,
            );
          }

          setPanes(found);
        }
      })
      .catch((err) => console.error("[PrintPage] unhandled error:", err))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!order)
    return (
      <div className="p-6 text-center text-muted-foreground">
        ไม่พบข้อมูลออเดอร์
      </div>
    );

  // Group panes by unique design
  const designGroups: DesignGroup[] = [];
  panes.forEach((p) => {
    const sig = getDesignSignature(p);
    const existing = designGroups.find((g) => g.signature === sig);
    if (existing) {
      existing.panes.push(p);
    } else {
      designGroups.push({ signature: sig, panes: [p] });
    }
  });

  const orderCode = order.code ?? order._id.slice(-6).toUpperCase();
  const stations = Array.isArray(order.stations) ? order.stations : [];

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
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => router.back()}
        >
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
          const groupQty = group.panes.length;
          const isLast = gIdx === designGroups.length - 1;

          // Consolidated Spec String
          const specStr = [
            getStr(order.material),
            getMaterialSpec(order.material).match(/\d+(\.\d+)?/)?.[0]
              ? `${getMaterialSpec(order.material).match(/\d+(\.\d+)?/)?.[0]} มม.`
              : "",
            "ใส", // Default if not found
          ]
            .filter(Boolean)
            .join(" / ");

          return (
            <div
              key={group.signature}
              className={`section-container bg-white text-black text-[10px] font-sans border border-black ${!isLast ? "page-break" : ""}`}
            >
              {/* 1. Header Grid (High Density) */}
              <div className="grid grid-cols-[1fr,1.5fr,1fr] border-b border-black">
                <div className="p-1.5 border-r border-black flex flex-col justify-center">
                  <div className="flex items-center gap-2 mb-0.5">
                    <img
                      src="/logo.png"
                      alt="Logo"
                      className="h-5 object-contain"
                    />
                    <h2 className="text-[9px] font-black uppercase leading-none">
                      Standard Plus
                    </h2>
                  </div>
                  <p className="text-[7px] text-slate-400">
                    Tel: 042-920-222 | Fax: 042-920-224
                  </p>
                </div>
                <div className="p-1.5 border-r border-black flex flex-col items-center justify-center bg-slate-50/30">
                  <h1 className="text-[11px] font-black underline uppercase">
                    ใบสั่งผลิตกระจก (แบบที่ {gIdx + 1}/{designGroups.length})
                  </h1>
                  <p className="text-[8px] font-bold text-red-600 tracking-widest">
                    {orderCode}
                  </p>
                </div>
                <div className="p-1.5 grid grid-cols-2 gap-x-2 text-[7px]">
                  <div className="font-bold text-slate-500">วันที่:</div>{" "}
                  <div>{fmtDate(order.createdAt)}</div>
                  <div className="font-bold text-slate-500">จน.รวม:</div>{" "}
                  <div className="font-bold">{panes.length} แผ่น</div>
                  <div className="font-bold text-slate-500">พาร์ท:</div>{" "}
                  <div className="font-bold">
                    {gIdx + 1}/{designGroups.length}
                  </div>
                </div>
              </div>

              {/* 2. Customer & Job Info Line */}
              <div className="grid grid-cols-[2fr,1fr,1fr,1fr] border-b border-black bg-white text-[8px]">
                <div className="p-1 px-2 border-r border-black truncate">
                  <span className="font-bold text-slate-500 uppercase text-[6px] mr-1">
                    ลูกค้า:
                  </span>{" "}
                  {getStr(order.customer)}
                </div>
                <div className="p-1 px-2 border-r border-black">
                  <span className="font-bold text-slate-500 uppercase text-[6px] mr-1">
                    เบอร์โทร:
                  </span>{" "}
                  —
                </div>
                <div className="p-1 px-2 border-r border-black">
                  <span className="font-bold text-slate-500 uppercase text-[6px] mr-1">
                    ผู้ขาย:
                  </span>{" "}
                  —
                </div>
                <div className="p-1 px-2">
                  <span className="font-bold text-slate-500 uppercase text-[6px] mr-1">
                    ใบเสนอราคา:
                  </span>{" "}
                  —
                </div>
              </div>

              {/* 3. Consolidated Spec Line */}
              <div className="flex items-center px-2 py-0.5 bg-slate-50 border-b border-black font-black italic text-[9px]">
                <span className="text-blue-800 tracking-tight">{specStr}</span>
                <span className="mx-2 text-slate-300">|</span>
                <span className="text-slate-600">
                  ** {samplePane.jobType || "งานสั่งทำพิเศษ"} **
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[7px] font-black text-red-600 border border-red-600 px-1 rounded-sm bg-white">
                    มอก.
                  </span>
                </div>
              </div>

              {/* 4. MAIN CONTENT (HORIZONTAL SPLIT) */}
              <div className="flex border-b border-black min-h-[330px]">
                {/* 4a. Left: Large Technical Draft (Drawing) */}
                <div className="flex-1 p-2 flex flex-col bg-white overflow-hidden">
                  <p className="text-[6px] font-black text-slate-300 uppercase italic mb-1 tracking-widest leading-none">
                    TECHNICAL DRAFT / แบบวาดเทคนิค
                  </p>
                  <div className="flex-1 flex items-center justify-center border border-slate-50 max-h-[350px]">
                    <StaticGlassRenderer
                      width={samplePane.dimensions?.width || 800}
                      height={samplePane.dimensions?.height || 600}
                      holes={
                        samplePane.holes as HoleData[] | number | undefined
                      }
                      notches={
                        samplePane.notches as HoleData[] | number | undefined
                      }
                    />
                  </div>
                </div>

                {/* 4b. Right: Sidebar (Info + Checklist) */}
                <div className="w-[260px] border-l border-black flex flex-col bg-slate-50/5">
                  {/* Dimension Summary */}
                  <div className="border-b border-black">
                    <p className="bg-slate-900 text-white py-0.5 text-[6px] font-black text-center uppercase tracking-widest">
                      Dimension Table
                    </p>
                    <table className="w-full text-center">
                      <thead>
                        <tr className="border-b border-black text-[6px] font-bold text-slate-500 bg-slate-50 uppercase">
                          <th className="border-r border-black p-0.5">No.</th>
                          <th className="border-r border-black p-0.5">
                            W (กว้าง)
                          </th>
                          <th className="border-r border-black p-0.5">
                            H (สูง)
                          </th>
                          <th className="p-0.5">QTY</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="font-black text-[16px] leading-tight">
                          <td className="border-r border-black p-1.5 text-[9px] text-slate-400">
                            {gIdx + 1}
                          </td>
                          <td className="border-r border-black p-1.5 text-blue-800">
                            {samplePane.dimensions?.width}
                          </td>
                          <td className="border-r border-black p-1.5 text-blue-800">
                            {samplePane.dimensions?.height}
                          </td>
                          <td className="p-1.5 text-red-600">{groupQty}</td>
                        </tr>
                        <tr className="border-t border-black bg-slate-100/50 text-[6px]">
                          <td
                            colSpan={3}
                            className="p-0.5 px-1.5 text-right border-r border-black font-bold uppercase text-slate-500"
                          >
                            Total in design
                          </td>
                          <td className="p-0.5 font-bold text-[8px] text-red-600">
                            {groupQty}
                          </td>
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
                      {[
                        "เจียริมขัดมัน",
                        "เจียรหยาบ",
                        "เจียรปลี",
                        "เจียรลูกหนู",
                        "ลับคม",
                      ].map((l, i) => (
                        <div key={l} className="flex items-center gap-1.5">
                          <div
                            className={`w-3 h-3 border border-slate-400 bg-white flex items-center justify-center text-[8px] ${i === 1 ? "font-black text-blue-700" : "text-transparent"}`}
                          >
                            ✓
                          </div>
                          <span
                            className={`text-[8px] ${i === 1 ? "font-black text-blue-800 leading-none" : "text-slate-600 font-medium leading-none"}`}
                          >
                            {l}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-0.5 mt-2">
                      <p className="font-black text-[7px] uppercase text-blue-700 border-b border-blue-100 pb-0.5 mb-1 flex items-center gap-1">
                        <span className="w-1 h-1 bg-blue-700 rounded-full"></span>
                        Corners (คิ้ว)
                      </p>
                      <div className="flex items-center gap-1.5 opacity-50">
                        <div className="w-3 h-3 border border-slate-400 bg-white text-transparent">
                          ✓
                        </div>
                        <span className="text-[8px] text-slate-500 font-medium italic leading-none">
                          ไม่มี / No Details
                        </span>
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
                  <span className="text-[6px] font-black text-slate-400 uppercase tracking-tighter shrink-0">
                    Flow:
                  </span>
                  <div className="flex items-center gap-1 overflow-hidden">
                    {stations.map((sid, idx) => {
                      const sidStr =
                        typeof sid === "string"
                          ? sid
                          : (sid as { _id: string; name: string })._id;
                      const label = stationMap.get(sidStr)?.name ?? sidStr;
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-0.5 shrink-0"
                        >
                          <span className="text-[7px] font-bold px-1 bg-white border border-slate-200 rounded text-slate-700 truncate max-w-[50px] leading-tight">
                            {label}
                          </span>
                          {idx < stations.length - 1 && (
                            <span className="text-slate-300 text-[6px]">→</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="p-1 px-2 flex items-center gap-2 text-[7px]">
                  <span className="font-bold text-slate-500 uppercase tracking-tighter shrink-0">
                    Notes:
                  </span>
                  <div className="flex-1 border-b border-slate-300 border-dashed translate-y-0.5"></div>
                </div>
              </div>

              {/* 6. Footer: Signatures Only (COMPACT) */}
              <div className="bg-white h-[45px] overflow-hidden flex items-center px-12">
                <div className="flex-1 flex flex-col items-center">
                  <div className="w-[180px] border-b border-slate-800 mb-0.5"></div>
                  <p className="font-black text-[6px] uppercase leading-none">
                    ผู้สั่ง / Approved By
                  </p>
                </div>
                <div className="flex-1 flex flex-col items-center">
                  <div className="w-[180px] border-b border-slate-800 mb-0.5"></div>
                  <p className="font-black text-[6px] uppercase leading-none">
                    ผู้ผลิต / Produced By
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
