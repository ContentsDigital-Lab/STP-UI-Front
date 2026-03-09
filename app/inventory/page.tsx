"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { inventoriesApi } from "@/lib/api/inventories";
import { materialsApi } from "@/lib/api/materials";
import { Inventory, Material } from "@/lib/api/types";
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
import { Loader2, Search, Plus, Package, Settings2, FilterX } from "lucide-react";

const ITEMS_PER_PAGE = 10;

export default function InventoryPage() {
    const [inventories, setInventories] = useState<Inventory[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [stockTypeFilter, setStockTypeFilter] = useState<string>("all");
    const [showLowStockOnly, setShowLowStockOnly] = useState<boolean>(false);
    const [locationFilter, setLocationFilter] = useState<string>("all");
    const [thicknessFilter, setThicknessFilter] = useState<string>("all");
    const [colorFilter, setColorFilter] = useState<string>("all");
    const [glassTypeFilter, setGlassTypeFilter] = useState<string>("all");

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);

    // Import Dialog
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [importData, setImportData] = useState({
        material: "",
        stockType: "Raw" as "Raw" | "Reuse",
        quantity: 1,
        location: ""
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [invRes, matRes] = await Promise.all([
                inventoriesApi.getAll(),
                materialsApi.getAll()
            ]);

            if (invRes.success && invRes.data) setInventories(invRes.data);
            if (matRes.success && matRes.data) setMaterials(matRes.data);
        } catch (error) {
            console.error("Failed to load inventory data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleImport = async () => {
        if (!importData.material || !importData.location) return;
        setIsSubmitting(true);
        try {
            const response = await inventoriesApi.create(importData);
            if (response.success && response.data) {
                setInventories([response.data, ...inventories]);
                setIsImportOpen(false);
                setImportData({ material: "", stockType: "Raw", quantity: 1, location: "" });
            }
        } catch (error) {
            console.error("Failed to import material:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Helper to get material info
    const getMaterialInfo = (materialIdOrObj: string | Material) => {
        if (typeof materialIdOrObj === "string") {
            return materials.find(m => m._id === materialIdOrObj) || null;
        }
        return materialIdOrObj;
    };

    // Filter Options
    const locations = useMemo(() => Array.from(new Set(inventories.map(inv => inv.location))), [inventories]);
    const thicknesses = useMemo(() => Array.from(new Set(materials.map(m => m.specDetails?.thickness).filter(Boolean))), [materials]);
    const colors = useMemo(() => Array.from(new Set(materials.map(m => m.specDetails?.color).filter(Boolean))), [materials]);
    const glassTypes = useMemo(() => Array.from(new Set(materials.map(m => m.specDetails?.glassType).filter(Boolean))), [materials]);

    const filteredInventories = useMemo(() => {
        return inventories.filter(inv => {
            const mat = getMaterialInfo(inv.material);
            const searchLower = searchQuery.toLowerCase();

            const matchesSearch = mat?.name.toLowerCase().includes(searchLower) ||
                inv.location.toLowerCase().includes(searchLower);
            const matchesType = stockTypeFilter === "all" || inv.stockType === stockTypeFilter;
            const matchesLocation = locationFilter === "all" || inv.location === locationFilter;
            const matchesThickness = thicknessFilter === "all" || mat?.specDetails?.thickness === thicknessFilter;
            const matchesColor = colorFilter === "all" || mat?.specDetails?.color === colorFilter;
            const matchesGlassType = glassTypeFilter === "all" || mat?.specDetails?.glassType === glassTypeFilter;

            let matchesStockAlert = true;
            if (showLowStockOnly) {
                matchesStockAlert = !!mat && inv.quantity <= mat.reorderPoint;
            }

            return matchesSearch && matchesType && matchesLocation && matchesThickness && matchesColor && matchesGlassType && matchesStockAlert;
        });
    }, [inventories, materials, searchQuery, stockTypeFilter, locationFilter, thicknessFilter, colorFilter, glassTypeFilter, showLowStockOnly]);

    const totalPages = Math.ceil(filteredInventories.length / ITEMS_PER_PAGE);
    const paginatedInventories = filteredInventories.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const resetFilters = () => {
        setSearchQuery("");
        setStockTypeFilter("all");
        setLocationFilter("all");
        setThicknessFilter("all");
        setColorFilter("all");
        setGlassTypeFilter("all");
        setShowLowStockOnly(false);
        setCurrentPage(1);
    };

    const TableSkeleton = () => (
        <>
            {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-[150px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[60px] rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                    <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                            <Skeleton className="h-6 w-[40px]" />
                        </div>
                    </TableCell>
                </TableRow>
            ))}
        </>
    );

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Inventory</h1>
                    <p className="text-muted-foreground">Manage stock levels, locations, and material imports.</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Link href="/inventory/materials" className="flex-1 sm:flex-none">
                        <Button variant="outline" className="w-full gap-2 text-[#1B4B9A] border-[#1B4B9A]/20 hover:bg-[#1B4B9A]/10">
                            <Settings2 className="h-4 w-4" />
                            Manage Materials
                        </Button>
                    </Link>
                    <Button
                        onClick={() => setIsImportOpen(true)}
                        className="flex-1 sm:flex-none gap-2 bg-[#E8601C] hover:bg-[#E8601C]/90 text-white"
                    >
                        <Plus className="h-4 w-4" />
                        Import Stock
                    </Button>
                </div>
            </div>

            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-2">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Search - Smaller and integrated */}
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search materials or location..."
                            className="pl-9 h-9 text-sm border-slate-200 focus:ring-1 focus:ring-slate-400 bg-slate-50/50"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                        />
                    </div>

                    {/* Compact Selects */}
                    <div className="flex flex-wrap items-center gap-2">
                        <Select value={stockTypeFilter} onValueChange={(val) => { if (val) setStockTypeFilter(val); setCurrentPage(1); }}>
                            <SelectTrigger className="w-[110px] h-9 text-xs border-slate-200 bg-white">
                                <SelectValue placeholder="All Types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                <SelectItem value="Raw">Raw</SelectItem>
                                <SelectItem value="Reuse">Reuse</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={locationFilter} onValueChange={(val) => { if (val) setLocationFilter(val); setCurrentPage(1); }}>
                            <SelectTrigger className="w-[130px] h-9 text-xs border-slate-200 bg-white">
                                <SelectValue placeholder="Location" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Locations</SelectItem>
                                {locations.map(loc => (
                                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block" />

                        <Select value={thicknessFilter} onValueChange={(val) => { if (val) setThicknessFilter(val); setCurrentPage(1); }}>
                            <SelectTrigger className="w-[110px] h-9 text-xs border-slate-200 bg-white">
                                <SelectValue placeholder="Thick" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any Thick</SelectItem>
                                {thicknesses.map(t => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={glassTypeFilter} onValueChange={(val) => { if (val) setGlassTypeFilter(val); setCurrentPage(1); }}>
                            <SelectTrigger className="w-[130px] h-9 text-xs border-slate-200 bg-white">
                                <SelectValue placeholder="Glass Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any Glass</SelectItem>
                                {glassTypes.map(gt => (
                                    <SelectItem key={gt} value={gt}>{gt}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={colorFilter} onValueChange={(val) => { if (val) setColorFilter(val); setCurrentPage(1); }}>
                            <SelectTrigger className="w-[110px] h-9 text-xs border-slate-200 bg-white">
                                <SelectValue placeholder="Color" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any Color</SelectItem>
                                {colors.map(c => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Unified Actions Area */}
                    <div className="flex items-center gap-2 ml-auto">
                        <Button
                            variant={showLowStockOnly ? "destructive" : "outline"}
                            size="sm"
                            onClick={() => { setShowLowStockOnly(!showLowStockOnly); setCurrentPage(1); }}
                            className={`h-9 px-3 text-xs gap-1.5 font-medium ${!showLowStockOnly ? 'text-slate-600 border-slate-200 hover:bg-slate-50' : ''}`}
                        >
                            <Package className="h-3.5 w-3.5" />
                            Low Stock
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={resetFilters}
                            className="h-9 px-2 text-xs text-slate-400 hover:text-slate-600"
                        >
                            <FilterX className="h-3.5 w-3.5 mr-1" />
                            Reset
                        </Button>
                    </div>
                </div>
            </div>

            <div className="rounded-md border bg-card shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead>Material</TableHead>
                                <TableHead>Specs</TableHead>
                                <TableHead>Location</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Date Added</TableHead>
                                <TableHead className="text-right">Quantity</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableSkeleton />
                            ) : paginatedInventories.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                        <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                        No inventory records found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedInventories.map((inv) => {
                                    const material = getMaterialInfo(inv.material);
                                    const isLowStock = material && inv.quantity <= material.reorderPoint;

                                    return (
                                        <TableRow key={inv._id} className="hover:bg-muted/50 transition-colors">
                                            <TableCell className="font-medium">
                                                {material ? material.name : "Unknown Material"}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {material?.specDetails ? (
                                                    <div className="flex flex-col">
                                                        {material.specDetails.glassType && <span>Type: {material.specDetails.glassType}</span>}
                                                        {material.specDetails.thickness && <span>Thickness: {material.specDetails.thickness}</span>}
                                                        {material.specDetails.color && <span>Color: {material.specDetails.color}</span>}
                                                    </div>
                                                ) : "-"}
                                            </TableCell>
                                            <TableCell>{inv.location}</TableCell>
                                            <TableCell>
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${inv.stockType === 'Raw'
                                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                    }`}>
                                                    {inv.stockType}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col text-xs text-muted-foreground">
                                                    <span>{new Date(inv.createdAt).toLocaleDateString()}</span>
                                                    <span>{new Date(inv.createdAt).toLocaleTimeString()}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className={`text-lg font-semibold ${isLowStock ? 'text-red-500 font-bold' : ''}`}>
                                                        {inv.quantity.toLocaleString()} {material?.unit || 'units'}
                                                    </span>
                                                    {isLowStock && (
                                                        <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded-sm">
                                                            Low Stock
                                                        </span>
                                                    )}
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

            {!isLoading && totalPages > 1 && (
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                        </PaginationItem>
                        {[...Array(totalPages)].map((_, i) => (
                            <PaginationItem key={i}>
                                <PaginationLink
                                    isActive={currentPage === i + 1}
                                    onClick={() => setCurrentPage(i + 1)}
                                    className="cursor-pointer"
                                >
                                    {i + 1}
                                </PaginationLink>
                            </PaginationItem>
                        ))}
                        <PaginationItem>
                            <PaginationNext
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            )}

            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Import Stock</DialogTitle>
                        <DialogDescription>
                            Add new materials to the inventory locations.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="material" className="text-[13px] font-medium text-slate-700">Material Item *</Label>
                            <Select
                                value={importData.material}
                                onValueChange={(val) => {
                                    if (val) setImportData({ ...importData, material: val })
                                }}
                            >
                                <SelectTrigger className="h-10 w-full border-slate-200 focus:ring-1 focus:ring-slate-400">
                                    <SelectValue placeholder="Select material...">
                                        {importData.material && materials.find(m => m._id === importData.material)?.name}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="max-h-[250px]">
                                    {materials.map(m => (
                                        <SelectItem
                                            key={m._id}
                                            value={m._id}
                                            className="cursor-pointer py-1.5 border-b border-slate-50 last:border-0 focus:bg-slate-100 focus:text-slate-900"
                                        >
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-medium text-sm text-slate-900 leading-tight">{m.name}</span>
                                                <span className="text-[10px] text-slate-500 uppercase leading-none">
                                                    {m.specDetails?.thickness} / {m.specDetails?.color} / {m.specDetails?.glassType}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="stockType" className="text-[13px] font-medium text-slate-700">Stock Type</Label>
                                <Select
                                    value={importData.stockType}
                                    onValueChange={(val) => {
                                        if (val === "Raw" || val === "Reuse") {
                                            setImportData({ ...importData, stockType: val })
                                        }
                                    }}
                                >
                                    <SelectTrigger className="h-10 border-slate-200">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Raw">Raw</SelectItem>
                                        <SelectItem value="Reuse">Reuse</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="quantity" className="text-[13px] font-medium text-slate-700">Quantity *</Label>
                                <Input
                                    id="quantity"
                                    type="number"
                                    min="1"
                                    className="h-10 border-slate-200"
                                    value={importData.quantity}
                                    onChange={(e) => setImportData({ ...importData, quantity: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="location" className="text-[13px] font-medium text-slate-700">Warehouse Location *</Label>
                            <Input
                                id="location"
                                className="h-10 border-slate-200"
                                placeholder="e.g. A1, Shelf 3, Rack B"
                                value={importData.location}
                                onChange={(e) => setImportData({ ...importData, location: e.target.value })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsImportOpen(false)} disabled={isSubmitting} className="h-9">
                            Cancel
                        </Button>
                        <Button
                            onClick={handleImport}
                            disabled={isSubmitting || !importData.material || !importData.location || importData.quantity <= 0}
                            className="bg-[#1B4B9A] hover:bg-[#1B4B9A]/90 text-white h-9 px-6"
                        >
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Import Stock
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
