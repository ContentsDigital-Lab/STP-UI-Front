"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Save, RotateCcw, DollarSign, Info, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
    DEFAULT_PRICING,
    ALL_THICKNESSES,
    getCachedPricingSettings,
    cachePricingSettings,
    type PricingSettings,
    type GlassPriceTable,
} from "@/lib/pricing-settings";
import { pricingSettingsApi } from "@/lib/api/pricing-settings";
import { materialsApi } from "@/lib/api/materials";
import { Material } from "@/lib/api/types";

const BASE_GLASS_TYPES = ["Clear", "Tinted", "Tempered", "Laminated", "Low-E", "Frosted", "Reflective", "Patterned"];

const BASE_TYPE_THICKNESSES: Record<string, string[]> = {
    Clear:      ["3mm", "5mm", "6mm", "8mm", "10mm", "12mm", "15mm", "19mm"],
    Tinted:     ["5mm", "6mm", "8mm", "10mm", "12mm", "15mm"],
    Tempered:   ["5mm", "6mm", "8mm", "10mm", "12mm", "15mm", "19mm"],
    Laminated:  ["6mm", "8mm", "10mm", "12mm", "15mm"],
    "Low-E":    ["6mm", "8mm", "10mm", "12mm"],
    Frosted:    ["5mm", "6mm", "8mm", "10mm"],
    Reflective: ["6mm", "8mm", "10mm"],
    Patterned:  ["5mm", "6mm"],
};

const TYPE_LABELS: Record<string, string> = {
    Clear:      "กระจกใส (Clear)",
    Tinted:     "กระจกเขียว (Tinted)",
    Tempered:   "กระจกเทมเปอร์ (Tempered)",
    Laminated:  "กระจกลามิเนต (Laminated)",
    "Low-E":    "กระจกอินซูเลท (Low-E)",
    Frosted:    "กระจกพ่นฝ้า (Frosted)",
    Reflective: "กระจกสะท้อน (Reflective)",
    Patterned:  "กระจกลาย (Patterned)",
};

const normalizeThickness = (t: string): string => {
    const num = parseInt(t);
    return isNaN(num) ? t : `${num}mm`;
};

const sortThicknesses = (arr: string[]): string[] =>
    [...new Set(arr)].sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));

