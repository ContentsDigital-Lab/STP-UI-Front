"use client";

import { useNode } from "@craftjs/core";
import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Printer, Loader2, X, Sticker, RefreshCw, ChevronRight, Sparkles, Layers } from "lucide-react";
import { usePreview } from "../PreviewContext";
import { useStationContext } from "../StationContext";
import { QRCodeSVG } from "qrcode.react";
import { getStickerTemplates, getStickerTemplate, StickerTemplateRecord } from "@/lib/api/sticker-templates";
import {
    getStickerMapping,
    fetchStickerMapping,
    saveStickerMapping,
    resolveStickerTemplates,
    isPaneLaminateOrInsulate,
    type StickerMappingSettings
} from "@/lib/sticker-settings";
import { panesApi } from "@/lib/api/panes";
import { Pane, PaginatedResponse } from "@/lib/api/types";
import StickerThumbnail from "@/app/settings/sticker/StickerThumbnail";
import type { StickerElement } from "@/app/settings/sticker/types";
import { formatPaneDimWithUnit } from "@/lib/utils/station-helpers";
import {
    formatCompositeFormula,
    formatGrindingSummary,
    formatHolesAndNotches,
    calcGlassWeight,
    calcGlassPerimeterMeters,
    calcGlassAreaSqFt,
    formatDimensionsDisplay,
    normalizeThickness,
} from "@/lib/utils/glass-calc";

const MM_TO_PX = 3.7795275591;
const LS_KEY   = "std_sticker_template";

