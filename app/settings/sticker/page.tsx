"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Plus, Tag, Clock, Pencil, Trash2, Search, ArrowLeft, Copy, Loader2 } from "lucide-react";
import type { StickerElement } from "./types";

const StickerThumbnail = dynamic(() => import("./StickerThumbnail"), {
    ssr: false,
    loading: () => <div className="w-full bg-muted/40 rounded-lg animate-pulse" style={{ minHeight: 120 }} />,
});
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Pagination, PaginationContent, PaginationEllipsis,
    PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { toast } from "sonner";
import { useWebSocket } from "@/lib/hooks/use-socket";
import {
    getStickerTemplates,
    getStickerTemplate,
    createStickerTemplate,
    deleteStickerTemplate,
    StickerTemplateRecord,
} from "@/lib/api/sticker-templates";

const ITEMS_PER_PAGE = 9;

// ── Skeletons ─────────────────────────────────────────────────────────────────
function SkeletonCard() {
    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex gap-2 pt-1">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 w-8" />
            </div>
        </div>
    );
}

// ── Template card ─────────────────────────────────────────────────────────────
function TemplateCard({ tmpl, assignedGroup, isDeleting, onEdit, onDelete, onDuplicate }: {
    tmpl: StickerTemplateRecord;
    assignedGroup?: "laminate" | "standard" | null;
    isDeleting: boolean;
    onEdit: (id: string) => void;
    onDelete: (tmpl: StickerTemplateRecord) => void;
    onDuplicate: (id: string) => void;
}) {
    const fmtDate = (d: string) =>
        new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden hover:shadow-md transition-shadow group cursor-pointer relative" onClick={() => onEdit(tmpl._id)}>
            {/* Status Badges */}
            {assignedGroup && (
                <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
                    {assignedGroup === "laminate" && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500 text-white shadow-sm flex items-center gap-1">
                            <Layers className="h-3 w-3" />
                            เทมเพลต 1 (ลามิเนต / อินซูเลท)
                        </span>
                    )}
                    {assignedGroup === "standard" && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-600 text-white shadow-sm flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            เทมเพลต 2 (เทมเปอร์ / ตัดธรรมดา)
                        </span>
                    )}
                </div>
            )}

            {/* Thumbnail preview */}
            <div className={`p-3 pb-2 ${assignedGroup ? 'pt-8' : ''}`}>
                <StickerThumbnail
                    widthMm={tmpl.width}
                    heightMm={tmpl.height}
                    elements={(tmpl.elements ?? []) as StickerElement[]}
                    maxW={160}
                    maxH={90}
                />
            </div>

            {/* Info + actions */}
            <div className="px-4 pb-4 space-y-2">
                <div className="space-y-0.5">
                    <h3 className="font-semibold text-slate-900 dark:text-white truncate text-sm">
                        {tmpl.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{tmpl.width} × {tmpl.height} mm</p>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                    <Clock className="h-3 w-3" />
                    <span>แก้ไขล่าสุด {fmtDate(tmpl.updatedAt)}</span>
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" className="flex-1 gap-1.5 rounded-xl h-8 bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white text-xs font-bold shadow-sm border-0" onClick={() => onEdit(tmpl._id)}>
                        <Pencil className="h-3.5 w-3.5" />
                        เปิดแก้ไข
                    </Button>
                    <Button
                        size="sm" variant="outline"
                        className="h-8 w-8 p-0 rounded-lg border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                        onClick={() => onDuplicate(tmpl._id)}
                        title="คัดลอก template"
                    >
                        <Copy className="h-3.5 w-3.5 text-blue-500" />
                    </Button>
                    <Button
                        size="sm" variant="outline"
                        className="h-8 w-8 p-0 rounded-lg border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950 hover:border-red-200 dark:hover:border-red-900 transition-colors"
                        disabled={isDeleting}
                        onClick={() => onDelete(tmpl)}
                        title="ลบ template"
                    >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Layers, Settings2, Sparkles, CheckCircle2 } from "lucide-react";
