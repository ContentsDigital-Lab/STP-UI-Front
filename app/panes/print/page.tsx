"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { panesApi } from "@/lib/api/panes";
import { Pane } from "@/lib/api/types";
import { getStickerTemplate, StickerTemplateRecord } from "@/lib/api/sticker-templates";
import { formatPaneDimWithUnit } from "@/lib/utils/station-helpers";
import type { StickerElement } from "@/app/settings/sticker/types";

import {
    calcGlassWeight,
    calcGlassPerimeterMeters,
    calcGlassAreaSqFt,
    formatGrindingSummary,
    formatDimensionsDisplay,
    formatCompositeFormula,
    formatHolesAndNotches,
    normalizeThickness,
} from "@/lib/utils/glass-calc";

const MM_TO_PX = 3.7795275591;

function fmtDate(d?: string) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

// ── Variable substitution ──────────────────────────────────────────────────────
function substituteVars(
    text: string,
    pane: Pane,
    order: Record<string, unknown> | null,
    sequentialIndex?: number,
    totalPanesCount?: number
): string {
    const customer = order?.customer as Record<string, unknown> | undefined;
    const material = order?.material as Record<string, unknown> | undefined;
    const assignedTo = order?.assignedTo as Record<string, unknown> | undefined;
    const now = new Date();

    const deliveryDateRaw = (order?.expectedDeliveryDate || order?.deadline) as string | undefined;
    const deliveryDateStr = deliveryDateRaw
        ? new Date(deliveryDateRaw).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" })
        : now.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });

    const seqNo = sequentialIndex ? `No. ${sequentialIndex}` : (pane.paneNumber || "No. 1");
    const rawColor = pane.rawGlass?.color || (pane as any).rawGlassColor || "ใส";
    const thkStr = normalizeThickness(pane.dimensions?.thickness || (pane as any).thickness || "6");

    const edgeTop = pane.edgeTasks?.find(e => e.side === 'top')?.edgeProfile;
    const edgeBottom = pane.edgeTasks?.find(e => e.side === 'bottom')?.edgeProfile;
    const edgeLeft = pane.edgeTasks?.find(e => e.side === 'left')?.edgeProfile;
    const edgeRight = pane.edgeTasks?.find(e => e.side === 'right')?.edgeProfile;
    const grindingSummary = formatGrindingSummary(edgeTop, edgeBottom, edgeLeft, edgeRight);

    const compositeFormula = formatCompositeFormula(
        pane.jobType || pane.glassType,
        rawColor,
        thkStr,
        pane.productType,
        pane.compositeLayers
    );

    const depth3Val = (pane.dimensions as any)?.depth3 ?? (pane as any).glassDepth3;
    const isPattern = (pane as any).isCutByPattern || pane.customDimensionsText === "**ตัดตามแบบ**";
    const dimDisplay = formatDimensionsDisplay(
        pane.dimensions?.width,
        pane.dimensions?.height,
        pane.customDimensionsText,
        depth3Val,
        isPattern
    );

    const holesCount = pane.holesCount ?? (Array.isArray(pane.holes) ? pane.holes.length : (typeof pane.holes === 'number' ? pane.holes : 0));
    const notchesCount = pane.notchesCount ?? (Array.isArray(pane.notches) ? pane.notches.length : (typeof pane.notches === 'number' ? pane.notches : 0));
    const holesAndNotchesSummary = formatHolesAndNotches(holesCount, notchesCount);

    const isLam = pane.productType === "laminated";
    const weightVal = calcGlassWeight(pane.dimensions?.width, pane.dimensions?.height, pane.dimensions?.thickness, 1, isLam);
    const perimVal = calcGlassPerimeterMeters(pane.dimensions?.width, pane.dimensions?.height, 1);
    const areaVal = calcGlassAreaSqFt(pane.dimensions?.width, pane.dimensions?.height, 1);

    const isTP = pane.jobType?.toUpperCase().includes("TP") || pane.glassType?.toUpperCase().includes("TP");
    const tpText = isTP ? "TP" : "";

    const poCode = (order?.referenceId || order?.poNumber || order?.code || order?.orderNumber || "") as string;
    const custName = (customer?.name || (order as any)?.customerName || "") as string;

    const vars: Record<string, string> = {
        // ออเดอร์ & เอกสาร
        "{{po}}":                     poCode,
        "{{customerName}}":           custName,
        "{{orderCode}}":              (order?.orderNumber ?? order?.code ?? poCode) as string,
        "{{deliveryDate}}":           deliveryDateStr,
        "{{sequentialNo}}":           seqNo,
        "{{totalSheetsSummary}}":      totalPanesCount ? `จำนวนทั้งหมด ${totalPanesCount} แผ่น` : "",
        "{{quantity}}":               "1 แผ่น",
        "{{status}}":                 (order?.status ?? "") as string,
        "{{assignedTo}}":             (assignedTo?.name ?? assignedTo?.username ?? "") as string,
        "{{materialName}}":           (material?.name ?? "") as string,

        // สเปกกระจก & ประกอบ
        "{{compositeFormula}}":       compositeFormula,
        "{{jobType}}":                (pane.jobType ?? pane.glassType ?? pane.glassTypeLabel ?? "") as string,
        "{{tp}}":                     tpText,
        "{{rawGlassColor}}":          rawColor,
        "{{thickness}}":              thkStr ? `${thkStr} มม.` : "",
        "{{glassType}}":              (pane.jobType ?? pane.glassType ?? pane.glassTypeLabel ?? "") as string,
        "{{productType}}":            pane.productType === "laminated" ? "ลามิเนต" : pane.productType === "insulated" ? "อินซูเลท" : "",
        "{{paneNumber}}":             pane.paneNumber ?? "",
        "{{paneId}}":                 pane._id ?? "",
        "{{qrCode}}":                 pane.qrCode || `STDPLUS:${pane.paneNumber}`,

        // ขนาด & ขอบ
        "{{dimensions}}":             dimDisplay,
        "{{width}}":                  pane.dimensions?.width ? `${Math.round(pane.dimensions.width)}` : "",
        "{{height}}":                 pane.dimensions?.height ? `${Math.round(pane.dimensions.height)}` : "",
        "{{grindingSummary}}":        grindingSummary,

        // รู & บาก & หมายเหตุ
        "{{holes}}":                  holesCount > 0 ? String(holesCount) : "",
        "{{notches}}":                notchesCount > 0 ? String(notchesCount) : "",
        "{{holesAndNotchesSummary}}": holesAndNotchesSummary,
        "{{customerRemarks}}":        pane.customerRemarks || "",
        "{{internalRemarks}}":        pane.internalRemarks || "",

        // คำนวณ
        "{{weight}}":                 weightVal > 0 ? `${weightVal} กก.` : "",
        "{{perimeterMeters}}":        perimVal > 0 ? `${perimVal} ม.` : "",
        "{{areaSqFt}}":               areaVal > 0 ? `${areaVal} ตร.ฟุต` : "",

        // วันที่
        "{{date}}":                   now.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }),
        "{{time}}":                   now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
    };

    let result = text;
    for (const [key, val] of Object.entries(vars)) result = result.replaceAll(key, val);
    return result;
}

