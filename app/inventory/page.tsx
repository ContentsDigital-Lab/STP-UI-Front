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
import {
    Loader2,
    Search,
    Plus,
    Package,
    Settings2,
    FilterX,
    AlertTriangle,
    Boxes,
    TrendingUp,
    ChevronRight,
    History,
    Info,
    Edit3,
    Minus,
    ArrowUpRight,
    ArrowDownRight,
    CheckCircle2
} from "lucide-react";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

import { useLanguage } from "@/lib/i18n/language-context";
import { materialLogsApi } from "@/lib/api/material-logs";
import { MaterialLog } from "@/lib/api/types";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { Trash2 } from "lucide-react";

const ITEMS_PER_PAGE = 10;

export default function InventoryPage() {
    const { t, lang } = useLanguage();
    const it = t.inventory_dashboard;

    const [inventories, setInventories] = useState<Inventory[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Master-Detail State
    const [selectedInventory, setSelectedInventory] = useState<Inventory | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [materialLogs, setMaterialLogs] = useState<MaterialLog[]>([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [stockTypeFilter, setStockTypeFilter] = useState<string>("all");
    const [showLowStockOnly, setShowLowStockOnly] = useState<boolean>(false);
    const [locationFilter, setLocationFilter] = useState<string>("all");
    const [thicknessFilter, setThicknessFilter] = useState<string>("all");
    const [colorFilter, setColorFilter] = useState<string>("all");
    const [glassTypeFilter, setGlassTypeFilter] = useState<string>("all");

    // Dashboard Stats (Global - ignores current filter for cards)
    const globalStats = useMemo(() => {
        const totalItems = inventories.length;
        const totalQuantity = inventories.reduce((sum, inv) => sum + inv.quantity, 0);

        let lowStockCount = 0;
        inventories.forEach(inv => {
            const mat = typeof inv.material === "string"
                ? materials.find(m => m._id === inv.material)
                : inv.material;
            if (mat && inv.quantity <= mat.reorderPoint) {
                lowStockCount++;
            }
        });

        // Top Glass Types for a mini-stat or visualization logic
        const topMaterials = [...inventories]
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 3);

        return { totalItems, totalQuantity, lowStockCount, topMaterials };
    }, [inventories, materials]);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);

    // Import/Edit Dialog
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [importData, setImportData] = useState({
        material: "",
        stockType: "Raw" as "Raw" | "Reuse",
        quantity: 1,
        location: ""
    });

    // WebSocket for real-time updates
    useWebSocket(() => {
        fetchData(false); // Silent refresh on message
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
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
            if (isEditing && editId) {
                const response = await inventoriesApi.update(editId, importData);
                if (response.success && response.data) {
                    setInventories(prev => prev.map(inv => inv._id === editId ? response.data! : inv));
                    setIsImportOpen(false);
                    resetImportForm();
                }
            } else {
                // Aggregation Logic: Check if material + location + stockType already exists
                const existing = inventories.find(inv =>
                    (typeof inv.material === 'string' ? inv.material : inv.material._id) === importData.material &&
                    inv.location.toLowerCase() === importData.location.toLowerCase() &&
                    inv.stockType === importData.stockType
                );

                if (existing) {
                    // Update existing quantity
                    const newQty = existing.quantity + importData.quantity;
                    const response = await inventoriesApi.update(existing._id, { quantity: newQty });
                    if (response.success && response.data) {
                        setInventories(prev => prev.map(inv => inv._id === existing._id ? response.data! : inv));
                        setIsImportOpen(false);
                        resetImportForm();
                    }
                } else {
                    // Create new
                    const response = await inventoriesApi.create(importData);
                    if (response.success && response.data) {
                        setInventories([response.data, ...inventories]);
                        setIsImportOpen(false);
                        resetImportForm();
                    }
                }
            }
        } catch (error) {
            console.error("Failed to process inventory:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(lang === 'th' ? "คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?" : "Are you sure you want to delete this item?")) return;
        try {
            const res = await inventoriesApi.delete(id);
            if (res.success) {
                setInventories(prev => prev.filter(inv => inv._id !== id));
                setIsDetailOpen(false);
                setSelectedInventory(null);
            }
        } catch (err) {
            console.error("Failed to delete inventory item:", err);
        }
    };

    const fetchLogs = async (matId: string) => {
        setIsLoadingLogs(true);
        try {
            const res = await materialLogsApi.getAll({ materialId: matId, limit: 10 });
            if (res.success && res.data) {
                setMaterialLogs(res.data);
            }
        } catch (err) {
            console.error("Failed to load material logs:", err);
        } finally {
            setIsLoadingLogs(false);
        }
    };

    const resetImportForm = () => {
        setImportData({ material: "", stockType: "Raw", quantity: 1, location: "" });
        setIsEditing(false);
        setEditId(null);
    };

    const openDetails = (inv: Inventory) => {
        setSelectedInventory(inv);
        setIsDetailOpen(true);
        const mat = getMaterialInfo(inv.material);
        if (mat) fetchLogs(mat._id);
    };

    const openEditDialog = (inv: Inventory) => {
        setImportData({
            material: typeof inv.material === 'string' ? inv.material : inv.material._id,
            stockType: inv.stockType,
            quantity: inv.quantity,
            location: inv.location
        });
        setIsEditing(true);
        setEditId(inv._id);
        setIsImportOpen(true);
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
        <div className="flex flex-col gap-8 max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-8 overflow-x-hidden">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
                <div className="space-y-1">
                    <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
                        {it.title}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base font-medium">
                        {it.subtitle}
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    <Link href="/inventory/materials" className="w-full sm:w-auto">
                        <Button variant="outline" className="w-full gap-2 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all font-bold rounded-xl h-11">
                            <Settings2 className="h-4 w-4" />
                            {it.manageMaterials}
                        </Button>
                    </Link>
                    <Button
                        onClick={() => setIsImportOpen(true)}
                        className="w-full sm:w-auto gap-2 bg-[#E8601C] hover:bg-[#E8601C]/90 text-white shadow-lg shadow-orange-500/20 px-8 transition-all font-bold rounded-xl h-11"
                    >
                        <Plus className="h-4 w-4" />
                        {it.importStock}
                    </Button>
                </div>
            </div>

            {/* Dashboard Actionable Cards - Visual Hierarchy & Click-to-Filter */}
            {!isLoading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    {/* Total Stock Items */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between min-h-[140px]">
                        <div className="flex items-center justify-between mb-4">
                            <div className="h-12 w-12 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-[#1B4B9A] dark:text-blue-400 group-hover:bg-[#1B4B9A] group-hover:text-white transition-colors">
                                <Boxes className="h-6 w-6" />
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded-lg">
                                ENJOY OVERVIEW
                            </span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{it.totalItems}</p>
                            <div className="flex items-baseline gap-2 mt-1">
                                <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{globalStats.totalItems}</h3>
                                <span className="text-[11px] font-bold text-emerald-500 flex items-center bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded-md">
                                    <ArrowUpRight className="h-3 w-3 mr-0.5" />
                                    Active
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Low Stock Card - CLICK TO FILTER */}
                    <button
                        onClick={() => {
                            setShowLowStockOnly(!showLowStockOnly);
                            setCurrentPage(1);
                        }}
                        className={`text-left p-6 rounded-3xl border transition-all flex flex-col justify-between hover:scale-[1.02] active:scale-[0.98] min-h-[140px] shadow-sm ${showLowStockOnly
                            ? 'bg-red-600 border-red-600 shadow-lg shadow-red-500/20 text-white'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-red-200 dark:hover:border-red-900 group'
                            }`}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-colors ${showLowStockOnly ? 'bg-red-500 text-white' : 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
                                }`}>
                                <AlertTriangle className="h-6 w-6" />
                            </div>
                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${showLowStockOnly ? 'bg-red-500 text-white' : 'bg-red-100/50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                }`}>
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                </span>
                                {showLowStockOnly ? 'Active Filter' : 'Alert'}
                            </div>
                        </div>
                        <div>
                            <p className={`text-sm font-bold ${showLowStockOnly ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>{it.lowStock}</p>
                            <h3 className="text-3xl font-black tracking-tight mt-1">
                                {globalStats.lowStockCount}
                            </h3>
                        </div>
                    </button>

                    {/* Total Volume */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between min-h-[140px]">
                        <div className="flex items-center justify-between mb-4">
                            <div className="h-12 w-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                <TrendingUp className="h-6 w-6" />
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded-lg">
                                Aggregate
                            </span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{it.totalQuantity}</p>
                            <div className="flex items-baseline gap-2 mt-1">
                                <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{globalStats.totalQuantity.toLocaleString()}</h3>
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">UNITS</span>
                            </div>
                        </div>
                    </div>

                    {/* Quick Insight - Dynamic */}
                    <div className="bg-slate-900 dark:bg-black p-6 rounded-3xl border border-slate-800 dark:border-slate-900 shadow-xl flex flex-col justify-between overflow-hidden relative min-h-[140px]">
                        {/* Background subtle glass effect */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full -mr-16 -mt-16"></div>

                        <div className="flex items-center gap-2 mb-4 relative z-10">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">Healthy Flow</span>
                        </div>
                        <div className="relative z-10">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">{it.mostStocked}</p>
                            <h3 className="text-lg font-black text-white mt-1 leading-tight line-clamp-1">
                                {globalStats.topMaterials[0] ? (typeof globalStats.topMaterials[0].material === 'string' ? materials.find(m => m._id === globalStats.topMaterials[0].material)?.name : globalStats.topMaterials[0].material.name) : "No Data"}
                            </h3>
                            <p className="text-[10px] text-slate-500 mt-2 flex items-center gap-1 font-bold">
                                <ArrowUpRight className="h-3 w-3" />
                                Updated just now
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Revamped Search & Filter Section - Filter Chips Style */}
            <div className="bg-slate-50/50 dark:bg-slate-900/50 p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 transition-all">
                <div className="flex flex-col lg:flex-row lg:items-end gap-6">
                    {/* Smart Search */}
                    <div className="flex-1 space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">
                            {it.filterLabel} / {it.searchPlaceholder.split(' (')[0]}
                        </Label>
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder={it.searchPlaceholder}
                                className="pl-11 h-12 text-sm border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-[#1B4B9A]/20 bg-white dark:bg-slate-950 shadow-sm rounded-2xl transition-all"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                            />
                        </div>
                    </div>

                    {/* Filter Dropdowns - Grouped with Labels */}
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-4 sm:gap-6">
                        <div className="space-y-2 flex-1 sm:flex-none sm:min-w-[130px]">
                            <Label className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">{it.type}</Label>
                            <Select value={stockTypeFilter} onValueChange={(val) => { if (val) setStockTypeFilter(val); setCurrentPage(1); }}>
                                <SelectTrigger className="h-12 text-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-2xl shadow-sm font-bold">
                                    <SelectValue placeholder={it.type} />
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                    <SelectItem value="all">{lang === 'th' ? 'ทุกประเภท' : 'All Types'}</SelectItem>
                                    <SelectItem value="Raw">Raw</SelectItem>
                                    <SelectItem value="Reuse">Reuse</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2 flex-1 sm:flex-none sm:min-w-[150px]">
                            <Label className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">{it.area}</Label>
                            <Select value={locationFilter} onValueChange={(val) => { if (val) setLocationFilter(val); setCurrentPage(1); }}>
                                <SelectTrigger className="h-12 text-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-2xl shadow-sm font-bold">
                                    <SelectValue placeholder={it.area} />
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                    <SelectItem value="all">{lang === 'th' ? 'ทุกพื้นที่' : 'All Locations'}</SelectItem>
                                    {locations.map(loc => (
                                        <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2 col-span-2 sm:col-auto sm:min-w-[140px]">
                            <Label className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">{it.glassType}</Label>
                            <Select value={glassTypeFilter} onValueChange={(val) => { if (val) setGlassTypeFilter(val); setCurrentPage(1); }}>
                                <SelectTrigger className="h-12 text-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-2xl shadow-sm font-bold">
                                    <SelectValue placeholder={it.glassType} />
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                    <SelectItem value="all">{lang === 'th' ? 'ทุกประเภทกระจก' : 'Any Glass'}</SelectItem>
                                    {glassTypes.map(gt => (
                                        <SelectItem key={gt} value={gt}>{gt}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={resetFilters}
                            className="h-12 w-12 sm:w-auto sm:px-4 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors gap-2 font-bold rounded-2xl self-end shrink-0"
                            title={it.clearFilters}
                        >
                            <FilterX className="h-5 w-5 sm:h-4 sm:w-4" />
                            <span className="hidden sm:inline text-xs">{it.clearFilters}</span>
                        </Button>
                    </div>
                </div>

                {/* Filter Chips Layer (Active status) */}
                {(stockTypeFilter !== "all" || locationFilter !== "all" || glassTypeFilter !== "all" || showLowStockOnly) && (
                    <div className="flex flex-wrap gap-2 mt-6 pt-6 border-t border-slate-200/40 dark:border-slate-800/40">
                        {stockTypeFilter !== "all" && (
                            <Badge variant="secondary" className="bg-[#1B4B9A]/10 text-[#1B4B9A] dark:text-blue-400 border-none px-4 py-1.5 rounded-full text-[11px] font-bold flex gap-2 items-center">
                                {it.type}: {stockTypeFilter}
                                <span className="cursor-pointer hover:text-slate-900 dark:hover:text-white" onClick={() => setStockTypeFilter("all")}>×</span>
                            </Badge>
                        )}
                        {locationFilter !== "all" && (
                            <Badge variant="secondary" className="bg-[#1B4B9A]/10 text-[#1B4B9A] dark:text-blue-400 border-none px-4 py-1.5 rounded-full text-[11px] font-bold flex gap-2 items-center">
                                {it.area}: {locationFilter}
                                <span className="cursor-pointer hover:text-slate-900 dark:hover:text-white" onClick={() => setLocationFilter("all")}>×</span>
                            </Badge>
                        )}
                        {showLowStockOnly && (
                            <Badge variant="secondary" className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-none px-4 py-1.5 rounded-full text-[11px] font-black flex gap-2 items-center animate-in fade-in slide-in-from-left-2 transition-all">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {it.table.lowStock}
                                <span className="cursor-pointer hover:text-slate-900 dark:hover:text-white" onClick={() => setShowLowStockOnly(false)}>×</span>
                            </Badge>
                        )}
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden min-h-[500px]">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50/50 dark:bg-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                                <TableHead className="py-5 pl-8 text-slate-500 dark:text-slate-400 font-black uppercase text-[10px] tracking-widest">{it.table.identity}</TableHead>
                                <TableHead className="py-5 text-slate-500 dark:text-slate-400 font-black uppercase text-[10px] tracking-widest">{it.table.area}</TableHead>
                                <TableHead className="py-5 text-slate-500 dark:text-slate-400 font-black uppercase text-[10px] tracking-widest">{it.table.health}</TableHead>
                                <TableHead className="py-5 text-slate-500 dark:text-slate-400 font-black uppercase text-[10px] tracking-widest">{it.table.type}</TableHead>
                                <TableHead className="py-5 pr-8 text-right text-slate-500 dark:text-slate-400 font-black uppercase text-[10px] tracking-widest">{it.table.quantity}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableSkeleton />
                            ) : paginatedInventories.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-64 text-center">
                                        <div className="flex flex-col items-center justify-center space-y-4 opacity-40">
                                            <Package className="h-16 w-16 text-slate-300 dark:text-slate-700" />
                                            <div className="text-base font-bold text-slate-500 dark:text-slate-400 tracking-tight">No inventory records found matching your filters.</div>
                                            <Button variant="link" onClick={resetFilters} className="text-[#1B4B9A] dark:text-blue-400 font-bold hover:no-underline">Clear all filters</Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedInventories.map((inv) => {
                                    const material = getMaterialInfo(inv.material);
                                    const isLowStock = material && inv.quantity <= material.reorderPoint;
                                    const stockPercentage = material ? Math.min((inv.quantity / (material.reorderPoint * 3)) * 100, 100) : 0;

                                    let statusColor = "bg-emerald-500";
                                    let statusBg = "bg-emerald-50 dark:bg-emerald-900/20";
                                    let statusText = "text-emerald-700 dark:text-emerald-400";
                                    let statusLabel = it.table.healthy;

                                    if (isLowStock) {
                                        statusColor = "bg-red-500";
                                        statusBg = "bg-red-50 dark:bg-red-900/20";
                                        statusText = "text-red-700 dark:text-red-400";
                                        statusLabel = it.table.lowStock;
                                    } else if (material && inv.quantity <= material.reorderPoint * 1.5) {
                                        statusColor = "bg-amber-500";
                                        statusBg = "bg-amber-50 dark:bg-amber-900/20";
                                        statusText = "text-amber-700 dark:text-amber-400";
                                        statusLabel = it.table.warning;
                                    }

                                    return (
                                        <TableRow
                                            key={inv._id}
                                            className={`group cursor-pointer border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-all ${selectedInventory?._id === inv._id ? 'bg-[#1B4B9A]/5 dark:bg-[#1B4B9A]/20' : ''
                                                }`}
                                            onClick={() => openDetails(inv)}
                                        >
                                            <TableCell className="py-5 pl-8">
                                                <div className="flex items-center gap-4">
                                                    <div className={`h-11 w-11 rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 dark:border-slate-800 group-hover:scale-110 transition-transform ${inv.stockType === 'Raw' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'}`}>
                                                        <Package className="h-5 w-5" />
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="font-black text-slate-900 dark:text-white group-hover:text-[#1B4B9A] dark:group-hover:text-blue-400 transition-colors truncate max-w-[200px]">
                                                            {material ? material.name : it.table.unknown}
                                                        </span>
                                                        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-bold truncate max-w-[250px] uppercase tracking-tight">
                                                            {material?.specDetails ? `${material.specDetails.thickness || '-'} / ${material.specDetails.color || '-'} / ${material.specDetails.glassType || '-'}` : "-"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5">
                                                    <Badge variant="outline" className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-[10px] px-2.5 py-1 rounded-xl shadow-sm">
                                                        {inv.location}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-2 w-full max-w-[140px]">
                                                    <div className="flex items-center justify-between">
                                                        <span className={`text-[10px] font-black uppercase tracking-widest ${statusText}`}>
                                                            {statusLabel}
                                                        </span>
                                                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500">{Math.round(stockPercentage)}%</span>
                                                    </div>
                                                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner flex">
                                                        <div
                                                            className={`h-full ${statusColor} rounded-full transition-all duration-700 ease-out shadow-[0_0_12px_rgba(0,0,0,0.15)]`}
                                                            style={{ width: `${stockPercentage}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border-none shadow-sm ${inv.stockType === 'Raw'
                                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                                    : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                                    }`}>
                                                    {inv.stockType}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-5 pr-8">
                                                <div className="flex flex-col items-end gap-1.5">
                                                    <div className="flex items-center gap-4">
                                                        <span className={`font-mono text-xl font-black tracking-tighter ${isLowStock ? 'text-red-600 dark:text-red-500' : 'text-slate-900 dark:text-white'}`}>
                                                            {inv.quantity.toLocaleString()}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                                        {material?.unit || 'units'}
                                                        <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-1.5 transition-transform text-[#1B4B9A] dark:text-blue-400" />
                                                    </span>
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

            {/* Pagination Layer */}
            {!isLoading && totalPages > 1 && (
                <div className="flex justify-center py-6">
                    <Pagination>
                        <PaginationContent className="gap-2">
                            <PaginationItem>
                                <PaginationPrevious
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    className={currentPage === 1
                                        ? "pointer-events-none opacity-30"
                                        : "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all font-bold"
                                    }
                                />
                            </PaginationItem>
                            {[...Array(totalPages)].map((_, i) => (
                                <PaginationItem key={i}>
                                    <PaginationLink
                                        isActive={currentPage === i + 1}
                                        onClick={() => setCurrentPage(i + 1)}
                                        className={`cursor-pointer rounded-xl font-bold transition-all ${currentPage === i + 1
                                            ? "bg-[#1B4B9A] text-white shadow-lg shadow-blue-500/20 border-none hover:bg-[#1B4B9A]/90"
                                            : "hover:bg-slate-100 dark:hover:bg-slate-800"
                                            }`}
                                    >
                                        {i + 1}
                                    </PaginationLink>
                                </PaginationItem>
                            ))}
                            <PaginationItem>
                                <PaginationNext
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    className={currentPage === totalPages
                                        ? "pointer-events-none opacity-30"
                                        : "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all font-bold"
                                    }
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}

            {/* v4 Side Panel Detail (Sheet) */}
            <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <SheetContent className="w-full sm:max-w-lg border-l border-slate-200 dark:border-slate-800 shadow-2xl dark:bg-slate-950 p-0">
                    {selectedInventory && (() => {
                        const mat = getMaterialInfo(selectedInventory.material);
                        return (
                            <div className="flex flex-col h-full">
                                <SheetHeader className="p-8 pb-8 border-b border-slate-100 dark:border-slate-900 bg-slate-50/50 dark:bg-slate-900/50">
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="h-16 w-16 rounded-3xl bg-[#1B4B9A] dark:bg-blue-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/20">
                                            <Package className="h-8 w-8" />
                                        </div>
                                        <div className="text-left space-y-1">
                                            <SheetTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-white leading-tight">{mat?.name || it.table.unknown}</SheetTitle>
                                            <SheetDescription className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                <Info className="h-3.5 w-3.5 text-blue-500" />
                                                ID: {selectedInventory._id.slice(-8)} • {selectedInventory.stockType}
                                            </SheetDescription>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">{it.detail.currentStock}</p>
                                            <p className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tighter">{selectedInventory.quantity.toLocaleString()}</p>
                                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">{mat?.unit || 'Units'}</p>
                                        </div>
                                        <div className={`p-4 rounded-2xl border shadow-sm transition-colors ${selectedInventory.quantity <= (mat?.reorderPoint || 0)
                                            ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/40'
                                            : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/40'
                                            }`}>
                                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">{it.detail.status}</p>
                                            <p className={`text-sm font-black uppercase tracking-widest ${selectedInventory.quantity <= (mat?.reorderPoint || 0)
                                                ? 'text-red-600 dark:text-red-400'
                                                : 'text-emerald-600 dark:text-emerald-400'
                                                }`}>
                                                {selectedInventory.quantity <= (mat?.reorderPoint || 0) ? it.detail.actionRequired : 'Optimal Flow'}
                                            </p>
                                        </div>
                                    </div>
                                </SheetHeader>

                                {/* Detail Tabs/Content */}
                                <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                                    {/* Specifications Widget */}
                                    <section>
                                        <h4 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                                            <div className="h-1.5 w-6 bg-blue-500 rounded-full"></div>
                                            {it.detail.technical}
                                        </h4>
                                        <div className="grid grid-cols-1 gap-y-2">
                                            {[
                                                { label: it.glassType, value: mat?.specDetails?.glassType },
                                                { label: lang === 'th' ? 'ความหนา (มม.)' : 'Thickness (mm)', value: mat?.specDetails?.thickness },
                                                { label: lang === 'th' ? 'โทนสี' : 'Color Palette', value: mat?.specDetails?.color },
                                                { label: it.area, value: selectedInventory.location },
                                                { label: lang === 'th' ? 'จุดเตือนภัย' : 'Alert Threshold', value: `${mat?.reorderPoint || 0} ${mat?.unit}`, critical: true }
                                            ].map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center py-4 border-b border-slate-50 dark:border-slate-900 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-900/50 px-2 rounded-xl transition-colors">
                                                    <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">{item.label}</span>
                                                    <span className={`text-sm font-black ${item.critical ? 'text-red-500 flex items-center gap-1.5' : 'text-slate-700 dark:text-slate-200'}`}>
                                                        {item.critical && <AlertTriangle className="h-4 w-4" />}
                                                        {item.value || '-'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    {/* History Log Widget */}
                                    <section>
                                        <div className="flex items-center justify-between mb-8">
                                            <h4 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] flex items-center gap-3">
                                                <div className="h-1.5 w-6 bg-orange-500 rounded-full"></div>
                                                {it.detail.logs}
                                            </h4>
                                            <Badge variant="outline" className="text-[9px] font-black text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 rounded-lg">{it.detail.last30}</Badge>
                                        </div>
                                        <div className="space-y-6 relative ml-2">
                                            {/* Timeline Line */}
                                            <div className="absolute left-[13px] top-4 bottom-4 w-px bg-slate-100 dark:bg-slate-800"></div>

                                            {isLoadingLogs ? (
                                                <div className="pl-10 py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
                                            ) : materialLogs.length === 0 ? (
                                                <div className="relative flex items-start gap-5 opacity-40 select-none">
                                                    <div className="mt-1.5 h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border-4 border-white dark:border-slate-950 shadow-sm z-10">
                                                        <History className="h-3 w-3 text-slate-400 dark:text-slate-600" />
                                                    </div>
                                                    <div className="flex-1 p-3">
                                                        <p className="text-xs font-bold text-slate-500 dark:text-slate-600 leading-none">{it.detail.noLogs || 'No history found'}</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                materialLogs.map((log) => (
                                                    <div key={log._id} className="relative flex items-start gap-5 group/log">
                                                        <div className={`mt-1.5 h-7 w-7 rounded-full flex items-center justify-center border-4 border-white dark:border-slate-950 shadow-sm z-10 group-hover/log:scale-110 transition-transform ${log.action === 'Import' ? 'bg-emerald-100' :
                                                                log.action === 'Withdraw' ? 'bg-orange-100' :
                                                                    'bg-blue-100'
                                                            }`}>
                                                            {log.action === 'Import' ? <Plus className="h-3 w-3 text-emerald-600" /> :
                                                                log.action === 'Withdraw' ? <ArrowUpRight className="h-3 w-3 text-orange-600" /> :
                                                                    <History className="h-3 w-3 text-blue-600" />}
                                                        </div>
                                                        <div className="flex-1 bg-white dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-50 dark:border-slate-900 shadow-sm">
                                                            <p className="text-xs font-black text-slate-800 dark:text-slate-200 leading-none">{log.action}</p>
                                                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-2">{new Date(log.createdAt).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US')}</p>
                                                            <div className="mt-3 flex items-center gap-2">
                                                                <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest ${log.action === 'Withdraw' ? 'text-orange-600 bg-orange-50' : 'text-emerald-600 bg-emerald-50'
                                                                    }`}>
                                                                    {log.action === 'Withdraw' ? '-' : '+'}{log.quantity} {mat?.unit || 'Units'}
                                                                </span>
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">@{log.warehouseLocation}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </section>
                                </div>

                                {/* Actions Footer */}
                                <div className="p-8 border-t border-slate-100 dark:border-slate-900 bg-white dark:bg-slate-950 mt-auto flex gap-3">
                                    <Button
                                        onClick={() => openEditDialog(selectedInventory)}
                                        variant="outline"
                                        className="flex-1 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 font-black text-[11px] uppercase tracking-wider gap-2 h-14 rounded-2xl shadow-sm"
                                    >
                                        <Edit3 className="h-4 w-4 text-[#1B4B9A]" />
                                        {it.detail.update}
                                    </Button>
                                    <Button
                                        onClick={() => handleDelete(selectedInventory._id)}
                                        variant="outline"
                                        className="w-14 border-slate-200 dark:border-slate-800 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 transition-all h-14 rounded-2xl shadow-sm p-0 flex items-center justify-center"
                                    >
                                        <Trash2 className="h-5 w-5" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })()}
                </SheetContent>
            </Sheet>

            <Dialog open={isImportOpen} onOpenChange={(open) => { if (!open) resetImportForm(); setIsImportOpen(open); }}>
                <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-3xl">
                    <DialogHeader className="p-8 pb-6 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-900">
                        <DialogTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-white uppercase">
                            {isEditing ? (lang === 'th' ? 'แก้ไขข้อมูล' : 'Edit Details') : it.importStock}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                            {isEditing
                                ? (lang === 'th' ? 'ปรับปรุงข้อมูลคลังสินค้า' : 'Update existing inventory record.')
                                : (lang === 'th' ? 'เพิ่มวัสดุใหม่ลงในพื้นที่จัดเก็บ' : 'Add new materials to the inventory locations.')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="p-8 space-y-6">
                        <div className="space-y-2.5">
                            <Label htmlFor="material" className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
                                {lang === 'th' ? 'รายการวัสดุ' : 'Material Item'} *
                            </Label>
                            <Select
                                value={importData.material}
                                onValueChange={(val) => {
                                    if (val) setImportData({ ...importData, material: val })
                                }}
                            >
                                <SelectTrigger className="h-12 w-full border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-[#E8601C]/20 bg-white dark:bg-slate-950 rounded-2xl font-bold transition-all">
                                    <SelectValue placeholder={lang === 'th' ? 'เลือกวัสดุ...' : 'Select material...'}>
                                        {importData.material && materials.find(m => m._id === importData.material)?.name}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px] rounded-2xl dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                    {materials.map(m => (
                                        <SelectItem
                                            key={m._id}
                                            value={m._id}
                                            className="cursor-pointer py-3 border-b border-slate-50 dark:border-slate-800/50 last:border-0 focus:bg-[#E8601C] focus:text-white rounded-none first:rounded-t-xl last:rounded-b-xl transition-colors group"
                                        >
                                            <div className="flex flex-col gap-1">
                                                <span className="font-black text-sm text-slate-900 dark:text-white leading-tight group-focus:text-white transition-colors">{m.name}</span>
                                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase leading-none tracking-tight group-focus:text-orange-100/70 transition-colors">
                                                    {m.specDetails?.thickness} / {m.specDetails?.color} / {m.specDetails?.glassType}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2.5">
                                <Label htmlFor="stockType" className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">{it.type}</Label>
                                <Select
                                    value={importData.stockType}
                                    onValueChange={(val) => {
                                        if (val === "Raw" || val === "Reuse") {
                                            setImportData({ ...importData, stockType: val })
                                        }
                                    }}
                                >
                                    <SelectTrigger className="h-12 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-2xl font-bold">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-2xl dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                        <SelectItem value="Raw">Raw</SelectItem>
                                        <SelectItem value="Reuse">Reuse</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2.5">
                                <Label htmlFor="quantity" className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">{it.table.quantity} *</Label>
                                <Input
                                    id="quantity"
                                    type="number"
                                    min="1"
                                    className="h-12 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-2xl font-black text-base"
                                    value={importData.quantity}
                                    onChange={(e) => setImportData({ ...importData, quantity: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2.5">
                                <Label htmlFor="location" className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">{lang === 'th' ? 'ตำแหน่งคลังสินค้า' : 'Warehouse Location'} *</Label>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {locations.slice(0, 5).map(loc => (
                                        <button
                                            key={loc}
                                            onClick={() => setImportData({ ...importData, location: loc })}
                                            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${importData.location === loc
                                                    ? 'bg-[#E8601C] border-[#E8601C] text-white shadow-lg shadow-orange-500/20 scale-105'
                                                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-[#E8601C]/50'
                                                }`}
                                        >
                                            {loc}
                                        </button>
                                    ))}
                                </div>
                                <Input
                                    id="location"
                                    className="h-12 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-2xl font-bold placeholder:font-medium transition-all focus:ring-2 focus:ring-[#E8601C]/20"
                                    placeholder="e.g. A1, Shelf 3, Rack B"
                                    value={importData.location}
                                    onChange={(e) => setImportData({ ...importData, location: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="p-8 pt-0 bg-white dark:bg-slate-950 border-t-0 flex-row gap-4 sm:justify-end">
                        <Button
                            variant="ghost"
                            onClick={() => setIsImportOpen(false)}
                            disabled={isSubmitting}
                            className="h-12 px-6 font-black text-xs uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                            {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                        </Button>
                        <Button
                            onClick={handleImport}
                            disabled={isSubmitting || !importData.material || !importData.location || importData.quantity <= 0}
                            className="bg-[#1B4B9A] hover:bg-[#1B4B9A]/90 text-white h-12 px-8 font-black text-xs uppercase tracking-[0.1em] rounded-2xl shadow-xl shadow-blue-500/20"
                        >
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isEditing ? (lang === 'th' ? 'บันทึกการเปลี่ยนแปลง' : 'Save Changes') : it.importStock}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
