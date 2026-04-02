"use client";

import { useNode } from "@craftjs/core";
import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Printer, Loader2, X, Sticker, RefreshCw, ChevronRight } from "lucide-react";
import { usePreview } from "../PreviewContext";
import { useStationContext } from "../StationContext";
import { QRCodeSVG } from "qrcode.react";
import { getStickerTemplates, getStickerTemplate, StickerTemplateRecord } from "@/lib/api/sticker-templates";
import { panesApi } from "@/lib/api/panes";
import { Pane, PaginatedResponse } from "@/lib/api/types";
import StickerThumbnail from "@/app/settings/sticker/StickerThumbnail";
import type { StickerElement } from "@/app/settings/sticker/types";

const MM_TO_PX = 3.7795275591;
const LS_KEY   = "std_sticker_template";

// ── Variable substitution ─────────────────────────────────────────────────────
function sub(text: string, pane: Pane, order: Record<string, unknown> | null): string {
    const customer   = order?.customer   as Record<string, unknown> | undefined;
    const material   = order?.material   as Record<string, unknown> | undefined;
    const assignedTo = order?.assignedTo as Record<string, unknown> | undefined;
    const now        = new Date();
    const qrCode = pane.qrCode || `STDPLUS:${pane.paneNumber}`;
    const vars: Record<string, string> = {
        // ── กระจก ─────────────────────────────────────────────────────────
        "{{paneNumber}}":   pane.paneNumber ?? "",
        "{{paneId}}":       pane._id ?? "",
        "{{glassType}}":    pane.glassTypeLabel ?? "",
        "{{dimensions}}":   pane.dimensions
            ? `${pane.dimensions.width}×${pane.dimensions.height}${pane.dimensions.thickness > 0 ? `×${pane.dimensions.thickness}` : ""}mm`
            : "",
        "{{width}}":        pane.dimensions ? String(pane.dimensions.width) : "",
        "{{height}}":       pane.dimensions ? String(pane.dimensions.height) : "",
        "{{thickness}}":    pane.dimensions ? String(pane.dimensions.thickness) : "",
        "{{qrCode}}":       qrCode,
        // ── ออเดอร์ ───────────────────────────────────────────────────────
        "{{orderCode}}":    (order?.orderNumber ?? order?.code ?? order?.requestNumber ?? order?.number ?? "") as string,
        "{{customerName}}": (customer?.name ?? "") as string,
        "{{materialName}}": (material?.name ?? pane.glassTypeLabel ?? "") as string,
        "{{quantity}}":     String(order?.quantity ?? ""),
        "{{status}}":       (order?.status ?? "") as string,
        "{{assignedTo}}":   (assignedTo?.name ?? assignedTo?.username ?? "") as string,
        // ── วันที่ / เวลา ─────────────────────────────────────────────────
        "{{date}}":         now.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }),
        "{{time}}":         now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
    };
    let result = text;
    for (const [k, v] of Object.entries(vars)) result = result.replaceAll(k, v);
    return result;
}

