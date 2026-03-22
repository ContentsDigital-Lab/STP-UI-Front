"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
    Plus, Pencil, Trash2, LayoutTemplate, Clock,
    LayoutGrid, List, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Pagination, PaginationContent, PaginationEllipsis,
    PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { toast } from "sonner";
import {
    getStationTemplates,
    createStationTemplate,
    deleteStationTemplate,
} from "@/lib/api/station-templates";
import { StationTemplate } from "@/lib/types/station-designer";

const ITEMS_PER_PAGE = 9;

// ── Skeleton card ──────────────────────────────────────────────────────────────
function SkeletonCard() {
    return (
        <div className="rounded-xl border bg-card p-4 space-y-3">
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

// ── Skeleton row ───────────────────────────────────────────────────────────────
function SkeletonRow() {
    return (
        <div className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-28 ml-auto" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-8" />
        </div>
    );
}

// ── Template card ──────────────────────────────────────────────────────────────
function TemplateCard({
    tmpl, deleting, onEdit, onDelete,
}: {
    tmpl: StationTemplate;
    deleting: string | null;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const nodeCount =
        tmpl.uiSchema && typeof tmpl.uiSchema === "object"
            ? Object.keys(tmpl.uiSchema).length
            : 0;
    const formatDate = (d: string) =>
        new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

    return (
        <div className="rounded-xl border bg-card p-4 hover:shadow-md transition-shadow space-y-3">
            <div className="space-y-1">
                <h3 className="font-semibold text-foreground truncate">{tmpl.name}</h3>
                <p className="text-xs text-muted-foreground">{nodeCount} nodes</p>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                <Clock className="h-3 w-3" />
                <span>แก้ไขล่าสุด {formatDate(tmpl.updatedAt)}</span>
            </div>
            <div className="flex gap-2">
                <Button size="sm" className="flex-1 gap-1.5" onClick={() => onEdit(tmpl._id)}>
                    <Pencil className="h-3.5 w-3.5" />
                    เปิดแก้ไข
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                    disabled={deleting === tmpl._id}
                    onClick={() => onDelete(tmpl._id)}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
}

// ── Template row ───────────────────────────────────────────────────────────────
function TemplateRow({
    tmpl, deleting, onEdit, onDelete,
}: {
    tmpl: StationTemplate;
    deleting: string | null;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const nodeCount =
        tmpl.uiSchema && typeof tmpl.uiSchema === "object"
            ? Object.keys(tmpl.uiSchema).length
            : 0;
    const formatDate = (d: string) =>
        new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

    return (
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 hover:shadow-sm transition-shadow">
            <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{tmpl.name}</p>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">{nodeCount} nodes</span>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground/70 whitespace-nowrap">
                <Clock className="h-3 w-3" />
                <span>{formatDate(tmpl.updatedAt)}</span>
            </div>
            <Button size="sm" className="gap-1.5 shrink-0" onClick={() => onEdit(tmpl._id)}>
                <Pencil className="h-3.5 w-3.5" />
                เปิดแก้ไข
            </Button>
            <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                disabled={deleting === tmpl._id}
                onClick={() => onDelete(tmpl._id)}
            >
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function StationDesignerGalleryPage() {
    const router = useRouter();
    const [templates, setTemplates] = useState<StationTemplate[]>([]);
    const [loading,   setLoading]   = useState(true);
    const [creating,  setCreating]  = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [newName,   setNewName]   = useState("");
    const [deleting,  setDeleting]  = useState<string | null>(null);

    // UI state
    const [view,    setView]    = useState<"card" | "row">("card");
    const [search,  setSearch]  = useState("");
    const [page,    setPage]    = useState(1);

    useEffect(() => {
        getStationTemplates()
            .then((t) => { setTemplates(t); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    // Reset page when search changes
    useEffect(() => { setPage(1); }, [search]);

    const filtered = useMemo(
        () => templates.filter((t) =>
            t.name.toLowerCase().includes(search.toLowerCase())
        ),
        [templates, search]
    );

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

    // Build page numbers with ellipsis
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

    const handleEdit = (id: string) => router.push(`/stations/designer/${id}`);

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

            {/* Toolbar: search + view toggle */}
            <div className="flex justify-end items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="ค้นหา template..."
                        className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                    />
                </div>

                {/* View toggle */}
                <div className="flex items-center rounded-lg border bg-background p-0.5 gap-0.5">
                    <button
                        onClick={() => setView("card")}
                        className={`rounded-md p-1.5 transition-colors ${
                            view === "card"
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                        title="Card view"
                    >
                        <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => setView("row")}
                        className={`rounded-md p-1.5 transition-colors ${
                            view === "row"
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                        title="List view"
                    >
                        <List className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                // Skeleton
                view === "card" ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
                    </div>
                )
            ) : filtered.length === 0 ? (
                // Empty state
                <div className="flex flex-col items-center justify-center py-24 space-y-4 border-2 border-dashed rounded-xl">
                    <LayoutTemplate className="h-12 w-12 text-muted-foreground/30" />
                    <div className="text-center">
                        {search ? (
                            <>
                                <p className="font-medium text-muted-foreground">ไม่พบ template "{search}"</p>
                                <p className="text-sm text-muted-foreground/70">ลองค้นหาด้วยคำอื่น</p>
                            </>
                        ) : (
                            <>
                                <p className="font-medium text-muted-foreground">ยังไม่มี template</p>
                                <p className="text-sm text-muted-foreground/70">กด "สร้าง template ใหม่" เพื่อเริ่มออกแบบ</p>
                            </>
                        )}
                    </div>
                    {!search && (
                        <Button onClick={() => setShowCreate(true)} variant="outline" className="gap-2">
                            <Plus className="h-4 w-4" />
                            สร้าง template แรก
                        </Button>
                    )}
                </div>
            ) : view === "card" ? (
                // Card grid
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {paginated.map((tmpl) => (
                        <TemplateCard
                            key={tmpl._id}
                            tmpl={tmpl}
                            deleting={deleting}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            ) : (
                // Row list
                <div className="flex flex-col gap-2">
                    {paginated.map((tmpl) => (
                        <TemplateRow
                            key={tmpl._id}
                            tmpl={tmpl}
                            deleting={deleting}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                        />
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
                                <PaginationPrevious
                                    text="ก่อนหน้า"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    aria-disabled={page === 1}
                                    className={page === 1 ? "pointer-events-none opacity-40" : "cursor-pointer"}
                                />
                            </PaginationItem>

                            {pageNumbers.map((p, i) =>
                                p === "…" ? (
                                    <PaginationItem key={`ellipsis-${i}`}>
                                        <PaginationEllipsis />
                                    </PaginationItem>
                                ) : (
                                    <PaginationItem key={p}>
                                        <PaginationLink
                                            isActive={p === page}
                                            onClick={() => setPage(p as number)}
                                            className="cursor-pointer"
                                        >
                                            {p}
                                        </PaginationLink>
                                    </PaginationItem>
                                )
                            )}

                            <PaginationItem>
                                <PaginationNext
                                    text="ถัดไป"
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    aria-disabled={page === totalPages}
                                    className={page === totalPages ? "pointer-events-none opacity-40" : "cursor-pointer"}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}

            {/* Create dialog */}
            {showCreate && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                    onClick={() => setShowCreate(false)}
                >
                    <div
                        className="bg-card rounded-xl border shadow-xl w-full max-w-md mx-4 p-6 space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-lg font-semibold">สร้าง Station Template</h2>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                ชื่อ Template *
                            </label>
                            <input
                                autoFocus
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="เช่น กระบวนการผลิตกระจกมาตรฐาน"
                                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                            />
                        </div>
                        <div className="flex gap-2 justify-end">
                            <Button
                                variant="outline"
                                onClick={() => { setShowCreate(false); setNewName(""); }}
                            >
                                ยกเลิก
                            </Button>
                            <Button
                                disabled={!newName.trim() || creating}
                                onClick={handleCreate}
                                className="gap-2"
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