import {
    getStickerMapping,
    fetchStickerMapping,
    saveStickerMapping,
    type StickerMappingSettings,
} from "@/lib/sticker-settings";

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StickerGalleryPage() {
    const router = useRouter();

    const [templates, setTemplates] = useState<StickerTemplateRecord[]>([]);
    const [loading,   setLoading]   = useState(true);
    const [templateToDelete, setTemplateToDelete] = useState<StickerTemplateRecord | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [creating,  setCreating]  = useState(false);

    const [search, setSearch] = useState("");
    const [page,   setPage]   = useState(1);

    // Default template mapping
    const [mapping, setMapping] = useState<StickerMappingSettings>(() => getStickerMapping());

    useEffect(() => {
        fetchStickerMapping().then((m) => {
            if (m) setMapping(m);
        });
    }, []);

    const handleUpdateMapping = async (field: keyof StickerMappingSettings, val: string | null) => {
        const cleanVal = val === "__none__" || !val ? "" : val;
        const next = { ...mapping, [field]: cleanVal };
        setMapping(next);
        await saveStickerMapping(next);
        const label = field === "laminateTemplateId" ? "กลุ่มงานลามิเนต/อินซูเลท (เทมเพลต 1)" : "กลุ่มงานเทมเปอร์/ตัดธรรมดา (เทมเพลต 2)";
        if (!cleanVal) {
            toast.info(`ยกเลิกการผูกแม่แบบสำหรับ ${label} แล้ว (ใช้แบบเริ่มต้นปกติ)`);
        } else {
            const tmplName = templates.find(t => t._id === cleanVal)?.name || "แม่แบบที่เลือก";
            toast.success(`บันทึกแม่แบบเริ่มต้นสำหรับ ${label} เป็น "${tmplName}" แล้ว`);
        }
    };

    // Create dialog
    const [showCreate, setShowCreate] = useState(false);
    const [newName,    setNewName]    = useState("");
    const [newW,       setNewW]       = useState(80);
    const [newH,       setNewH]       = useState(50);

    const fetchTemplates = () => {
        getStickerTemplates(1, 100)
            .then((list) => { setTemplates(list); setLoading(false); })
            .catch(() => setLoading(false));
    };

    const fetchAllData = () => {
        fetchTemplates();
        fetchStickerMapping().then((m) => {
            if (m) setMapping(m);
        });
    };

    useEffect(() => { fetchTemplates(); }, []);

    // Real-time updates via WebSocket
    useWebSocket(
        "sticker-template",
        ["sticker-template:created", "sticker-template:updated", "sticker-template:deleted", "sticker-settings:updated"],
        () => { fetchAllData(); },
    );

    useEffect(() => { setPage(1); }, [search]);

    const filtered = useMemo(
        () => templates.filter((t) => t.name.toLowerCase().includes(search.toLowerCase())),
        [templates, search]
    );

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

    const pageNumbers = useMemo(() => {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
        const pages: (number | "…")[] = [1];
        if (page > 3) pages.push("…");
        for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) pages.push(p);
        if (page < totalPages - 2) pages.push("…");
        pages.push(totalPages);
        return pages;
    }, [page, totalPages]);

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setCreating(true);
        try {
            const tmpl = await createStickerTemplate({
                name: newName.trim(),
                width: newW,
                height: newH,
                elements: [],
            });
            toast.success("สร้าง template แล้ว");
            router.push(`/settings/sticker/${tmpl._id}`);
        } catch {
            toast.error("สร้างไม่สำเร็จ");
            setCreating(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!templateToDelete) return;
        setIsDeleting(true);
        try {
            await deleteStickerTemplate(templateToDelete._id);
            setTemplates((prev) => prev.filter((t) => t._id !== templateToDelete._id));
            toast.success("ลบ template สำเร็จ");
            setTemplateToDelete(null);
        } catch {
            toast.error("ลบไม่สำเร็จ");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleDuplicate = async (id: string) => {
        try {
            const original = await getStickerTemplate(id);
            if (!original) { toast.error("ไม่พบ template"); return; }
            await createStickerTemplate({
                name: `${original.name} (สำเนา)`,
                width: original.width,
                height: original.height,
                elements: original.elements,
            });
            toast.success("คัดลอก template แล้ว");
            fetchTemplates();
        } catch {
            toast.error("คัดลอกไม่สำเร็จ");
        }
    };

    const handleEdit = (id: string) => router.push(`/settings/sticker/${id}`);

    const getLaminateDisplayText = () => {
        if (!mapping.laminateTemplateId || mapping.laminateTemplateId === "__none__") {
            return <span className="text-slate-400 italic">-- ไม่เลือก (ใช้แบบเริ่มต้นปกติ) --</span>;
        }
        const tmpl = templates.find(t => t._id === mapping.laminateTemplateId);
        if (!tmpl) return <span className="text-slate-400 italic">-- ไม่เลือก (ใช้แบบเริ่มต้นปกติ) --</span>;
        return (
            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                {tmpl.name} ({tmpl.width}×{tmpl.height}mm)
            </span>
        );
    };

    const getStandardDisplayText = () => {
        if (!mapping.standardTemplateId || mapping.standardTemplateId === "__none__") {
            return <span className="text-slate-400 italic">-- ไม่เลือก (ใช้แบบเริ่มต้นปกติ) --</span>;
        }
        const tmpl = templates.find(t => t._id === mapping.standardTemplateId);
        if (!tmpl) return <span className="text-slate-400 italic">-- ไม่เลือก (ใช้แบบเริ่มต้นปกติ) --</span>;
        return (
            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                {tmpl.name} ({tmpl.width}×{tmpl.height}mm)
            </span>
        );
    };

    return (
        <PermissionGuard permission="stickers:manage">
            <div className="space-y-6 max-w-[1440px] mx-auto w-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={() => router.back()}
                        className="h-9 w-9 rounded-full flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                    </button>
                    <div className="space-y-0.5 min-w-0">
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white truncate">ออกแบบสติ๊กเกอร์</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">จัดการ template สติ๊กเกอร์ QR สำหรับพิมพ์ติดออเดอร์</p>
                    </div>
                </div>
                <Button onClick={() => setShowCreate(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white font-bold rounded-xl h-10 px-5 text-sm shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0 w-full sm:w-auto shrink-0">
                    <Plus className="h-4 w-4" />
                    สร้าง template ใหม่
                </Button>
            </div>

            {/* Filter */}
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="relative flex-1 space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                        <Search className="h-3 w-3" />
                        ค้นหา
                    </label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="ค้นหา template..."
                            className="w-full pl-9 pr-3 h-10 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-orange-500/40 transition-shadow"
                        />
                    </div>
                </div>
            </div>

            {/* Default Template Mapping Settings (กลุ่มงานลามิเนต vs เทมเปอร์/ตัดธรรมดา) */}
            <div className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900/60 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <Settings2 className="h-4 w-4" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            ตั้งค่าแม่แบบเริ่มต้นประจำกลุ่มงาน
                            <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                                Auto-assign Template
                            </span>
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            ระบบจะเลือกแม่แบบสติกเกอร์ที่ผูกไว้ให้โดยอัตโนมัติตามประเภทงานของแผ่นกระจก
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    {/* กล่อง 1: กลุ่มงานลามิเนต / อินซูเลท */}
                    <div className="p-4 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
                                    <Layers className="h-4 w-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                        เทมเพลตของกลุ่มงานลามิเนต / อินซูเลท
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                            เทมเพลตที่ 1
                                        </span>
                                    </h3>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        มีสูตรชั้นฟิล์ม PVB/AIR และแถบด้านข้าง
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <Select
                                value={mapping.laminateTemplateId || "__none__"}
                                onValueChange={(val) => handleUpdateMapping("laminateTemplateId", val)}
                            >
                                <SelectTrigger className="w-full h-9 text-xs bg-slate-50/70 dark:bg-slate-900/70 border-slate-200 dark:border-slate-700 justify-between">
                                    {getLaminateDisplayText()}
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__" className="text-xs text-slate-500 italic">
                                        -- ไม่เลือก (ใช้แบบเริ่มต้นปกติ) --
                                    </SelectItem>
                                    {templates
                                        .filter((t) => t._id !== mapping.standardTemplateId)
                                        .map((t) => (
                                            <SelectItem key={t._id} value={t._id} className="text-xs">
                                                <span>
                                                    {t.name} ({t.width}×{t.height}mm)
                                                </span>
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* กล่อง 2: กลุ่มงานเทมเปอร์ / ตัดธรรมดา */}
                    <div className="p-4 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                    <Tag className="h-4 w-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                        เทมเพลตของกลุ่มงานเทมเปอร์ / ตัดธรรมดา
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                            เทมเพลตที่ 2
                                        </span>
                                    </h3>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        งานกระจกเดี่ยวทั่วไป
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <Select
                                value={mapping.standardTemplateId || "__none__"}
                                onValueChange={(val) => handleUpdateMapping("standardTemplateId", val)}
                            >
                                <SelectTrigger className="w-full h-9 text-xs bg-slate-50/70 dark:bg-slate-900/70 border-slate-200 dark:border-slate-700 justify-between">
                                    {getStandardDisplayText()}
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__" className="text-xs text-slate-500 italic">
                                        -- ไม่เลือก (ใช้แบบเริ่มต้นปกติ) --
                                    </SelectItem>
                                    {templates
                                        .filter((t) => t._id !== mapping.laminateTemplateId)
                                        .map((t) => (
                                            <SelectItem key={t._id} value={t._id} className="text-xs">
                                                <span>
                                                    {t.name} ({t.width}×{t.height}mm)
                                                </span>
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center py-20 space-y-4">
                    <div className="h-14 w-14 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <Tag className="h-7 w-7 text-slate-400 dark:text-slate-500" />
                    </div>
                    <div className="text-center">
                        {search ? (
                            <>
                                <p className="font-medium text-slate-600 dark:text-slate-300">ไม่พบ template "{search}"</p>
                                <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">ลองค้นหาด้วยคำอื่น</p>
                            </>
                        ) : (
                            <>
                                <p className="font-medium text-slate-600 dark:text-slate-300">ยังไม่มี template</p>
                                <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">กด "สร้าง template ใหม่" เพื่อเริ่มออกแบบ</p>
                            </>
                        )}
                    </div>
                    {!search && (
                        <Button onClick={() => setShowCreate(true)} variant="outline" className="gap-2 rounded-xl h-10 border-slate-200 dark:border-slate-700">
                            <Plus className="h-4 w-4" />
                            สร้าง template แรก
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {paginated.map((tmpl) => {
                        const isLam = mapping.laminateTemplateId === tmpl._id;
                        const isStd = mapping.standardTemplateId === tmpl._id;
                        return (
                            <TemplateCard
                                key={tmpl._id}
                                tmpl={tmpl}
                                assignedGroup={isLam ? "laminate" : isStd ? "standard" : null}
                                isDeleting={isDeleting && templateToDelete?._id === tmpl._id}
                                onEdit={handleEdit}
                                onDelete={(t) => setTemplateToDelete(t)}
                                onDuplicate={handleDuplicate}
                            />
                        );
                    })}
                </div>
            )}

            {/* Pagination */}
            {!loading && filtered.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-muted-foreground">
                        แสดง {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} จาก {filtered.length} templates
                    </p>
                    <Pagination className="w-auto mx-0">
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious text="ก่อนหน้า" onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    aria-disabled={page === 1} className={page === 1 ? "pointer-events-none opacity-40" : "cursor-pointer"} />
                            </PaginationItem>
                            {pageNumbers.map((p, i) =>
                                p === "…" ? (
                                    <PaginationItem key={`e-${i}`}><PaginationEllipsis /></PaginationItem>
                                ) : (
                                    <PaginationItem key={p}>
                                        <PaginationLink isActive={p === page} onClick={() => setPage(p as number)} className="cursor-pointer">{p}</PaginationLink>
                                    </PaginationItem>
                                )
                            )}
                            <PaginationItem>
                                <PaginationNext text="ถัดไป" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    aria-disabled={page === totalPages} className={page === totalPages ? "pointer-events-none opacity-40" : "cursor-pointer"} />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!templateToDelete} onOpenChange={(open) => !open && !isDeleting && setTemplateToDelete(null)}>
                <DialogContent className="sm:max-w-sm rounded-2xl border-slate-200 dark:border-slate-800 p-0 bg-white dark:bg-slate-950 overflow-hidden shadow-2xl">
                    <div className="px-6 pt-6 pb-4">
                        <DialogHeader className="items-center text-center">
                            <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center text-red-500">
                                <Trash2 className="h-6 w-6" />
                            </div>
                            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">
                                ยืนยันการลบ Template
                            </DialogTitle>
                            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 text-center leading-relaxed">
                                ต้องการลบ template <span className="font-semibold text-slate-800 dark:text-slate-200">"{templateToDelete?.name}"</span> ใช่หรือไม่?
                                <span className="text-xs text-red-500/90 dark:text-red-400 mt-1 block">การกระทำนี้ไม่สามารถย้อนกลับได้</span>
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-3">
                        <Button
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            variant="destructive"
                            className="gap-2 bg-red-600 hover:bg-red-700 text-white rounded-xl h-10 px-5 text-sm font-bold shadow-lg shadow-red-500/20"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    กำลังลบ...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="h-4 w-4" />
                                    ลบ Template
                                </>
                            )}
                        </Button>
                        <Button
                            variant="outline"
                            className="rounded-xl h-10 text-sm text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white border-slate-200 dark:border-slate-700 px-5 font-medium"
                            onClick={() => setTemplateToDelete(null)}
                            disabled={isDeleting}
                        >
                            ยกเลิก
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Create dialog */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
                    <div className="bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">สร้าง Sticker Template</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">กำหนดชื่อและขนาดสติ๊กเกอร์</p>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">ชื่อ Template <span className="text-red-400">*</span></label>
                                <input
                                    autoFocus
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="เช่น สติ๊กเกอร์ออเดอร์มาตรฐาน"
                                    className="w-full h-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-orange-500/40"
                                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">กว้าง (mm)</label>
                                    <input
                                        type="number" min={10} max={300}
                                        value={newW}
                                        onChange={(e) => setNewW(Number(e.target.value))}
                                        className="w-full h-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-orange-500/40"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">สูง (mm)</label>
                                    <input
                                        type="number" min={10} max={300}
                                        value={newH}
                                        onChange={(e) => setNewH(Number(e.target.value))}
                                        className="w-full h-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-orange-500/40"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                            <Button variant="ghost" className="rounded-xl h-10 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white px-4" onClick={() => { setShowCreate(false); setNewName(""); }}>
                                ยกเลิก
                            </Button>
                            <Button
                                disabled={!newName.trim() || creating}
                                onClick={handleCreate}
                                className="gap-2 rounded-xl h-10 min-w-[160px] bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white text-sm font-bold shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0"
                            >
                                <Plus className="h-4 w-4" />
                                {creating ? "กำลังสร้าง..." : "สร้างและเปิด Editor"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        </PermissionGuard>
    );
}
