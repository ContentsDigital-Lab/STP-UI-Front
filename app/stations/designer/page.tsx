"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, LayoutTemplate, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
    getStationTemplates,
    createStationTemplate,
    deleteStationTemplate,
} from "@/lib/api/station-templates";
import { StationTemplate } from "@/lib/types/station-designer";

export default function StationDesignerGalleryPage() {
    const router = useRouter();
    const [templates, setTemplates] = useState<StationTemplate[]>([]);
    const [loading,   setLoading]   = useState(true);
    const [creating,  setCreating]  = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [newName,   setNewName]   = useState("");
    const [deleting,  setDeleting]  = useState<string | null>(null);

    useEffect(() => {
        getStationTemplates().then((t) => { setTemplates(t); setLoading(false); }).catch(() => setLoading(false));
    }, []);

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setCreating(true);
        try {
            const tmpl = await createStationTemplate({ name: newName.trim() });
            toast.success("สร้าง template แล้ว");
            router.push(`/stations/designer/${tmpl._id}`);
        } catch {
            toast.error("สร้างไม่สำเร็จ");
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id: string) => {
        setDeleting(id);
        try {
            await deleteStationTemplate(id);
            setTemplates((prev) => prev.filter((t) => t._id !== id));
            toast.success("ลบ template แล้ว");
        } catch {
            toast.error("ลบไม่สำเร็จ");
        } finally {
            setDeleting(null);
        }
    };

    const formatDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <LayoutTemplate className="h-6 w-6 text-primary" />
                        ออกแบบสถานี
                    </h1>
                    <p className="text-sm text-muted-foreground">ออกแบบกระบวนการผลิตแบบลากวาง</p>
                </div>
                <Button onClick={() => setShowCreate(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    สร้าง template ใหม่
                </Button>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-36 rounded-xl border bg-muted/30 animate-pulse" />
                    ))}
                </div>
            ) : templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 space-y-4 border-2 border-dashed rounded-xl">
                    <LayoutTemplate className="h-12 w-12 text-muted-foreground/30" />
                    <div className="text-center">
                        <p className="font-medium text-muted-foreground">ยังไม่มี template</p>
                        <p className="text-sm text-muted-foreground/70">กด "สร้าง template ใหม่" เพื่อเริ่มออกแบบ</p>
                    </div>
                    <Button onClick={() => setShowCreate(true)} variant="outline" className="gap-2">
                        <Plus className="h-4 w-4" />
                        สร้าง template แรก
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {templates.map((tmpl) => (
                        <div key={tmpl._id} className="rounded-xl border bg-card p-4 hover:shadow-md transition-shadow space-y-3">
                            <div className="space-y-1">
                                <h3 className="font-semibold text-foreground truncate">{tmpl.name}</h3>
                                <p className="text-xs text-muted-foreground">{tmpl.uiSchema && typeof tmpl.uiSchema === "object" ? Object.keys(tmpl.uiSchema).length : 0} nodes</p>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                                <Clock className="h-3 w-3" />
                                <span>แก้ไขล่าสุด {formatDate(tmpl.updatedAt)}</span>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    className="flex-1 gap-1.5"
                                    onClick={() => router.push(`/stations/designer/${tmpl._id}`)}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                    เปิดแก้ไข
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                    disabled={deleting === tmpl._id}
                                    onClick={() => handleDelete(tmpl._id)}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create dialog */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
                    <div className="bg-card rounded-xl border shadow-xl w-full max-w-md mx-4 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-lg font-semibold">สร้าง Station Template</h2>
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ชื่อ Template *</label>
                                <input
                                    autoFocus
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="เช่น กระบวนการผลิตกระจกมาตรฐาน"
                                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => { setShowCreate(false); setNewName(""); }}>
                                ยกเลิก
                            </Button>
                            <Button disabled={!newName.trim() || creating} onClick={handleCreate} className="gap-2">
                                <Plus className="h-4 w-4" />
                                {creating ? "กำลังสร้าง..." : "สร้างและเปิด Editor"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
