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
        <div className="flex flex-wrap gap-2.5 sm:gap-2">
            {COLOR_OPTIONS.map((c) => (
                <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    onClick={() => onChange(c.id)}
                    className={`w-10 h-10 sm:w-7 sm:h-7 rounded-full border-2 transition-all ${
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
    onSave:     (data: { name: string; colorId: string; templateId?: string }) => void;
}) {
    const [name,       setName]       = useState(initial?.name       ?? "");
    const [colorId,    setColorId]    = useState(initial?.colorId    ?? "sky");
    const [templateId, setTemplateId] = useState<string>(resolveTemplateId(initial?.templateId));

    const color    = getColorOption(colorId);
    const isEdit   = Boolean(initial?._id);
    // templateId is required by the backend DB — always required on create
    const canSave  = name.trim().length > 0 && (isEdit || templateId.length > 0);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg w-full sm:max-w-md p-6 space-y-5 sm:space-y-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-lg sm:text-base font-bold sm:font-semibold text-slate-900 dark:text-white">{isEdit ? "แก้ไขสถานี" : "สร้างสถานีใหม่"}</h2>
                    <button type="button" onClick={onClose} className="h-10 w-10 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 transition-colors">
                        <X className="h-5 w-5 sm:h-4 sm:w-4" />
                    </button>
                </div>

                <div className="space-y-1.5">
                    <label className="text-base sm:text-sm font-medium text-slate-700 dark:text-slate-300">ชื่อสถานี <span className="text-red-400">*</span></label>
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="เช่น ตัดกระจก, QC, บรรจุ..."
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 sm:px-3 sm:py-2 text-base sm:text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
                        onKeyDown={(e) => e.key === "Enter" && canSave && onSave({ name: name.trim(), colorId, templateId: templateId || undefined })}
                    />
                    {name.trim() && (
                        <span className={`inline-block text-sm font-semibold px-2.5 py-1 rounded-lg mt-1 ${color.cls}`}>
                            {name.trim()}
                        </span>
                    )}
                </div>

                <div className="space-y-2">
                    <label className="text-base sm:text-sm font-medium text-slate-700 dark:text-slate-300">สีป้ายชื่อ</label>
                    <ColorPicker value={colorId} onChange={setColorId} />
                </div>

                <div className="space-y-1.5">
                    <label className="text-base sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                        Template {!isEdit && <span className="text-red-400">*</span>}
                    </label>
                    <select
                        value={templateId}
                        onChange={(e) => setTemplateId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 sm:px-3 sm:py-2 text-base sm:text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
                    >
                        <option value="">— เลือก template —</option>
                        {templates.map((t) => (
                            <option key={t._id} value={t._id}>{t.name}</option>
                        ))}
                    </select>
                    {templates.length === 0 ? (
                        <p className="text-sm sm:text-xs text-slate-400">ยังไม่มี template — สร้างได้ที่ปุ่ม &quot;จัดการ Template&quot;</p>
                    ) : !isEdit && !templateId && (
                        <p className="text-sm sm:text-xs text-amber-600">กรุณาเลือก template ก่อนสร้างสถานี</p>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2">
                    <Button variant="outline" className="rounded-xl h-12 sm:h-auto sm:rounded-xl text-base sm:text-sm order-2 sm:order-1" size="sm" onClick={onClose}>ยกเลิก</Button>
                    <Button className="rounded-xl h-12 sm:h-auto sm:rounded-xl text-base sm:text-sm bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold sm:font-medium order-1 sm:order-2" size="sm" disabled={!canSave} onClick={() => onSave({ name: name.trim(), colorId, templateId: templateId || undefined })}>
                        <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5 mr-1" />
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4" onClick={onCancel}>
            <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg w-full sm:max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-col items-center gap-2 text-center">
                    <div className="h-12 w-12 sm:h-9 sm:w-9 rounded-xl sm:rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                        <Trash2 className="h-6 w-6 sm:h-4 sm:w-4 text-red-500" />
                    </div>
                    <h2 className="text-lg sm:text-base font-bold sm:font-semibold text-slate-900 dark:text-white">ลบสถานี</h2>
                    <p className="text-base sm:text-sm text-slate-500">ต้องการลบสถานี <strong className="text-slate-700 dark:text-slate-300">{name}</strong> ใช่ไหม? ไม่สามารถกู้คืนได้</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                    <Button variant="outline" size="sm" className="rounded-xl h-12 sm:h-auto text-base sm:text-sm order-2 sm:order-1" onClick={onCancel}>ยกเลิก</Button>
                    <Button size="sm" className="rounded-xl h-12 sm:h-auto text-base sm:text-sm bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold sm:font-medium order-1 sm:order-2" onClick={onConfirm}>ลบสถานี</Button>
                </div>
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
/** colorId is UI-only state; production backend has no colorId field — store in localStorage */
const COLOR_STORAGE_KEY = "std_station_colors";

function loadColorMap(): Record<string, string> {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}"); } catch { return {}; }
}
function saveColorMap(map: Record<string, string>) {
    if (typeof window === "undefined") return;
    localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(map));
}

export default function StationsPage() {
    const router = useRouter();

    const [stations,    setStations]    = useState<Station[]>([]);
    const [templates,   setTemplates]   = useState<StationTemplate[]>([]);
    const [tmplNames,   setTmplNames]   = useState<Record<string, string>>({});
    const [colorMap,    setColorMap]    = useState<Record<string, string>>({});
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
        // Clear legacy localStorage data — stations/templates now live in the backend API
        if (typeof window !== "undefined") {
            localStorage.removeItem("std_stations");
            localStorage.removeItem("std_station_templates");
            setColorMap(loadColorMap());
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

    const handleCreate = async (data: { name: string; colorId: string; templateId?: string }) => {
        try {
            const res = await stationsApi.create(data);
            if (res.success && res.data?._id) {
                const newMap = { ...loadColorMap(), [res.data._id]: data.colorId };
                saveColorMap(newMap);
                setColorMap(newMap);
            }
            await reload();
            setShowCreate(false);
            toast.success("สร้างสถานีแล้ว");
        } catch (err) {
            toast.error("สร้างสถานีไม่สำเร็จ — " + (err instanceof Error ? err.message : "unknown error"));
        }
    };

    const handleUpdate = async (data: { name: string; colorId: string; templateId?: string }) => {
        if (!editing) return;
        try {
            await stationsApi.update(editing._id, data);
            const newMap = { ...loadColorMap(), [editing._id]: data.colorId };
            saveColorMap(newMap);
            setColorMap(newMap);
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
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">สถานี</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">สถานีการทำงานในกระบวนการผลิต</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="gap-2 text-sm rounded-xl h-12 sm:h-10" onClick={() => router.push("/stations/designer")}>
                        <Settings2 className="h-4 w-4" />
                        <span className="hidden sm:inline">จัดการ</span> Template
                    </Button>
                    <Button className="gap-2 text-sm rounded-xl h-12 sm:h-10 bg-blue-600 hover:bg-blue-700 text-white font-semibold" onClick={() => setShowCreate(true)}>
                        <Plus className="h-4 w-4" />
                        สร้างสถานี
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
                        <p className="text-base sm:text-sm font-medium text-slate-500 dark:text-slate-400">ยังไม่มีสถานี</p>
                        <p className="text-sm sm:text-xs text-slate-400 dark:text-slate-500 mt-0.5">กด &quot;สร้างสถานี&quot; เพื่อเพิ่มสถานีการทำงาน</p>
                    </div>
                    <Button onClick={() => setShowCreate(true)} className="gap-2 rounded-xl h-12 sm:h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white text-base sm:text-sm font-bold">
                        <Plus className="h-4 w-4" />
                        สร้างสถานีแรก
                    </Button>
                </div>
            )}

            {/* Station grid */}
            {stations.length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {stations.map((station) => {
                        const color        = getColorOption(colorMap[station._id] ?? station.colorId);
                        const tmplId       = resolveTemplateId(station.templateId);
                        const templateName = tmplId ? tmplNames[tmplId] : undefined;

                        return (
                            <div key={station._id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 overflow-hidden flex flex-col group sm:hover:border-slate-300 dark:sm:hover:border-slate-700 transition-colors">
                                {/* Color bar — visible on mobile for quick identification */}
                                <div className="h-1.5 sm:h-1" style={{ backgroundColor: color.swatch }} />

                                <div className="p-4 flex flex-col gap-3 flex-1">
                                    {/* Station info + actions */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-3 sm:gap-2 min-w-0">
                                            {/* Large icon on mobile, badge on desktop */}
                                            <div className={`h-11 w-11 sm:hidden rounded-xl flex items-center justify-center shrink-0 ${color.cls}`}>
                                                <Factory className="h-5 w-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-[17px] leading-tight sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                                                    {station.name}
                                                </h3>
                                                {/* Desktop: color badge */}
                                                <span className={`hidden sm:inline-block text-xs font-semibold px-2 py-0.5 rounded-md mt-0.5 ${color.cls}`}>
                                                    {station.name}
                                                </span>
                                                {/* Template info */}
                                                {loadingTmpl ? (
                                                    <div className="flex items-center gap-1 mt-0.5 text-sm sm:text-xs text-slate-400">
                                                        <Loader2 className="h-3 w-3 animate-spin" /> กำลังโหลด...
                                                    </div>
                                                ) : templateName ? (
                                                    <div className="flex items-center gap-1 mt-0.5">
                                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                                        <span className="text-sm sm:text-xs text-slate-500 dark:text-slate-400 font-medium truncate">{templateName}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm sm:text-xs text-slate-400 italic mt-0.5 block">ยังไม่มี template</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions — always visible on mobile, hover on desktop */}
                                        <div className="flex items-center gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            <button
                                                type="button"
                                                onClick={() => setEditing({ ...station, colorId: colorMap[station._id] ?? station.colorId ?? "sky" })}
                                                className="h-10 w-10 sm:h-7 sm:w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 transition-colors"
                                                title="แก้ไข"
                                            >
                                                <Pencil className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeleting(station)}
                                                className="h-10 w-10 sm:h-7 sm:w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 active:bg-red-100 transition-colors"
                                                title="ลบ"
                                            >
                                                <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Enter station — big on mobile, normal on desktop */}
                                    <Button
                                        className="w-full h-14 sm:h-9 gap-2 text-base sm:text-xs rounded-xl sm:rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold sm:font-medium"
                                        disabled={!tmplId}
                                        onClick={() => router.push(`/stations/${station._id}`)}
                                    >
                                        <Play className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
                                        เข้าสถานี
                                        <ChevronRight className="h-5 w-5 sm:h-3 sm:w-3 ml-auto" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}

                    {/* Quick add card */}
                    <button
                        type="button"
                        onClick={() => setShowCreate(true)}
                        className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 flex flex-col items-center justify-center gap-2 hover:border-blue-300 dark:hover:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-500/5 active:bg-blue-50 transition-all min-h-[160px]"
                    >
                        <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <Plus className="h-4 w-4 text-slate-400" />
                        </div>
                        <span className="text-sm text-slate-400 font-medium">สร้างสถานีใหม่</span>
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
