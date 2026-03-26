"use client";

import React, { useEffect, useState } from "react";
import { Bell, Volume2, VolumeX, Play, RotateCcw, Save, Check, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/language-context";
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

const getVolumeSteps = (lang: string) => [
    { value: 0.2, label: lang === 'th' ? "เบา" : "Quiet" },
    { value: 0.46, label: lang === 'th' ? "ปานกลาง" : "Medium" },
    { value: 0.74, label: lang === 'th' ? "ค่อนข้างดัง" : "Loud" },
    { value: 1.0, label: lang === 'th' ? "ดังสุด" : "Max" },
];

const SOUNDS_BY_CATEGORY = Object.entries(SOUND_CATEGORIES).map(([catKey, catLabel]) => ({
    key: catKey,
    label: catLabel,
    sounds: SOUND_LIST.filter((s) => s.category === catKey),
}));

export default function NotificationSoundSettingsPage() {
    const { lang } = useLanguage();
    const router = useRouter();
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
        toast.success(lang === 'th' ? "บันทึกการตั้งค่าเสียงแจ้งเตือนแล้ว" : "Notification settings saved");
        setTimeout(() => setSaved(false), 2000);
    };

    const handleReset = () => {
        setSettings(DEFAULT_SOUND_SETTINGS);
        toast.info(lang === 'th' ? "รีเซ็ตเป็นค่าเริ่มต้นแล้ว (ยังไม่ได้บันทึก)" : "Reset to default settings (Not saved yet)");
    };

    const getSoundLabel = (id: string) => {
        const sound = SOUND_LIST.find((s) => s.id === id);
        return sound ? sound.label : id;
    };

    return (
        <div className="max-w-[1400px] mx-auto space-y-6 sm:space-y-8 pb-12 pt-4">
            <Button variant="ghost" className="mb-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {lang === 'th' ? "กลับ" : "Back"}
            </Button>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
                <div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#1e293b] dark:text-white leading-normal pt-2 pb-1">
                        {lang === 'th' ? "ตั้งค่าเสียงแจ้งเตือน" : "Notification Sounds"}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base font-medium mt-1">
                        {lang === 'th' ? "จัดการระดับเสียงและประเภทการแจ้งเตือนตามความสำคัญของข้อมูล" : "Manage volume and notification settings based on priority"}
                    </p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <Button
                        variant="ghost"
                        onClick={handleReset}
                        className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-bold px-4 h-12 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 gap-2 shrink-0 transition-all flex-1 sm:flex-none"
                    >
                        <RotateCcw className="h-4 w-4" />
                        <span className="hidden sm:inline">{lang === 'th' ? "รีเซ็ตเริ่มต้น" : "Reset Default"}</span>
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saved}
                        className="bg-blue-600 hover:bg-blue-700 dark:bg-[#FF8A00] dark:hover:bg-[#E67A00] text-white font-bold px-6 h-12 rounded-xl shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 gap-2 shrink-0 transition-all flex-1 sm:flex-none"
                    >
                        <Save className="h-4 w-4" />
                        {saved ? (lang === 'th' ? "บันทึกแล้ว ✓" : "Saved ✓") : (lang === 'th' ? "บันทึกการตั้งค่า" : "Save Settings")}
                    </Button>
                </div>
            </div>

            {/* Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* ─── Left Column ─── */}
                <div className="col-span-1 lg:col-span-4 flex flex-col gap-6">
                    
                    {/* Toggle Card */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <Volume2 className="h-7 w-7 text-blue-600 dark:text-[#FF8A00]" />
                                <h2 className="text-lg font-bold text-slate-800 dark:text-white">{lang === 'th' ? "เปิด/ปิดเสียง" : "Toggle Sounds"}</h2>
                            </div>
                            <button
                                onClick={() => setSettings(s => ({ ...s, enabled: !s.enabled }))}
                                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none ${settings.enabled ? 'bg-blue-600 dark:bg-[#FF8A00]' : 'bg-slate-200 dark:bg-slate-700'}`}
                            >
                                <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${settings.enabled ? 'translate-x-7' : 'translate-x-1'}`} />
                            </button>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                            {lang === 'th' ? "เปิดใช้งานการแจ้งเตือนด้วยเสียงทั้งหมดในระบบ Inventory" : "Enable all sound notifications in the Inventory system"}
                        </p>
                    </div>

                    {/* Volume Card */}
                    <div className={`bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 dark:border-slate-800 transition-opacity ${!settings.enabled ? "opacity-50 pointer-events-none" : ""}`}>
                        <div className="flex items-center gap-3 mb-8">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600 dark:text-[#FF8A00]"><path d="M11 5L11 19"></path><path d="M15 9L15 15"></path><path d="M7 9L7 15"></path></svg>
                            <h2 className="text-lg font-bold text-slate-800 dark:text-white">{lang === 'th' ? "ระดับเสียง" : "Volume Level"}</h2>
                        </div>
                        <div className="relative mb-6">
                            <input
                                type="range"
                                min="0.2"
                                max="1.0"
                                step="0.01"
                                value={settings.volume}
                                onChange={(e) => setSettings((s) => ({ ...s, volume: parseFloat(e.target.value) }))}
                                className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full cursor-pointer accent-blue-600 dark:accent-[#FF8A00] transition-all duration-75"
                            />
                        </div>
                        <div className="relative h-4 mt-2 text-[11px] font-bold text-slate-400">
                            {getVolumeSteps(lang).map((step: any, i: number, arr: any[]) => {
                                // Find geometrically closest label based on continuous float
                                const closestStep = arr.reduce((prev, curr) => 
                                    Math.abs(curr.value - settings.volume) < Math.abs(prev.value - settings.volume) ? curr : prev
                                );
                                const isClosest = closestStep.value === step.value;
                                
                                let positionClass = "absolute top-0";
                                let positionStyle = {};
                                
                                if (i === 0) {
                                    positionClass += " left-0";
                                } else if (i === arr.length - 1) {
                                    positionClass += " right-0";
                                } else {
                                    positionClass += " -translate-x-1/2";
                                    positionStyle = { left: `${((step.value - 0.2) / 0.8) * 100}%` };
                                }
                                
                                return (
                                    <span key={step.value} style={positionStyle} className={`${positionClass} transition-colors duration-200 ${isClosest ? "text-blue-600 dark:text-[#FF8A00]" : "text-slate-400"}`}>
                                        {step.label}
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    {/* Inventory Intelligence Banner */}
                    <div className="bg-[#0f172a] text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
                        <div className="relative z-10">
                            <h2 className="text-xl font-extrabold mb-3">Inventory Intelligence</h2>
                            <p className="text-sm text-slate-300 leading-relaxed font-medium">
                                {lang === 'th' ? "ระบบเสียงของเราใช้คลื่นความถี่ที่ช่วยให้คุณโฟกัสได้ดีขึ้นในคลังสินค้าที่มีเสียงดัง" : "Our sound system uses frequencies designed to improve focus in noisy warehouse environments"}
                            </p>
                        </div>
                        <div className="absolute -bottom-10 -right-6 opacity-20">
                            <svg width="180" height="180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path><path d="M2 17c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path><path d="M2 7c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path></svg>
                        </div>
                    </div>
                </div>

                {/* ─── Right Column ─── */}
                <div className={`col-span-1 lg:col-span-8 flex flex-col gap-6 transition-opacity ${!settings.enabled ? "opacity-50 pointer-events-none" : ""}`}>
                    
                    {/* Priority Cards Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Low Priority */}
                        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col">
                            <div className="flex flex-col gap-1 mb-5">
                                <div className="flex items-center gap-2">
                                    <div className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0"></div>
                                    <span className="font-extrabold text-sm text-slate-800 dark:text-slate-200">{lang === 'th' ? "ความสำคัญต่ำ" : "Low Priority"}</span>
                                    {lang === 'th' && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 ml-1 border border-blue-200 dark:border-transparent">
                                            Low Priority
                                        </span>
                                    )}
                                </div>
                                <div className="text-[11px] text-slate-400 pl-5 space-y-0.5 leading-tight mt-1">
                                    <p>{lang === 'th' ? "การแจ้งเตือนทั่วไป ข้อมูลอัปเดต" : "General alerts, updates"}</p>
                                    <p className="italic opacity-80">{lang === 'th' ? "เช่น มีการอัปเดตข้อมูลใหม่" : "e.g., New data available"}</p>
                                </div>
                            </div>
                            <div className="mt-auto">
                                <Select value={settings.sounds.low} onValueChange={(v) => setSettings((s) => ({ ...s, sounds: { ...s.sounds, low: v || s.sounds.low } }))}>
                                    <SelectTrigger className="mb-4 h-11 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium text-slate-700 dark:text-slate-300">
                                        <span className="truncate">{getSoundLabel(settings.sounds.low)}</span>
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        {SOUNDS_BY_CATEGORY.map((cat) => (
                                            <React.Fragment key={cat.key}>
                                                <div className="px-3 py-2 text-xs font-bold text-slate-400">{cat.label}</div>
                                                {cat.sounds.map((sound) => (
                                                    <SelectItem key={sound.id} value={sound.id} className="font-medium rounded-lg">{sound.label}</SelectItem>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button onClick={() => handlePlay(settings.sounds.low)} variant="outline" className="w-full h-10 rounded-xl font-bold gap-2 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm">
                                    <Play className="h-4 w-4" /> {lang === 'th' ? "ฟังตัวอย่าง" : "Listen"}
                                </Button>
                            </div>
                        </div>

                        {/* Medium Priority */}
                        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col">
                            <div className="flex flex-col gap-1 mb-5">
                                <div className="flex items-center gap-2">
                                    <div className="h-2.5 w-2.5 rounded-full bg-yellow-500 shrink-0"></div>
                                    <span className="font-extrabold text-sm text-slate-800 dark:text-slate-200">{lang === 'th' ? "ความสำคัญกลาง" : "Medium Priority"}</span>
                                    {lang === 'th' && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 ml-1 border border-yellow-200 dark:border-transparent">
                                            Medium Priority
                                        </span>
                                    )}
                                </div>
                                <div className="text-[11px] text-slate-400 pl-5 space-y-0.5 leading-tight mt-1">
                                    <p>{lang === 'th' ? "ต้องดำเนินการในเร็วๆ นี้" : "Action required soon"}</p>
                                    <p className="italic opacity-80">{lang === 'th' ? "เช่น คำขอเบิกวัสดุรอการอนุมัติ" : "e.g., Pending material requests"}</p>
                                </div>
                            </div>
                            <div className="mt-auto">
                                <Select value={settings.sounds.medium} onValueChange={(v) => setSettings((s) => ({ ...s, sounds: { ...s.sounds, medium: v || s.sounds.medium } }))}>
                                    <SelectTrigger className="mb-4 h-11 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium text-slate-700 dark:text-slate-300">
                                        <span className="truncate">{getSoundLabel(settings.sounds.medium)}</span>
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        {SOUNDS_BY_CATEGORY.map((cat) => (
                                            <React.Fragment key={cat.key}>
                                                <div className="px-3 py-2 text-xs font-bold text-slate-400">{cat.label}</div>
                                                {cat.sounds.map((sound) => (
                                                    <SelectItem key={sound.id} value={sound.id} className="font-medium rounded-lg">{sound.label}</SelectItem>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button onClick={() => handlePlay(settings.sounds.medium)} variant="outline" className="w-full h-10 rounded-xl font-bold gap-2 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm">
                                    <Play className="h-4 w-4" /> {lang === 'th' ? "ฟังตัวอย่าง" : "Listen"}
                                </Button>
                            </div>
                        </div>

                        {/* High Priority */}
                        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col">
                            <div className="flex flex-col gap-1 mb-5">
                                <div className="flex items-center gap-2">
                                    <div className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0"></div>
                                    <span className="font-extrabold text-sm text-slate-800 dark:text-slate-200">{lang === 'th' ? "ความสำคัญสูง" : "High Priority"}</span>
                                    {lang === 'th' && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 ml-1 border border-red-200 dark:border-transparent">
                                            High Priority
                                        </span>
                                    )}
                                </div>
                                <div className="text-[11px] text-slate-400 pl-5 space-y-0.5 leading-tight mt-1">
                                    <p>{lang === 'th' ? "ต้องดำเนินการทันที" : "Immediate action required"}</p>
                                    <p className="italic opacity-80">{lang === 'th' ? "เช่น คำขอเคลมเร่งด่วน สต็อกวิกฤต" : "e.g., Urgent claims, critical stock"}</p>
                                </div>
                            </div>
                            <div className="mt-auto">
                                <Select value={settings.sounds.high} onValueChange={(v) => setSettings((s) => ({ ...s, sounds: { ...s.sounds, high: v || s.sounds.high } }))}>
                                    <SelectTrigger className="mb-4 h-11 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium text-slate-700 dark:text-slate-300">
                                        <span className="truncate">{getSoundLabel(settings.sounds.high)}</span>
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        {SOUNDS_BY_CATEGORY.map((cat) => (
                                            <React.Fragment key={cat.key}>
                                                <div className="px-3 py-2 text-xs font-bold text-slate-400">{cat.label}</div>
                                                {cat.sounds.map((sound) => (
                                                    <SelectItem key={sound.id} value={sound.id} className="font-medium rounded-lg">{sound.label}</SelectItem>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button onClick={() => handlePlay(settings.sounds.high)} variant="outline" className="w-full h-10 rounded-xl font-bold gap-2 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm">
                                    <Play className="h-4 w-4" /> {lang === 'th' ? "ฟังตัวอย่าง" : "Listen"}
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* All Sounds Preview Card */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-50 dark:bg-[#FF8A00]/20 p-2.5 rounded-2xl text-blue-600 dark:text-[#FF8A00]">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                                </div>
                                <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">{lang === 'th' ? "ลองฟังเสียงทั้งหมด" : "Preview All Sounds"}</h2>
                            </div>
                            <div className="bg-slate-100 dark:bg-slate-800 rounded-full p-1 flex items-center">
                                <span className="px-4 py-1.5 rounded-full text-xs font-bold text-slate-400 cursor-pointer">ALL</span>
                                <span className="px-4 py-1.5 rounded-full bg-blue-600 dark:bg-[#FF8A00] text-white text-xs font-bold shadow-md shadow-blue-500/20 dark:shadow-orange-500/20 cursor-pointer">CUSTOM</span>
                            </div>
                        </div>

                        <div className="space-y-8">
                            {SOUNDS_BY_CATEGORY.map((cat, idx) => (
                                <div key={cat.key}>
                                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex gap-4 items-center">
                                        {cat.label}
                                        <div className="flex-1 border-b border-slate-100 dark:border-slate-800"></div>
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 border-b border-transparent">
                                        {cat.sounds.map((sound) => (
                                            <div
                                                key={sound.id}
                                                className={`flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group border border-transparent ${
                                                    playing === sound.id ? "border-blue-200 bg-blue-50/50 dark:border-[#FF8A00]/50 dark:bg-[#FF8A00]/10" : ""
                                                }`}
                                                onClick={() => handlePlay(sound.id)}
                                            >
                                                <span className={`font-bold text-sm ${playing === sound.id ? "text-blue-600 dark:text-[#FF8A00]" : "text-slate-700 dark:text-slate-300"}`}>
                                                    {sound.label}
                                                </span>
                                                <div className={`rounded-full p-1.5 transition-colors ${playing === sound.id ? "bg-blue-600 dark:bg-[#FF8A00] text-white shadow-md shadow-blue-500/30 dark:shadow-orange-500/30" : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 group-hover:bg-blue-600 dark:group-hover:bg-[#FF8A00] group-hover:text-white"}`}>
                                                    <Play className="h-3 w-3 fill-current" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
