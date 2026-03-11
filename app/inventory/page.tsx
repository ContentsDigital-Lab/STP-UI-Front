"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
    Plus,
    Search,
    Filter,
    ArrowUpRight,
    TrendingUp,
    AlertTriangle,
    Boxes,
    Package,
    Warehouse,
    ChevronLeft,
    ChevronRight,
    MoreHorizontal,
    Edit3,
    History,
    CheckCircle2,
    Clock,
    Shield,
    X,
    Settings2,
    Trash2
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Sheet,
    SheetContent,
    SheetHeader,
} from "@/components/ui/sheet";
import { inventoriesApi } from "@/lib/api/inventories";
import { materialsApi } from "@/lib/api/materials";
import { materialLogsApi } from "@/lib/api/material-logs";
import { Inventory, Material, MaterialLog } from "@/lib/api/types";
import { useWebSocket } from "@/lib/hooks/use-socket";

const ITEMS_PER_PAGE = 10;

export default function InventoryPage() {
    const { t, lang } = useLanguage();
    const it = t.inventory_dashboard;

    const [isLoading, setIsLoading] = useState(true);
    const [inventories, setInventories] = useState<Inventory[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
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

    // WebSocket for real-time updates (v8 Socket.io + Rooms)
    const inventoryEvents = ['inventory:updated', 'material:updated'];
    useWebSocket('inventory', inventoryEvents, (event: string) => {
        console.log(`[Inventory] Received ${event}, refreshing data...`);
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
    }, [inventories, materials, searchQuery, stockTypeFilter, locationFilter, thicknessFilter, colorFilter, glassTypeFilter, showLowStockOnly, getMaterialInfo]);

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
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between overflow-hidden relative min-h-[140px]">
                        <div className="flex items-center justify-between mb-4">
                            <div className="h-12 w-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                <CheckCircle2 className="h-6 w-6" />
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded-lg">
                                Healthy Flow
                            </span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{it.mostStocked}</p>
                            <h4 className="text-lg font-black text-slate-900 dark:text-white truncate group-hover:text-[#E8601C] transition-colors mt-1">
                                {globalStats.topMaterials[0]
                                    ? (getMaterialInfo(globalStats.topMaterials[0].material)?.name || "N/A")
                                    : "---"}
                            </h4>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter & Search Bar */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                <div className="flex flex-col lg:flex-row items-end gap-6 overflow-x-auto pb-2 scrollbar-hide">
                    {/* Search Field */}
                    <div className="w-full lg:max-w-md space-y-2 shrink-0">
                        <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                            <Search className="h-3 w-3" />
                            Quick Search
                        </Label>
                        <div className="relative group">
                            <Input
                                placeholder={it.searchPlaceholder}
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="pl-4 pr-10 h-12 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 focus:ring-[#E8601C] focus:border-[#E8601C] rounded-2xl transition-all font-medium text-sm"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                        {/* Area Filter */}
                        <div className="w-[180px] space-y-2">
                            <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                <Warehouse className="h-3 w-3" />
                                {it.area}
                            </Label>
                            <Select value={locationFilter} onValueChange={(val) => { setLocationFilter(val || "all"); setCurrentPage(1); }}>
                                <SelectTrigger className="h-12 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm focus:ring-[#E8601C]">
                                    <SelectValue placeholder="All Areas" />
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl border-slate-200 dark:border-slate-800">
                                    <SelectItem value="all" className="font-bold">All Areas</SelectItem>
                                    {locations.map(loc => (
                                        <SelectItem key={loc} value={loc} className="font-bold">{loc}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Glass Type Filter */}
                        <div className="w-[180px] space-y-2">
                            <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                <Package className="h-3 w-3" />
                                {it.glassType}
                            </Label>
                            <Select value={glassTypeFilter} onValueChange={(val) => { setGlassTypeFilter(val || "all"); setCurrentPage(1); }}>
                                <SelectTrigger className="h-12 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm focus:ring-[#E8601C]">
                                    <SelectValue placeholder="All Types" />
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl border-slate-200 dark:border-slate-800">
                                    <SelectItem value="all" className="font-bold">All Types</SelectItem>
                                    {glassTypes.map(type => (
                                        <SelectItem key={type} value={type} className="font-bold">{type}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* More Filters / Reset */}
                        <div className="flex items-center gap-2 pt-6">
                            {(searchQuery || locationFilter !== "all" || glassTypeFilter !== "all" || showLowStockOnly) && (
                                <Button
                                    variant="ghost"
                                    onClick={resetFilters}
                                    className="h-12 rounded-2xl text-slate-500 hover:text-[#E8601C] font-bold px-4"
                                >
                                    {it.clearFilters}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Table Content */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                                <TableHead className="font-black text-xs uppercase tracking-widest py-5 px-6 text-slate-500 dark:text-slate-400">{it.table.identity}</TableHead>
                                <TableHead className="font-black text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400">{it.table.area}</TableHead>
                                <TableHead className="font-black text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400">{it.table.health}</TableHead>
                                <TableHead className="font-black text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400">{it.table.type}</TableHead>
                                <TableHead className="font-black text-xs uppercase tracking-widest py-5 text-center text-slate-500 dark:text-slate-400">{it.table.quantity}</TableHead>
                                <TableHead className="text-right py-5 pr-6"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableSkeleton />
                            ) : paginatedInventories.length > 0 ? (
                                paginatedInventories.map((inv) => {
                                    const mat = getMaterialInfo(inv.material);
                                    const isLow = mat && inv.quantity <= mat.reorderPoint;
                                    const statusText = isLow ? it.table.lowStock : it.table.healthy;

                                    return (
                                        <TableRow
                                            key={inv._id}
                                            className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 border-slate-100 dark:border-slate-800 transition-colors cursor-pointer"
                                            onClick={() => openDetails(inv)}
                                        >
                                            <TableCell className="py-5 px-6">
                                                <div className="flex flex-col">
                                                    <span className="font-black text-slate-900 dark:text-white group-hover:text-[#E8601C] transition-colors">
                                                        {mat?.name || it.table.unknown}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase flex items-center mt-1">
                                                        {mat?.specDetails?.thickness && <span className="mr-2">{mat.specDetails.thickness}</span>}
                                                        {mat?.specDetails?.color && <span>{mat.specDetails.color}</span>}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-5">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-700"></div>
                                                    <span className="font-bold text-slate-600 dark:text-slate-300 text-sm italic">{inv.location}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-5">
                                                <Badge
                                                    variant="secondary"
                                                    className={`rounded-lg px-2 py-0.5 font-bold uppercase text-[10px] tracking-wider ${isLow
                                                        ? "bg-red-50 dark:bg-red-900/20 text-red-600 border-red-100 dark:border-red-900/50"
                                                        : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border-emerald-100 dark:border-emerald-900/50"
                                                        }`}
                                                >
                                                    {statusText}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-5">
                                                <span className={`text-[11px] font-black tracking-widest uppercase px-2 py-1 rounded-md ${inv.stockType === "Raw"
                                                    ? "bg-blue-50 dark:bg-blue-900/30 text-[#1B4B9A] dark:text-blue-400"
                                                    : "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                                                    }`}>
                                                    {inv.stockType}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-5 text-center">
                                                <span className="text-xl font-black text-slate-900 dark:text-white group-hover:scale-110 inline-block transition-transform tabular-nums">
                                                    {inv.quantity.toLocaleString()}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-5 pr-6 text-right" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => openDetails(inv)}
                                                    className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                                >
                                                    <MoreHorizontal className="h-5 w-5" />
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="h-16 w-16 rounded-3xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-700">
                                                <Boxes className="h-8 w-8" />
                                            </div>
                                            <p className="text-slate-500 dark:text-slate-400 font-bold tracking-tight">ไม่พบข้อมูลที่ต้องการ</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            Showing page {currentPage} of {totalPages}
                        </span>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => prev - 1)}
                                className="h-9 px-3 rounded-xl border-slate-200 dark:border-slate-800 font-bold"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className="flex gap-1">
                                {[...Array(totalPages)].map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setCurrentPage(i + 1)}
                                        className={`h-9 w-9 rounded-xl flex items-center justify-center text-xs font-black transition-all ${currentPage === i + 1
                                            ? "bg-[#E8601C] text-white shadow-lg shadow-orange-500/20"
                                            : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                                            }`}
                                    >
                                        {i + 1}
                                    </button>
                                ))}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(prev => prev + 1)}
                                className="h-9 px-3 rounded-xl border-slate-200 dark:border-slate-800 font-bold"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Item Detail Side Panel */}
            <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <SheetContent className="sm:max-w-md border-l border-slate-200 dark:border-slate-800 p-0 overflow-y-auto bg-slate-50 dark:bg-slate-950">
                    {selectedInventory && (
                        <div className="flex flex-col h-full">
                            {/* Panel Header */}
                            <div className="p-8 pb-10 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-3xl rounded-full -mr-16 -mt-16"></div>

                                <div className="space-y-4 relative z-10">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="rounded-md px-2 py-0 text-[9px] font-black uppercase tracking-tighter border-slate-200 dark:border-slate-700 text-slate-400">
                                            #{selectedInventory._id.slice(-6).toUpperCase()}
                                        </Badge>
                                        <span className={`h-2 w-2 rounded-full ${getMaterialInfo(selectedInventory.material)?.reorderPoint && selectedInventory.quantity <= getMaterialInfo(selectedInventory.material)!.reorderPoint ? "bg-red-500" : "bg-emerald-500"}`}></span>
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                                            {getMaterialInfo(selectedInventory.material)?.name || "N/A"}
                                        </h2>
                                        <div className="flex items-center gap-2 mt-2">
                                            <Warehouse className="h-4 w-4 text-slate-400" />
                                            <span className="text-sm font-bold text-slate-500 italic">{selectedInventory.location}</span>
                                        </div>
                                    </div>

                                    {/* Stock Badge - Background Styled */}
                                    <div className={`p-6 rounded-3xl mt-6 flex flex-col items-center justify-center border shadow-sm ${getMaterialInfo(selectedInventory.material)?.reorderPoint && selectedInventory.quantity <= getMaterialInfo(selectedInventory.material)!.reorderPoint
                                        ? "bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/50"
                                        : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/50"
                                        }`}>
                                        <span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${getMaterialInfo(selectedInventory.material)?.reorderPoint && selectedInventory.quantity <= getMaterialInfo(selectedInventory.material)!.reorderPoint ? "text-red-500" : "text-emerald-600"
                                            }`}>
                                            {it.detail.currentStock}
                                        </span>
                                        <div className={`text-5xl font-black tracking-tighter tabular-nums ${getMaterialInfo(selectedInventory.material)?.reorderPoint && selectedInventory.quantity <= getMaterialInfo(selectedInventory.material)!.reorderPoint ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"
                                            }`}>
                                            {selectedInventory.quantity.toLocaleString()}
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase">Quantity Balance</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 space-y-10">
                                {/* Technical Details */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <Shield className="h-4 w-4 text-[#E8601C]" />
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">{it.detail.technical}</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Stock Type</p>
                                            <p className="text-sm font-black text-slate-900 dark:text-white uppercase">{selectedInventory.stockType}</p>
                                        </div>
                                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Thickness</p>
                                            <p className="text-sm font-black text-slate-900 dark:text-white">{getMaterialInfo(selectedInventory.material)?.specDetails?.thickness || "-"}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Flow Logs */}
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <History className="h-4 w-4 text-[#E8601C]" />
                                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">{it.detail.logs}</h3>
                                        </div>
                                        <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-800 text-slate-400 border-none font-bold uppercase text-[9px] px-2">
                                            {it.detail.last30}
                                        </Badge>
                                    </div>

                                    <div className="space-y-4">
                                        {isLoadingLogs ? (
                                            <div className="space-y-3">
                                                {[...Array(3)].map((_, i) => (
                                                    <Skeleton key={i} className="h-16 w-full rounded-2xl" />
                                                ))}
                                            </div>
                                        ) : materialLogs.length > 0 ? (
                                            materialLogs.map((log) => (
                                                <div key={log._id} className="flex gap-4 relative group">
                                                    {/* Vertical Flow Line */}
                                                    <div className="absolute left-[39px] top-6 bottom-[-20px] w-0.5 bg-slate-200 dark:bg-slate-800 hidden group-last:hidden"></div>

                                                    <div className={`h-20 w-20 rounded-2xl shrink-0 flex flex-col items-center justify-center border shadow-sm ${log.action === 'Import'
                                                        ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40 text-emerald-600"
                                                        : "bg-orange-50 dark:bg-orange-950/20 border-orange-100 dark:border-orange-900/40 text-orange-600"
                                                        }`}>
                                                        <span className="text-[10px] font-black uppercase leading-none mb-1">
                                                            {log.action === 'Import' ? '+' : '-'}
                                                        </span>
                                                        <span className="text-lg font-black tracking-tighter leading-none">
                                                            {log.quantity.toLocaleString()}
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-col justify-center gap-1">
                                                        <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                                            {log.action === 'Import' ? 'นำเข้าวัสดุ' : 'เบิกออกวัสดุ'}
                                                        </p>
                                                        <div className="flex flex-col gap-0.5">
                                                            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                                                                <Clock className="h-3 w-3" />
                                                                <span className="text-[10px] font-bold uppercase">
                                                                    {new Date(log.createdAt).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
                                                                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                                                    })}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-slate-400">
                                                                <Warehouse className="h-3 w-3" />
                                                                <span className="text-[10px] font-bold italic">{log.warehouseLocation}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="py-12 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center px-6">
                                                <History className="h-8 w-8 text-slate-200 dark:text-slate-800 mb-3" />
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{it.detail.noLogs}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Panel Footer */}
                            <div className="mt-auto p-8 pt-0 grid grid-cols-2 gap-3">
                                <Button
                                    onClick={() => handleDelete(selectedInventory._id)}
                                    variant="outline"
                                    className="rounded-2xl h-14 border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 font-black tracking-tight"
                                >
                                    <Trash2 className="h-5 w-5" />
                                </Button>
                                <Button
                                    onClick={() => openEditDialog(selectedInventory)}
                                    className="rounded-2xl h-14 bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-[#E8601C] dark:hover:bg-[#E8601C] hover:text-white transition-all font-black tracking-tight"
                                >
                                    <Edit3 className="mr-2 h-5 w-5" />
                                    {it.detail.update}
                                </Button>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            {/* Import/Edit Dialog */}
            <Dialog open={isImportOpen} onOpenChange={(open) => {
                setIsImportOpen(open);
                if (!open) resetImportForm();
            }}>
                <DialogContent className="sm:max-w-[500px] border-slate-200 dark:border-slate-800 rounded-3xl p-8 bg-white dark:bg-slate-950 max-h-[90vh] overflow-y-auto">
                    <DialogHeader className="mb-6">
                        <DialogTitle className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                            {isEditing ? it.detail.update : it.importStock}
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 font-medium">
                            {isEditing ? "ปรับปรุงข้อมูลวัสดุในคลัง" : "เพิ่มวัสดุใหม่เข้าสู่ระบบจัดการสต็อก"}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-8">
                        {/* Material Selection */}
                        <div className="space-y-3">
                            <Label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Package className="h-3 w-3" />
                                เลือกวัสดุ (Material Identity)
                            </Label>
                            <Select
                                value={importData.material}
                                onValueChange={(val) => setImportData({ ...importData, material: val || "" })}
                            >
                                <SelectTrigger className="h-14 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-black text-slate-900 dark:text-white px-5 focus:ring-[#E8601C] focus:border-[#E8601C]">
                                    <SelectValue placeholder="Select a material..." />
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl border-slate-200 dark:border-slate-800 p-2">
                                    {materials.map(mat => (
                                        <SelectItem
                                            key={mat._id}
                                            value={mat._id}
                                            className="rounded-xl py-3 font-bold focus:bg-[#E8601C] focus:text-white"
                                        >
                                            <div className="flex flex-col">
                                                <span>{mat.name}</span>
                                                <span className="text-[10px] opacity-70">
                                                    {mat.specDetails?.thickness} {mat.specDetails?.color}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Location Suggestion System */}
                        <div className="space-y-4">
                            <div className="space-y-3">
                                <Label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <Warehouse className="h-3 w-3" />
                                    สถานที่จัดเก็บ (Warehouse Location)
                                </Label>
                                <Input
                                    placeholder="เช่น A01-01, B2..."
                                    value={importData.location}
                                    onChange={(e) => setImportData({ ...importData, location: e.target.value })}
                                    className="h-14 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-black text-slate-900 dark:text-white px-5 uppercase focus:ring-[#E8601C] focus:border-[#E8601C]"
                                />
                            </div>

                            {/* Recommendation Badges */}
                            <div className="space-y-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">ข้อเสนอแนะล่าสุด</p>
                                <div className="flex flex-wrap gap-2">
                                    {locations.slice(0, 5).map(loc => (
                                        <button
                                            key={loc}
                                            onClick={() => setImportData({ ...importData, location: loc })}
                                            className={`px-3 py-1.5 rounded-xl border text-[11px] font-black transition-all ${importData.location === loc
                                                ? "bg-[#E8601C] border-[#E8601C] text-white shadow-md"
                                                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-[#E8601C] hover:text-[#E8601C]"
                                                }`}
                                        >
                                            {loc}
                                        </button>
                                    ))}
                                    {locations.length === 0 && (
                                        <span className="text-[10px] text-slate-400 italic">ยังไม่มีประวัติสถานที่...</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            {/* Stock Type */}
                            <div className="space-y-3">
                                <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">ประเภทสต็อก</Label>
                                <Select
                                    value={importData.stockType}
                                    onValueChange={(val) => setImportData({ ...importData, stockType: (val as "Raw" | "Reuse") || "Raw" })}
                                >
                                    <SelectTrigger className="h-14 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-black px-5 focus:ring-[#E8601C]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-2xl border-slate-200 dark:border-slate-800">
                                        <SelectItem value="Raw" className="font-bold">RAW MATERIAL</SelectItem>
                                        <SelectItem value="Reuse" className="font-bold">REUSABLE</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Quantity */}
                            <div className="space-y-3">
                                <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">จำนวนสินค้า (QTY)</Label>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        value={importData.quantity}
                                        onChange={(e) => setImportData({ ...importData, quantity: parseInt(e.target.value) || 0 })}
                                        className="h-14 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-black text-slate-900 dark:text-white px-5 focus:ring-[#E8601C]"
                                    />
                                    <Package className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800">
                        <Button
                            variant="ghost"
                            onClick={() => setIsImportOpen(false)}
                            className="rounded-2xl h-14 font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white px-8"
                        >
                            ยกเลิก
                        </Button>
                        <Button
                            onClick={handleImport}
                            disabled={isSubmitting || !importData.material || !importData.location}
                            className={`rounded-2xl h-14 min-w-[160px] font-black tracking-tight text-white transition-all shadow-xl ${isSubmitting ? "bg-slate-400" : "bg-slate-900 dark:bg-white dark:text-slate-900 hover:bg-[#E8601C] dark:hover:bg-[#E8601C] dark:hover:text-white"
                                }`}
                        >
                            {isSubmitting ? "Processing..." : (isEditing ? "บันทึกการแก้ไข" : "ยืนยันนำเข้าสต็อก")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
