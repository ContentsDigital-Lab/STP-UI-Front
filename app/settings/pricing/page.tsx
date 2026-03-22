"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Save, RotateCcw, DollarSign, Info } from "lucide-react";
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

// glass types that appear in the bill creation page
const GLASS_TYPES = ["Clear", "Tinted", "Tempered", "Laminated", "Low-E", "Frosted", "Reflective", "Patterned"];

// which thicknesses are available per type (show only relevant ones)
const TYPE_THICKNESSES: Record<string, string[]> = {
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

export default function PricingSettingsPage() {
    const [settings, setSettings] = useState<PricingSettings>(() => getCachedPricingSettings());
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeType, setActiveType] = useState(GLASS_TYPES[0]);

    // Fetch from server on mount — server is the source of truth
    useEffect(() => {
        pricingSettingsApi.get().then(res => {
            if (res.data) {
                setSettings(res.data);
                cachePricingSettings(res.data);
            }
        }).catch(() => {
            // Fall through — cached value already in state
        });
    }, []);

    const updateGlassPrice = (
        glassType: string,
        thickness: string,
        field: "pricePerSqFt" | "grindingRate",
        value: number,
    ) => {
        setSettings(prev => ({
            ...prev,
            glassPrices: {
                ...prev.glassPrices,
                [glassType]: {
                    ...prev.glassPrices[glassType],
                    [thickness]: {
                        ...(prev.glassPrices[glassType]?.[thickness] ?? { pricePerSqFt: 0, grindingRate: 50 }),
                        [field]: value,
                    },
                },
            },
        }));
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

    const handleReset = () => {
        setSettings(DEFAULT_PRICING);
        setSaved(false);
        toast("รีเซ็ตเป็นค่าเริ่มต้นแล้ว (ยังไม่ได้บันทึก)");
    };

    return (
        <div className="max-w-5xl mx-auto w-full space-y-6 pb-16">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                    <Link href="/settings">
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-[#E8601C]/10 rounded-xl">
                            <DollarSign className="h-5 w-5 text-[#E8601C]" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white">ตั้งค่าราคากระจก</h1>
                            <p className="text-xs text-slate-500">ราคาแนะนำที่จะ auto-fill ในหน้าสร้างบิล</p>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-9 rounded-xl gap-1.5 text-xs" onClick={handleReset}>
                        <RotateCcw className="h-3.5 w-3.5" /> รีเซ็ต
                    </Button>
                    <Button
                        size="sm"
                        className="h-9 rounded-xl gap-1.5 text-xs bg-[#E8601C] hover:bg-[#E8601C]/90 text-white"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        <Save className="h-3.5 w-3.5" /> {saving ? "กำลังบันทึก..." : saved ? "บันทึก ✓" : "บันทึก"}
                    </Button>
                </div>
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 text-sm text-blue-700 dark:text-blue-300">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                    <p className="font-semibold mb-0.5">วิธีใช้</p>
                    <p className="text-xs leading-relaxed">
                        ราคาที่ตั้งไว้จะถูก <strong>auto-fill อัตโนมัติ</strong> เมื่อเลือกประเภทกระจก + ความหนาในหน้าสร้างบิล
                        ยังสามารถแก้ไขราคาเฉพาะออเดอร์ได้ในหน้าสร้างบิลโดยตรง
                    </p>
                    <p className="text-xs leading-relaxed mt-1">
                        <strong>ราคา/ตร.ฟ.</strong> = ราคาเนื้อกระจกต่อตารางฟุต &nbsp;|&nbsp;
                        <strong>เจียร/ม.</strong> = ค่าเจียรขอบต่อเมตร (50 = กระจกบาง, 75 = กระจกหนา/พิเศษ)
                    </p>
                </div>
            </div>

            {/* Global service rates */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-card p-5 space-y-4">
                <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                    ค่าบริการทั่วไป
                </h2>
                <div className="grid grid-cols-2 gap-4 max-w-sm">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-500">ราคา/รู (ค่าเจาะ) ฿</Label>
                        <Input
                            type="number" min={0}
                            value={settings.holePriceEach}
                            onChange={e => { setSettings(p => ({ ...p, holePriceEach: parseFloat(e.target.value) || 0 })); setSaved(false); }}
                            className="h-10 rounded-xl font-bold text-sm"
                        />
                        <p className="text-[10px] text-slate-400">นับจากจำนวน cutout ที่วาดใน designer</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-500">ราคา/บาก (ค่าบาก) ฿</Label>
                        <Input
                            type="number" min={0}
                            value={settings.notchPrice}
                            onChange={e => { setSettings(p => ({ ...p, notchPrice: parseFloat(e.target.value) || 0 })); setSaved(false); }}
                            className="h-10 rounded-xl font-bold text-sm"
                        />
                        <p className="text-[10px] text-slate-400">กรอกจำนวนบากในหน้าสร้างบิล</p>
                    </div>
                </div>
            </div>

            {/* Glass price table */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-card overflow-hidden">
                {/* Type tabs */}
                <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                    {GLASS_TYPES.map(type => (
                        <button
                            key={type}
                            type="button"
                            onClick={() => setActiveType(type)}
                            className={`shrink-0 px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
                                activeType === type
                                    ? "border-[#E8601C] text-[#E8601C] bg-white dark:bg-slate-900"
                                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>

                <div className="p-5 space-y-4">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{TYPE_LABELS[activeType]}</p>

                    {/* Table header */}
                    <div className="grid grid-cols-[80px_1fr_1fr] gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">ความหนา</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">ราคา/ตร.ฟ. (฿)</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">เจียร/ม. (฿)</span>
                    </div>

                    {/* Rows per thickness */}
                    {(TYPE_THICKNESSES[activeType] ?? ALL_THICKNESSES).map(thickness => {
                        const row = settings.glassPrices[activeType]?.[thickness];
                        const defRow = DEFAULT_PRICING.glassPrices[activeType]?.[thickness];
                        const hasValue = !!row;
                        return (
                            <div key={thickness} className="grid grid-cols-[80px_1fr_1fr] gap-3 items-center">
                                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{thickness}</span>
                                <Input
                                    type="number" min={0}
                                    placeholder={defRow ? String(defRow.pricePerSqFt) : "0"}
                                    value={row?.pricePerSqFt ?? ""}
                                    onChange={e => updateGlassPrice(activeType, thickness, "pricePerSqFt", parseFloat(e.target.value) || 0)}
                                    className={`h-9 rounded-xl text-xs font-bold ${!hasValue ? "opacity-50" : ""}`}
                                />
                                <Input
                                    type="number" min={0}
                                    placeholder={defRow ? String(defRow.grindingRate) : "50"}
                                    value={row?.grindingRate ?? ""}
                                    onChange={e => updateGlassPrice(activeType, thickness, "grindingRate", parseFloat(e.target.value) || 0)}
                                    className={`h-9 rounded-xl text-xs font-bold ${!hasValue ? "opacity-50" : ""}`}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Formula reminder */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-4 text-xs text-slate-500 space-y-1">
                <p className="font-bold text-slate-600 dark:text-slate-300 mb-2">สูตรคำนวณราคาต่อแผ่น</p>
                <p>= <strong>กว้าง(ม) × สูง(ม) × 10.764</strong> × ราคา/ตร.ฟ.</p>
                <p>+ <strong>2 × (กว้าง + สูง)</strong> × ราคาเจียร/ม.</p>
                <p>+ <strong>จำนวน cutout</strong> × ราคา/รู</p>
                <p>+ <strong>จำนวนบาก</strong> × ราคา/บาก</p>
                <p className="pt-1 text-[10px] text-slate-400">10.764 = ตัวแปลง 1 ตร.ม. → ตร.ฟ. (อิงสูตรตาราง Excel ของร้าน)</p>
            </div>
        </div>
    );
}
