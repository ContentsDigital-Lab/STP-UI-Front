"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Plus, Tag, Clock, Pencil, Trash2, Search, ArrowLeft, Copy } from "lucide-react";
import type { StickerElement } from "./types";

const StickerThumbnail = dynamic(() => import("./StickerThumbnail"), {
    ssr: false,
    loading: () => <div className="w-full bg-muted/40 rounded-lg animate-pulse" style={{ minHeight: 120 }} />,
});
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
function TemplateCard({ tmpl, deleting, onEdit, onDelete, onDuplicate }: {
    tmpl: StickerTemplateRecord;
    deleting: string | null;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
}) {
    const fmtDate = (d: string) =>
        new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden hover:shadow-md transition-shadow group cursor-pointer" onClick={() => onEdit(tmpl._id)}>
            {/* Thumbnail preview */}
            <div className="p-3 pb-2">
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
                    <h3 className="font-semibold text-slate-900 dark:text-white truncate text-sm">{tmpl.name}</h3>
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
                        className="h-8 w-8 p-0 rounded-lg border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950"
                        disabled={deleting === tmpl._id}
                        onClick={() => onDelete(tmpl._id)}
                    >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StickerGalleryPage() {
    const router = useRouter();

    const [templates, setTemplates] = useState<StickerTemplateRecord[]>([]);
    const [loading,   setLoading]   = useState(true);
    const [deleting,  setDeleting]  = useState<string | null>(null);
    const [creating,  setCreating]  = useState(false);

    const [search, setSearch] = useState("");
    const [page,   setPage]   = useState(1);

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

    useEffect(() => { fetchTemplates(); }, []);

    // Real-time updates via WebSocket
    useWebSocket(
        "sticker-template",
        ["sticker-template:created", "sticker-template:updated", "sticker-template:deleted"],
        () => { fetchTemplates(); },
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

    const handleDelete = async (id: string) => {
        setDeleting(id);
        try {
            await deleteStickerTemplate(id);
            setTemplates((prev) => prev.filter((t) => t._id !== id));
            toast.success("ลบ template แล้ว");
        } catch {
            toast.error("ลบไม่สำเร็จ");
        } finally {
            setDeleting(null);
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

    return (
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
                    {paginated.map((tmpl) => (
                        <TemplateCard key={tmpl._id} tmpl={tmpl} deleting={deleting} onEdit={handleEdit} onDelete={handleDelete} onDuplicate={handleDuplicate} />
                    ))}
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
    );
}