// ── Template sticker renderer (HTML-based, print-safe) ──────────────────────
function TemplateStickerRenderer({
    template, pane, order, sequentialIndex, totalPanesCount,
}: {
    template: StickerTemplateRecord;
    pane: Pane;
    order: Record<string, unknown> | null;
    sequentialIndex?: number;
    totalPanesCount?: number;
}) {
    const { width: wMm, height: hMm, elements } = template;
    const sc = 1 / MM_TO_PX;
    const qrValue = pane.qrCode || `STDPLUS:${pane.paneNumber}`;

    function renderEl(el: StickerElement, keyPrefix = ""): React.ReactNode {
        const key = keyPrefix + el.id;
        const left = `${el.x * sc}mm`;
        const top  = `${el.y * sc}mm`;
        const rot  = el.rotation ? `rotate(${el.rotation}deg)` : undefined;
        const base: React.CSSProperties = { position: "absolute", left, top, transform: rot, transformOrigin: "0 0" };

        switch (el.type) {
            case "text":
            case "dynamic": {
                const txt = substituteVars(el.text, pane, order, sequentialIndex, totalPanesCount);
                return (
                    <span key={key} style={{
                        ...base,
                        fontSize: `${el.fontSize * sc}mm`,
                        color: el.fill,
                        fontFamily: el.fontFamily ?? "Prompt, sans-serif",
                        fontWeight: el.bold ? "bold" : "normal",
                        fontStyle: el.italic ? "italic" : "normal",
                        whiteSpace: "nowrap",
                        lineHeight: 1.2,
                    }}>{txt}</span>
                );
            }
            case "qr": {
                const qrVal = substituteVars(el.value || qrValue, pane, order, sequentialIndex, totalPanesCount);
                const sizeMm = Math.min(el.width, el.height) * sc;
                return (
                    <div key={key} style={{ ...base, width: `${el.width * sc}mm`, height: `${el.height * sc}mm` }}>
                        <QRCodeSVG
                            value={qrVal}
                            size={sizeMm * MM_TO_PX * 2}
                            style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm` }}
                            bgColor="#ffffff"
                            fgColor="#000000"
                            level="M"
                        />
                    </div>
                );
            }
            case "rect":
                return (
                    <div key={key} style={{
                        ...base,
                        width: `${el.width * sc}mm`,
                        height: `${el.height * sc}mm`,
                        backgroundColor: el.fill === "transparent" ? "transparent" : el.fill,
                        border: el.strokeWidth > 0 ? `${el.strokeWidth * sc}mm solid ${el.stroke}` : "none",
                        boxSizing: "border-box",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}>
                        {el.label && (
                            <span style={{ fontSize: `${(el.labelFontSize ?? 12) * sc}mm`, color: el.labelColor ?? "#000", fontFamily: "Prompt, sans-serif" }}>
                                {substituteVars(el.label, pane, order, sequentialIndex, totalPanesCount)}
                            </span>
                        )}
                    </div>
                );
            case "line":
                return (
                    <svg key={key} style={{ ...base, overflow: "visible" }}
                        width={`${Math.max(...el.points.filter((_, i) => i % 2 === 0)) * sc}mm`}
                        height={`${Math.max(...el.points.filter((_, i) => i % 2 !== 0)) * sc}mm`}
                    >
                        <polyline
                            points={el.points.map((v, i) => `${v * sc}mm`).join(" ")}
                            stroke={el.stroke}
                            strokeWidth={`${el.strokeWidth * sc}mm`}
                            strokeDasharray={el.dash ? el.dash.map((d: number) => `${d * sc}mm`).join(" ") : undefined}
                            fill="none"
                        />
                    </svg>
                );
            case "image":
                return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={key} src={el.src} alt="" style={{
                        ...base,
                        width: `${el.width * sc}mm`,
                        height: `${el.height * sc}mm`,
                        objectFit: "cover",
                    }} />
                );
            case "group":
                return (
                    <div key={key} style={{ ...base, width: `${el.width * sc}mm`, height: `${el.height * sc}mm`, position: "absolute" }}>
                        {el.children.map((child) => renderEl(child, key + "-"))}
                    </div>
                );
            default:
                return null;
        }
    }

    return (
        <div style={{
            position: "relative",
            width: `${wMm}mm`,
            height: `${hMm}mm`,
            overflow: "hidden",
            backgroundColor: "white",
            boxSizing: "border-box",
        }}>
            {(elements as StickerElement[]).map((el) => renderEl(el))}
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function PaneStickerPrintPage() {
    const searchParams = useSearchParams();
    const router       = useRouter();

    const requestId  = searchParams.get("request");
    const orderId    = searchParams.get("order");
    const templateId = searchParams.get("template");
    const paneIds    = searchParams.get("ids")?.split(",").filter(Boolean);
    const autoprint  = searchParams.get("autoprint") === "1";

    const [panes,    setPanes]    = useState<Pane[]>([]);
    const [order,    setOrder]    = useState<Record<string, unknown> | null>(null);
    const [template, setTemplate] = useState<StickerTemplateRecord | null>(null);
    const [loading,  setLoading]  = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const sortPanes = (list: Pane[]) => list.slice().sort((a, b) => {
                    if (a.paneNumber && b.paneNumber) {
                        return a.paneNumber.localeCompare(b.paneNumber, undefined, { numeric: true, sensitivity: 'base' });
                    }
                    return 0;
                });

                // Load panes
                if (paneIds && paneIds.length > 0) {
                    const results = await Promise.all(paneIds.map(id => panesApi.getById(id)));
                    setPanes(sortPanes(results.filter(r => r.success && r.data).map(r => r.data)));
                } else if (orderId) {
                    // Try fetching panes by order first
                    const res = await panesApi.getAll({ order: orderId, status_ne: "claimed", limit: 200 });
                    const byOrder = res.success ? (res.data ?? []) : [];

                    if (byOrder.length > 0) {
                        setPanes(sortPanes(byOrder));
                        const firstOrder = byOrder[0]?.order;
                        if (firstOrder && typeof firstOrder === "object") setOrder(firstOrder as unknown as Record<string, unknown>);
                    } else {
                        // Fallback: fetch the order directly, get its request, query panes by request
                        try {
                            const { fetchApi } = await import("@/lib/api/config");
                            const orderRes = await fetchApi<{ success: boolean; data: Record<string, unknown> }>(`/orders/${orderId}`);
                            if (orderRes.success && orderRes.data) {
                                setOrder(orderRes.data);
                                const req    = orderRes.data.request;
                                const reqId  = req ? (typeof req === "object" ? (req as Record<string, unknown>)._id as string : req as string) : null;
                                if (reqId) {
                                    const res2 = await panesApi.getAll({ request: reqId, limit: 200 });
                                    if (res2.success) setPanes(sortPanes(res2.data ?? []));
                                }
                            }
                        } catch { /* ignore */ }
                    }
                } else if (requestId) {
                    const res = await panesApi.getAll({ request: requestId, limit: 200 });
                    if (res.success) setPanes(sortPanes(res.data ?? []));
                } else {
                    const res = await panesApi.getAll({ limit: 200 });
                    if (res.success) setPanes(sortPanes(res.data ?? []));
                }

                // Load template if provided
                if (templateId) {
                    const t = await getStickerTemplate(templateId);
                    setTemplate(t);
                }
            } catch { /* ignore */ }
            setLoading(false);
        }
        load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-trigger print dialog when ?autoprint=1 (opened from station block)
    useEffect(() => {
        if (!autoprint || loading || panes.length === 0) return;
        // Small delay to ensure DOM is fully painted before print dialog opens
        const t = setTimeout(() => window.print(), 400);
        return () => clearTimeout(t);
    }, [autoprint, loading, panes.length]);

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
    );

    if (panes.length === 0) return (
        <div className="p-6 text-center text-muted-foreground">ไม่พบข้อมูลกระจก</div>
    );

    const requestInfo  = panes[0]?.request;
    const requestLabel = requestInfo && typeof requestInfo === "object"
        ? (requestInfo as unknown as Record<string, unknown>).requestNumber as string ?? ""
        : "";
    const requestType  = requestInfo && typeof requestInfo === "object"
        ? ((requestInfo as unknown as Record<string, unknown>).details as Record<string, unknown>)?.type as string ?? ""
        : "";
    const orderLabel   = (order?.orderNumber ?? order?.code ?? "") as string;

    // When using a template, @page size = sticker size so there's no wasted paper.
    // Each pane prints on its own page (break-after: page on every item except the last).
    const pageStyle = template
        ? `@page { size: ${template.width}mm ${template.height}mm; margin: 0; }`
        : `@page { size: A4; margin: 8mm; }`;

    return (
        <>
            <style>{`
                @media print {
                    ${pageStyle}
                    html, body { margin: 0 !important; padding: 0 !important; visibility: hidden; ${template ? `width: ${template.width}mm !important;` : ""} }
                    #pane-sticker-print, #pane-sticker-print * { visibility: visible; }
                    #pane-sticker-print { position: absolute; top: 0; left: 0; background: #fff; margin: 0; padding: 0; }
                    .no-print { display: none !important; }
                    .sticker-page {
                        break-after: page; page-break-after: always;
                        ${template ? `width: ${template.width}mm; height: ${template.height}mm; overflow: hidden;` : ""}
                        margin: 0; padding: 0;
                    }
                    .sticker-page:last-child { break-after: auto; page-break-after: auto; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
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
                        {template ? `Template: ${template.name} (${template.width}×${template.height}mm)` : "QR สติกเกอร์กระจก"}
                        {" — "}{panes.length} ชิ้น
                        {(orderLabel || requestLabel) && <span className="ml-2 font-medium text-foreground">{orderLabel || requestLabel}</span>}
                        {requestType && <span className="ml-1 text-muted-foreground">({requestType})</span>}
                    </p>
                </div>
                <Button className="gap-2" onClick={() => window.print()}>
                    <Printer className="h-4 w-4" />
                    พิมพ์สติกเกอร์
                </Button>
            </div>

            {/* Print content */}
            <div id="pane-sticker-print" className="bg-white text-black font-sans">

                {template ? (
                    /* ── Template-based: one sticker per page, no margin ─── */
                    <>
                        {panes.map((pane, idx) => (
                            <div key={pane._id} className="sticker-page">
                                <TemplateStickerRenderer
                                    template={template}
                                    pane={pane}
                                    order={order}
                                    sequentialIndex={idx + 1}
                                    totalPanesCount={panes.length}
                                />
                            </div>
                        ))}
                    </>
                ) : (
                    /* ── Default QR grid ──────────────────────────────────── */
                    <>
                        <div className="border-b-2 border-gray-200 pb-4 mb-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h1 className="text-xl font-black text-gray-800">QR สติกเกอร์กระจก</h1>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {panes.length} ชิ้น
                                        {requestLabel && ` • ${requestLabel}`}
                                        {requestType  && ` • ${requestType}`}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-400">{fmtDate(new Date().toISOString())}</p>
                                    <p className="text-[10px] text-gray-300 mt-0.5">สแกน QR เพื่อบันทึกการผลิต</p>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            {panes.map((pane) => {
                                const qrValue = pane.qrCode || `STDPLUS:${pane.paneNumber}`;
                                return (
                                    <div key={pane._id} className="sticker-item border-2 border-gray-300 rounded-xl p-3 flex flex-col items-center gap-2 bg-white">
                                        <p className="font-mono font-black text-sm tracking-widest text-black">{pane.paneNumber}</p>
                                        <div className="p-2 bg-white border border-gray-100 rounded-lg">
                                            <QRCodeSVG value={qrValue} size={110} bgColor="#ffffff" fgColor="#000000" level="M" marginSize={1} />
                                        </div>
                                        <div className="w-full text-center">
                                            {pane.glassTypeLabel && <p className="text-xs font-semibold text-gray-700">{pane.glassTypeLabel}</p>}
                                            {pane.dimensions && (pane.dimensions.width > 0 || pane.dimensions.height > 0) && (
                                                <p className="text-[10px] text-gray-500 mt-0.5">
                                                    {(() => {
                                                        const pd = formatPaneDimWithUnit(pane);
                                                        return pd.dimStr ? (
                                                            <>
                                                                {pd.dimStr}
                                                                {pd.thicknessStr && ` ${pd.thicknessStr}`}
                                                            </>
                                                        ) : null;
                                                    })()}
                                                </p>
                                            )}
                                        </div>
                                        <div className="w-full border-t border-dashed border-gray-200 pt-1.5 mt-auto">
                                            <p className="text-[8px] text-gray-300 text-center font-mono">{qrValue}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
