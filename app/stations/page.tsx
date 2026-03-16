"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Factory, Plus, Play, Pencil, Trash2,
    LayoutTemplate, CheckCircle2, X, Loader2,
    ChevronRight, Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { stationsApi } from "@/lib/api/stations";
import { Station } from "@/lib/api/types";
import { COLOR_OPTIONS, getColorOption } from "@/lib/stations/stations-store";
import { getStationTemplates } from "@/lib/api/station-templates";
import { StationTemplate } from "@/lib/types/station-designer";

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
    onSave:     (data: { name: string; colorId: string; templateId?: string }) => void;
}) {
    const [name,       setName]       = useState(initial?.name       ?? "");
    const [colorId,    setColorId]    = useState(initial?.colorId    ?? "sky");
    const [templateId, setTemplateId] = useState<string>(initial?.templateId ?? "");

    const color    = getColorOption(colorId);
    const isEdit   = Boolean(initial?._id);
    const canSave  = name.trim().length > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div
                className="bg-card rounded-2xl border shadow-xl w-full max-w-md p-6 space-y-5"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">{isEdit ? "แก้ไขสถานี" : "สร้างสถานีใหม่"}</h2>
                    <button type="button" onClick={onClose} className="p-1 rounded text-muted-foreground/40 hover:text-foreground">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Name */}
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ชื่อสถานี *</label>
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="เช่น ตัดกระจก, QC, บรรจุ..."
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                        onKeyDown={(e) => e.key === "Enter" && canSave && onSave({ name: name.trim(), colorId, templateId: templateId || undefined })}
                    />
                    {/* Live preview badge */}
                    {name.trim() && (
                        <span className={`inline-block text-sm font-semibold px-3 py-1.5 rounded-xl mt-1 ${color.cls}`}>
                            {name.trim()}
                        </span>
                    )}
                </div>

                {/* Color */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">สีป้ายชื่อ</label>
                    <ColorPicker value={colorId} onChange={setColorId} />
                </div>

                {/* Template */}
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Template (ไม่บังคับ)</label>
                    <select
                        value={templateId}
                        onChange={(e) => setTemplateId(e.target.value)}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                    >
                        <option value="">— ยังไม่เลือก —</option>
                        {templates.map((t) => (
                            <option key={t._id} value={t._id}>{t.name}</option>
                        ))}
                    </select>
                    {templates.length === 0 && (
                        <p className="text-xs text-muted-foreground/60">ยังไม่มี template — สร้างได้ที่ปุ่ม "จัดการ Template"</p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 justify-end pt-1">
                    <Button variant="outline" size="sm" onClick={onClose}>ยกเลิก</Button>
                    <Button size="sm" disabled={!canSave} onClick={() => onSave({ name: name.trim(), colorId, templateId: templateId || undefined })}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
            <div className="bg-card rounded-2xl border shadow-xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-base font-semibold">ลบสถานี</h2>
                <p className="text-sm text-muted-foreground">ต้องการลบสถานี <strong>{name}</strong> ใช่ไหม? ไม่สามารถกู้คืนได้</p>
                <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={onCancel}>ยกเลิก</Button>
                    <Button size="sm" variant="destructive" onClick={onConfirm}>ลบ</Button>
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
        // Clear legacy localStorage data — stations/templates now live in the backend API
        if (typeof window !== "undefined") {
            localStorage.removeItem("std_stations");
            localStorage.removeItem("std_station_templates");
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
        await stationsApi.create(data);
        await reload();
        setShowCreate(false);
    };

    const handleUpdate = async (data: { name: string; colorId: string; templateId?: string }) => {
        if (!editing) return;
        await stationsApi.update(editing._id, data);
        await reload();
        setEditing(null);
    };

    const handleDelete = async () => {
        if (!deleting) return;
        await stationsApi.delete(deleting._id);
        await reload();
        setDeleting(null);
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Factory className="h-6 w-6 text-primary" />
                        สถานี
                    </h1>
                    <p className="text-sm text-muted-foreground">สถานีการทำงานในกระบวนการผลิต</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="gap-2" onClick={() => router.push("/stations/designer")}>
                        <Settings2 className="h-4 w-4" />
                        จัดการ Template
                    </Button>
                    <Button className="gap-2" onClick={() => setShowCreate(true)}>
                        <Plus className="h-4 w-4" />
                        สร้างสถานี
                    </Button>
                </div>
            </div>

            {/* Empty state */}
            {stations.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 space-y-4 border-2 border-dashed rounded-2xl">
                    <div className="p-4 rounded-2xl bg-muted/50">
                        <Factory className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                    <div className="text-center">
                        <p className="font-semibold text-muted-foreground">ยังไม่มีสถานี</p>
                        <p className="text-sm text-muted-foreground/70 mt-1">กด "สร้างสถานี" เพื่อเพิ่มสถานีการทำงาน</p>
                    </div>
                    <Button onClick={() => setShowCreate(true)} className="gap-2">
                        <Plus className="h-4 w-4" />
                        สร้างสถานีแรก
                    </Button>
                </div>
            )}

            {/* Station grid */}
            {stations.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {stations.map((station) => {
                        const color        = getColorOption(station.colorId);
                        const templateName = station.templateId ? tmplNames[station.templateId] : undefined;

                        return (
                            <div key={station._id} className="rounded-2xl border bg-card p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
                                {/* Name badge + actions */}
                                <div className="flex items-start justify-between gap-2">
                                    <span className={`text-sm font-semibold px-3 py-1.5 rounded-xl ${color.cls}`}>
                                        {station.name}
                                    </span>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setEditing(station)}
                                            className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors"
                                            title="แก้ไข"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDeleting(station)}
                                            className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                            title="ลบ"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Template assignment */}
                                <div className="flex-1">
                                    {loadingTmpl ? (
                                        <div className="rounded-lg border border-muted/40 px-3 py-1.5 flex items-center gap-1.5">
                                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40" />
                                            <span className="text-xs text-muted-foreground/40">กำลังโหลด...</span>
                                        </div>
                                    ) : templateName ? (
                                        <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5">
                                            <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                                            <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium truncate">{templateName}</span>
                                        </div>
                                    ) : (
                                        <div className="rounded-lg border border-dashed border-muted-foreground/25 px-3 py-1.5 text-center">
                                            <span className="text-xs text-muted-foreground/50">ยังไม่ได้กำหนด template</span>
                                        </div>
                                    )}
                                </div>

                                {/* Enter station button */}
                                <Button
                                    size="sm"
                                    className="w-full h-9 gap-1.5 text-xs"
                                    disabled={!station.templateId}
                                    onClick={() => router.push(`/stations/${station._id}`)}
                                >
                                    <Play className="h-3.5 w-3.5" />
                                    เข้าสถานี
                                    {station.templateId && <ChevronRight className="h-3 w-3" />}
                                </Button>
                            </div>
                        );
                    })}

                    {/* Quick add card */}
                    <button
                        type="button"
                        onClick={() => setShowCreate(true)}
                        className="rounded-2xl border-2 border-dashed border-muted-foreground/20 p-5 flex flex-col items-center justify-center gap-2 hover:border-primary/40 hover:bg-primary/5 transition-all min-h-[180px]"
                    >
                        <div className="p-2.5 rounded-xl bg-muted/60">
                            <Plus className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                        <span className="text-sm text-muted-foreground/60 font-medium">สร้างสถานีใหม่</span>
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