export default function PricingSettingsPage() {
    const [settings, setSettings] = useState<PricingSettings>(() => getCachedPricingSettings());
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [glassTypes, setGlassTypes] = useState<string[]>(BASE_GLASS_TYPES);
    const [typeThicknesses, setTypeThicknesses] = useState<Record<string, string[]>>(BASE_TYPE_THICKNESSES);
    const [activeType, setActiveType] = useState(BASE_GLASS_TYPES[0]);
    const [newThicknessInput, setNewThicknessInput] = useState("");

    useEffect(() => {
        const load = async () => {
            const [pricingRes, matRes] = await Promise.all([
                pricingSettingsApi.get().catch(() => null),
                materialsApi.getAll().catch(() => null),
            ]);

            if (pricingRes?.data) {
                setSettings(pricingRes.data);
                cachePricingSettings(pricingRes.data);
            }

            if (matRes?.success && matRes.data) {
                const extraTypes = new Set<string>();
                const extraThicknesses: Record<string, Set<string>> = {};

                for (const mat of matRes.data) {
                    const gt = mat.specDetails?.glassType?.trim();
                    const th = mat.specDetails?.thickness?.toString()?.trim();
                    if (gt) {
                        extraTypes.add(gt);
                        if (!extraThicknesses[gt]) extraThicknesses[gt] = new Set();
                        if (th) extraThicknesses[gt].add(normalizeThickness(th));
                    }
                }

                const mergedTypes = [...BASE_GLASS_TYPES];
                for (const t of extraTypes) {
                    if (!mergedTypes.includes(t)) mergedTypes.push(t);
                }

                const mergedThicknesses: Record<string, string[]> = { ...BASE_TYPE_THICKNESSES };
                for (const [gt, thSet] of Object.entries(extraThicknesses)) {
                    const base = mergedThicknesses[gt] ?? [];
                    mergedThicknesses[gt] = sortThicknesses([...base, ...thSet]);
                }

                setGlassTypes(mergedTypes);
                setTypeThicknesses(mergedThicknesses);
            }
        };
        load();
    }, []);

    const updateGlassPrice = (
        glassType: string,
        thickness: string,
        field: "pricePerSqFt" | "grindingRate" | "rough" | "polished",
        value: number,
    ) => {
        setSettings(prev => {
            const currentVariant = prev.glassPrices[glassType]?.[thickness] ?? { pricePerSqFt: 0, grindingRate: 50 };
            let newVariant = { ...currentVariant };

            if (field === "pricePerSqFt") {
                newVariant.pricePerSqFt = value;
            } else if (field === "grindingRate") {
                newVariant.grindingRate = value;
            } else if (field === "rough" || field === "polished") {
                const currentRate = typeof currentVariant.grindingRate === 'object' 
                    ? { ...currentVariant.grindingRate } 
                    : { rough: Number(currentVariant.grindingRate) || 0, polished: Number(currentVariant.grindingRate) || 0 };
                
                currentRate[field] = value;
                newVariant.grindingRate = currentRate;
            }

            return {
                ...prev,
                glassPrices: {
                    ...prev.glassPrices,
                    [glassType]: {
                        ...prev.glassPrices[glassType],
                        [thickness]: newVariant,
                    },
                },
            };
        });
        setSaved(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await pricingSettingsApi.update(settings);
            if (res.data) {
                cachePricingSettings(res.data);
                setSettings(res.data);
            }
            setSaved(true);
            toast.success("บันทึกการตั้งค่าราคาแล้ว");
        } catch {
            toast.error("บันทึกไม่สำเร็จ กรุณาลองใหม่");
        } finally {
            setSaving(false);
        }
    };

    const handleAddThickness = () => {
        const num = parseInt(newThicknessInput);
        if (isNaN(num) || num <= 0) {
            toast.error("กรุณาใส่ตัวเลขที่ถูกต้อง");
            return;
        }
        const value = `${num}mm`;
        const current = typeThicknesses[activeType] ?? [];
        if (current.includes(value)) {
            toast.warning(`${value} มีอยู่แล้ว`);
            return;
        }
        setTypeThicknesses(prev => ({
            ...prev,
            [activeType]: sortThicknesses([...current, value]),
        }));
        setNewThicknessInput("");
        toast.success(`เพิ่มความหนา ${value} ใน ${activeType} แล้ว`);
    };

    const handleReset = () => {
        setSettings(DEFAULT_PRICING);
        setSaved(false);
        toast("รีเซ็ตเป็นค่าเริ่มต้นแล้ว (ยังไม่ได้บันทึก)");
    };

    return (
        <div className="max-w-[1400px] mx-auto w-full space-y-6 sm:space-y-8 pb-16 pt-4">
            <Button variant="ghost" className="mb-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => window.history.back()}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                กลับ
            </Button>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                        <div className="p-2.5 bg-blue-600/10 dark:bg-[#E8601C]/10 rounded-2xl text-blue-600 dark:text-[#E8601C]">
                            <DollarSign className="h-7 w-7" />
                        </div>
                        ตั้งค่าราคากระจก
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">
                        ราคาแนะนำที่จะ Auto-fill ในหน้าสร้างบิล
                    </p>
                </div>
                <div className="flex gap-3 w-full sm:w-auto">
                    <Button
                        variant="ghost"
                        onClick={handleReset}
                        className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-bold px-4 h-12 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 gap-2 shrink-0 transition-all flex-1 sm:flex-none"
                    >
                        <RotateCcw className="h-4 w-4" /> <span className="hidden sm:inline">รีเซ็ต</span>
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-[#D65415] text-white font-bold px-6 h-12 rounded-xl shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 gap-2 shrink-0 transition-all flex-1 sm:flex-none border-0"
                    >
                        <Save className="h-4 w-4" /> {saving ? "กำลังบันทึก..." : saved ? "บันทึกแล้ว ✓" : "บันทึกการตั้งค่า"}
                    </Button>
                </div>
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-4 bg-blue-50/80 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-3xl p-6 text-sm text-blue-800 dark:text-blue-300 shadow-sm relative overflow-hidden group">
                <div className="p-2.5 bg-blue-100 dark:bg-blue-800/40 rounded-2xl shrink-0 group-hover:scale-110 transition-transform">
                    <Info className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="pt-1">
                    <p className="font-extrabold text-base mb-1.5 text-blue-900 dark:text-blue-100">วิธีใช้งานตารางราคา</p>
                    <p className="font-medium text-blue-700/80 dark:text-blue-300/80 leading-relaxed mb-3">
                        ราคาที่ตั้งไว้จะถูกนำไป <strong>Auto-fill</strong> อัตโนมัติในหน้าสร้างบิล ตามประเภทกระจกและความหนาที่คุณเลือก 
                        (คุณยังสามารถแก้ไขราคาเฉพาะบิลนั้นๆ ได้ในหน้าสร้างบิลโดยตรง)
                    </p>
                    <ul className="space-y-1 font-medium text-xs bg-white/50 dark:bg-slate-900/50 p-3 rounded-xl border border-blue-100 dark:border-blue-800/30 inline-block w-full sm:w-auto">
                        <li><strong className="text-blue-900 dark:text-blue-200">ราคา/ตร.ฟ.</strong> = ราคาเนื้อกระจกต่อตารางฟุต</li>
                        <li><strong className="text-blue-900 dark:text-blue-200">เจียร/ม.</strong> = ค่าเจียรขอบต่อเมตร (ปกติ 50 สำหรับกระจกบาง, 75+ สำหรับกระจกหนา)</li>
                    </ul>
                </div>
            </div>

            {/* Global service rates & Formula */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-slate-800 dark:bg-slate-200" />
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                            ค่าบริการทั่วไป (หักลบอัตโนมัติ)
                        </h2>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 sm:gap-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">ราคาเจาะรู (฿)</Label>
                            <Input
                                type="number" min={0}
                                value={settings.holePriceEach}
                                onChange={e => { setSettings(p => ({ ...p, holePriceEach: parseFloat(e.target.value) || 0 })); setSaved(false); }}
                                className="h-12 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 font-bold text-lg px-4"
                            />
                            <p className="text-[10px] sm:text-xs text-slate-400 font-medium leading-tight">คำนวณจาก Cutout ที่วาด</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">ราคาบากมุม (฿)</Label>
                            <Input
                                type="number" min={0}
                                value={settings.notchPrice}
                                onChange={e => { setSettings(p => ({ ...p, notchPrice: parseFloat(e.target.value) || 0 })); setSaved(false); }}
                                className="h-12 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 font-bold text-lg px-4"
                            />
                            <p className="text-[10px] sm:text-xs text-slate-400 font-medium leading-tight">ระบุจำนวนตอนสร้างบิล</p>
                        </div>
                    </div>
                </div>

                {/* Formula reminder */}
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-6 sm:p-8 space-y-3 relative overflow-hidden">
                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-4">สูตรคำนวณราคาต่อแผ่น</h2>
                            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300 font-medium">
                                <li className="flex gap-2"><span>•</span> <span>= <strong>กว้าง(ม) × สูง(ม) × 10.764</strong> × ราคา/ตร.ฟ.</span></li>
                                <li className="flex gap-2"><span>•</span> <span>+ <strong>2 × (กว้าง + สูง)</strong> × ราคาเจียร/ม.</span></li>
                                <li className="flex gap-2"><span>•</span> <span>+ <strong>จำนวน Cutout</strong> × ราคาเจาะรู</span></li>
                                <li className="flex gap-2"><span>•</span> <span>+ <strong>จำนวนบากมุม</strong> × ราคาบากมุม</span></li>
                            </ul>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/50">
                            <p className="text-[11px] text-slate-400 font-medium italic">* 10.764 คือตัวแปลงอัตราส่วน 1 ตร.ม. ไปเป็น ตร.ฟ.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Glass price table */}
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col">
                {/* Type tabs */}
                <div className="flex overflow-x-auto bg-slate-100 dark:bg-slate-900/80 p-2 gap-1 border-b border-slate-200 dark:border-slate-800 hide-scrollbar">
                    {glassTypes.map(type => (
                        <button
                            key={type}
                            type="button"
                            onClick={() => setActiveType(type)}
                            className={`shrink-0 px-5 py-2.5 rounded-2xl text-sm font-bold whitespace-nowrap transition-all ${
                                activeType === type
                                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-[#E8601C] shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
                                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50"
                            }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>

                <div className="p-6 sm:p-8 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white">{TYPE_LABELS[activeType] ?? activeType}</h2>
                        <div className="flex items-center gap-2">
                            <Input
                                type="text"
                                placeholder="เช่น 5mm"
                                value={newThicknessInput}
                                onChange={e => setNewThicknessInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddThickness(); }}
                                className="h-10 w-28 rounded-xl text-sm font-bold text-center bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleAddThickness}
                                className="h-10 rounded-xl text-xs font-bold text-blue-600 dark:text-[#E8601C] hover:bg-blue-50 dark:hover:bg-[#E8601C]/5 border-blue-200 dark:border-[#E8601C]/20 hover:border-blue-300 dark:hover:border-[#E8601C]/40 gap-1.5"
                            >
                                <Plus className="h-4 w-4" /> เพิ่มความหนา
                            </Button>
                        </div>
                    </div>

                    {/* Table header */}
                    <div className="grid grid-cols-[80px_1fr_1fr_1fr_40px] sm:grid-cols-[100px_1fr_1fr_1fr_40px] gap-2 sm:gap-4 px-2 pb-2">
                        <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">ความหนา</span>
                        <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider text-center sm:text-left">ราคา/ตร.ฟ.</span>
                        <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider text-center sm:text-left">เจียรหยาบ/ม.</span>
                        <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider text-center sm:text-left">ขัดมัน/ม.</span>
                        <span />
                    </div>

                    {/* Rows per thickness */}
                    <div className="space-y-3">
                        {(typeThicknesses[activeType] ?? ALL_THICKNESSES).map(thickness => {
                            const row = settings.glassPrices[activeType]?.[thickness];
                            const defRow = DEFAULT_PRICING.glassPrices[activeType]?.[thickness];
                            const hasValue = !!row;
                            return (
                                <div key={thickness} className="grid grid-cols-[80px_1fr_1fr_1fr_40px] sm:grid-cols-[100px_1fr_1fr_1fr_40px] gap-2 sm:gap-4 items-center group bg-slate-50/50 dark:bg-slate-800/20 p-2 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                    <div className="flex items-center h-full sm:px-2">
                                        <span className="text-sm sm:text-base font-extrabold text-slate-700 dark:text-slate-200">{thickness}</span>
                                    </div>
                                    <Input
                                        type="number" min={0}
                                        placeholder={defRow ? String(defRow.pricePerSqFt) : "0"}
                                        value={row?.pricePerSqFt ?? ""}
                                        onChange={e => updateGlassPrice(activeType, thickness, "pricePerSqFt", parseFloat(e.target.value) || 0)}
                                        className={`h-11 sm:h-12 rounded-xl text-sm sm:text-base font-bold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus:border-blue-600 dark:focus:border-[#E8601C] focus:ring-blue-600/20 dark:focus:ring-[#E8601C]/20 text-center sm:text-left px-2 sm:px-4 ${!hasValue ? "opacity-60 grayscale" : ""}`}
                                    />
                                    {(() => {
                                        const r = row?.grindingRate;
                                        const rough = typeof r === 'object' ? r.rough : (Number(r) || 0);
                                        const polished = typeof r === 'object' ? r.polished : (Number(r) || 0);
                                        
                                        const dr = defRow?.grindingRate;
                                        const dRough = typeof dr === 'object' ? dr.rough : (Number(dr) || 50);
                                        const dPolished = typeof dr === 'object' ? dr.polished : (Number(dr) || 60);

                                        return (
                                            <>
                                                <Input
                                                    type="number" min={0}
                                                    placeholder={String(dRough)}
                                                    value={rough || ""}
                                                    onChange={e => updateGlassPrice(activeType, thickness, "rough", parseFloat(e.target.value) || 0)}
                                                    className={`h-11 sm:h-12 rounded-xl text-sm sm:text-base font-bold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus:border-blue-600 dark:focus:border-[#E8601C] focus:ring-blue-600/20 dark:focus:ring-[#E8601C]/20 text-center sm:text-left px-2 sm:px-4 ${!hasValue ? "opacity-60 grayscale" : ""}`}
                                                />
                                                <Input
                                                    type="number" min={0}
                                                    placeholder={String(dPolished)}
                                                    value={polished || ""}
                                                    onChange={e => updateGlassPrice(activeType, thickness, "polished", parseFloat(e.target.value) || 0)}
                                                    className={`h-11 sm:h-12 rounded-xl text-sm sm:text-base font-bold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus:border-blue-600 dark:focus:border-[#E8601C] focus:ring-blue-600/20 dark:focus:ring-[#E8601C]/20 text-center sm:text-left px-2 sm:px-4 ${!hasValue ? "opacity-60 grayscale" : ""}`}
                                                />
                                            </>
                                        );
                                    })()}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTypeThicknesses(prev => ({
                                                ...prev,
                                                [activeType]: (prev[activeType] ?? []).filter(t => t !== thickness),
                                            }));
                                            setSettings(prev => {
                                                const updated = { ...prev, glassPrices: { ...prev.glassPrices } };
                                                if (updated.glassPrices[activeType]) {
                                                    const copy = { ...updated.glassPrices[activeType] };
                                                    delete copy[thickness];
                                                    updated.glassPrices[activeType] = copy;
                                                }
                                                return updated;
                                            });
                                            setSaved(false);
                                            toast.success(`ลบ ${thickness} ออกจาก ${activeType} แล้ว`);
                                        }}
                                        className="h-10 w-10 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40 opacity-0 group-hover:opacity-100 transition-all ml-auto sm:ml-0"
                                        title={`ลบ ${thickness}`}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
