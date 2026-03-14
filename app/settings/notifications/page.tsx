"use client";

import React, { useEffect, useState } from "react";
import { Bell, Volume2, VolumeX, Play, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
    SOUND_LIST,
    SOUND_CATEGORIES,
    DEFAULT_SOUND_SETTINGS,
    NotificationSoundSettings,
    loadSoundSettings,
    saveSoundSettings,
    playSound,
} from "@/lib/notification-sounds";

const PRIORITY_CONFIG = [
    {
        key: "low" as const,
        label: "ความสำคัญต่ำ",
        sublabel: "Low Priority",
        color: "bg-blue-500",
        badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
        description: "การแจ้งเตือนทั่วไป ข้อมูลอัปเดต",
        example: "เช่น มีการอัปเดตข้อมูลใหม่",
    },
    {
        key: "medium" as const,
        label: "ความสำคัญกลาง",
        sublabel: "Medium Priority",
        color: "bg-yellow-500",
        badgeClass: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
        description: "ต้องดำเนินการในเร็วๆ นี้",
        example: "เช่น คำขอเบิกวัสดุรอการอนุมัติ",
    },
    {
        key: "high" as const,
        label: "ความสำคัญสูง",
        sublabel: "High Priority",
        color: "bg-red-500",
        badgeClass: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
        description: "ต้องดำเนินการทันที",
        example: "เช่น คำขอเคลมเร่งด่วน สต็อกวิกฤต",
    },
];

const VOLUME_STEPS = [
    { value: 0.2, label: "เบา (20%)" },
    { value: 0.4, label: "ค่อนข้างเบา (40%)" },
    { value: 0.6, label: "ปานกลาง (60%)" },
    { value: 0.8, label: "ค่อนข้างดัง (80%)" },
    { value: 1.0, label: "ดังสุด (100%)" },
];

// Group sounds by category for display
const SOUNDS_BY_CATEGORY = Object.entries(SOUND_CATEGORIES).map(([catKey, catLabel]) => ({
    key: catKey,
    label: catLabel,
    sounds: SOUND_LIST.filter((s) => s.category === catKey),
}));