// ── Variable substitution ─────────────────────────────────────────────────────
function sub(text: string, pane: Pane, order: Record<string, unknown> | null, paneIndex: number = 0): string {
    const customer   = order?.customer   as Record<string, unknown> | undefined;
    const material   = order?.material   as Record<string, unknown> | undefined;
    const assignedTo = order?.assignedTo as Record<string, unknown> | undefined;
    const now        = new Date();
    const qrCode     = pane.qrCode || `STDPLUS:${pane.paneNumber || paneIndex + 1}`;

    const seqNo = `No. ${paneIndex + 1}`;
    const rawColor = ((pane as any).rawGlass?.color || (pane as any).rawGlassColor || "").trim();
    const thkStr = normalizeThickness(pane.dimensions?.thickness || (pane as any).thickness || "");

    const edgeTop = pane.edgeTasks?.find(e => e.side === 'top')?.edgeProfile;
    const edgeBottom = pane.edgeTasks?.find(e => e.side === 'bottom')?.edgeProfile;
    const edgeLeft = pane.edgeTasks?.find(e => e.side === 'left')?.edgeProfile;
    const edgeRight = pane.edgeTasks?.find(e => e.side === 'right')?.edgeProfile;
    const grindingSummary = formatGrindingSummary(edgeTop, edgeBottom, edgeLeft, edgeRight);

    const compositeFormula = formatCompositeFormula(
        pane.jobType || pane.glassType,
        rawColor,
        thkStr,
        (pane as any).productType,
        (pane as any).compositeLayers
    );

    const depth3Val = (pane.dimensions as any)?.depth3 ?? (pane as any).glassDepth3;
    const isPattern = (pane as any).isCutByPattern || (pane as any).customDimensionsText === "**ตัดตามแบบ**";
    const dimDisplay = formatDimensionsDisplay(
        pane.dimensions?.width,
        pane.dimensions?.height,
        (pane as any).customDimensionsText,
        depth3Val,
        isPattern
    );

    const holesCount = pane.holesCount ?? (Array.isArray(pane.holes) ? pane.holes.length : (typeof pane.holes === 'number' ? pane.holes : 0));
    const notchesCount = pane.notchesCount ?? (Array.isArray(pane.notches) ? pane.notches.length : (typeof pane.notches === 'number' ? pane.notches : 0));
    const holesAndNotchesSummary = formatHolesAndNotches(holesCount, notchesCount);

    const isLam = isPaneLaminateOrInsulate(pane);
    const weightVal = calcGlassWeight(pane.dimensions?.width ?? 0, pane.dimensions?.height ?? 0, pane.dimensions?.thickness ?? 6, 1, isLam);
    const perimVal = calcGlassPerimeterMeters(pane.dimensions?.width ?? 0, pane.dimensions?.height ?? 0, 1);
    const areaVal = calcGlassAreaSqFt(pane.dimensions?.width ?? 0, pane.dimensions?.height ?? 0, 1);

    const isTP = (pane.jobType || pane.glassType || (pane as any).rawGlassType || "")?.toUpperCase().includes("TP");
    const tpText = isTP ? "TP" : "";

    // Clean jobType/glassType: if it contains "ตัดธรรมดา" or "ธรรมดา" or is non-TP generic, keep it blank so "ตัดธรรมดา" is never printed
    const rawJobType = (pane.jobType ?? pane.glassType ?? pane.glassTypeLabel ?? "") as string;
    const cleanJobType = isTP ? "TP" : (/ตัดธรรมดา|ธรรมดา|float|raw/i.test(rawJobType) ? "" : rawJobType);

    // Combined spec variable: [TP] [Color] [Thickness] (e.g. "TP ใส 6 มม." or "ใส 6 มม.")
    const glassSpec = [tpText, rawColor, thkStr ? `${thkStr} มม.` : ""].filter(Boolean).join(" ");

    const poCode = (order?.referenceId || order?.poNumber || order?.code || order?.orderNumber || (order as any)?.requestNumber || "") as string;
    const custName = (customer?.name || (order as any)?.customerName || "") as string;

    const deliveryRaw = (order as any)?.expectedDeliveryDate || (order as any)?.deadline;
    const deliveryDateStr = deliveryRaw
        ? new Date(deliveryRaw).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" })
        : now.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });

    const custRemarks = (pane as any).customerRemarks || (order as any)?.customerRemarks || (order as any)?.notes || "";
    const intRemarks = (pane as any).remarks || (pane as any).internalRemarks || (order as any)?.internalRemarks || "";

    const vars: Record<string, string> = {
        // ── ออเดอร์ & เอกสาร ───────────────────────────────────────────────
        "{{po}}":                     poCode,
        "{{customerName}}":           custName,
        "{{orderCode}}":              (order?.orderNumber ?? order?.code ?? poCode) as string,
        "{{deliveryDate}}":           deliveryDateStr,
        "{{sequentialNo}}":           seqNo,
        "{{quantity}}":               "1 แผ่น",
        "{{status}}":                 (order?.status ?? "") as string,
        "{{assignedTo}}":             (assignedTo?.name ?? assignedTo?.username ?? "") as string,
        "{{materialName}}":           (material?.name ?? pane.glassTypeLabel ?? "") as string,

        // ── สเปกกระจก & กระจกประกอบ ─────────────────────────────────────────
        "{{compositeFormula}}":       compositeFormula,
        "{{jobType}}":                cleanJobType,
        "{{tp}}":                     tpText,
        "{{rawGlassColor}}":          rawColor,
        "{{thickness}}":              thkStr ? `${thkStr} มม.` : "",
        "{{glassType}}":              cleanJobType,
        "{{glassSpec}}":              glassSpec,
        "{{specGroup}}":              glassSpec,
        "{{productType}}":            (pane as any).productType === "laminated" ? "ลามิเนต" : (pane as any).productType === "insulated" ? "อินซูเลท" : "",
        "{{paneNumber}}":             pane.paneNumber ?? "",
        "{{paneId}}":                 pane._id ?? "",
        "{{qrCode}}":                 qrCode,

        // ── ขนาดและการเจียร ───────────────────────────────────────────────
        "{{dimensions}}":             dimDisplay,
        "{{width}}":                  pane.dimensions?.width ? `${Math.round(pane.dimensions.width)}` : "",
        "{{height}}":                 pane.dimensions?.height ? `${Math.round(pane.dimensions.height)}` : "",
        "{{grindingSummary}}":        grindingSummary,

        // ── รูเจาะ / บาก / หมายเหตุ ────────────────────────────────────────
        "{{holes}}":                  holesCount > 0 ? String(holesCount) : "",
        "{{notches}}":                notchesCount > 0 ? String(notchesCount) : "",
        "{{holesSummary}}":           holesCount > 0 ? `จำนวน ${holesCount} รู` : "",
        "{{notchesSummary}}":         notchesCount > 0 ? `จำนวนบาก ${notchesCount} บาก` : "",
        "{{holesAndNotchesSummary}}": holesAndNotchesSummary,
        "{{customerRemarks}}":        custRemarks,
        "{{internalRemarks}}":        intRemarks,

        // ── สูตรคำนวณทางเทคนิค ──────────────────────────────────────────────
        "{{weight}}":                 weightVal ? `${weightVal} กก.` : "",
        "{{perimeterMeters}}":        perimVal ? `${perimVal} ม.` : "",
        "{{areaSqFt}}":               areaVal ? `${areaVal} ตร.ฟุต` : "",

        // ── วันที่ / เวลา ─────────────────────────────────────────────────
        "{{date}}":                   now.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }),
        "{{time}}":                   now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
    };

    let result = text;
    for (const [k, v] of Object.entries(vars)) result = result.replaceAll(k, v);
    return result;
}

