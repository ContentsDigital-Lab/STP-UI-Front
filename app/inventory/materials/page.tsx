"use client";

import { useState, useEffect, useMemo } from "react";
import { materialsApi } from "@/lib/api/materials";
import { materialLogsApi } from "@/lib/api/material-logs";
import { Material } from "@/lib/api/types";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Search, Plus, Edit, Trash2, FilterX, ChevronLeft, Package, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/api-error";
import {
    MATERIAL_UNIT_OPTIONS,
    materialPayloadFromForm,
    materialUnitDisplayLabel,
    normalizeMaterialUnit,
} from "@/lib/utils/material-payload";

const ITEMS_PER_PAGE = 10;

export default function MaterialsManagementPage() {
    const [materials, setMaterials] = useState<Material[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [thicknessFilter, setThicknessFilter] = useState<string>("all");
    const [colorFilter, setColorFilter] = useState<string>("all");
    const [glassTypeFilter, setGlassTypeFilter] = useState<string>("all");

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);

    // Delete confirmation state
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; logCount: number; step: 1 | 2 } | null>(null);
    const [isLoadingDeleteTarget, setIsLoadingDeleteTarget] = useState(false);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        unit: "sheet",
        reorderPoint: 10,
        thickness: "",
        color: "",
        glassType: "",
        width: "",
        length: ""
    });

    useEffect(() => {
        fetchMaterials();
    }, []);

    const fetchMaterials = async () => {
        setIsLoading(true);
        try {
            const response = await materialsApi.getAll();
            if (response.success && response.data) {
                setMaterials(response.data);
            }
        } catch (error) {
            console.error("Failed to fetch materials:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenModal = (material?: Material) => {
        if (material) {
            setEditingMaterial(material);
            setFormData({
                name: material.name || "",
                unit: normalizeMaterialUnit(material.unit || "sheet"),
                reorderPoint: material.reorderPoint || 0,
                thickness: material.specDetails?.thickness?.toString() || "",
                color: material.specDetails?.color || "",
                glassType: material.specDetails?.glassType || "",
                width: material.specDetails?.width?.toString() || "",
                length: material.specDetails?.length?.toString() || ""
            });
        } else {
            setEditingMaterial(null);
            setFormData({
                name: "",
                unit: "sheet",
                reorderPoint: 10,
                thickness: "",
                color: "",
                glassType: "",
                width: "",
                length: ""
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name.trim()) return;
        setIsSubmitting(true);

        const payload = materialPayloadFromForm(formData) as Partial<Material>;

        try {
            if (editingMaterial) {
                const response = await materialsApi.update(editingMaterial._id, payload);
                if (response.success) {
                    // Re-fetch to confirm actual saved data from server
                    const freshRes = await materialsApi.getById(editingMaterial._id);
                    const updated = freshRes.success && freshRes.data ? freshRes.data : response.data;
                    setMaterials(materials.map(m => m._id === editingMaterial._id ? updated : m));
                    toast.success('บันทึกข้อมูลเรียบร้อย');
                }
            } else {
                const response = await materialsApi.create(payload);
                if (response.success && response.data) {
                    setMaterials([response.data, ...materials]);
                    toast.success('เพิ่มวัสดุเรียบร้อย');
                }
            }
            setIsModalOpen(false);
        } catch (error) {
            console.error("Failed to save material:", error);
            const msg =
                error instanceof ApiError
                    ? error.message
                    : error instanceof Error
                      ? error.message
                      : "บันทึกไม่สำเร็จ";
            toast.error(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        setIsLoadingDeleteTarget(true);
        try {
            const logsRes = await materialLogsApi.getAll({ materialId: id });
            const logCount = logsRes.success && logsRes.data ? logsRes.data.length : 0;
            setDeleteTarget({ id, name, logCount, step: 1 });
        } catch {
            setDeleteTarget({ id, name, logCount: 0, step: 1 });
        } finally {
            setIsLoadingDeleteTarget(false);
        }
    };

    const executeDelete = async () => {
        if (!deleteTarget) return;
        const { id } = deleteTarget;
        setDeleteTarget(null);
        try {
            // Always fetch fresh logs and delete them all before deleting the material
            const logsRes = await materialLogsApi.getAll({ materialId: id });
            if (logsRes.success && logsRes.data && logsRes.data.length > 0) {
                const logs = logsRes.data;
                // Delete child logs first (those with parentLog), then parents
                const children = logs.filter(l => l.parentLog);
                const parents = logs.filter(l => !l.parentLog);
                await Promise.all(children.map(l => materialLogsApi.delete(l._id)));
                await Promise.all(parents.map(l => materialLogsApi.delete(l._id)));
            }
            const response = await materialsApi.delete(id);
            if (response.success) {
                setMaterials(materials.filter(m => m._id !== id));
                toast.success('ลบวัสดุเรียบร้อย');
            } else {
                toast.error('ลบไม่สำเร็จ');
            }
        } catch (error) {
            console.error("Failed to delete material:", error);
            toast.error(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด');
        }
    };

    // Filter Options
    const thicknesses = useMemo(() => Array.from(new Set(materials.map(m => m.specDetails?.thickness?.toString()).filter(Boolean))), [materials]);
    const colors = useMemo(() => Array.from(new Set(materials.map(m => m.specDetails?.color).filter(Boolean))), [materials]);
    const glassTypes = useMemo(() => Array.from(new Set(materials.map(m => m.specDetails?.glassType).filter(Boolean))), [materials]);

    // Smart search — matches across all fields
    const filteredMaterials = useMemo(() => {
        return materials.filter(m => {
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch = !searchQuery ||
                m.name.toLowerCase().includes(searchLower) ||
                (m.specDetails?.glassType || "").toLowerCase().includes(searchLower) ||
                (m.specDetails?.thickness?.toString() || "").toLowerCase().includes(searchLower) ||
                (m.specDetails?.color || "").toLowerCase().includes(searchLower) ||
                (m.specDetails?.width?.toString() || "").toLowerCase().includes(searchLower) ||
                (m.specDetails?.length?.toString() || "").toLowerCase().includes(searchLower) ||
                (m.unit || "").toLowerCase().includes(searchLower);

            const matchesThickness = thicknessFilter === "all" || m.specDetails?.thickness?.toString() === thicknessFilter;
            const matchesColor = colorFilter === "all" || m.specDetails?.color === colorFilter;
            const matchesGlassType = glassTypeFilter === "all" || m.specDetails?.glassType === glassTypeFilter;

            return matchesSearch && matchesThickness && matchesColor && matchesGlassType;
        });
    }, [materials, searchQuery, thicknessFilter, colorFilter, glassTypeFilter]);

    const totalPages = Math.ceil(filteredMaterials.length / ITEMS_PER_PAGE);
    const paginatedMaterials = filteredMaterials.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const resetFilters = () => {
        setSearchQuery("");
        setThicknessFilter("all");
        setColorFilter("all");
        setGlassTypeFilter("all");
        setCurrentPage(1);
    };

    const hasActiveFilters = searchQuery || thicknessFilter !== "all" || colorFilter !== "all" || glassTypeFilter !== "all";

    const TableSkeleton = () => (
        <>
            {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-[200px]" /></TableCell>
                    <TableCell><Skeleton className="h-10 w-[150px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[40px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[60px]" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-[100px]" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-[80px] ml-auto" /></TableCell>
                </TableRow>
            ))}
        </>
    );

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-start gap-3">
                    <Link href="/inventory" className="mt-1 shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-colors" title="กลับไปหน้าคลังกระจก">
                        <ChevronLeft className="h-5 w-5" />
                    </Link>
                    <div className="space-y-1 min-w-0">
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white truncate">จัดการวัสดุ</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">กำหนดข้อมูลพื้นฐาน, ขนาดบรรจุ, และจุดแจ้งเตือนของวัสดุ</p>
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="grid grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] items-end gap-3 sm:gap-4">
                    {/* Search */}
                    <div className="space-y-1.5 col-span-2 lg:col-span-1">
                        <Label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                            <Search className="h-3 w-3" />
                            ค้นหา
                        </Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="ค้นหาชื่อ, ประเภท, ความหนา, สี, ขนาด..."
                                className="pl-9 pr-9 h-10 text-sm border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-blue-600 bg-slate-50/50 dark:bg-slate-800/50 rounded-xl"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Glass Type Filter */}
                    <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">ประเภทกระจก</Label>
                        <Select value={glassTypeFilter === "all" ? "" : glassTypeFilter} onValueChange={(val) => { setGlassTypeFilter(val || "all"); setCurrentPage(1); }}>
                            <SelectTrigger className="h-10 w-full text-sm border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl focus:ring-blue-600/20">
                                <SelectValue placeholder="ทั้งหมด" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
                                <SelectItem value="all" className="focus:bg-slate-100 focus:text-slate-900">ทั้งหมด</SelectItem>
                                {glassTypes.map(gt => (
                                    <SelectItem key={gt} value={gt!} className="focus:bg-slate-100 focus:text-slate-900">{gt}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Thickness Filter */}
                    <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">ความหนา</Label>
                        <Select value={thicknessFilter === "all" ? "" : thicknessFilter} onValueChange={(val) => { setThicknessFilter(val || "all"); setCurrentPage(1); }}>
                            <SelectTrigger className="h-10 w-full text-sm border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl focus:ring-blue-600/20">
                                <SelectValue placeholder="ทั้งหมด" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
                                <SelectItem value="all" className="focus:bg-slate-100 focus:text-slate-900">ทั้งหมด</SelectItem>
                                {thicknesses.map(t => (
                                    <SelectItem key={t} value={t!} className="focus:bg-slate-100 focus:text-slate-900">{t}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Color Filter */}
                    <div className="space-y-1.5 col-span-2 sm:col-span-1">
                        <Label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">สีกระจก</Label>
                        <Select value={colorFilter === "all" ? "" : colorFilter} onValueChange={(val) => { setColorFilter(val || "all"); setCurrentPage(1); }}>
                            <SelectTrigger className="h-10 w-full text-sm border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl focus:ring-blue-600/20">
                                <SelectValue placeholder="ทั้งหมด" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
                                <SelectItem value="all" className="focus:bg-slate-100 focus:text-slate-900">ทั้งหมด</SelectItem>
                                {colors.map(c => (
                                    <SelectItem key={c} value={c!} className="focus:bg-slate-100 focus:text-slate-900">{c}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-2 lg:mt-0 col-span-2 lg:col-span-1 pt-3 lg:pt-0 border-t border-slate-100 dark:border-slate-800/50 lg:border-t-0">
                        {hasActiveFilters && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={resetFilters}
                                className="h-10 px-3 text-xs text-slate-400 hover:text-slate-600 rounded-xl"
                            >
                                <FilterX className="h-3.5 w-3.5 mr-1" />
                                ล้าง
                            </Button>
                        )}
                        <Button
                            onClick={() => handleOpenModal()}
                            className="h-10 gap-2 w-full lg:w-auto bg-blue-600 hover:bg-blue-700 text-white dark:bg-[#E8601C] dark:hover:bg-orange-600 rounded-xl shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0"
                        >
                            <Plus className="h-4 w-4" />
                            เพิ่มวัสดุ
                        </Button>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50/80 dark:bg-slate-800/50 border-b-slate-200 dark:border-b-slate-800">
                                <TableHead className="text-[12px] font-semibold text-slate-600 dark:text-slate-400">ชื่อวัสดุ</TableHead>
                                <TableHead className="text-[12px] font-semibold text-slate-600 dark:text-slate-400">สเปค (ประเภท/หนา/สี)</TableHead>
                                <TableHead className="text-[12px] font-semibold text-slate-600 dark:text-slate-400">ขนาด (W×H)</TableHead>
                                <TableHead className="text-[12px] font-semibold text-slate-600 dark:text-slate-400">จุดแจ้งเตือน</TableHead>
                                <TableHead className="text-[12px] font-semibold text-slate-600 dark:text-slate-400">หน่วย</TableHead>
                                <TableHead className="text-[12px] font-semibold text-slate-600 dark:text-slate-400">วันที่เพิ่ม</TableHead>
                                <TableHead className="text-right text-[12px] font-semibold text-slate-600 dark:text-slate-400">จัดการ</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableSkeleton />
                            ) : paginatedMaterials.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                        <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                        ไม่พบวัสดุ
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedMaterials.map((material) => {
                                    const hasSize = material.specDetails?.width || material.specDetails?.length;
                                    return (
                                        <TableRow key={material._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors border-b-slate-200 dark:border-b-slate-800">
                                            <TableCell className="font-medium text-[14px] text-slate-900 dark:text-slate-200">{material.name}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col text-[13px] space-y-0.5 text-slate-500 dark:text-slate-400">
                                                    {material.specDetails?.glassType && <span><span className="font-medium text-slate-700 dark:text-slate-300">ประเภท:</span> {material.specDetails.glassType}</span>}
                                                    {material.specDetails?.thickness && <span><span className="font-medium text-slate-700 dark:text-slate-300">หนา:</span> {material.specDetails.thickness}</span>}
                                                    {material.specDetails?.color && <span><span className="font-medium text-slate-700 dark:text-slate-300">สี:</span> {material.specDetails.color}</span>}
                                                    {!material.specDetails?.glassType && !material.specDetails?.thickness && !material.specDetails?.color && "-"}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {hasSize ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50">
                                                        {material.specDetails?.width || "-"} × {material.specDetails?.length || "-"}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300 dark:text-slate-600">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-100 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/50">
                                                    {material.reorderPoint}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-[13px] text-slate-600 dark:text-slate-400">
                                                {materialUnitDisplayLabel(material.unit)}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col text-[11px] text-slate-400 dark:text-slate-500">
                                                    <span>{new Date(material.createdAt).toLocaleDateString()}</span>
                                                    <span>{new Date(material.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleOpenModal(material)}
                                                        className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-950/50 rounded-xl"
                                                    >
                                                        <Edit className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleDelete(material._id, material.name)}
                                                        disabled={isLoadingDeleteTarget}
                                                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/50 rounded-xl"
                                                    >
                                                        {isLoadingDeleteTarget ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Pagination */}
            {!isLoading && totalPages > 1 && (
                <div className="mt-4">
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    className={currentPage === 1 ? "pointer-events-none opacity-50 h-8" : "cursor-pointer h-8"}
                                />
                            </PaginationItem>
                            {[...Array(totalPages)].map((_, i) => (
                                <PaginationItem key={i}>
                                    <PaginationLink
                                        isActive={currentPage === i + 1}
                                        onClick={() => setCurrentPage(i + 1)}
                                        className="cursor-pointer h-8 w-8 text-xs"
                                    >
                                        {i + 1}
                                    </PaginationLink>
                                </PaginationItem>
                            ))}
                            <PaginationItem>
                                <PaginationNext
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    className={currentPage === totalPages ? "pointer-events-none opacity-50 h-8" : "cursor-pointer h-8"}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}

            {/* Create/Edit Dialog */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-[520px] rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg">{editingMaterial ? "แก้ไขวัสดุ" : "เพิ่มวัสดุใหม่"}</DialogTitle>
                        <DialogDescription className="text-sm">
                            กำหนดรายละเอียดวัสดุ, สเปค, และเกณฑ์แจ้งเตือน
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="name" className="text-[13px] font-medium text-slate-700">ชื่อวัสดุ *</Label>
                            <Input
                                id="name"
                                placeholder="เช่น กระจกนิรภัย ใส"
                                className="h-10 border-slate-200 rounded-xl"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="unit" className="text-[13px] font-medium text-slate-700">หน่วยวัด</Label>
                                <Select
                                    value={formData.unit}
                                    onValueChange={(v) => {
                                        if (v) setFormData({ ...formData, unit: v });
                                    }}
                                >
                                    <SelectTrigger id="unit" className="h-10 w-full border-slate-200 rounded-xl">
                                        <SelectValue placeholder="เลือกหน่วย">
                                            {materialUnitDisplayLabel(formData.unit)}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {MATERIAL_UNIT_OPTIONS.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="reorderPoint" className="text-[13px] font-medium text-slate-700">จุดแจ้งเตือน</Label>
                                <Input
                                    id="reorderPoint"
                                    type="number"
                                    min="0"
                                    className="h-10 border-slate-200 rounded-xl"
                                    value={formData.reorderPoint}
                                    onChange={(e) => setFormData({ ...formData, reorderPoint: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                        </div>

                        <div className="pt-2 mt-2 border-t border-slate-100">
                            <h4 className="text-[13px] font-semibold text-slate-900 mb-3 uppercase tracking-wider">สเปค</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="thickness" className="text-[13px] font-medium text-slate-700">ความหนา</Label>
                                    <Input
                                        id="thickness"
                                        placeholder="เช่น 5mm, 10mm"
                                        className="h-10 border-slate-200 rounded-xl"
                                        value={formData.thickness}
                                        onChange={(e) => setFormData({ ...formData, thickness: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="color" className="text-[13px] font-medium text-slate-700">สี</Label>
                                    <Input
                                        id="color"
                                        placeholder="เช่น ใส, เขียว"
                                        className="h-10 border-slate-200 rounded-xl"
                                        value={formData.color}
                                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5 col-span-2">
                                    <Label htmlFor="glassType" className="text-[13px] font-medium text-slate-700">ประเภทกระจก</Label>
                                    <Input
                                        id="glassType"
                                        placeholder="เช่น นิรภัย, ลามิเนต"
                                        className="h-10 border-slate-200 rounded-xl"
                                        value={formData.glassType}
                                        onChange={(e) => setFormData({ ...formData, glassType: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Dimensions */}
                        <div className="pt-2 mt-2 border-t border-slate-100">
                            <h4 className="text-[13px] font-semibold text-slate-900 mb-3 uppercase tracking-wider">ขนาด</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="width" className="text-[13px] font-medium text-slate-700">ความกว้าง (Width)</Label>
                                    <Input
                                        id="width"
                                        placeholder="เช่น 900mm, 1200mm"
                                        className="h-10 border-slate-200 rounded-xl"
                                        value={formData.width}
                                        onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="length" className="text-[13px] font-medium text-slate-700">ความสูง (Height)</Label>
                                    <Input
                                        id="length"
                                        placeholder="เช่น 600mm, 1000mm"
                                        className="h-10 border-slate-200 rounded-xl"
                                        value={formData.length}
                                        onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSubmitting} className="h-9 rounded-xl">
                            ยกเลิก
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSubmitting || !formData.name.trim()}
                            className="bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white min-w-[120px] h-9 rounded-xl font-bold shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0"
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "บันทึก"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog — Step 1 */}
            <Dialog open={deleteTarget?.step === 1} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
                <DialogContent className="sm:max-w-[360px] border-slate-200 dark:border-slate-800 rounded-2xl p-0">
                    <div className="p-6">
                        <DialogHeader>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="h-10 w-10 rounded-xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0">
                                    <Trash2 className="h-5 w-5 text-red-500" />
                                </div>
                                <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">ยืนยันการลบ</DialogTitle>
                            </div>
                            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                ลบ <span className="font-bold text-slate-700 dark:text-slate-300">&ldquo;{deleteTarget?.name}&rdquo;</span> ออกจากระบบ? การกระทำนี้ไม่สามารถย้อนกลับได้
                            </DialogDescription>
                            {deleteTarget && deleteTarget.logCount > 0 && (
                                <p className="text-xs bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900/50 mt-2">
                                    ⚠️ ประวัติการเคลื่อนไหวทั้งหมด <span className="font-bold">{deleteTarget.logCount} รายการ</span> จะถูกลบด้วย
                                </p>
                            )}
                        </DialogHeader>
                    </div>
                    <div className="px-6 pb-6 flex gap-3">
                        <Button variant="outline" className="flex-1 rounded-xl h-11 font-bold" onClick={() => setDeleteTarget(null)}>
                            ยกเลิก
                        </Button>
                        <Button
                            className="flex-1 rounded-xl h-11 font-bold bg-red-600 hover:bg-red-700 text-white"
                            onClick={() => deleteTarget && setDeleteTarget({ ...deleteTarget, step: 2 })}
                        >
                            <Trash2 className="h-4 w-4 mr-1.5" />
                            ยืนยัน
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog — Step 2 (final, when logs exist) */}
            <Dialog open={deleteTarget?.step === 2} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
                <DialogContent className="sm:max-w-[360px] border-slate-200 dark:border-slate-800 rounded-2xl p-0">
                    <div className="p-6">
                        <DialogHeader>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0">
                                    <Trash2 className="h-5 w-5 text-red-600" />
                                </div>
                                <DialogTitle className="text-lg font-bold text-red-600 dark:text-red-400">ยืนยันการลบถาวร</DialogTitle>
                            </div>
                            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                คุณแน่ใจหรือไม่? วัสดุ <span className="font-bold text-slate-700 dark:text-slate-300">&ldquo;{deleteTarget?.name}&rdquo;</span>
                                {deleteTarget && deleteTarget.logCount > 0
                                    ? <> และประวัติการเคลื่อนไหว <span className="font-bold text-red-600">{deleteTarget.logCount} รายการ</span> จะถูกลบออกจากระบบถาวร</>
                                    : <> จะถูกลบออกจากระบบถาวร</>
                                }
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="px-6 pb-6 flex gap-3">
                        <Button variant="outline" className="flex-1 rounded-xl h-11 font-bold" onClick={() => setDeleteTarget(null)}>
                            ยกเลิก
                        </Button>
                        <Button className="flex-1 rounded-xl h-11 font-bold bg-red-700 hover:bg-red-800 text-white" onClick={executeDelete}>
                            <Trash2 className="h-4 w-4 mr-1.5" />
                            ลบถาวร
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
