"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Layers, Plus, Copy, Trash2, SlidersHorizontal, Scale, Ruler, Grid, ChevronDown } from "lucide-react";
import type { PaneSpec } from "@/app/request/create/page";
import type { PricingSettings } from "@/lib/pricing-settings";
import { useUnit } from "@/lib/unit/unit-context";
import { UnitToggle } from "@/components/ui/unit-toggle";
import {
    calcGlassWeight,
    calcGlassPerimeterMeters,
    calcGlassAreaSqFt,
    formatCompositeFormula,
} from "@/lib/utils/glass-calc";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

interface GlassSpecsTableProps {
    panes: PaneSpec[];
    activeTab: number;
    setActiveTab: (idx: number) => void;
    pricingSettings: PricingSettings;
    addPane: () => void;
    removePane: (idx: number) => void;
    duplicatePane: (idx: number) => void;
    updatePaneAt: (idx: number, updates: Partial<PaneSpec>) => void;
    handleGlassTypeChange: (idx: number, type: string) => void;
    lang: string;
    glassTypes: string[];
    thicknesses: string[];
    rawGlassTypeOptions: string[];
    rawGlassColorOptions?: string[];
    calcPanePrice: (p: PaneSpec, ps: PricingSettings) => any;
}

export function GlassSpecsTable({
    panes,
    activeTab,
    setActiveTab,
    pricingSettings,
    addPane,
    removePane,
    duplicatePane,
    updatePaneAt,
    handleGlassTypeChange,
    lang,
    glassTypes,
    thicknesses,
    rawGlassTypeOptions,
    rawGlassColorOptions,
    calcPanePrice,
}: GlassSpecsTableProps) {
    const { unit, toMm, formatCurrentUnit } = useUnit();

    // Dialog state for configuring composite layers (ลามิเนต / อินซูเลท)
    const [layerModalPaneIdx, setLayerModalPaneIdx] = useState<number | null>(null);

    const rawColorList = React.useMemo(() => {
        const defaultMap: Record<string, string> = {
            "ใส": "ใส (Clear)",
            "เขียว": "เขียว (Green)",
            "ชา": "ชา (Tea)",
            "เทา": "เทา (Grey)",
            "บรอนซ์": "บรอนซ์ (Bronze)",
            "ดำ": "ดำ (Black)",
            "ดำด้าน": "ดำด้าน (Matte Black)",
            "น้ำเงิน": "น้ำเงิน (Blue)",
            "ฟ้า": "ฟ้า (Sky Blue)",
            "ทอง": "ทอง (Gold)",
            "เงิน": "เงิน (Silver)",
            "น้ำตาล": "น้ำตาล (Brown)",
            "ขาว": "ขาว (White)",
            "ม่วง": "ม่วง (Purple)",
            "ชมพู": "ชมพู (Pink)",
        };
        const defaultColors = ["ใส", "เขียว", "ชา", "เทา", "บรอนซ์"];
        const set = new Set<string>();
        const list: { value: string; label: string }[] = [];
        if (rawGlassColorOptions) {
            for (const c of rawGlassColorOptions) {
                if (!set.has(c)) {
                    set.add(c);
                    list.push({ value: c, label: defaultMap[c] || c });
                }
            }
        }
        for (const c of defaultColors) {
            if (!set.has(c)) {
                set.add(c);
                list.push({ value: c, label: defaultMap[c] || c });
            }
        }
        return list;
    }, [rawGlassColorOptions]);

    // Calculate total sheets summary (ข้อ 2: "2 รายการ จำนวนทั้งหมด 5 แผ่น")
    const totalQuantity = React.useMemo(() => {
        return panes.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
    }, [panes]);

    // Live Grand Totals (ข้อ 13: รวมน้ำหนักทั้งหมดของบิล, เมตรรวม, ตารางฟุตรวม ที่มาร์กแดง)
    const grandTotals = React.useMemo(() => {
        let totalWeight = 0;
        let totalPerimeter = 0;
        let totalArea = 0;

        for (const p of panes) {
            const isLam = p.productType === "laminated";
            const w = calcGlassWeight(p.glassWidth, p.glassHeight, p.thickness, p.quantity, isLam);
            const m = calcGlassPerimeterMeters(p.glassWidth, p.glassHeight, p.quantity);
            const sqft = calcGlassAreaSqFt(p.glassWidth, p.glassHeight, p.quantity);
            totalWeight += w;
            totalPerimeter += m;
            totalArea += sqft;
        }

        return {
            weight: Number(totalWeight.toFixed(2)),
            perimeter: Number(totalPerimeter.toFixed(2)),
            area: Number(totalArea.toFixed(2)),
        };
    }, [panes]);

    const hasAnyComposite = React.useMemo(
        () => panes.some(p => p.productType === "laminated" || p.productType === "insulated"),
        [panes]
    );

    // ── Resizable Table Columns (Excel-like) ─────────────────────────────────
    const DEFAULT_COL_WIDTHS: Record<string, number> = React.useMemo(() => ({
        index: 44,
        width: 90,
        height: 90,
        depth3: 130,
        pattern: 105,
        qty: 75,
        jobType: 120,
        thickness: 95,
        rawColor: 155,
        holes: 85,
        notches: 85,
        productType: 130,
        composite: 185,
        corner: 95,
        edgeTop: 125,
        edgeBottom: 125,
        edgeLeft: 125,
        edgeRight: 125,
        customerRemarks: 150,
        internalRemarks: 150,
        actions: 65,
    }), []);

    const [colWidths, setColWidths] = React.useState<Record<string, number>>(() => {
        try {
            const saved = localStorage.getItem("stp_table_col_widths_v2");
            if (saved) {
                return { ...DEFAULT_COL_WIDTHS, ...JSON.parse(saved) };
            }
        } catch { /* ignore */ }
        return DEFAULT_COL_WIDTHS;
    });

    const resizingRef = React.useRef<{
        colKey: string;
        startX: number;
        startWidth: number;
    } | null>(null);

    const handleResizeMouseDown = React.useCallback((colKey: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = colWidths[colKey] || DEFAULT_COL_WIDTHS[colKey] || 100;
        resizingRef.current = { colKey, startX, startWidth };

        const handleMouseMove = (ev: MouseEvent) => {
            if (!resizingRef.current) return;
            const delta = ev.clientX - resizingRef.current.startX;
            const newWidth = Math.max(45, resizingRef.current.startWidth + delta);
            setColWidths((prev) => {
                const next = { ...prev, [resizingRef.current!.colKey]: newWidth };
                try {
                    localStorage.setItem("stp_table_col_widths_v2", JSON.stringify(next));
                } catch { /* ignore */ }
                return next;
            });
        };

        const handleMouseUp = () => {
            resizingRef.current = null;
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };

        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
    }, [colWidths, DEFAULT_COL_WIDTHS]);

    const handleDoubleClickResize = React.useCallback((colKey: string) => {
        setColWidths((prev) => {
            const next = { ...prev, [colKey]: DEFAULT_COL_WIDTHS[colKey] };
            try {
                localStorage.setItem("stp_table_col_widths_v2", JSON.stringify(next));
            } catch { /* ignore */ }
            return next;
        });
    }, [DEFAULT_COL_WIDTHS]);

    const totalTableWidth = React.useMemo(() => {
        return Object.entries(colWidths).reduce(
            (sum, [k, w]) => sum + (k === 'composite' && !hasAnyComposite ? 0 : (w || DEFAULT_COL_WIDTHS[k] || 100)),
            0
        );
    }, [colWidths, hasAnyComposite, DEFAULT_COL_WIDTHS]);

    const activeModalPane = layerModalPaneIdx !== null ? panes[layerModalPaneIdx] : null;

    return (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-[350px] shrink-0 w-full z-10">
            {/* Table Header Bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur shrink-0 select-none">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-[#E8601C]" />
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            {lang === 'th'
                                ? `รายการแผ่นกระจก (${panes.length} รายการ, จำนวนทั้งหมด ${totalQuantity} แผ่น)`
                                : `Glass Specs (${panes.length} Items, Total ${totalQuantity} Sheets)`}
                        </span>
                    </div>

                    {/* ข้อ 13: มาร์คแดง - แสดงผลรวมน้ำหนัก, เมตรรวม, ตารางฟุตรวมของบิล */}
                    <div className="flex items-center gap-2 pl-3 border-l border-slate-200 dark:border-slate-700">
                        {/* รวมน้ำหนักทั้งหมด */}
                        <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-md border border-red-200/60 dark:border-red-800/40 font-medium">
                            <Scale className="h-3.5 w-3.5 text-red-500" />
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">{lang === 'th' ? 'น้ำหนัก:' : 'Weight:'}</span>
                            <span className="text-xs font-bold">{grandTotals.weight}</span>
                            <span className="text-[10px] text-slate-400">กก.</span>
                        </div>

                        {/* เมตรรวมทั้งหมด */}
                        <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-md border border-orange-200/60 dark:border-orange-800/40 font-medium">
                            <Ruler className="h-3.5 w-3.5 text-orange-500" />
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">{lang === 'th' ? 'เมตรรวม:' : 'Perimeter:'}</span>
                            <span className="text-xs font-bold">{grandTotals.perimeter}</span>
                            <span className="text-[10px] text-slate-400">ม.</span>
                        </div>

                        {/* ตารางฟุตรวมทั้งหมด */}
                        <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-800/40 font-medium">
                            <Grid className="h-3.5 w-3.5 text-amber-500" />
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">{lang === 'th' ? 'ตารางฟุต:' : 'Area:'}</span>
                            <span className="text-xs font-bold">{grandTotals.area}</span>
                            <span className="text-[10px] text-slate-400">ตร.ฟุต</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-slate-500">{lang === 'th' ? 'หน่วยวัด:' : 'Unit:'}</span>
                        <UnitToggle />
                    </div>
                    <Button
                        type="button"
                        onClick={addPane}
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 rounded-lg text-[11px] font-bold text-[#E8601C] border-[#E8601C]/20 hover:bg-[#E8601C]/5 gap-1"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        {lang === 'th' ? 'เพิ่มแผ่นกระจก' : 'Add Pane'}
                    </Button>
                </div>
            </div>

            {/* Spreadsheet Grid */}
            <div className="flex-1 overflow-auto">
                <table
                    className="text-[12px] border-separate border-spacing-0 text-left table-fixed"
                    style={{ width: `${totalTableWidth}px` }}
                >
                    <colgroup>
                        <col style={{ width: `${colWidths.index || DEFAULT_COL_WIDTHS.index}px` }} />
                        <col style={{ width: `${colWidths.width || DEFAULT_COL_WIDTHS.width}px` }} />
                        <col style={{ width: `${colWidths.height || DEFAULT_COL_WIDTHS.height}px` }} />
                        <col style={{ width: `${colWidths.depth3 || DEFAULT_COL_WIDTHS.depth3}px` }} />
                        <col style={{ width: `${colWidths.pattern || DEFAULT_COL_WIDTHS.pattern}px` }} />
                        <col style={{ width: `${colWidths.qty || DEFAULT_COL_WIDTHS.qty}px` }} />
                        <col style={{ width: `${colWidths.jobType || DEFAULT_COL_WIDTHS.jobType}px` }} />
                        <col style={{ width: `${colWidths.thickness || DEFAULT_COL_WIDTHS.thickness}px` }} />
                        <col style={{ width: `${colWidths.rawColor || DEFAULT_COL_WIDTHS.rawColor}px` }} />
                        <col style={{ width: `${colWidths.holes || DEFAULT_COL_WIDTHS.holes}px` }} />
                        <col style={{ width: `${colWidths.notches || DEFAULT_COL_WIDTHS.notches}px` }} />
                        <col style={{ width: `${colWidths.productType || DEFAULT_COL_WIDTHS.productType}px` }} />
                        {hasAnyComposite && <col style={{ width: `${colWidths.composite || DEFAULT_COL_WIDTHS.composite}px` }} />}
                        <col style={{ width: `${colWidths.corner || DEFAULT_COL_WIDTHS.corner}px` }} />
                        <col style={{ width: `${colWidths.edgeTop || DEFAULT_COL_WIDTHS.edgeTop}px` }} />
                        <col style={{ width: `${colWidths.edgeBottom || DEFAULT_COL_WIDTHS.edgeBottom}px` }} />
                        <col style={{ width: `${colWidths.edgeLeft || DEFAULT_COL_WIDTHS.edgeLeft}px` }} />
                        <col style={{ width: `${colWidths.edgeRight || DEFAULT_COL_WIDTHS.edgeRight}px` }} />
                        <col style={{ width: `${colWidths.customerRemarks || DEFAULT_COL_WIDTHS.customerRemarks}px` }} />
                        <col style={{ width: `${colWidths.internalRemarks || DEFAULT_COL_WIDTHS.internalRemarks}px` }} />
                        <col style={{ width: `${colWidths.actions || DEFAULT_COL_WIDTHS.actions}px` }} />
                    </colgroup>
                    <thead>
                        <tr className="bg-slate-50/95 dark:bg-slate-900/95 text-slate-500 font-bold sticky top-0 z-10 select-none whitespace-nowrap">
                            <th
                                style={{ width: `${colWidths.index || DEFAULT_COL_WIDTHS.index}px`, minWidth: `${colWidths.index || DEFAULT_COL_WIDTHS.index}px`, maxWidth: `${colWidths.index || DEFAULT_COL_WIDTHS.index}px` }}
                                className="relative py-2 px-2 text-center border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 whitespace-nowrap overflow-hidden box-border"
                            >
                                <span>#</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("index", e)}
                                    onDoubleClick={() => handleDoubleClickResize("index")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>
                            <th
                                style={{ width: `${colWidths.width || DEFAULT_COL_WIDTHS.width}px`, minWidth: `${colWidths.width || DEFAULT_COL_WIDTHS.width}px`, maxWidth: `${colWidths.width || DEFAULT_COL_WIDTHS.width}px` }}
                                className="relative py-2 px-2.5 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? `กว้าง (${unit})` : `Width (${unit})`}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("width", e)}
                                    onDoubleClick={() => handleDoubleClickResize("width")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>
                            <th
                                style={{ width: `${colWidths.height || DEFAULT_COL_WIDTHS.height}px`, minWidth: `${colWidths.height || DEFAULT_COL_WIDTHS.height}px`, maxWidth: `${colWidths.height || DEFAULT_COL_WIDTHS.height}px` }}
                                className="relative py-2 px-2.5 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? `สูง (${unit})` : `Height (${unit})`}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("height", e)}
                                    onDoubleClick={() => handleDoubleClickResize("height")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>
                            
                            {/* Requirement 9: คอลัมน์ ตัวคูณพิเศษ (มิติเพิ่มเติม เช่น สูงขวา / ด้านเฉียง) */}
                            <th
                                style={{ width: `${colWidths.depth3 || DEFAULT_COL_WIDTHS.depth3}px`, minWidth: `${colWidths.depth3 || DEFAULT_COL_WIDTHS.depth3}px`, maxWidth: `${colWidths.depth3 || DEFAULT_COL_WIDTHS.depth3}px` }}
                                className="relative py-2 px-2.5 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? `ตัวคูณพิเศษ (${unit})` : `Extra Dim (${unit})`}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("depth3", e)}
                                    onDoubleClick={() => handleDoubleClickResize("depth3")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>

                            {/* Requirement 9: คอลัมน์แยก ตัดตามแบบ (ใช่ / ไม่ใช่) */}
                            <th
                                style={{ width: `${colWidths.pattern || DEFAULT_COL_WIDTHS.pattern}px`, minWidth: `${colWidths.pattern || DEFAULT_COL_WIDTHS.pattern}px`, maxWidth: `${colWidths.pattern || DEFAULT_COL_WIDTHS.pattern}px` }}
                                className="relative py-2 px-2.5 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-center whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? 'ตัดตามแบบ' : 'Pattern Cut'}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("pattern", e)}
                                    onDoubleClick={() => handleDoubleClickResize("pattern")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>

                            <th
                                style={{ width: `${colWidths.qty || DEFAULT_COL_WIDTHS.qty}px`, minWidth: `${colWidths.qty || DEFAULT_COL_WIDTHS.qty}px`, maxWidth: `${colWidths.qty || DEFAULT_COL_WIDTHS.qty}px` }}
                                className="relative py-2 px-2.5 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? 'จำนวน' : 'Qty'}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("qty", e)}
                                    onDoubleClick={() => handleDoubleClickResize("qty")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>
                            <th
                                style={{ width: `${colWidths.jobType || DEFAULT_COL_WIDTHS.jobType}px`, minWidth: `${colWidths.jobType || DEFAULT_COL_WIDTHS.jobType}px`, maxWidth: `${colWidths.jobType || DEFAULT_COL_WIDTHS.jobType}px` }}
                                className="relative py-2 px-2.5 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? 'ลักษณะงาน' : 'Job Type'}<span className="text-red-500 ml-0.5 font-bold">*</span></span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("jobType", e)}
                                    onDoubleClick={() => handleDoubleClickResize("jobType")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>
                            <th
                                style={{ width: `${colWidths.thickness || DEFAULT_COL_WIDTHS.thickness}px`, minWidth: `${colWidths.thickness || DEFAULT_COL_WIDTHS.thickness}px`, maxWidth: `${colWidths.thickness || DEFAULT_COL_WIDTHS.thickness}px` }}
                                className="relative py-2 px-2.5 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? 'ความหนา' : 'Thickness'}<span className="text-red-500 ml-0.5 font-bold">*</span></span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("thickness", e)}
                                    onDoubleClick={() => handleDoubleClickResize("thickness")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>
                            <th
                                style={{ width: `${colWidths.rawColor || DEFAULT_COL_WIDTHS.rawColor}px`, minWidth: `${colWidths.rawColor || DEFAULT_COL_WIDTHS.rawColor}px`, maxWidth: `${colWidths.rawColor || DEFAULT_COL_WIDTHS.rawColor}px` }}
                                className="relative py-2 px-2.5 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? 'สีดิบ' : 'Raw Color'}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("rawColor", e)}
                                    onDoubleClick={() => handleDoubleClickResize("rawColor")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>
                            
                            {/* Requirement 10: จำนวนรู & จำนวนบาก */}
                            <th
                                style={{ width: `${colWidths.holes || DEFAULT_COL_WIDTHS.holes}px`, minWidth: `${colWidths.holes || DEFAULT_COL_WIDTHS.holes}px`, maxWidth: `${colWidths.holes || DEFAULT_COL_WIDTHS.holes}px` }}
                                className="relative py-2 px-2.5 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-center whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? 'จำนวนรู' : 'Holes'}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("holes", e)}
                                    onDoubleClick={() => handleDoubleClickResize("holes")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>
                            <th
                                style={{ width: `${colWidths.notches || DEFAULT_COL_WIDTHS.notches}px`, minWidth: `${colWidths.notches || DEFAULT_COL_WIDTHS.notches}px`, maxWidth: `${colWidths.notches || DEFAULT_COL_WIDTHS.notches}px` }}
                                className="relative py-2 px-2.5 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-center whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? 'จำนวนบาก' : 'Notches'}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("notches", e)}
                                    onDoubleClick={() => handleDoubleClickResize("notches")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>

                            {/* Requirement 14 & 15: ประเภทงาน & กระจกประกอบ (ลามิเนต/อินซูเลท) */}
                            <th
                                style={{ width: `${colWidths.productType || DEFAULT_COL_WIDTHS.productType}px`, minWidth: `${colWidths.productType || DEFAULT_COL_WIDTHS.productType}px`, maxWidth: `${colWidths.productType || DEFAULT_COL_WIDTHS.productType}px` }}
                                className="relative py-2 px-2.5 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? 'ประเภทงาน' : 'Work Type'}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("productType", e)}
                                    onDoubleClick={() => handleDoubleClickResize("productType")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>
                            
                            {/* ซ่อนไว้ แสดงเฉพาะตอนมีแถวที่เป็นลามิเนตหรืออินซูเลท */}
                            {hasAnyComposite && (
                                <th
                                    style={{ width: `${colWidths.composite || DEFAULT_COL_WIDTHS.composite}px`, minWidth: `${colWidths.composite || DEFAULT_COL_WIDTHS.composite}px`, maxWidth: `${colWidths.composite || DEFAULT_COL_WIDTHS.composite}px` }}
                                    className="relative py-2 px-2.5 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 whitespace-nowrap overflow-hidden box-border"
                                >
                                    <span className="truncate">{lang === 'th' ? 'ชนิดฟิล์ม/อากาศที่บรรจุ' : 'Film / Gas Filling'}</span>
                                    <div
                                        onMouseDown={(e) => handleResizeMouseDown("composite", e)}
                                        onDoubleClick={() => handleDoubleClickResize("composite")}
                                        title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                    >
                                        <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                    </div>
                                </th>
                            )}

                            {/* Corner Spec Column */}
                            <th
                                style={{ width: `${colWidths.corner || DEFAULT_COL_WIDTHS.corner}px`, minWidth: `${colWidths.corner || DEFAULT_COL_WIDTHS.corner}px`, maxWidth: `${colWidths.corner || DEFAULT_COL_WIDTHS.corner}px` }}
                                className="relative py-2 px-2.5 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? 'คิ้ว/มุม' : 'Corners'}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("corner", e)}
                                    onDoubleClick={() => handleDoubleClickResize("corner")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>

                            {/* Grinding Sides */}
                            <th
                                style={{ width: `${colWidths.edgeTop || DEFAULT_COL_WIDTHS.edgeTop}px`, minWidth: `${colWidths.edgeTop || DEFAULT_COL_WIDTHS.edgeTop}px`, maxWidth: `${colWidths.edgeTop || DEFAULT_COL_WIDTHS.edgeTop}px` }}
                                className="relative py-2 px-2 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-center whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? 'เจียรบน' : 'Top'}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("edgeTop", e)}
                                    onDoubleClick={() => handleDoubleClickResize("edgeTop")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>
                            <th
                                style={{ width: `${colWidths.edgeBottom || DEFAULT_COL_WIDTHS.edgeBottom}px`, minWidth: `${colWidths.edgeBottom || DEFAULT_COL_WIDTHS.edgeBottom}px`, maxWidth: `${colWidths.edgeBottom || DEFAULT_COL_WIDTHS.edgeBottom}px` }}
                                className="relative py-2 px-2 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-center whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? 'เจียรล่าง' : 'Bottom'}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("edgeBottom", e)}
                                    onDoubleClick={() => handleDoubleClickResize("edgeBottom")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>
                            <th
                                style={{ width: `${colWidths.edgeLeft || DEFAULT_COL_WIDTHS.edgeLeft}px`, minWidth: `${colWidths.edgeLeft || DEFAULT_COL_WIDTHS.edgeLeft}px`, maxWidth: `${colWidths.edgeLeft || DEFAULT_COL_WIDTHS.edgeLeft}px` }}
                                className="relative py-2 px-2 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-center whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? 'เจียรซ้าย' : 'Left'}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("edgeLeft", e)}
                                    onDoubleClick={() => handleDoubleClickResize("edgeLeft")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>
                            <th
                                style={{ width: `${colWidths.edgeRight || DEFAULT_COL_WIDTHS.edgeRight}px`, minWidth: `${colWidths.edgeRight || DEFAULT_COL_WIDTHS.edgeRight}px`, maxWidth: `${colWidths.edgeRight || DEFAULT_COL_WIDTHS.edgeRight}px` }}
                                className="relative py-2 px-2 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-center whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? 'เจียรขวา' : 'Right'}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("edgeRight", e)}
                                    onDoubleClick={() => handleDoubleClickResize("edgeRight")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>

                            {/* Requirement 11 & 12: หมายเหตุลูกค้า & หมายเหตุภายใน */}
                            <th
                                style={{ width: `${colWidths.customerRemarks || DEFAULT_COL_WIDTHS.customerRemarks}px`, minWidth: `${colWidths.customerRemarks || DEFAULT_COL_WIDTHS.customerRemarks}px`, maxWidth: `${colWidths.customerRemarks || DEFAULT_COL_WIDTHS.customerRemarks}px` }}
                                className="relative py-2 px-2.5 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? 'หมายเหตุลูกค้า' : 'Customer Note'}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("customerRemarks", e)}
                                    onDoubleClick={() => handleDoubleClickResize("customerRemarks")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>
                            <th
                                style={{ width: `${colWidths.internalRemarks || DEFAULT_COL_WIDTHS.internalRemarks}px`, minWidth: `${colWidths.internalRemarks || DEFAULT_COL_WIDTHS.internalRemarks}px`, maxWidth: `${colWidths.internalRemarks || DEFAULT_COL_WIDTHS.internalRemarks}px` }}
                                className="relative py-2 px-2.5 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 whitespace-nowrap overflow-hidden box-border"
                            >
                                <span className="truncate">{lang === 'th' ? 'หมายเหตุ' : 'Internal Note'}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("internalRemarks", e)}
                                    onDoubleClick={() => handleDoubleClickResize("internalRemarks")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>

                            <th
                                style={{ width: `${colWidths.actions || DEFAULT_COL_WIDTHS.actions}px`, minWidth: `${colWidths.actions || DEFAULT_COL_WIDTHS.actions}px`, maxWidth: `${colWidths.actions || DEFAULT_COL_WIDTHS.actions}px` }}
                                className="relative py-2 px-2 text-center border-b bg-slate-50 dark:bg-slate-900 whitespace-nowrap overflow-hidden box-border"
                            >
                                <span>{lang === 'th' ? 'จัดการ' : 'Actions'}</span>
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("actions", e)}
                                    onDoubleClick={() => handleDoubleClickResize("actions")}
                                    title="ลากเพื่อปรับขนาดความกว้าง (ดับเบิ้ลคลิกเพื่อคืนค่าเดิม)"
                                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-[#E8601C]/40 active:bg-[#E8601C] group z-20 flex items-center justify-center transition-colors"
                                >
                                    <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 group-hover:bg-[#E8601C] transition-colors" />
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {panes.map((pane, idx) => {
                            const isActive = idx === activeTab;
                            const isLam = pane.productType === "laminated";
                            
                            const cellInputClass = "w-full bg-transparent px-2 py-1 h-8 text-[12px] outline-none text-slate-800 dark:text-slate-100 font-semibold focus:bg-white dark:focus:bg-slate-800 focus:ring-1 focus:ring-[#E8601C] rounded transition-all";
                            const selectClass = "w-full bg-transparent px-1.5 py-1 h-8 text-[12px] outline-none text-slate-800 dark:text-slate-100 font-semibold cursor-pointer focus:bg-white dark:focus:bg-slate-800 focus:ring-1 focus:ring-[#E8601C] rounded transition-all";

                            const hasComposite = pane.productType === "laminated" || pane.productType === "insulated";
                            const formulaPreview = formatCompositeFormula(
                                pane.glassType,
                                pane.rawGlassColor,
                                pane.thickness,
                                pane.productType,
                                pane.compositeLayers
                            );

                            return (
                                <tr
                                    key={pane.id}
                                    onClick={() => {
                                        if (activeTab !== idx) setActiveTab(idx);
                                    }}
                                    className={`border-b border-slate-200 dark:border-slate-800 transition-colors ${
                                        isActive
                                            ? "bg-[#E8601C]/5 dark:bg-[#E8601C]/10"
                                            : "hover:bg-slate-50 dark:hover:bg-slate-800/30"
                                    }`}
                                >
                                    {/* Index Column */}
                                    <td className="relative text-center font-bold text-slate-400 bg-slate-50/50 dark:bg-slate-900/30 py-1.5 border-b border-r border-slate-200 dark:border-slate-800 select-none box-border">
                                        {isActive && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#E8601C]" />}
                                        {idx + 1}
                                    </td>

                                    {/* Width Column */}
                                    <td className="p-1 border-b border-r border-slate-200 dark:border-slate-800 box-border">
                                        <input
                                            id={`pane-w-${idx}`}
                                            type="number"
                                            step="any"
                                            min={unit === 'inch' ? 2 : 50}
                                            disabled={Boolean(pane.isCutByPattern)}
                                            value={pane.isCutByPattern ? "" : (pane.glassWidth === 0 ? "" : formatCurrentUnit(pane.glassWidth))}
                                            onChange={(e) => {
                                                if (e.target.value === "") {
                                                    updatePaneAt(idx, { glassWidth: 0 });
                                                    return;
                                                }
                                                const parsed = parseFloat(e.target.value);
                                                if (!isNaN(parsed)) {
                                                    const w = toMm(parsed);
                                                    updatePaneAt(idx, {
                                                        glassWidth: w,
                                                        vertices: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: pane.glassHeight }, { x: 0, y: pane.glassHeight }],
                                                    });
                                                }
                                            }}
                                            onFocus={() => {
                                                if (activeTab !== idx) setActiveTab(idx);
                                            }}
                                            placeholder={pane.isCutByPattern ? "—" : (lang === 'th' ? 'กว้าง' : 'W')}
                                            className={`${cellInputClass} ${
                                                pane.isCutByPattern
                                                    ? "opacity-40 cursor-not-allowed bg-slate-100/70 dark:bg-slate-800/50 text-center font-bold text-slate-400"
                                                    : ""
                                            }`}
                                        />
                                    </td>

                                    {/* Height Column */}
                                    <td className="p-1 border-b border-r border-slate-200 dark:border-slate-800 box-border">
                                        <input
                                            id={`pane-h-${idx}`}
                                            type="number"
                                            step="any"
                                            min={unit === 'inch' ? 2 : 50}
                                            disabled={Boolean(pane.isCutByPattern)}
                                            value={pane.isCutByPattern ? "" : (pane.glassHeight === 0 ? "" : formatCurrentUnit(pane.glassHeight))}
                                            onChange={(e) => {
                                                if (e.target.value === "") {
                                                    updatePaneAt(idx, { glassHeight: 0 });
                                                    return;
                                                }
                                                const parsed = parseFloat(e.target.value);
                                                if (!isNaN(parsed)) {
                                                    const h = toMm(parsed);
                                                    updatePaneAt(idx, {
                                                        glassHeight: h,
                                                        vertices: [{ x: 0, y: 0 }, { x: pane.glassWidth, y: 0 }, { x: pane.glassWidth, y: h }, { x: 0, y: h }],
                                                    });
                                                }
                                            }}
                                            onFocus={() => {
                                                if (activeTab !== idx) setActiveTab(idx);
                                            }}
                                            placeholder={pane.isCutByPattern ? "—" : (lang === 'th' ? 'สูง' : 'H')}
                                            className={`${cellInputClass} ${
                                                pane.isCutByPattern
                                                    ? "opacity-40 cursor-not-allowed bg-slate-100/70 dark:bg-slate-800/50 text-center font-bold text-slate-400"
                                                    : ""
                                            }`}
                                        />
                                    </td>

                                    {/* 3rd Dimension (ด้าน 3) Column */}
                                    <td className="p-1 border-b border-r border-slate-200 dark:border-slate-800 box-border">
                                        <input
                                            id={`pane-d3-${idx}`}
                                            type="number"
                                            step="any"
                                            min={unit === 'inch' ? 2 : 50}
                                            disabled={Boolean(pane.isCutByPattern)}
                                            value={pane.isCutByPattern ? "" : (pane.glassDepth3 === undefined || pane.glassDepth3 === 0 ? "" : formatCurrentUnit(pane.glassDepth3))}
                                            onChange={(e) => {
                                                if (e.target.value === "") {
                                                    updatePaneAt(idx, { glassDepth3: undefined });
                                                    return;
                                                }
                                                const parsed = parseFloat(e.target.value);
                                                if (!isNaN(parsed)) {
                                                    updatePaneAt(idx, { glassDepth3: toMm(parsed) });
                                                }
                                            }}
                                            onFocus={() => {
                                                if (activeTab !== idx) setActiveTab(idx);
                                            }}
                                            placeholder={pane.isCutByPattern ? "—" : (lang === 'th' ? '(ถ้ามี)' : 'Optional')}
                                            className={`${cellInputClass} ${
                                                pane.isCutByPattern
                                                    ? "opacity-40 cursor-not-allowed bg-slate-100/70 dark:bg-slate-800/50 text-center font-bold text-slate-400"
                                                    : pane.glassDepth3
                                                    ? "bg-blue-50/50 dark:bg-blue-950/30 font-bold text-blue-700 dark:text-blue-300"
                                                    : "text-slate-400 font-normal"
                                            }`}
                                            title={lang === 'th' ? 'ตัวคูณพิเศษ (ความยาวมิติเพิ่มเติม เช่น สูงขวา / ด้านเฉียง)' : 'Extra Multiplier Dimension'}
                                        />
                                    </td>

                                    {/* Requirement 9: คอลัมน์แยก ตัดตามแบบ (ใช่ / ไม่ใช่) */}
                                    <td className="p-1 border-b border-r border-slate-200 dark:border-slate-800 box-border">
                                        <select
                                            id={`pane-pattern-${idx}`}
                                            value={pane.isCutByPattern ? "yes" : "no"}
                                            onChange={(e) => {
                                                const isYes = e.target.value === "yes";
                                                updatePaneAt(idx, {
                                                    isCutByPattern: isYes,
                                                    customDimensionsText: isYes ? "**ตัดตามแบบ**" : "",
                                                });
                                            }}
                                            onFocus={() => {
                                                if (activeTab !== idx) setActiveTab(idx);
                                            }}
                                            className={`${selectClass} text-center font-bold ${
                                                pane.isCutByPattern
                                                    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700"
                                                    : "text-slate-600 dark:text-slate-400"
                                            }`}
                                        >
                                            <option value="no">{lang === 'th' ? 'ไม่ใช่' : 'No'}</option>
                                            <option value="yes">{lang === 'th' ? 'ใช่' : 'Yes'}</option>
                                        </select>
                                    </td>

                                    {/* Qty Column */}
                                    <td className="p-1 border-b border-r border-slate-200 dark:border-slate-800 box-border">
                                        <input
                                            id={`pane-qty-${idx}`}
                                            type="number"
                                            min={1}
                                            value={pane.quantity === 0 ? "" : pane.quantity}
                                            onChange={(e) => {
                                                if (e.target.value === "") {
                                                    updatePaneAt(idx, { quantity: 0 });
                                                    return;
                                                }
                                                const parsed = parseInt(e.target.value);
                                                if (!isNaN(parsed)) {
                                                    updatePaneAt(idx, { quantity: parsed });
                                                }
                                            }}
                                            onFocus={() => {
                                                if (activeTab !== idx) setActiveTab(idx);
                                            }}
                                            className={cellInputClass}
                                        />
                                    </td>

                                    {/* Job Type (ลักษณะงาน) Column */}
                                    <td className="p-1 border-b border-r border-slate-200 dark:border-slate-800 box-border">
                                        <input
                                            id={`pane-job-${idx}`}
                                            list="job-types-list"
                                            value={pane.glassType}
                                            onChange={(e) => handleGlassTypeChange(idx, e.target.value)}
                                            onFocus={() => {
                                                if (activeTab !== idx) setActiveTab(idx);
                                            }}
                                            placeholder={lang === 'th' ? 'ลักษณะงาน' : 'Job Type'}
                                            className={cellInputClass}
                                        />
                                    </td>

                                    {/* Thickness Column */}
                                    <td className="p-1 border-b border-r border-slate-200 dark:border-slate-800 box-border">
                                        <input
                                            id={`pane-thickness-${idx}`}
                                            list="thicknesses-list"
                                            value={pane.thickness}
                                            onChange={(e) => updatePaneAt(idx, { thickness: e.target.value })}
                                            onFocus={() => {
                                                if (activeTab !== idx) setActiveTab(idx);
                                            }}
                                            placeholder={lang === 'th' ? 'ระบุความหนา' : 'Specify mm'}
                                            className={cellInputClass}
                                        />
                                    </td>

                                    {/* Raw Glass Color Column (Custom text enabled) */}
                                    <td className="p-1 border-b border-r border-slate-200 dark:border-slate-800 box-border">
                                        <input
                                            id={`pane-rawcolor-${idx}`}
                                            list="raw-colors-list"
                                            value={pane.rawGlassColor}
                                            onChange={(e) => updatePaneAt(idx, { rawGlassColor: e.target.value })}
                                            onFocus={() => {
                                                if (activeTab !== idx) setActiveTab(idx);
                                            }}
                                            placeholder={lang === 'th' ? 'ใส / เขียว' : 'Clear / Green'}
                                            className={cellInputClass}
                                        />
                                    </td>

                                    {/* Requirement 10: จำนวนรู */}
                                    <td className="p-1 border-b border-r border-slate-200 dark:border-slate-800 text-center box-border">
                                        <input
                                            id={`pane-holes-${idx}`}
                                            type="number"
                                            min={0}
                                            value={pane.holesCount === undefined || pane.holesCount === 0 ? "" : pane.holesCount}
                                            onChange={(e) => {
                                                const val = e.target.value === "" ? 0 : parseInt(e.target.value) || 0;
                                                updatePaneAt(idx, { holesCount: val });
                                            }}
                                            placeholder="0"
                                            className={`${cellInputClass} text-center`}
                                        />
                                    </td>

                                    {/* Requirement 10: จำนวนบาก */}
                                    <td className="p-1 border-b border-r border-slate-200 dark:border-slate-800 text-center box-border">
                                        <input
                                            id={`pane-notches-${idx}`}
                                            type="number"
                                            min={0}
                                            value={pane.notchesCount === undefined || pane.notchesCount === 0 ? "" : pane.notchesCount}
                                            onChange={(e) => {
                                                const val = e.target.value === "" ? 0 : parseInt(e.target.value) || 0;
                                                updatePaneAt(idx, { notchesCount: val });
                                            }}
                                            placeholder="0"
                                            className={`${cellInputClass} text-center`}
                                        />
                                    </td>

                                    {/* Requirement 15: ประเภทงาน (ลามิเนต / อินซูเลท) */}
                                    <td className="p-1 border-b border-r border-slate-200 dark:border-slate-800 box-border">
                                        <select
                                            id={`pane-prodtype-${idx}`}
                                            value={pane.productType || ""}
                                            onChange={(e) => {
                                                const val = e.target.value as "" | "laminated" | "insulated";
                                                updatePaneAt(idx, {
                                                    productType: val,
                                                    layerCount: pane.layerCount || 2,
                                                    compositeLayers: pane.compositeLayers && pane.compositeLayers.length > 0
                                                        ? pane.compositeLayers
                                                        : [{ filmAirType: val === "insulated" ? "air 6" : "PVB 0.38 ใส", rawGlassColor: "ใส", thickness: "5" }]
                                                });
                                                if (val === "laminated" || val === "insulated") {
                                                    setLayerModalPaneIdx(idx);
                                                }
                                            }}
                                            className={selectClass}
                                        >
                                            <option value="">ธรรมดา (เดี่ยว)</option>
                                            <option value="laminated">ลามิเนต</option>
                                            <option value="insulated">อินซูเลท</option>
                                        </select>
                                    </td>

                                    {/* Requirement 14 & 15: โครงสร้างเลเยอร์ (Modal Trigger) - ซ่อนไว้ แสดงเฉพาะตอนมีลามิเนตหรืออินซูเลท */}
                                    {hasAnyComposite && (
                                        <td className="p-1 border-b border-r border-slate-200 dark:border-slate-800 box-border">
                                            {hasComposite ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setLayerModalPaneIdx(idx);
                                                    }}
                                                    className="w-full flex items-center justify-between px-2 py-1 h-8 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded text-[11px] font-semibold text-slate-700 dark:text-slate-200 transition-colors truncate"
                                                    title={formulaPreview}
                                                >
                                                    <span className="truncate">{formulaPreview}</span>
                                                    <SlidersHorizontal className="h-3 w-3 shrink-0 ml-1 text-slate-400 dark:text-slate-500" />
                                                </button>
                                            ) : (
                                                <span className="text-slate-400 dark:text-slate-600 text-[11px] px-2 italic">
                                                    —
                                                </span>
                                            )}
                                        </td>
                                    )}

                                    {/* Corner Spec Column (คิ้ว/มุม) */}
                                    <td className="p-1 border-b border-r border-slate-200 dark:border-slate-800 box-border">
                                        <input
                                            id={`pane-corner-${idx}`}
                                            value={pane.cornerNone ? "" : pane.cornerSize}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const isNone = val.trim() === "" || val.trim() === "ไม่มี";
                                                updatePaneAt(idx, {
                                                    cornerNone: isNone,
                                                    cornerSize: isNone ? "" : val,
                                                });
                                            }}
                                            placeholder={lang === 'th' ? 'ไม่มี' : 'None'}
                                            onFocus={() => {
                                                if (activeTab !== idx) setActiveTab(idx);
                                            }}
                                            className={cellInputClass}
                                        />
                                    </td>

                                    {/* Edge Grinding Profiles */}
                                    {(['Top', 'Bottom', 'Left', 'Right'] as const).map((side) => {
                                        const key = `edge${side}` as keyof PaneSpec;
                                        return (
                                            <td key={side} className="p-1 border-b border-r border-slate-200 dark:border-slate-800 box-border">
                                                <select
                                                    id={`pane-edge${side.toLowerCase()}-${idx}`}
                                                    value={pane[key] as string}
                                                    onChange={(e) => updatePaneAt(idx, { [key]: e.target.value })}
                                                    onFocus={() => {
                                                        if (activeTab !== idx) setActiveTab(idx);
                                                    }}
                                                    className={selectClass}
                                                >
                                                    <option value="N">ธรรมดา (N)</option>
                                                    <option value="D">เจียรริม (D)</option>
                                                    <option value="B">เจียรหยาบ (B)</option>
                                                    <option value="BE">เจียรปลี (BE)</option>
                                                    <option value="AA">เจียรลูกหนู (AA)</option>
                                                    <option value="A">ลบคม (A)</option>
                                                </select>
                                            </td>
                                        );
                                    })}

                                    {/* Requirement 11: หมายเหตุของลูกค้า */}
                                    <td className="p-1 border-b border-r border-slate-200 dark:border-slate-800 box-border">
                                        <input
                                            id={`pane-custnote-${idx}`}
                                            value={pane.customerRemarks || ""}
                                            onChange={(e) => updatePaneAt(idx, { customerRemarks: e.target.value })}
                                            placeholder="#20, ชุดที่ 5"
                                            className={cellInputClass}
                                        />
                                    </td>

                                    {/* Requirement 12: หมายเหตุภายใน */}
                                    <td className="p-1 border-b border-r border-slate-200 dark:border-slate-800 box-border">
                                        <input
                                            id={`pane-internote-${idx}`}
                                            value={pane.internalRemarks || ""}
                                            onChange={(e) => updatePaneAt(idx, { internalRemarks: e.target.value })}
                                            placeholder="CNC, ผ่ารูไฟ"
                                            className={cellInputClass}
                                        />
                                    </td>

                                    {/* Actions */}
                                    <td className="py-1 px-1.5 text-center border-b border-slate-200 dark:border-slate-800 box-border">
                                        <div className="flex items-center justify-center gap-1 select-none">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    duplicatePane(idx);
                                                }}
                                                className="h-6 w-6 text-slate-400 hover:text-[#E8601C]"
                                                title={lang === 'th' ? 'ทำซ้ำ' : 'Duplicate'}
                                            >
                                                <Copy className="h-3 w-3" />
                                            </Button>
                                            {panes.length > 1 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        removePane(idx);
                                                    }}
                                                    className="h-6 w-6 text-slate-400 hover:text-red-500"
                                                    title={lang === 'th' ? 'ลบ' : 'Delete'}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>



            {/* Composite Layers Configuration Dialog (ข้อ 14 & 15) */}
            {activeModalPane && layerModalPaneIdx !== null && (
                <Dialog open={layerModalPaneIdx !== null} onOpenChange={() => setLayerModalPaneIdx(null)}>
                    <DialogContent className="sm:max-w-[560px] rounded-2xl">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                                <Layers className="h-5 w-5 text-[#E8601C]" />
                                ตั้งค่าโครงสร้างกระจกประกอบ (แถวที่ {layerModalPaneIdx + 1})
                            </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-4 py-2">
                            {/* Layer Count Selector */}
                            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                                <div>
                                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                        จำนวนชั้นของกระจก
                                    </div>
                                    <div className="text-[11px] text-slate-400">
                                        เลือกกระจก 2 ชั้น (ฟิล์ม 1 ชั้น) หรือ 3 ชั้น (ฟิล์ม 2 ชั้น)
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const currentLayers = activeModalPane.compositeLayers || [];
                                            const l1 = currentLayers[0] || { filmAirType: activeModalPane.productType === "insulated" ? "air 6" : "PVB 0.38 ใส", rawGlassColor: "ใส", thickness: "5" };
                                            updatePaneAt(layerModalPaneIdx, {
                                                layerCount: 2,
                                                compositeLayers: [l1]
                                            });
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                            (activeModalPane.layerCount || 2) === 2
                                                ? "bg-[#E8601C] text-white shadow-sm"
                                                : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600"
                                        }`}
                                    >
                                        2 ชั้น
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const currentLayers = activeModalPane.compositeLayers || [];
                                            const l1 = currentLayers[0] || { filmAirType: activeModalPane.productType === "insulated" ? "air 6" : "PVB 0.38 ใส", rawGlassColor: "ใส", thickness: "5" };
                                            const l2 = currentLayers[1] || { filmAirType: activeModalPane.productType === "insulated" ? "air 6" : "PVB 0.38 ใส", rawGlassColor: "ใส", thickness: "6" };
                                            updatePaneAt(layerModalPaneIdx, {
                                                layerCount: 3,
                                                compositeLayers: [l1, l2]
                                            });
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                            activeModalPane.layerCount === 3
                                                ? "bg-[#E8601C] text-white shadow-sm"
                                                : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600"
                                        }`}
                                    >
                                        3 ชั้น
                                    </button>
                                </div>
                            </div>

                            {/* Base Pane Info (แผ่นหน้าสุด) */}
                            <div className="bg-slate-100/70 dark:bg-slate-800/70 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                                <span className="font-bold text-slate-700 dark:text-slate-200">กระจกแผ่นหน้า (แผ่นที่ 1): </span>
                                <span className="text-[#E8601C] font-bold">
                                    {activeModalPane.glassType || "TP"} {activeModalPane.rawGlassColor || "ใส"} {activeModalPane.thickness || "6mm"}
                                </span>
                            </div>

                            {/* Layer 1 (Middle film + Glass Sheet 2) */}
                            <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 space-y-3">
                                <div className="text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                                    ชั้นประกบที่ 1 (ฟิล์ม/อากาศ + กระจกแผ่นที่ 2)
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                                            ชนิดฟิล์ม / อากาศ
                                        </label>
                                        <input
                                            value={activeModalPane.compositeLayers?.[0]?.filmAirType || ""}
                                            onChange={(e) => {
                                                const layers = [...(activeModalPane.compositeLayers || [{ filmAirType: "", rawGlassColor: "ใส", thickness: "5" }])];
                                                layers[0] = { ...layers[0], filmAirType: e.target.value };
                                                updatePaneAt(layerModalPaneIdx, { compositeLayers: layers });
                                            }}
                                            placeholder="PVB 0.38 ใส / air 6"
                                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:ring-1 focus:ring-[#E8601C]"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                                            สีกระจกดิบ (แผ่น 2)
                                        </label>
                                        <input
                                            list="raw-colors-list"
                                            value={activeModalPane.compositeLayers?.[0]?.rawGlassColor || ""}
                                            onChange={(e) => {
                                                const layers = [...(activeModalPane.compositeLayers || [{ filmAirType: "PVB 0.38 ใส", rawGlassColor: "", thickness: "5" }])];
                                                layers[0] = { ...layers[0], rawGlassColor: e.target.value };
                                                updatePaneAt(layerModalPaneIdx, { compositeLayers: layers });
                                            }}
                                            placeholder="ใส / เขียว"
                                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:ring-1 focus:ring-[#E8601C]"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                                            กระจกหนา (แผ่น 2)
                                        </label>
                                        <input
                                            list="thicknesses-list"
                                            value={activeModalPane.compositeLayers?.[0]?.thickness || ""}
                                            onChange={(e) => {
                                                const layers = [...(activeModalPane.compositeLayers || [{ filmAirType: "PVB 0.38 ใส", rawGlassColor: "ใส", thickness: "" }])];
                                                layers[0] = { ...layers[0], thickness: e.target.value };
                                                updatePaneAt(layerModalPaneIdx, { compositeLayers: layers });
                                            }}
                                            placeholder="5mm"
                                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:ring-1 focus:ring-[#E8601C]"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Layer 2 (If 3 layers selected) */}
                            {activeModalPane.layerCount === 3 && (
                                <div className="p-3.5 rounded-xl border border-purple-200 dark:border-purple-900 bg-purple-50/40 dark:bg-purple-950/20 space-y-3">
                                    <div className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-purple-500" />
                                        ชั้นประกบที่ 2 (ฟิล์ม/อากาศ + กระจกแผ่นที่ 3)
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                                                ชนิดฟิล์ม / อากาศ (2)
                                            </label>
                                            <input
                                                value={activeModalPane.compositeLayers?.[1]?.filmAirType || ""}
                                                onChange={(e) => {
                                                    const layers = [...(activeModalPane.compositeLayers || [])];
                                                    layers[1] = { ...(layers[1] || { rawGlassColor: "ใส", thickness: "6" }), filmAirType: e.target.value };
                                                    updatePaneAt(layerModalPaneIdx, { compositeLayers: layers });
                                                }}
                                                placeholder="PVB 0.38 ใส / air 6"
                                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:ring-1 focus:ring-[#E8601C]"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                                                สีกระจกดิบ (แผ่น 3)
                                            </label>
                                            <input
                                                list="raw-colors-list"
                                                value={activeModalPane.compositeLayers?.[1]?.rawGlassColor || ""}
                                                onChange={(e) => {
                                                    const layers = [...(activeModalPane.compositeLayers || [])];
                                                    layers[1] = { ...(layers[1] || { filmAirType: "PVB 0.38 ใส", thickness: "6" }), rawGlassColor: e.target.value };
                                                    updatePaneAt(layerModalPaneIdx, { compositeLayers: layers });
                                                }}
                                                placeholder="ใส / เขียว"
                                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:ring-1 focus:ring-[#E8601C]"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                                                กระจกหนา (แผ่น 3)
                                            </label>
                                            <input
                                                list="thicknesses-list"
                                                value={activeModalPane.compositeLayers?.[1]?.thickness || ""}
                                                onChange={(e) => {
                                                    const layers = [...(activeModalPane.compositeLayers || [])];
                                                    layers[1] = { ...(layers[1] || { filmAirType: "PVB 0.38 ใส", rawGlassColor: "ใส" }), thickness: e.target.value };
                                                    updatePaneAt(layerModalPaneIdx, { compositeLayers: layers });
                                                }}
                                                placeholder="6mm"
                                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:ring-1 focus:ring-[#E8601C]"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Formula Result Preview */}
                            <div className="bg-slate-900 text-white p-3 rounded-xl">
                                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                                    สูตรแสดงบนสติกเกอร์ (Formula Preview)
                                </div>
                                <div className="text-sm font-mono font-bold text-amber-400">
                                    {formatCompositeFormula(
                                        activeModalPane.glassType,
                                        activeModalPane.rawGlassColor,
                                        activeModalPane.thickness,
                                        activeModalPane.productType,
                                        activeModalPane.compositeLayers
                                    )}
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                onClick={() => setLayerModalPaneIdx(null)}
                                className="bg-[#E8601C] hover:bg-[#E8601C]/90 text-white rounded-xl text-xs font-bold px-5"
                            >
                                ตกลง
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* Native Suggestions Datalists */}
            <datalist id="job-types-list">
                {glassTypes.map(t => (
                    <option key={t} value={t} />
                ))}
            </datalist>

            <datalist id="thicknesses-list">
                {thicknesses.map(t => (
                    <option key={t} value={t} />
                ))}
            </datalist>

            <datalist id="raw-glass-types-list">
                {(rawGlassTypeOptions.length > 0
                    ? rawGlassTypeOptions
                    : ['Clear', 'Tinted', 'Reflective', 'Frosted', 'Patterned']
                ).map(t => (
                    <option key={t} value={t} />
                ))}
            </datalist>

            <datalist id="raw-colors-list">
                {rawColorList.map(c => (
                    <option key={c.value} value={c.value}>{c.label !== c.value ? c.label : undefined}</option>
                ))}
            </datalist>
        </div>
    );
}