export default function NotificationSoundSettingsPage() {
    const [settings, setSettings] = useState<NotificationSoundSettings>(DEFAULT_SOUND_SETTINGS);
    const [playing, setPlaying] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setSettings(loadSoundSettings());
    }, []);

    const handlePlay = async (soundId: string) => {
        if (playing === soundId) return;
        setPlaying(soundId);
        try {
            await playSound(soundId, settings.volume);
        } finally {
            setTimeout(() => setPlaying(null), 1200);
        }
    };

    const handleSave = () => {
        saveSoundSettings(settings);
        setSaved(true);
        toast.success("บันทึกการตั้งค่าเสียงแจ้งเตือนแล้ว");
        setTimeout(() => setSaved(false), 2000);
    };

    const handleReset = () => {
        setSettings(DEFAULT_SOUND_SETTINGS);
        toast.info("รีเซ็ตเป็นค่าเริ่มต้นแล้ว (ยังไม่ได้บันทึก)");
    };

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            {/* Header */}
            <div className="space-y-1">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Bell className="h-6 w-6 text-primary" />
                    ตั้งค่าเสียงแจ้งเตือน
                </h1>
                <p className="text-sm text-muted-foreground">
                    เลือกเสียงและระดับเสียงสำหรับการแจ้งเตือนแต่ละระดับความสำคัญ
                </p>
            </div>

            {/* ─── Section 1: Master toggle ─── */}
            <section className="rounded-xl border bg-card p-5 space-y-1">
                <h2 className="font-semibold text-base">การเปิด/ปิดเสียง</h2>
                <p className="text-sm text-muted-foreground mb-4">เปิดหรือปิดเสียงแจ้งเตือนทั้งหมด</p>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setSettings((s) => ({ ...s, enabled: true }))}
                        className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                            settings.enabled
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:border-muted-foreground"
                        }`}
                    >
                        <Volume2 className="h-4 w-4" />
                        เปิดเสียง
                    </button>
                    <button
                        onClick={() => setSettings((s) => ({ ...s, enabled: false }))}
                        className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                            !settings.enabled
                                ? "border-red-500 bg-red-50 text-red-600 dark:bg-red-950"
                                : "border-border text-muted-foreground hover:border-muted-foreground"
                        }`}
                    >
                        <VolumeX className="h-4 w-4" />
                        ปิดเสียง
                    </button>
                </div>
            </section>

            {/* ─── Section 2: Volume ─── */}
            <section className={`rounded-xl border bg-card p-5 space-y-3 transition-opacity ${!settings.enabled ? "opacity-40 pointer-events-none" : ""}`}>
                <h2 className="font-semibold text-base">ระดับเสียง</h2>
                <p className="text-sm text-muted-foreground">ใช้กับทุกการแจ้งเตือน</p>
                <div className="flex flex-wrap gap-2">
                    {VOLUME_STEPS.map((step) => (
                        <button
                            key={step.value}
                            onClick={() => setSettings((s) => ({ ...s, volume: step.value }))}
                            className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                                settings.volume === step.value
                                    ? "border-primary bg-primary/10 text-primary font-medium"
                                    : "border-border text-muted-foreground hover:border-muted-foreground"
                            }`}
                        >
                            {step.label}
                        </button>
                    ))}
                </div>
            </section>

            {/* ─── Section 3: Per-priority sound ─── */}
            <section className={`rounded-xl border bg-card p-5 space-y-6 transition-opacity ${!settings.enabled ? "opacity-40 pointer-events-none" : ""}`}>
                <div>
                    <h2 className="font-semibold text-base">เสียงตามระดับความสำคัญ</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        เลือกเสียงที่ต่างกันสำหรับแต่ละระดับ แล้วกด ▶ เพื่อฟังตัวอย่าง
                    </p>
                </div>

                <div className="space-y-5">
                    {PRIORITY_CONFIG.map((priority) => (
                        <div key={priority.key} className="rounded-lg border bg-background p-4 space-y-3">
                            {/* Priority header */}
                            <div className="flex items-start justify-between gap-2">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${priority.color}`} />
                                        <span className="font-medium text-sm">{priority.label}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priority.badgeClass}`}>
                                            {priority.sublabel}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground pl-4">{priority.description}</p>
                                    <p className="text-xs text-muted-foreground/70 pl-4 italic">{priority.example}</p>
                                </div>
                            </div>

                            {/* Sound selector + preview */}
                            <div className="flex items-center gap-2 pl-4">
                                <Select
                                    value={settings.sounds[priority.key]}
                                    onValueChange={(v) =>
                                        setSettings((s) => ({
                                            ...s,
                                            sounds: { ...s.sounds, [priority.key]: v ?? s.sounds[priority.key] },
                                        }))
                                    }
                                >
                                    <SelectTrigger className="flex-1 max-w-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SOUNDS_BY_CATEGORY.map((cat) => (
                                            <React.Fragment key={cat.key}>
                                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                                    {cat.label}
                                                </div>
                                                {cat.sounds.map((sound) => (
                                                    <SelectItem key={sound.id} value={sound.id}>
                                                        <span className="font-medium">{sound.label}</span>
                                                        <span className="ml-2 text-xs text-muted-foreground">{sound.description}</span>
                                                    </SelectItem>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5 shrink-0"
                                    onClick={() => handlePlay(settings.sounds[priority.key])}
                                    disabled={playing === settings.sounds[priority.key]}
                                >
                                    <Play className={`h-3.5 w-3.5 ${playing === settings.sounds[priority.key] ? "animate-pulse text-primary" : ""}`} />
                                    {playing === settings.sounds[priority.key] ? "กำลังเล่น..." : "ฟังตัวอย่าง"}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── Section 4: All sounds preview ─── */}
            <section className="rounded-xl border bg-card p-5 space-y-4">
                <div>
                    <h2 className="font-semibold text-base">ลองฟังเสียงทั้งหมด</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">กดปุ่ม ▶ เพื่อฟังตัวอย่างเสียงแต่ละแบบ</p>
                </div>
                {SOUNDS_BY_CATEGORY.map((cat) => (
                    <div key={cat.key} className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{cat.label}</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {cat.sounds.map((sound) => (
                                <div
                                    key={sound.id}
                                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
                                        playing === sound.id ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/30"
                                    }`}
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium">{sound.label}</p>
                                        <p className="text-xs text-muted-foreground truncate">{sound.description}</p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="ml-2 shrink-0 h-8 w-8 p-0"
                                        onClick={() => handlePlay(sound.id)}
                                        disabled={playing === sound.id}
                                    >
                                        <Play className={`h-3.5 w-3.5 ${playing === sound.id ? "animate-pulse text-primary" : ""}`} />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </section>

            {/* ─── Save / Reset ─── */}
            <div className="flex items-center gap-3 pb-8">
                <Button onClick={handleSave} className="gap-2" disabled={saved}>
                    <Save className="h-4 w-4" />
                    {saved ? "บันทึกแล้ว ✓" : "บันทึกการตั้งค่า"}
                </Button>
                <Button variant="outline" onClick={handleReset} className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    รีเซ็ตค่าเริ่มต้น
                </Button>
            </div>
        </div>
    );
}