// ── Full-size sticker renderer (used for printing, not scaled) ─────────────────
function StickerPrintRenderer({
    template, pane, order, paneIndex = 0,
}: { template: StickerTemplateRecord; pane: Pane; order: Record<string, unknown> | null; paneIndex?: number }) {
    const { width: wMm, height: hMm, elements } = template;
    const sc      = 1 / MM_TO_PX;
    const qrValue = pane.qrCode || `STDPLUS:${pane.paneNumber}`;

    function renderEl(el: StickerElement, kp = ""): React.ReactNode {
        const key  = kp + el.id;
        const left = `${el.x * sc}mm`;
        const top  = `${el.y * sc}mm`;
        const rot  = el.rotation ? `rotate(${el.rotation}deg)` : undefined;
        const base: React.CSSProperties = { position: "absolute", left, top, transform: rot, transformOrigin: "0 0" };
        switch (el.type) {
            case "text":
            case "dynamic": {
                const content = sub(el.text, pane, order, paneIndex);
                return (
                    <div key={key} style={{
                        ...base,
                        display: "block",
                        fontSize: `${el.fontSize * sc}mm`,
                        color: el.fill || "#000000",
                        fontFamily: el.fontFamily ?? "Prompt, sans-serif",
                        fontWeight: el.bold ? "bold" : "normal",
                        fontStyle: el.italic ? "italic" : "normal",
                        whiteSpace: "pre",
                        lineHeight: 1.2,
                        zIndex: 10,
                        pointerEvents: "none",
                    }}>{content || "\u00A0"}</div>
                );
            }
            case "qr": {
                // el.value is a variable template (e.g. "{{qrCode}}", "{{orderCode}}") — always run through sub()
                // fallback: use pane's actual QR code if el.value is empty
                const qrVal  = sub(el.value || "{{qrCode}}", pane, order, paneIndex);
                const sizeMm = Math.min(el.width, el.height) * sc;
                return <div key={key} style={{ ...base, width: `${el.width * sc}mm`, height: `${el.height * sc}mm` }}><QRCodeSVG value={qrVal} size={sizeMm * MM_TO_PX * 2} style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm` }} bgColor="#ffffff" fgColor="#000000" level="M" /></div>;
            }
            case "rect":
                return <div key={key} style={{ ...base, width: `${el.width * sc}mm`, height: `${el.height * sc}mm`, backgroundColor: el.fill === "transparent" ? "transparent" : el.fill, border: el.strokeWidth > 0 ? `${el.strokeWidth * sc}mm solid ${el.stroke}` : "none", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>{el.label && <span style={{ fontSize: `${(el.labelFontSize ?? 12) * sc}mm`, color: el.labelColor ?? "#000", fontFamily: "Prompt, sans-serif" }}>{sub(el.label, pane, order, paneIndex)}</span>}</div>;
            case "line":
                return <svg key={key} style={{ ...base, overflow: "visible" }} width={`${Math.max(...el.points.filter((_, i) => i % 2 === 0)) * sc}mm`} height={`${Math.max(...el.points.filter((_, i) => i % 2 !== 0)) * sc}mm`}><polyline points={el.points.map(v => `${v * sc}mm`).join(" ")} stroke={el.stroke} strokeWidth={`${el.strokeWidth * sc}mm`} fill="none" /></svg>;
            // eslint-disable-next-line @next/next/no-img-element
            case "image": return <img key={key} src={el.src} alt="" style={{ ...base, width: `${el.width * sc}mm`, height: `${el.height * sc}mm`, objectFit: "cover" }} />;
            case "group": return <div key={key} style={{ ...base, width: `${el.width * sc}mm`, height: `${el.height * sc}mm`, position: "absolute" }}>{el.children.map(c => renderEl(c, key + "-"))}</div>;
            default: return null;
        }
    }

    return (
        <div style={{ position: "relative", width: `${wMm}mm`, height: `${hMm}mm`, overflow: "hidden", backgroundColor: "white", boxSizing: "border-box" }}>
            {(elements as StickerElement[]).map(el => renderEl(el))}
        </div>
    );
}

interface SavedTemplate { id: string; name: string; widthMm: number; heightMm: number }

// ── Block props ───────────────────────────────────────────────────────────────
interface StickerPrintBlockProps { label?: string }

export function StickerPrintBlock({ label = "พิมพ์สติ๊กเกอร์" }: StickerPrintBlockProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const { selectedRecord, orderData, requestData } = useStationContext();

    // Portal needs document.body — only available client-side
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    // ── Persisted template selection & Auto Mapping ──────────────────────────
    const [mapping,          setMapping]          = useState<StickerMappingSettings>({});
    const [laminateTemplate, setLaminateTemplate] = useState<StickerTemplateRecord | null>(null);
    const [standardTemplate, setStandardTemplate] = useState<StickerTemplateRecord | null>(null);

    // Persisted manual override selection (if null -> Auto-assign mode is ON)
    const [saved,            setSaved]            = useState<SavedTemplate | null>(null);
    const [template,         setTemplate]         = useState<StickerTemplateRecord | null>(null);
    const [loadingTpl,       setLoadingTpl]       = useState(false);

    // ── Pane list ─────────────────────────────────────────────────────────────
    const [panes,            setPanes]            = useState<Pane[]>([]);
    const [loadingPanes,     setLoadingPanes]     = useState(false);

    // ── Template picker modal ─────────────────────────────────────────────────
    const [showPicker,       setShowPicker]       = useState(false);
    const [allTemplates,     setAllTemplates]     = useState<StickerTemplateRecord[]>([]);
    const [loadingAll,       setLoadingAll]       = useState(false);

    // Load saved template from localStorage on mount
    useEffect(() => {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.id && parsed.id !== "__auto__") {
                    setSaved(parsed as SavedTemplate);
                }
            }
        } catch { /* ignore */ }
    }, []);

    // Load sticker mapping & all templates immediately on preview mount
    const loadMappingAndTemplates = useCallback(async () => {
        try {
            setLoadingAll(true);
            const [tpls, m] = await Promise.all([
                getStickerTemplates(1, 100),
                fetchStickerMapping(),
            ]);
            setAllTemplates(tpls);
            setMapping(m);

            const resolved = resolveStickerTemplates(tpls, m);
            setLaminateTemplate(resolved.laminateTemplate);
            setStandardTemplate(resolved.standardTemplate);
        } catch {
            // ignore
        } finally {
            setLoadingAll(false);
        }
    }, []);

    useEffect(() => {
        if (!isPreview) return;
        loadMappingAndTemplates();
    }, [loadMappingAndTemplates, isPreview]);

    const isAutoMode = !saved || saved.id === "__auto__";

    // Fetch full template (elements) when manual saved ID changes
    useEffect(() => {
        if (!saved?.id || saved.id === "__auto__" || !isPreview) {
            setTemplate(null);
            return;
        }
        setLoadingTpl(true);
        getStickerTemplate(saved.id)
            .then(setTemplate)
            .catch(() => setTemplate(null))
            .finally(() => setLoadingTpl(false));
    }, [saved?.id, isPreview]);

    // Fetch panes when order changes.
    const contextRecord = selectedRecord ?? orderData;
    const contextId     = (contextRecord?._id ?? requestData?._id) as string | undefined;

    // Extract the request ID embedded inside an order record (may be populated or plain string)
    const orderRequestId = contextRecord?.request
        ? (typeof contextRecord.request === "object"
            ? (contextRecord.request as Record<string, unknown>)._id as string
            : contextRecord.request as string)
        : undefined;

    // Page-level requestData (from URL params)
    const fallbackRequestId = requestData?._id as string | undefined;

    // Alias used in JSX for display / disabled checks
    const orderId = contextId;

    useEffect(() => {
        if (!contextId || !isPreview) { setPanes([]); return; }
        setLoadingPanes(true);

        const queries: Promise<PaginatedResponse<Pane>>[] = [
            panesApi.getAll({ order:   contextId, status_ne: "claimed", limit: 200 }),
            panesApi.getAll({ request: contextId, limit: 200 }),
        ];
        if (orderRequestId) queries.push(panesApi.getAll({ request: orderRequestId, limit: 200 }));
        if (fallbackRequestId && fallbackRequestId !== contextId)
            queries.push(panesApi.getAll({ request: fallbackRequestId, limit: 200 }));

        Promise.all(queries)
            .then((results) => {
                const winner = results.find(r => r.success && r.data.length > 0);
                const rawList = winner?.data ?? [];
                const sorted = rawList.slice().sort((a, b) => {
                    if (a.paneNumber && b.paneNumber) {
                        return a.paneNumber.localeCompare(b.paneNumber, undefined, { numeric: true, sensitivity: 'base' });
                    }
                    return 0;
                });
                setPanes(sorted);
            })
            .catch(() => setPanes([]))
            .finally(() => setLoadingPanes(false));
    }, [contextId, orderRequestId, fallbackRequestId, isPreview]);

    const openPicker = async () => {
        setShowPicker(true);
        if (allTemplates.length > 0) return;
        loadMappingAndTemplates();
    };

    const handleSelectAuto = useCallback(() => {
        setSaved(null);
        setTemplate(null);
        localStorage.removeItem(LS_KEY);
        setShowPicker(false);
    }, []);

    const handleSelectManual = useCallback((t: StickerTemplateRecord) => {
        const s: SavedTemplate = { id: t._id, name: t.name, widthMm: t.width, heightMm: t.height };
        setSaved(s);
        setTemplate(t);
        localStorage.setItem(LS_KEY, JSON.stringify(s));
        setShowPicker(false);
    }, []);

    // Change mapping from modal
    const handleUpdateMappingField = useCallback(async (field: keyof StickerMappingSettings, tmplId: string) => {
        const cleanVal = tmplId === "__none__" || !tmplId ? "" : tmplId;
        const next = { ...mapping, [field]: cleanVal };
        setMapping(next);
        await saveStickerMapping(next);
        const resolved = resolveStickerTemplates(allTemplates, next);
        setLaminateTemplate(resolved.laminateTemplate);
        setStandardTemplate(resolved.standardTemplate);
    }, [mapping, allTemplates]);

    const getPaneTemplate = useCallback((pane: Pane): StickerTemplateRecord | null => {
        if (!isAutoMode && template) return template;
        const isMulti = isPaneLaminateOrInsulate(pane);
        if (isMulti) {
            return laminateTemplate || standardTemplate || template || (allTemplates.length > 0 ? allTemplates[0] : null);
        }
        return standardTemplate || laminateTemplate || template || (allTemplates.length > 0 ? allTemplates[0] : null);
    }, [isAutoMode, template, laminateTemplate, standardTemplate, allTemplates]);

    const activePrimaryTemplate = (!isAutoMode && template)
        ? template
        : (standardTemplate || laminateTemplate || template || (allTemplates.length > 0 ? allTemplates[0] : null));

    const readyToPrint = panes.length > 0 && (
        isAutoMode ? (!!laminateTemplate || !!standardTemplate || !!template || allTemplates.length > 0) : !!template
    );

    const handlePrint = () => {
        if (!readyToPrint) return;
        window.print();
    };

    const orderLabel = (contextRecord?.orderNumber ?? contextRecord?.code ?? (contextRecord as Record<string, unknown>)?.requestNumber ?? "") as string;

    // Close modal on Escape key
    useEffect(() => {
        if (!showPicker) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setShowPicker(false);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [showPicker]);

    // Breakdown of panes
    const lamCount = panes.filter(isPaneLaminateOrInsulate).length;
    const stdCount = panes.length - lamCount;
    const hasMixedTypes = lamCount > 0 && stdCount > 0;

    // ── Design mode ───────────────────────────────────────────────────────────
    if (!isPreview) {
        return (
            <div
                ref={(ref) => { ref && connect(drag(ref)); }}
                className={`w-full cursor-grab rounded-xl p-1 transition-all ${selected ? "ring-2 ring-primary/30" : "hover:ring-1 hover:ring-primary/20"}`}
            >
                <button disabled className="w-full rounded-lg bg-purple-700 text-white font-bold px-6 py-3 text-base min-h-[52px] disabled:opacity-70 flex items-center justify-center gap-2">
                    <Printer className="h-5 w-5" />
                    {label}
                </button>
                <p className="text-[10px] text-purple-600 dark:text-purple-400 text-center mt-1">
                    <Sparkles className="inline h-3 w-3 mr-0.5" />
                    อัตโนมัติ (เทมเพลต 1 & 2) → พิมพ์สติกเกอร์
                </p>
            </div>
        );
    }

    // ── Preview mode ──────────────────────────────────────────────────────────

    // Pane status line
    const paneStatus = !orderId
        ? { text: "เลือกออเดอร์จากรายการข้อมูลก่อน", color: "text-gray-400" }
        : loadingPanes || loadingTpl
        ? { text: "กำลังโหลดข้อมูล…", color: "text-gray-400" }
        : panes.length === 0
        ? { text: "ไม่พบกระจกในออเดอร์นี้", color: "text-red-400" }
        : {
            text: `พร้อมพิมพ์ ${panes.length} ชิ้น${orderLabel ? ` · ${orderLabel}` : ""}`,
            color: "text-emerald-600 dark:text-emerald-400 font-semibold",
        };

    return (
        <div className="w-full space-y-3">

            {/* ── Print portal: stickers rendered as direct child of <body> ── */}
            {mounted && readyToPrint && (() => {
                const firstPaneTemplate = panes.length > 0 ? (getPaneTemplate(panes[0]) || activePrimaryTemplate) : activePrimaryTemplate;
                const printW = firstPaneTemplate?.width ?? 86;
                const printH = firstPaneTemplate?.height ?? 56;

                return createPortal(
                    <>
                        <style>{`
                            @media screen { #stk-print-portal { display: none; } }
                            @media print {
                                @page { size: ${printW}mm ${printH}mm; margin: 0; }
                                html, body { margin: 0 !important; padding: 0 !important; width: ${printW}mm !important; height: ${printH}mm !important; }
                                body > * { display: none !important; }
                                body > #stk-print-portal { display: block !important; margin: 0 !important; padding: 0 !important; }
                                #stk-print-portal .stk-page {
                                    break-after: page; page-break-after: always;
                                    break-inside: avoid; page-break-inside: avoid;
                                    overflow: hidden; margin: 0; padding: 0;
                                }
                                #stk-print-portal .stk-page:last-child { break-after: auto; page-break-after: auto; }
                                #stk-print-portal * {
                                    -webkit-print-color-adjust: exact !important;
                                    print-color-adjust: exact !important;
                                    color-adjust: exact !important;
                                }
                                #stk-print-portal div, #stk-print-portal span {
                                    visibility: visible !important;
                                    opacity: 1 !important;
                                }
                            }
                        `}</style>
                        <div id="stk-print-portal">
                            {panes.map((pane, idx) => {
                                const paneTmpl = getPaneTemplate(pane) || activePrimaryTemplate;
                                if (!paneTmpl) return null;
                                return (
                                    <div
                                        key={pane._id || `pane_${idx}`}
                                        className="stk-page"
                                        style={{ width: `${paneTmpl.width}mm`, height: `${paneTmpl.height}mm` }}
                                    >
                                        <StickerPrintRenderer
                                            template={paneTmpl}
                                            pane={pane}
                                            order={contextRecord as Record<string, unknown> | null}
                                            paneIndex={idx}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </>,
                    document.body
                );
            })()}

            {/* ── Template selector bar ─────────────────────────────────── */}
            {isAutoMode ? (
                <div className="flex items-center gap-2.5 rounded-xl border-2 border-purple-600 dark:border-purple-500 bg-gradient-to-r from-purple-50 via-purple-50/70 to-indigo-50/60 dark:from-purple-950/40 dark:via-purple-900/20 dark:to-indigo-950/30 px-3.5 py-2.5 shadow-xs">
                    <div className="h-8 w-8 rounded-lg bg-purple-600 dark:bg-purple-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-purple-950 dark:text-purple-100 truncate">
                            อัตโนมัติ (เทมเพลต 1 & 2)
                        </p>
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-purple-700/90 dark:text-purple-300/90 mt-0.5">
                            <span className="truncate">1. ลามิเนต/อินซูเลท: <strong>{laminateTemplate?.name ?? "เทมเพลต 1"}</strong></span>
                            <span className="text-purple-300 dark:text-purple-600">•</span>
                            <span className="truncate">2. เทมเปอร์/ตัดธรรมดา: <strong>{standardTemplate?.name ?? "เทมเพลต 2"}</strong></span>
                        </div>
                    </div>
                    <button
                        onClick={openPicker}
                        className="flex items-center gap-1 text-[11px] font-semibold text-purple-700 dark:text-purple-300 bg-white dark:bg-purple-900/50 border border-purple-300 dark:border-purple-700 rounded-lg px-2.5 py-1.5 hover:bg-purple-100 dark:hover:bg-purple-800/40 active:bg-purple-200 shrink-0 shadow-xs"
                    >
                        <RefreshCw className="h-3 w-3" />
                        ตั้งค่า
                    </button>
                </div>
            ) : saved ? (
                <div className="flex items-center gap-2 rounded-xl border-2 border-purple-700 dark:border-purple-500 bg-purple-50 dark:bg-purple-900/20 px-3 py-2.5">
                    <Sticker className="h-4 w-4 text-purple-700 dark:text-purple-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-purple-900 dark:text-purple-100 truncate">{saved.name}</p>
                        <p className="text-[11px] text-purple-500 dark:text-purple-400">{saved.widthMm} × {saved.heightMm} mm</p>
                    </div>
                    <button
                        onClick={openPicker}
                        className="flex items-center gap-1 text-[11px] font-semibold text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 rounded-lg px-2 py-1 hover:bg-purple-100 dark:hover:bg-purple-900/40 active:bg-purple-200 shrink-0"
                    >
                        <RefreshCw className="h-3 w-3" />
                        เปลี่ยน
                    </button>
                </div>
            ) : (
                <button
                    onClick={openPicker}
                    className="w-full rounded-xl border-2 border-dashed border-purple-400 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/10 px-4 py-3 text-sm font-semibold text-purple-700 dark:text-purple-300 flex items-center justify-center gap-2 active:bg-purple-100 dark:active:bg-purple-900/20"
                >
                    <Sticker className="h-4 w-4" />
                    เลือก template สติ๊กเกอร์
                </button>
            )}

            {/* ── Pane status line ──────────────────────────────────────── */}
            <div className="flex items-center gap-2 px-1">
                {loadingPanes
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400 shrink-0" />
                    : <span className={`h-2 w-2 rounded-full shrink-0 ${panes.length > 0 ? "bg-emerald-500" : "bg-gray-300"}`} />
                }
                <p className={`text-xs ${paneStatus.color}`}>{paneStatus.text}</p>
            </div>

            {/* ── Print button ───────────────────────────────────────────── */}
            <button
                onClick={handlePrint}
                disabled={!readyToPrint}
                className="w-full rounded-xl border-2 border-purple-800 bg-purple-700 text-white font-bold px-6 py-3 text-base min-h-[52px] flex items-center justify-center gap-2 active:bg-purple-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-purple-700/20"
            >
                <Printer className="h-5 w-5" />
                {panes.length > 0
                    ? `พิมพ์สติ๊กเกอร์ ${panes.length} ชิ้น`
                    : label}
                {panes.length > 0 && <ChevronRight className="h-4 w-4" />}
            </button>

            {/* ── Template picker modal ──────────────────────────────────── */}
            {showPicker && (
                <div
                    className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
                    onClick={() => setShowPicker(false)}
                >
                    <div
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-slate-800 shrink-0">
                            <Sticker className="h-5 w-5 text-purple-700 dark:text-purple-400 shrink-0" />
                            <p className="font-bold text-gray-900 dark:text-slate-100 flex-1 text-base">ตั้งค่าแม่แบบสติ๊กเกอร์</p>
                            <button onClick={() => setShowPicker(false)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 active:bg-gray-200 dark:active:bg-slate-700">
                                <X className="h-5 w-5 text-gray-600 dark:text-slate-400" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {/* Auto Option Banner & Mapping Customizer */}
                            <div className={`p-4 rounded-xl border-2 transition-all ${
                                isAutoMode
                                    ? "border-purple-600 dark:border-purple-500 bg-purple-50/70 dark:bg-purple-950/40 ring-2 ring-purple-300 dark:ring-purple-900/50"
                                    : "border-purple-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50"
                            }`}>
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="h-8 w-8 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0">
                                            <Sparkles className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-bold text-purple-950 dark:text-purple-100">
                                                    โหมดอัตโนมัติตามกลุ่มงาน (เทมเพลต 1 & 2)
                                                </p>
                                                <span className="text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full font-bold">
                                                    แนะนำ
                                                </span>
                                            </div>
                                            <p className="text-xs text-purple-700/80 dark:text-purple-300/80">
                                                ระบบจะสลับแม่แบบให้ตามประเภทงานของแต่ละแผ่นกระจกในออเดอร์โดยอัตโนมัติ
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleSelectAuto}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                                            isAutoMode
                                                ? "bg-emerald-600 text-white shadow-xs"
                                                : "bg-purple-600 text-white hover:bg-purple-700 active:bg-purple-800"
                                        }`}
                                    >
                                        {isAutoMode ? "✓ ใช้งานโหมดนี้อยู่" : "เลือกใช้โหมดอัตโนมัติ"}
                                    </button>
                                </div>

                                {/* Direct Mapping Selectors */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-purple-200/60 dark:border-purple-800/60">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                            <span>เทมเพลต 1</span>
                                            <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">(1. ลามิเนต/อินซูเลท)</span>
                                        </label>
                                        <select
                                            value={laminateTemplate?._id || ""}
                                            onChange={(e) => handleUpdateMappingField("laminateTemplateId", e.target.value)}
                                            className="w-full text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        >
                                            {allTemplates
                                                .filter(t => t._id !== (standardTemplate?._id || mapping.standardTemplateId))
                                                .map(t => (
                                                    <option key={t._id} value={t._id}>
                                                        {t.name} ({t.width}×{t.height}mm)
                                                    </option>
                                                ))}
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                            <span>เทมเพลต 2</span>
                                            <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">(2. เทมเปอร์/ตัดธรรมดา)</span>
                                        </label>
                                        <select
                                            value={standardTemplate?._id || ""}
                                            onChange={(e) => handleUpdateMappingField("standardTemplateId", e.target.value)}
                                            className="w-full text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        >
                                            {allTemplates
                                                .filter(t => t._id !== (laminateTemplate?._id || mapping.laminateTemplateId))
                                                .map(t => (
                                                    <option key={t._id} value={t._id}>
                                                        {t.name} ({t.width}×{t.height}mm)
                                                    </option>
                                                ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
                                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">หรือเลือกแม่แบบแบบเจาะจง (บังคับใช้แม่แบบเดียวสำหรับทุกแผ่น)</p>
                            </div>

                            {loadingAll ? (
                                <div className="flex flex-col items-center justify-center gap-3 py-12">
                                    <Loader2 className="h-7 w-7 animate-spin text-purple-600" />
                                    <p className="text-sm text-gray-500">กำลังโหลด template...</p>
                                </div>
                            ) : allTemplates.length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                                    <Sticker className="h-10 w-10 text-gray-300" />
                                    <p className="text-sm font-semibold text-gray-500">ยังไม่มี template</p>
                                    <p className="text-xs text-gray-400">ไปสร้างที่ <span className="font-medium">ตั้งค่า → ออกแบบสติ๊กเกอร์</span></p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {allTemplates.map((t) => (
                                        <button
                                            key={t._id}
                                            onClick={() => handleSelectManual(t)}
                                            className={`flex flex-col items-center gap-2.5 p-3 rounded-xl border-2 transition-all group text-left
                                                ${!isAutoMode && saved?.id === t._id
                                                    ? "border-purple-600 dark:border-purple-500 bg-purple-50 dark:bg-purple-900/30 ring-2 ring-purple-300 dark:ring-purple-900/50"
                                                    : "border-gray-200 dark:border-slate-800 hover:border-purple-500 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                                                }`}
                                        >
                                            <div className="w-full bg-gray-50 dark:bg-slate-800/50 rounded-lg overflow-hidden border border-gray-100 dark:border-slate-700 flex items-center justify-center" style={{ minHeight: 90 }}>
                                                <StickerThumbnail
                                                    widthMm={t.width}
                                                    heightMm={t.height}
                                                    elements={t.elements as StickerElement[]}
                                                    maxW={180}
                                                    maxH={110}
                                                />
                                            </div>
                                            <div className="w-full text-center">
                                                <p className={`text-sm font-semibold leading-tight ${!isAutoMode && saved?.id === t._id ? "text-purple-700 dark:text-purple-300" : "text-gray-900 dark:text-slate-200 group-hover:text-purple-700 dark:group-hover:text-purple-300"}`}>
                                                    {t.name}
                                                    {!isAutoMode && saved?.id === t._id && <span className="ml-1 text-[10px] bg-purple-600 text-white px-1.5 py-0.5 rounded">ใช้อยู่</span>}
                                                </p>
                                                <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{t.width} × {t.height} mm</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-800 shrink-0 flex items-center justify-between">
                            <p className="text-xs text-gray-400 dark:text-slate-500">การเลือกจะถูกจำไว้สำหรับครั้งถัดไป</p>
                            <button
                                onClick={() => setShowPicker(false)}
                                className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors"
                            >
                                ปิด
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

StickerPrintBlock.craft = {
    displayName: "Sticker Print",
    props: { label: "พิมพ์สติ๊กเกอร์" } as StickerPrintBlockProps,
};