// ── Full-size sticker renderer (used for printing, not scaled) ─────────────────
function StickerPrintRenderer({
    template, pane, order,
}: { template: StickerTemplateRecord; pane: Pane; order: Record<string, unknown> | null }) {
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
                const content = sub(el.text, pane, order);
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
                const qrVal  = sub(el.value || "{{qrCode}}", pane, order);
                const sizeMm = Math.min(el.width, el.height) * sc;
                return <div key={key} style={{ ...base, width: `${el.width * sc}mm`, height: `${el.height * sc}mm` }}><QRCodeSVG value={qrVal} size={sizeMm * MM_TO_PX * 2} style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm` }} bgColor="#ffffff" fgColor="#000000" level="M" /></div>;
            }
            case "rect":
                return <div key={key} style={{ ...base, width: `${el.width * sc}mm`, height: `${el.height * sc}mm`, backgroundColor: el.fill === "transparent" ? "transparent" : el.fill, border: el.strokeWidth > 0 ? `${el.strokeWidth * sc}mm solid ${el.stroke}` : "none", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>{el.label && <span style={{ fontSize: `${(el.labelFontSize ?? 12) * sc}mm`, color: el.labelColor ?? "#000", fontFamily: "Prompt, sans-serif" }}>{sub(el.label, pane, order)}</span>}</div>;
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

    // ── Persisted template selection ──────────────────────────────────────────
    const [saved,      setSaved]      = useState<SavedTemplate | null>(null);
    const [template,   setTemplate]   = useState<StickerTemplateRecord | null>(null);
    const [loadingTpl, setLoadingTpl] = useState(false);

    // ── Pane list ─────────────────────────────────────────────────────────────
    const [panes,        setPanes]        = useState<Pane[]>([]);
    const [loadingPanes, setLoadingPanes] = useState(false);

    // ── Template picker modal ─────────────────────────────────────────────────
    const [showPicker,   setShowPicker]   = useState(false);
    const [allTemplates, setAllTemplates] = useState<StickerTemplateRecord[]>([]);
    const [loadingAll,   setLoadingAll]   = useState(false);

    // Load saved template from localStorage on mount
    useEffect(() => {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) setSaved(JSON.parse(raw) as SavedTemplate);
        } catch { /* ignore */ }
    }, []);

    // Fetch full template (elements) when saved ID changes
    useEffect(() => {
        if (!saved?.id || !isPreview) return;
        setLoadingTpl(true);
        getStickerTemplate(saved.id)
            .then(setTemplate)
            .catch(() => setTemplate(null))
            .finally(() => setLoadingTpl(false));
    }, [saved?.id, isPreview]);

    // Fetch panes when order changes.
    // selectedRecord is whatever the user last clicked in RecordList (order OR request).
    // orderData / requestData are pre-loaded from URL params.
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

        // Try every plausible combination in parallel — take first non-empty result.
        // Needed because selectedRecord might be an order OR a request depending on
        // which RecordList the user clicked, and requestData may be pre-loaded from URL.
        const queries: Promise<PaginatedResponse<Pane>>[] = [
            panesApi.getAll({ order:   contextId, status_ne: "claimed", limit: 200 }),   // contextId is an order ID
            panesApi.getAll({ request: contextId, limit: 200 }),   // contextId is a request ID
        ];
        if (orderRequestId) queries.push(panesApi.getAll({ request: orderRequestId, limit: 200 }));
        if (fallbackRequestId && fallbackRequestId !== contextId)
            queries.push(panesApi.getAll({ request: fallbackRequestId, limit: 200 }));

        Promise.all(queries)
            .then((results) => {
                const winner = results.find(r => r.success && r.data.length > 0);
                setPanes(winner?.data ?? []);
            })
            .catch(() => setPanes([]))
            .finally(() => setLoadingPanes(false));
    }, [contextId, orderRequestId, fallbackRequestId, isPreview]);

    const openPicker = async () => {
        setShowPicker(true);
        if (allTemplates.length > 0) return;
        setLoadingAll(true);
        getStickerTemplates(1, 50)
            .then(setAllTemplates)
            .finally(() => setLoadingAll(false));
    };

    const handleSelect = useCallback((t: StickerTemplateRecord) => {
        const s: SavedTemplate = { id: t._id, name: t.name, widthMm: t.width, heightMm: t.height };
        setSaved(s);
        setTemplate(t);  // use immediately — no need to re-fetch
        localStorage.setItem(LS_KEY, JSON.stringify(s));
        setShowPicker(false);
    }, []);

    const handlePrint = () => {
        if (!template || panes.length === 0) return;
        window.print();
    };

    const orderLabel = (contextRecord?.orderNumber ?? contextRecord?.code ?? (contextRecord as Record<string, unknown>)?.requestNumber ?? "") as string;

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
                    <Sticker className="inline h-3 w-3 mr-0.5" />
                    เลือก template → แสดงตัวอย่าง → พิมพ์
                </p>
            </div>
        );
    }

    // ── Preview mode ──────────────────────────────────────────────────────────
    const readyToPrint = !!template && panes.length > 0;

    // Pane status line
    const paneStatus = !orderId
        ? { text: "เลือกออเดอร์จากรายการข้อมูลก่อน", color: "text-gray-400" }
        : loadingPanes || loadingTpl
        ? { text: "กำลังโหลดข้อมูล…", color: "text-gray-400" }
        : panes.length === 0
        ? { text: "ไม่พบกระจกในออเดอร์นี้", color: "text-red-400" }
        : { text: `พร้อมพิมพ์ ${panes.length} ชิ้น${orderLabel ? ` · ${orderLabel}` : ""}`, color: "text-emerald-600" };

    return (
        <div className="w-full space-y-3">

            {/* ── Print portal: stickers rendered as direct child of <body> ── */}
            {mounted && readyToPrint && createPortal(
                <>
                    <style>{`
                        @media screen { #stk-print-portal { display: none; } }
                        @media print {
                            @page { size: ${template!.width}mm ${template!.height}mm; margin: 0; }
                            body > * { display: none !important; }
                            body > #stk-print-portal { display: block !important; }
                            #stk-print-portal .stk-page { break-after: page; page-break-after: always; }
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
                        {panes.map((pane) => (
                            <div key={pane._id} className="stk-page">
                                <StickerPrintRenderer
                                    template={template!}
                                    pane={pane}
                                    order={contextRecord as Record<string, unknown> | null}
                                />
                            </div>
                        ))}
                    </div>
                </>,
                document.body
            )}

            {/* ── Template selector bar ─────────────────────────────────── */}
            {saved ? (
                <div className="flex items-center gap-2 rounded-xl border-2 border-purple-700 bg-purple-50 px-3 py-2.5">
                    <Sticker className="h-4 w-4 text-purple-700 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-purple-900 truncate">{saved.name}</p>
                        <p className="text-[11px] text-purple-500">{saved.widthMm} × {saved.heightMm} mm</p>
                    </div>
                    <button
                        onClick={openPicker}
                        className="flex items-center gap-1 text-[11px] font-semibold text-purple-700 border border-purple-300 rounded-lg px-2 py-1 hover:bg-purple-100 active:bg-purple-200 shrink-0"
                    >
                        <RefreshCw className="h-3 w-3" />
                        เปลี่ยน
                    </button>
                </div>
            ) : (
                <button
                    onClick={openPicker}
                    className="w-full rounded-xl border-2 border-dashed border-purple-400 bg-purple-50 px-4 py-3 text-sm font-semibold text-purple-700 flex items-center justify-center gap-2 active:bg-purple-100"
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
                <p className={`text-xs font-medium ${paneStatus.color}`}>{paneStatus.text}</p>
            </div>

            {/* ── Print button ───────────────────────────────────────────── */}
            <button
                onClick={handlePrint}
                disabled={!readyToPrint}
                className="w-full rounded-xl border-2 border-purple-800 bg-purple-700 text-white font-bold px-6 py-3 text-base min-h-[52px] flex items-center justify-center gap-2 active:bg-purple-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
                <Printer className="h-5 w-5" />
                {panes.length > 0
                    ? `พิมพ์สติ๊กเกอร์ ${panes.length} ชิ้น`
                    : label}
                {panes.length > 0 && <ChevronRight className="h-4 w-4" />}
            </button>

            {/* ── Template picker modal ──────────────────────────────────── */}
            {showPicker && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
                        <div className="flex items-center gap-3 px-5 py-4 border-b-2 border-gray-100 shrink-0">
                            <Sticker className="h-5 w-5 text-purple-700 shrink-0" />
                            <p className="font-bold text-gray-900 flex-1 text-base">เลือก template สติ๊กเกอร์</p>
                            <button onClick={() => setShowPicker(false)} className="p-2 rounded-xl hover:bg-gray-100 active:bg-gray-200">
                                <X className="h-5 w-5 text-gray-600" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4">
                            {loadingAll ? (
                                <div className="flex flex-col items-center justify-center gap-3 py-16">
                                    <Loader2 className="h-7 w-7 animate-spin text-purple-600" />
                                    <p className="text-sm text-gray-500">กำลังโหลด template...</p>
                                </div>
                            ) : allTemplates.length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                                    <Sticker className="h-10 w-10 text-gray-300" />
                                    <p className="text-sm font-semibold text-gray-500">ยังไม่มี template</p>
                                    <p className="text-xs text-gray-400">ไปสร้างที่ <span className="font-medium">ตั้งค่า → ออกแบบสติ๊กเกอร์</span></p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {allTemplates.map((t) => (
                                        <button
                                            key={t._id}
                                            onClick={() => handleSelect(t)}
                                            className={`flex flex-col items-center gap-2.5 p-3 rounded-xl border-2 transition-all group text-left
                                                ${saved?.id === t._id
                                                    ? "border-purple-600 bg-purple-50 ring-2 ring-purple-300"
                                                    : "border-gray-200 hover:border-purple-500 hover:bg-purple-50"
                                                }`}
                                        >
                                            <div className="w-full bg-gray-50 rounded-lg overflow-hidden border border-gray-100 flex items-center justify-center" style={{ minHeight: 90 }}>
                                                <StickerThumbnail
                                                    widthMm={t.width}
                                                    heightMm={t.height}
                                                    elements={t.elements as StickerElement[]}
                                                    maxW={180}
                                                    maxH={110}
                                                />
                                            </div>
                                            <div className="w-full text-center">
                                                <p className={`text-sm font-semibold leading-tight ${saved?.id === t._id ? "text-purple-700" : "text-gray-900 group-hover:text-purple-700"}`}>
                                                    {t.name}
                                                    {saved?.id === t._id && <span className="ml-1 text-[10px] bg-purple-600 text-white px-1.5 py-0.5 rounded">ใช้อยู่</span>}
                                                </p>
                                                <p className="text-[11px] text-gray-400 mt-0.5">{t.width} × {t.height} mm</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="px-5 py-3 border-t border-gray-100 shrink-0">
                            <p className="text-xs text-gray-400 text-center">การเลือกจะถูกจำไว้สำหรับครั้งถัดไป</p>
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
