"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Factory, Plus, Play, Pencil, Trash2,
    CheckCircle2, X, Loader2,
    ChevronRight, Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { stationsApi } from "@/lib/api/stations";
import { Station } from "@/lib/api/types";
import { COLOR_OPTIONS, getColorOption } from "@/lib/stations/stations-store";
import { getStationTemplates } from "@/lib/api/station-templates";
import { StationTemplate } from "@/lib/types/station-designer";

/** Backend populates templateId — extract string ID from either a plain string or a populated object */
function resolveTemplateId(templateId: unknown): string {
    if (!templateId) return "";
    if (typeof templateId === "string") return templateId;
    if (typeof templateId === "object" && templateId !== null && "_id" in templateId) {
        return (templateId as { _id: string })._id;
    }
    return "";
}

// ── Color picker ──────────────────────────────────────────────────────────────
function ColorPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
    return (
        <div className="flex flex-wrap gap-2">
            {COLOR_OPTIONS.map((c) => (
                <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    onClick={() => onChange(c.id)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                        value === c.id ? "border-foreground scale-110 shadow-md" : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c.swatch }}
                />
            ))}
        </div>
    );
}

// ── Create / Edit modal ───────────────────────────────────────────────────────
function StationModal({
    initial,
    templates,
    onClose,
    onSave,
}: {
    initial?:   Partial<Station>;
    templates:  StationTemplate[];
    onClose:    () => void;
    onSave:     (data: { name: string; colorId: string; templateId?: string; isLaminateStation?: boolean }) => void;
}) {
    const [name,       setName]       = useState(initial?.name       ?? "");
    const [colorId,    setColorId]    = useState(initial?.colorId    ?? "sky");
    const [templateId, setTemplateId] = useState<string>(resolveTemplateId(initial?.templateId));
    const [isLaminate, setIsLaminate] = useState(initial?.isLaminateStation ?? false);

    const color    = getColorOption(colorId);
    const isEdit   = Boolean(initial?._id);
    // templateId is required by the backend DB — always required on create
    const canSave  = name.trim().length > 0 && (isEdit || templateId.length > 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg w-full max-w-md p-6 space-y-5"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">{isEdit ? "แก้ไขสถานี" : "สร้างสถานีใหม่"}</h2>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Name */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">ชื่อสถานี <span className="text-red-400">*</span></label>
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="เช่น ตัดกระจก, QC, บรรจุ..."
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
                        onKeyDown={(e) => e.key === "Enter" && canSave && onSave({ name: name.trim(), colorId, templateId: templateId || undefined, isLaminateStation: isLaminate || undefined })}
                    />
                    {name.trim() && (
                        <span className={`inline-block text-sm font-semibold px-2.5 py-1 rounded-lg mt-1 ${color.cls}`}>
                            {name.trim()}
                        </span>
                    )}
                </div>

                {/* Color */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">สีป้ายชื่อ</label>
                    <ColorPicker value={colorId} onChange={setColorId} />
                </div>

                {/* Template */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Template {!isEdit && <span className="text-red-400">*</span>}
                    </label>
                    <select
                        value={templateId}
                        onChange={(e) => setTemplateId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
                    >
                        <option value="">— เลือก template —</option>
                        {templates.map((t) => (
                            <option key={t._id} value={t._id}>{t.name}</option>
                        ))}
                    </select>
                    {templates.length === 0 ? (
                        <p className="text-xs text-slate-400">ยังไม่มี template — สร้างได้ที่ปุ่ม "จัดการ Template"</p>
                    ) : !isEdit && !templateId && (
                        <p className="text-xs text-amber-600">กรุณาเลือก template ก่อนสร้างสถานี</p>
                    )}
                </div>

                {/* Laminate station toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={isLaminate}
                        onChange={(e) => setIsLaminate(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">สถานีลามิเนต</span>
                        <p className="text-xs text-slate-400">เปิดใช้งานบอร์ดจับคู่แผ่นดิบและปุ่มประกบลามิเนต</p>
                    </div>
                </label>

                {/* Actions */}
                <div className="flex gap-2 justify-end pt-2">
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={onClose}>ยกเลิก</Button>
                    <Button size="sm" className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white" disabled={!canSave} onClick={() => onSave({ name: name.trim(), colorId, templateId: templateId || undefined, isLaminateStation: isLaminate || undefined })}>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        {isEdit ? "บันทึก" : "สร้างสถานี"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ── Delete confirm ────────────────────────────────────────────────────────────
function DeleteConfirm({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onCancel}>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center shrink-0">
                        <Trash2 className="h-4 w-4 text-red-500" />
                    </div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">ลบสถานี</h2>
                </div>
                <p className="text-sm text-slate-500">ต้องการลบสถานี <strong className="text-slate-700 dark:text-slate-300">{name}</strong> ใช่ไหม? ไม่สามารถกู้คืนได้</p>
                <div className="flex gap-2 justify-end">
                    <Button variant="outline" className="rounded-xl h-9 px-4 text-sm" onClick={onCancel}>ยกเลิก</Button>
                    <Button className="rounded-xl h-9 px-5 text-sm bg-red-600 hover:bg-red-700 text-white" onClick={onConfirm}>ลบ</Button>
                </div>
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StationsPage() {
    const router = useRouter();

    const [stations,    setStations]    = useState<Station[]>([]);
    const [templates,   setTemplates]   = useState<StationTemplate[]>([]);
    const [tmplNames,   setTmplNames]   = useState<Record<string, string>>({});
    const [loading,     setLoading]     = useState(true);
    const [loadingTmpl, setLoadingTmpl] = useState(true);

    const [showCreate, setShowCreate] = useState(false);
    const [editing,    setEditing]    = useState<Station | null>(null);
    const [deleting,   setDeleting]   = useState<Station | null>(null);

    const reload = async () => {
        const res = await stationsApi.getAll();
        if (res.success) setStations(res.data);
    };

    useEffect(() => {
        // Clear all legacy localStorage station data
        if (typeof window !== "undefined") {
            localStorage.removeItem("std_stations");
            localStorage.removeItem("std_station_templates");
            localStorage.removeItem("std_station_colors");
        }

        reload().finally(() => setLoading(false));
        getStationTemplates()
            .then((t) => {
                setTemplates(t);
                const names: Record<string, string> = {};
                for (const tmpl of t) names[tmpl._id] = tmpl.name;
                setTmplNames(names);
            })
            .finally(() => setLoadingTmpl(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleCreate = async (data: { name: string; colorId: string; templateId?: string; isLaminateStation?: boolean }) => {
        try {
            await stationsApi.create(data);
            await reload();
            setShowCreate(false);
            toast.success("สร้างสถานีแล้ว");
        } catch (err) {
            toast.error("สร้างสถานีไม่สำเร็จ — " + (err instanceof Error ? err.message : "unknown error"));
        }
    };

    const handleUpdate = async (data: { name: string; colorId: string; templateId?: string; isLaminateStation?: boolean }) => {
        if (!editing) return;
        try {
            await stationsApi.update(editing._id, data);
            await reload();
            setEditing(null);
            toast.success("บันทึกแล้ว");
        } catch (err) {
            toast.error("บันทึกไม่สำเร็จ — " + (err instanceof Error ? err.message : "unknown error"));
        }
    };

    const handleDelete = async () => {
        if (!deleting) return;
        try {
            await stationsApi.delete(deleting._id);
            await reload();
            setDeleting(null);
            toast.success("ลบสถานีแล้ว");
        } catch (err) {
            toast.error("ลบไม่สำเร็จ — " + (err instanceof Error ? err.message : "unknown error"));
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-[1440px] mx-auto w-full">
            <div className="flex flex-col sm:flex-row flex-wrap gap-4 sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">สถานี</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">สถานีการทำงานในกระบวนการผลิต</p>
                </div>
                <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto shrink-0">
                    <Button variant="outline" className="w-full sm:w-auto gap-2 text-xs sm:text-sm rounded-xl h-10 sm:h-11 px-0 sm:px-4 font-bold border-slate-200 dark:border-slate-700" onClick={() => router.push("/stations/designer")}>
                        <Settings2 className="h-4 w-4 shrink-0" />
                        <span className="truncate"><span className="hidden sm:inline">จัดการ </span>Template</span>
                    </Button>
                    <Button className="w-full sm:w-auto gap-2 text-xs sm:text-sm rounded-xl h-10 sm:h-11 px-0 sm:px-5 font-bold bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0" onClick={() => setShowCreate(true)}>
                        <Plus className="h-4 w-4 shrink-0" />
                        <span className="truncate">สร้างสถานี</span>
                    </Button>
                </div>
            </div>

            {/* Empty state */}
            {stations.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 space-y-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800">
                    <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <Factory className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">ยังไม่มีสถานี</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">กด "สร้างสถานี" เพื่อเพิ่มสถานีการทำงาน</p>
                    </div>
                    <Button onClick={() => setShowCreate(true)} className="gap-2 rounded-xl h-9 bg-blue-600 hover:bg-blue-700 text-white text-sm">
                        <Plus className="h-4 w-4" />
                        สร้างสถานีแรก
                    </Button>
                </div>
            )}

            {/* Station grid */}
            {stations.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {stations.map((station) => {
                        const color        = getColorOption(station.colorId);
                        const tmplId       = resolveTemplateId(station.templateId);
                        const templateName = tmplId ? tmplNames[tmplId] : undefined;

                        return (
                            <div key={station._id} className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all p-5 sm:p-6 flex flex-col gap-4 group">
                                {/* Name badge + actions */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-bold px-3 py-1.5 rounded-xl ${color.cls}`}>
                                            {station.name}
                                        </span>
                                        {station.isLaminateStation && (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">LAM</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            type="button"
                                            onClick={() => setEditing({ ...station, colorId: station.colorId ?? "sky" })}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                            title="แก้ไข"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDeleting(station)}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                            title="ลบ"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Template assignment */}
                                <div className="flex-1">
                                    {loadingTmpl ? (
                                        <div className="rounded-xl border border-slate-100 dark:border-slate-800 px-3 py-2 flex items-center gap-1.5">
                                            <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                                            <span className="text-xs text-slate-400 font-medium">กำลังโหลด...</span>
                                        </div>
                                    ) : templateName ? (
                                        <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                            <span className="text-xs text-emerald-700 dark:text-emerald-300 font-bold truncate">{templateName}</span>
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2 text-center">
                                            <span className="text-xs text-slate-400 font-medium">ยังไม่ได้กำหนด template</span>
                                        </div>
                                    )}
                                </div>

                                {/* Enter station button */}
                                <Button
                                    size="sm"
                                    className="w-full h-10 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white shadow-md shadow-blue-500/15 dark:shadow-orange-500/15 border-0 transition-all justify-between px-4 sm:px-5"
                                    disabled={!tmplId}
                                    onClick={() => router.push(`/stations/${station._id}`)}
                                >
                                    <div className="flex items-center gap-2">
                                        <Play className="h-3.5 w-3.5" />
                                        <span>เข้าสถานี</span>
                                    </div>
                                    {tmplId && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
                                </Button>
                            </div>
                        );
                    })}

                    {/* Quick add card */}
                    <button
                        type="button"
                        onClick={() => setShowCreate(true)}
                        className="rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-5 sm:p-6 flex flex-col items-center justify-center gap-3 hover:border-blue-400 dark:hover:border-[#E8601C] hover:bg-blue-50/30 dark:hover:bg-[#E8601C]/5 transition-all min-h-[200px]"
                    >
                        <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800">
                            <Plus className="h-5 w-5 text-slate-400" />
                        </div>
                        <span className="text-sm text-slate-400 font-bold">สร้างสถานีใหม่</span>
                    </button>
                </div>
            )}

            {/* Modals */}
            {showCreate && (
                <StationModal
                    templates={templates}
                    onClose={() => setShowCreate(false)}
                    onSave={handleCreate}
                />
            )}
            {editing && (
                <StationModal
                    initial={editing}
                    templates={templates}
                    onClose={() => setEditing(null)}
                    onSave={handleUpdate}
                />
            )}
            {deleting && (
                <DeleteConfirm
                    name={deleting.name}
                    onConfirm={handleDelete}
                    onCancel={() => setDeleting(null)}
                />
            )}
        </div>
    );
}
