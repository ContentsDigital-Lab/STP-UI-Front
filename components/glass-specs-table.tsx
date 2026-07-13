"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Layers, Plus, Copy, Trash2 } from "lucide-react";
import type { PaneSpec } from "@/app/request/create/page";
import type { PricingSettings } from "@/lib/pricing-settings";
import { useUnit } from "@/lib/unit/unit-context";
import { UnitToggle } from "@/components/ui/unit-toggle";

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
    calcPanePrice,
}: GlassSpecsTableProps) {
    const { unit, toMm, formatCurrentUnit } = useUnit();

    return (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-[350px] shrink-0 w-full z-10">
            {/* Table Header Bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur shrink-0 select-none">
                <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-[#E8601C]" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        {lang === 'th' ? `รายการแผ่นกระจก (${panes.length} แผ่น)` : `Glass Specs (${panes.length} Sheets)`}
                    </span>
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
                <table className="w-full text-[12px] border-collapse text-left min-w-[1300px]">
                    <thead>
                        <tr className="bg-slate-50/50 dark:bg-slate-900/30 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 backdrop-blur select-none">
                            <th className="py-2.5 px-3 text-center w-10 border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">#</th>
                            <th className="py-2.5 px-3 w-20 border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">{lang === 'th' ? `กว้าง (${unit})` : `Width (${unit})`}</th>
                            <th className="py-2.5 px-3 w-20 border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">{lang === 'th' ? `สูง (${unit})` : `Height (${unit})`}</th>
                            <th className="py-2.5 px-3 w-24 border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">{lang === 'th' ? 'จำนวน' : 'Qty'}</th>
                            <th className="py-2.5 px-3 w-36 border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">{lang === 'th' ? 'ลักษณะงาน' : 'Job Type'}</th>
                            <th className="py-2.5 px-3 w-24 border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">{lang === 'th' ? 'ความหนา' : 'Thickness'}</th>
                            <th className="py-2.5 px-3 w-28 border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">{lang === 'th' ? 'คิ้ว/มุม (Size)' : 'Corners'}</th>
                            <th className="py-2.5 px-3 w-28 border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">{lang === 'th' ? 'สีดิบ' : 'Color'}</th>
                            <th className="py-2.5 px-3 w-24 border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">{lang === 'th' ? 'เจียรบน' : 'Top Edge'}</th>
                            <th className="py-2.5 px-3 w-24 border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">{lang === 'th' ? 'เจียรล่าง' : 'Bottom Edge'}</th>
                            <th className="py-2.5 px-3 w-24 border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">{lang === 'th' ? 'เจียรซ้าย' : 'Left Edge'}</th>
                            <th className="py-2.5 px-3 w-24 border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">{lang === 'th' ? 'เจียรขวา' : 'Right Edge'}</th>
                            <th className="hidden py-2.5 px-3 w-28 border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">{lang === 'th' ? 'ราคาประมาณ' : 'Est. Price'}</th>
                            <th className="py-2.5 px-3 w-16 text-center bg-slate-50/80 dark:bg-slate-900/80">{lang === 'th' ? 'จัดการ' : 'Actions'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {panes.map((pane, idx) => {
                            const isActive = idx === activeTab;
                            const pricingCalc = calcPanePrice(pane, pricingSettings);
                            const cellInputClass = "w-full bg-transparent px-2.5 py-1.5 h-9 text-[13px] outline-none text-slate-800 dark:text-slate-100 font-semibold focus:bg-white dark:focus:bg-slate-800 focus:ring-1 focus:ring-[#E8601C] rounded transition-all";
                            const selectClass = "w-full bg-transparent px-2 py-1.5 h-9 text-[13px] outline-none text-slate-800 dark:text-slate-100 font-semibold cursor-pointer focus:bg-white dark:focus:bg-slate-800 focus:ring-1 focus:ring-[#E8601C] rounded transition-all";

                            return (
                                <tr
                                    key={pane.id}
                                    onClick={() => {
                                        if (activeTab !== idx) setActiveTab(idx);
                                    }}
                                    className={`border-b border-slate-200 dark:border-slate-800 transition-colors ${
                                        isActive
                                            ? "bg-[#E8601C]/5 dark:bg-[#E8601C]/10 border-l-2 border-l-[#E8601C]"
                                            : "hover:bg-slate-50 dark:hover:bg-slate-800/30"
                                    }`}
                                >
                                    {/* Index Column */}
                                    <td className="text-center font-bold text-slate-400 bg-slate-50/50 dark:bg-slate-900/30 py-2 border-r border-slate-200 dark:border-slate-800 select-none">
                                        {idx + 1}
                                    </td>

                                    {/* Width Column */}
                                    <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                                        <input
                                            id={`pane-w-${idx}`}
                                            type="number"
                                            step="any"
                                            min={unit === 'inch' ? 2 : 50}
                                            value={pane.glassWidth === 0 ? "" : formatCurrentUnit(pane.glassWidth)}
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
                                            className={cellInputClass}
                                        />
                                    </td>

                                    {/* Height Column */}
                                    <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                                        <input
                                            id={`pane-h-${idx}`}
                                            type="number"
                                            step="any"
                                            min={unit === 'inch' ? 2 : 50}
                                            value={pane.glassHeight === 0 ? "" : formatCurrentUnit(pane.glassHeight)}
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
                                            className={cellInputClass}
                                        />
                                    </td>

                                    {/* Qty Column */}
                                    <td className="p-1 border-r border-slate-200 dark:border-slate-800">
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

                                    {/* Job Type Column */}
                                    <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                                        <input
                                            id={`pane-job-${idx}`}
                                            list="job-types-list"
                                            value={pane.glassType}
                                            onChange={(e) => handleGlassTypeChange(idx, e.target.value)}
                                            onFocus={() => {
                                                if (activeTab !== idx) setActiveTab(idx);
                                            }}
                                            className={cellInputClass}
                                        />
                                    </td>

                                    {/* Thickness Column */}
                                    <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                                        <input
                                            id={`pane-thickness-${idx}`}
                                            list="thicknesses-list"
                                            value={pane.thickness}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const suggested = pricingSettings.glassPrices[pane.glassType]?.[val]
                                                    ?? pricingSettings.glassPrices[pane.glassType]?.[val]; // fallback logic is handled parent-side
                                                updatePaneAt(idx, {
                                                    thickness: val,
                                                });
                                            }}
                                            onFocus={() => {
                                                if (activeTab !== idx) setActiveTab(idx);
                                            }}
                                            className={cellInputClass}
                                        />
                                    </td>

                                    {/* Corner Spec Column */}
                                    <td className="p-1 border-r border-slate-200 dark:border-slate-800">
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

                                    {/* Raw Glass Color Column */}
                                    <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                                        <select
                                            id={`pane-rawcolor-${idx}`}
                                            value={pane.rawGlassColor}
                                            onChange={(e) => updatePaneAt(idx, { rawGlassColor: e.target.value })}
                                            onFocus={() => {
                                                if (activeTab !== idx) setActiveTab(idx);
                                            }}
                                            className={selectClass}
                                        >
                                            <option value="">{lang === 'th' ? 'ไม่มี' : 'None'}</option>
                                            <option value="ใส">ใส (Clear)</option>
                                            <option value="เขียว">เขียว (Green)</option>
                                            <option value="ชา">ชา (Tea)</option>
                                            <option value="เทา">เทา (Grey)</option>
                                            <option value="บรอนซ์">บรอนซ์ (Bronze)</option>
                                        </select>
                                    </td>

                                    {/* Edge Profiles */}
                                    {(['Top', 'Bottom', 'Left', 'Right'] as const).map((side) => {
                                        const key = `edge${side}` as keyof PaneSpec;
                                        return (
                                            <td key={side} className="p-1 border-r border-slate-200 dark:border-slate-800">
                                                <select
                                                    id={`pane-edge${side.toLowerCase()}-${idx}`}
                                                    value={pane[key] as string}
                                                    onChange={(e) => updatePaneAt(idx, { [key]: e.target.value })}
                                                    onFocus={() => {
                                                        if (activeTab !== idx) setActiveTab(idx);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (side === 'Right' && e.key === 'Tab' && !e.shiftKey && idx === panes.length - 1) {
                                                            e.preventDefault();
                                                            addPane();
                                                            setTimeout(() => {
                                                                const nextRowW = document.getElementById(`pane-w-${panes.length}`);
                                                                if (nextRowW) nextRowW.focus();
                                                            }, 80);
                                                        }
                                                    }}
                                                    className={selectClass}
                                                >
                                                    <option value="N">Plain (ธรรมดา)</option>
                                                    <option value="D">D (ขัดมัน)</option>
                                                    <option value="B">B (เจียรหยาบ)</option>
                                                    <option value="BE">BE (เจียรปลี)</option>
                                                    <option value="AA">AA (เจียรลูกหนู)</option>
                                                    <option value="A">A (ลบคม)</option>
                                                </select>
                                            </td>
                                        );
                                    })}

                                    {/* Est Price Column */}
                                    <td className="hidden p-1 border-r border-slate-200 dark:border-slate-800">
                                        <input
                                            id={`pane-price-${idx}`}
                                            type="number"
                                            min={0}
                                            value={pane.estimatedPrice}
                                            onChange={(e) => updatePaneAt(idx, { estimatedPrice: Math.max(0, parseFloat(e.target.value) || 0) })}
                                            onFocus={() => {
                                                if (activeTab !== idx) setActiveTab(idx);
                                            }}
                                            className="w-full bg-transparent px-2.5 py-1.5 h-9 text-[13px] outline-none text-slate-800 dark:text-slate-100 font-bold text-right focus:bg-white dark:focus:bg-slate-800 focus:ring-1 focus:ring-[#E8601C] rounded transition-all"
                                        />
                                    </td>

                                    {/* Action Column */}
                                    <td className="py-1 px-2 text-center">
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
        </div>
    );
}
