"use client";

import { useState, useEffect, useMemo } from "react";
import { materialsApi } from "@/lib/api/materials";
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
import { Loader2, Search, Plus, Edit, Trash2, FilterX, ChevronLeft, Package } from "lucide-react";
import Link from "next/link";

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

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        unit: "piece",
        reorderPoint: 10,
        thickness: "",
        color: "",
        glassType: ""
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
                unit: material.unit || "",
                reorderPoint: material.reorderPoint || 0,
                thickness: material.specDetails?.thickness || "",
                color: material.specDetails?.color || "",
                glassType: material.specDetails?.glassType || ""
            });
        } else {
            setEditingMaterial(null);
            setFormData({
                name: "",
                unit: "ชิ้น",
                reorderPoint: 10,
                thickness: "",
                color: "",
                glassType: ""
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name) return;
        setIsSubmitting(true);

        const payload: Partial<Material> = {
            name: formData.name,
            unit: formData.unit,
            reorderPoint: formData.reorderPoint,
            specDetails: {
                thickness: formData.thickness,
                color: formData.color,
                glassType: formData.glassType
            }
        };

        try {
            if (editingMaterial) {
                const response = await materialsApi.update(editingMaterial._id, payload);
                if (response.success && response.data) {
                    setMaterials(materials.map(m => m._id === editingMaterial._id ? response.data : m));
                }
            } else {
                const response = await materialsApi.create(payload);
                if (response.success && response.data) {
                    setMaterials([response.data, ...materials]);
                }
            }
            setIsModalOpen(false);
        } catch (error) {
            console.error("Failed to save material:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete ${name}?`)) return;

        try {
            const response = await materialsApi.delete(id);
            if (response.success) {
                setMaterials(materials.filter(m => m._id !== id));
            }
        } catch (error) {
            console.error("Failed to delete material:", error);
        }
    };

    // Filter Options
    const thicknesses = useMemo(() => Array.from(new Set(materials.map(m => m.specDetails?.thickness).filter(Boolean))), [materials]);
    const colors = useMemo(() => Array.from(new Set(materials.map(m => m.specDetails?.color).filter(Boolean))), [materials]);
    const glassTypes = useMemo(() => Array.from(new Set(materials.map(m => m.specDetails?.glassType).filter(Boolean))), [materials]);

    const filteredMaterials = useMemo(() => {
        return materials.filter(m => {
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch = m.name.toLowerCase().includes(searchLower) ||
                (m.specDetails?.glassType || "").toLowerCase().includes(searchLower);

            const matchesThickness = thicknessFilter === "all" || m.specDetails?.thickness === thicknessFilter;
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

    const TableSkeleton = () => (
        <>
            {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-[200px]" /></TableCell>
                    <TableCell><Skeleton className="h-10 w-[150px]" /></TableCell>
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
            <div className="flex items-center gap-2 mb-2">
                <Link href="/inventory" className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors mr-2">
                    <ChevronLeft className="h-5 w-5" />
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Manage Materials</h1>
                    <p className="text-muted-foreground">Define base materials, reorder limits, and specifications.</p>
                </div>
            </div>

            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-2">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search materials..."
                            className="pl-9 h-9 text-sm border-slate-200 focus:ring-1 focus:ring-slate-400 bg-slate-50/50"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Select value={glassTypeFilter} onValueChange={(val) => { if (val) setGlassTypeFilter(val); setCurrentPage(1); }}>
                            <SelectTrigger className="w-[130px] h-9 text-xs border-slate-200 bg-white">
                                <SelectValue placeholder="Glass Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="focus:bg-slate-100 focus:text-slate-900">Any Glass</SelectItem>
                                {glassTypes.map(gt => (
                                    <SelectItem key={gt} value={gt} className="focus:bg-slate-100 focus:text-slate-900">{gt}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={thicknessFilter} onValueChange={(val) => { if (val) setThicknessFilter(val); setCurrentPage(1); }}>
                            <SelectTrigger className="w-[110px] h-9 text-xs border-slate-200 bg-white">
                                <SelectValue placeholder="Thick" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="focus:bg-slate-100 focus:text-slate-900">Any Thick</SelectItem>
                                {thicknesses.map(t => (
                                    <SelectItem key={t} value={t} className="focus:bg-slate-100 focus:text-slate-900">{t}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={colorFilter} onValueChange={(val) => { if (val) setColorFilter(val); setCurrentPage(1); }}>
                            <SelectTrigger className="w-[110px] h-9 text-xs border-slate-200 bg-white">
                                <SelectValue placeholder="Color" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="focus:bg-slate-100 focus:text-slate-900">Any Color</SelectItem>
                                {colors.map(c => (
                                    <SelectItem key={c} value={c} className="focus:bg-slate-100 focus:text-slate-900">{c}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={resetFilters}
                            className="h-9 px-2 text-xs text-slate-400 hover:text-slate-600"
                        >
                            <FilterX className="h-3.5 w-3.5 mr-1" />
                            Reset
                        </Button>
                        <Button
                            onClick={() => handleOpenModal()}
                            className="h-9 gap-2 bg-[#1B4B9A] hover:bg-[#1B4B9A]/90 text-white text-xs px-4"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            New Material
                        </Button>
                    </div>
                </div>
            </div>

            <div className="rounded-md border bg-card shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50/50">
                                <TableHead className="text-[12px] font-semibold text-slate-600">Material Name</TableHead>
                                <TableHead className="text-[12px] font-semibold text-slate-600">Specs (Thickness/Color/Type)</TableHead>
                                <TableHead className="text-[12px] font-semibold text-slate-600">Alert Limit</TableHead>
                                <TableHead className="text-[12px] font-semibold text-slate-600">Unit</TableHead>
                                <TableHead className="text-[12px] font-semibold text-slate-600">Date Added</TableHead>
                                <TableHead className="text-right text-[12px] font-semibold text-slate-600">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableSkeleton />
                            ) : paginatedMaterials.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                        <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                        No materials found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedMaterials.map((material) => (
                                    <TableRow key={material._id} className="hover:bg-slate-50 transition-colors">
                                        <TableCell className="font-medium text-[14px] text-slate-900">{material.name}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col text-[13px] space-y-0.5 text-slate-500">
                                                {material.specDetails?.glassType && <span><span className="font-medium text-slate-700">Type:</span> {material.specDetails.glassType}</span>}
                                                {material.specDetails?.thickness && <span><span className="font-medium text-slate-700">Thick:</span> {material.specDetails.thickness}</span>}
                                                {material.specDetails?.color && <span><span className="font-medium text-slate-700">Color:</span> {material.specDetails.color}</span>}
                                                {!material.specDetails?.glassType && !material.specDetails?.thickness && !material.specDetails?.color && "-"}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-100">
                                                {material.reorderPoint}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-[13px] text-slate-600">{material.unit}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col text-[11px] text-slate-400">
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
                                                    className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                >
                                                    <Edit className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDelete(material._id, material.name)}
                                                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

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

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg">{editingMaterial ? "Edit Material" : "Create New Material"}</DialogTitle>
                        <DialogDescription className="text-sm">
                            Configure the material details, specifications, and alert thresholds.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="name" className="text-[13px] font-medium text-slate-700">Material Name *</Label>
                            <Input
                                id="name"
                                placeholder="e.g. Clear Tempered Glass"
                                className="h-10 border-slate-200"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="unit" className="text-[13px] font-medium text-slate-700">Unit Measure</Label>
                                <Input
                                    id="unit"
                                    placeholder="e.g. piece, sqft"
                                    className="h-10 border-slate-200"
                                    value={formData.unit}
                                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="reorderPoint" className="text-[13px] font-medium text-slate-700">Alert Threshold</Label>
                                <Input
                                    id="reorderPoint"
                                    type="number"
                                    min="0"
                                    className="h-10 border-slate-200"
                                    value={formData.reorderPoint}
                                    onChange={(e) => setFormData({ ...formData, reorderPoint: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                        </div>

                        <div className="pt-2 mt-2 border-t border-slate-100">
                            <h4 className="text-[13px] font-semibold text-slate-900 mb-3 uppercase tracking-wider">Specifications</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="thickness" className="text-[13px] font-medium text-slate-700">Thickness</Label>
                                    <Input
                                        id="thickness"
                                        placeholder="e.g. 5mm, 10mm"
                                        className="h-10 border-slate-200"
                                        value={formData.thickness}
                                        onChange={(e) => setFormData({ ...formData, thickness: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="color" className="text-[13px] font-medium text-slate-700">Color</Label>
                                    <Input
                                        id="color"
                                        placeholder="e.g. Clear, Green"
                                        className="h-10 border-slate-200"
                                        value={formData.color}
                                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5 col-span-2">
                                    <Label htmlFor="glassType" className="text-[13px] font-medium text-slate-700">Glass Type</Label>
                                    <Input
                                        id="glassType"
                                        placeholder="e.g. Tempered, Laminated"
                                        className="h-10 border-slate-200"
                                        value={formData.glassType}
                                        onChange={(e) => setFormData({ ...formData, glassType: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSubmitting} className="h-9">
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSubmitting || !formData.name}
                            className="bg-[#1B4B9A] hover:bg-[#1B4B9A]/90 text-white min-w-[120px] h-9"
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Material"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
