"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
    History,
    CheckCircle2,
    Clock,
    Shield,
    X,
    Settings2,
    Trash2,
    MapPin,
    ChevronDown,
    ArrowRightLeft
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
import { toast } from "sonner";
import { inventoriesApi } from "@/lib/api/inventories";
import { materialsApi } from "@/lib/api/materials";
import { materialLogsApi } from "@/lib/api/material-logs";
import { Inventory, Material, MaterialLog } from "@/lib/api/types";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { useAuth } from "@/lib/auth/auth-context";

const ITEMS_PER_PAGE = 10;

export default function InventoryPage() {
    const { t, lang } = useLanguage();
    const it = t.inventory_dashboard;
    const { user: currentWorker } = useAuth();

    const [isLoading, setIsLoading] = useState(true);
    const [inventories, setInventories] = useState<Inventory[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [selectedInventory, setSelectedInventory] = useState<Inventory | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [materialLogs, setMaterialLogs] = useState<MaterialLog[]>([]);
    const [allLogsForMaterial, setAllLogsForMaterial] = useState<MaterialLog[]>([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [stockTypeFilter, setStockTypeFilter] = useState<string>("all");
    const [showLowStockOnly, setShowLowStockOnly] = useState<boolean>(false);
    const [locationFilter, setLocationFilter] = useState<string>("all");
    const [thicknessFilter, setThicknessFilter] = useState<string>("all");
    const [colorFilter, setColorFilter] = useState<string>("all");
    const [glassTypeFilter, setGlassTypeFilter] = useState<string>("all");

    // Location autocomplete (Import dialog)
    const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
    const locationInputRef = useRef<HTMLInputElement>(null);
    const locationDropdownRef = useRef<HTMLDivElement>(null);

    // Location autocomplete (Move dialog)
    const [moveLocationDropdownOpen, setMoveLocationDropdownOpen] = useState(false);
    const moveLocationInputRef = useRef<HTMLInputElement>(null);
    const moveLocationDropdownRef = useRef<HTMLDivElement>(null);

    // Location usage frequency (persisted in localStorage)
    const [locationUsage, setLocationUsage] = useState<Record<string, number>>({});

    // Location colors (persisted in localStorage)
    const [locationColors, setLocationColors] = useState<Record<string, string>>({});

    const generateLocationColor = useCallback((existingColors: Record<string, string>) => {
        const count = Object.keys(existingColors).length;
        // Golden angle distribution for maximum hue spread
        const hue = (count * 137.508) % 360;
        // Vary saturation and lightness for distinction
        const saturation = 65 + (count * 17 % 26); // 65-90%
        const lightness = 45 + (count * 23 % 21);  // 45-65%
        return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
    }, []);

    const getLocationColor = useCallback((loc: string) => {
        if (locationColors[loc]) return locationColors[loc];
        const color = generateLocationColor(locationColors);
        const updated = { ...locationColors, [loc]: color };
        setLocationColors(updated);
        localStorage.setItem('locationColorMap', JSON.stringify(updated));
        return color;
    }, [locationColors, generateLocationColor]);

    useEffect(() => {
        try {
            const stored = localStorage.getItem('locationUsageFrequency');
            if (stored) setLocationUsage(JSON.parse(stored));
            const storedColors = localStorage.getItem('locationColorMap');
            if (storedColors) setLocationColors(JSON.parse(storedColors));
        } catch { /* ignore */ }
    }, []);

    const trackLocationUsage = useCallback((loc: string) => {
        setLocationUsage(prev => {
            const updated = { ...prev, [loc]: (prev[loc] || 0) + 1 };
            localStorage.setItem('locationUsageFrequency', JSON.stringify(updated));
            return updated;
        });
    }, []);

    // Close location dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                locationDropdownRef.current &&
                !locationDropdownRef.current.contains(e.target as Node) &&
                locationInputRef.current &&
                !locationInputRef.current.contains(e.target as Node)
            ) {
                setLocationDropdownOpen(false);
            }
            if (
                moveLocationDropdownRef.current &&
                !moveLocationDropdownRef.current.contains(e.target as Node) &&
                moveLocationInputRef.current &&
                !moveLocationInputRef.current.contains(e.target as Node)
            ) {
                setMoveLocationDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


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

    // Import Dialog
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [importData, setImportData] = useState({
        material: "",
        stockType: "Raw" as "Raw" | "Reuse",
        quantity: 1,
        location: ""
    });

    // Delete confirmation
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

    // Move Stock Dialog
    const [isMoveOpen, setIsMoveOpen] = useState(false);
    const [moveSource, setMoveSource] = useState<Inventory | null>(null);
    const [moveQty, setMoveQty] = useState(1);
    const [moveDestType, setMoveDestType] = useState<"existing" | "new">("existing");
    const [moveDestId, setMoveDestId] = useState("");
    const [moveDestLocation, setMoveDestLocation] = useState("");
    const [moveDestStockType, setMoveDestStockType] = useState<"Raw" | "Reuse">("Raw");
    const [isMoveSubmitting, setIsMoveSubmitting] = useState(false);

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
            // Aggregation Logic: Check if material + location + stockType already exists
            const existing = inventories.find(inv =>
                (typeof inv.material === 'string' ? inv.material : (inv.material as Material)._id) === importData.material &&
                inv.location.toLowerCase() === importData.location.toLowerCase() &&
                inv.stockType === importData.stockType
            );

            if (existing) {
                const newQty = existing.quantity + importData.quantity;
                const response = await inventoriesApi.update(existing._id, { quantity: newQty });
                if (response.success && response.data) {
                    setInventories(prev => prev.map(inv => inv._id === existing._id ? response.data! : inv));
                    await materialLogsApi.create({
                        material: importData.material,
                        actionType: "import",
                        quantityChanged: importData.quantity,
                        stockType: importData.stockType,
                        referenceId: existing._id,
                        ...(currentWorker ? { worker: currentWorker._id } : {}),
                    }).catch(err => console.error("Failed to create material log:", err));
                    setIsImportOpen(false);
                    resetImportForm();
                }
            } else {
                const response = await inventoriesApi.create(importData);
                if (response.success && response.data) {
                    setInventories([response.data, ...inventories]);
                    await materialLogsApi.create({
                        material: importData.material,
                        actionType: "import",
                        quantityChanged: importData.quantity,
                        stockType: importData.stockType,
                        referenceId: response.data._id,
                        ...(currentWorker ? { worker: currentWorker._id } : {}),
                    }).catch(err => console.error("Failed to create material log:", err));
                    setIsImportOpen(false);
                    resetImportForm();
                }
            }
        } catch (error) {
            console.error("Failed to process inventory:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = (id: string) => setDeleteTargetId(id);

    const executeDelete = async () => {
        if (!deleteTargetId) return;
        const id = deleteTargetId;
        setDeleteTargetId(null);
        try {
            const res = await inventoriesApi.delete(id);
            if (res.success) {
                setInventories(prev => prev.filter(inv => inv._id !== id));
                setIsDetailOpen(false);
                setSelectedInventory(null);
                toast.success(lang === 'th' ? 'ลบรายการเรียบร้อย' : 'Item deleted');
            } else {
                toast.error(lang === 'th' ? 'ลบไม่สำเร็จ' : 'Failed to delete');
            }
        } catch (err) {
            console.error("Failed to delete inventory item:", err);
            toast.error(lang === 'th' ? 'เกิดข้อผิดพลาด' : 'Something went wrong');
        }
    };

    const fetchLogs = async (matId: string, invId: string) => {
        setIsLoadingLogs(true);
        try {
            const res = await materialLogsApi.getAll({ materialId: matId });
            if (res.success && res.data) {
                // Store ALL logs for this material — needed to detect move pairs across slots
                setAllLogsForMaterial(res.data);
                // Filter to only logs relevant to this specific inventory slot
                const filtered = res.data.filter(log => {
                    if (log.referenceId && !log.referenceType) {
                        return log.referenceId === invId;
                    }
                    return !log.referenceId;
                });
                setMaterialLogs(
                    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10)
                );
            }
        } catch (err) {
            console.error("Failed to load material logs:", err);
        } finally {
            setIsLoadingLogs(false);
        }
    };

    // Refs to avoid stale closures in WebSocket callback
    const selectedInventoryRef = useRef<Inventory | null>(null);
    useEffect(() => { selectedInventoryRef.current = selectedInventory; }, [selectedInventory]);
    const fetchLogsRef = useRef<(matId: string, invId: string) => Promise<void>>(async () => {});
    useEffect(() => { fetchLogsRef.current = fetchLogs; }, [fetchLogs]);

    // WebSocket for real-time log updates in side panel
    // Server emits only "log:updated" for all actions
    useWebSocket('log', ['log:updated'], (_event: string, data: unknown) => {
        const payload = data as { action?: string; data?: MaterialLog };
        const inv = selectedInventoryRef.current;
        if (!inv) return;
        const openMatId = typeof inv.material === 'string' ? inv.material : (inv.material as Material)._id;
        const logMatId = payload?.data?.material
            ? (typeof payload.data.material === 'string' ? payload.data.material : (payload.data.material as Material)._id)
            : null;
        if (logMatId && logMatId === openMatId) {
            fetchLogsRef.current(openMatId, inv._id);
        }
    });

    const resetImportForm = () => {
        setImportData({ material: "", stockType: "Raw", quantity: 1, location: "" });
    };

    const openDetails = (inv: Inventory) => {
        setSelectedInventory(inv);
        setIsDetailOpen(true);
        const mat = getMaterialInfo(inv.material);
        if (mat) fetchLogs(mat._id, inv._id);
    };

    const resetMoveForm = () => {
        setMoveQty(1);
        setMoveDestType("existing");
        setMoveDestId("");
        setMoveDestLocation("");
        setMoveLocationDropdownOpen(false);
    };

    const openMoveDialog = (inv: Inventory) => {
        setMoveSource(inv);
        resetMoveForm();
        setIsMoveOpen(true);
    };

    const handleMove = async () => {
        if (!moveSource) return;
        if (moveQty <= 0 || moveQty > moveSource.quantity) return;
        if (moveDestType === "existing" && !moveDestId) return;
        if (moveDestType === "new" && !moveDestLocation.trim()) return;

        // Prevent moving to the same location
        const destLocCheck = moveDestType === "existing"
            ? inventories.find(inv => inv._id === moveDestId)?.location
            : moveDestLocation.trim();
        if (destLocCheck && destLocCheck.toLowerCase() === moveSource.location.toLowerCase()) {
            toast.error(lang === 'th' ? 'ไม่สามารถย้ายไปยังตำแหน่งเดิมได้' : 'Cannot move to the same location');
            return;
        }

        setIsMoveSubmitting(true);
        const matId = typeof moveSource.material === 'string'
            ? moveSource.material
            : (moveSource.material as Material)._id;

        try {
            // 1. Decrease source quantity
            const newSourceQty = moveSource.quantity - moveQty;
            await inventoriesApi.update(moveSource._id, { quantity: newSourceQty });

            // 2. Increase / create destination
            let destInventoryId: string;
            if (moveDestType === "existing") {
                const dest = inventories.find(inv => inv._id === moveDestId)!;
                await inventoriesApi.update(moveDestId, { quantity: dest.quantity + moveQty });
                destInventoryId = moveDestId;
            } else {
                const destLoc = moveDestLocation.trim();
                const existing = inventories.find(inv =>
                    (typeof inv.material === 'string' ? inv.material : (inv.material as Material)._id) === matId &&
                    inv.location.toLowerCase() === destLoc.toLowerCase() &&
                    inv.stockType === moveSource.stockType &&
                    inv._id !== moveSource._id
                );
                if (existing) {
                    await inventoriesApi.update(existing._id, { quantity: existing.quantity + moveQty });
                    destInventoryId = existing._id;
                } else {
                    const newInvRes = await inventoriesApi.create({
                        material: matId,
                        stockType: moveSource.stockType,
                        quantity: moveQty,
                        location: destLoc,
                    });
                    if (!newInvRes.success || !newInvRes.data) throw new Error("Failed to create destination inventory");
                    destInventoryId = newInvRes.data._id;
                }
            }

            // 3. Create withdraw log for source
            const withdrawLogRes = await materialLogsApi.create({
                material: matId,
                actionType: "withdraw",
                quantityChanged: -moveQty,
                stockType: moveSource.stockType,
                referenceId: moveSource._id,
                ...(currentWorker ? { worker: currentWorker._id } : {}),
            });

            // 4. Create import log for destination (linked via parentLog)
            await materialLogsApi.create({
                material: matId,
                actionType: "import",
                quantityChanged: moveQty,
                stockType: moveSource.stockType,
                referenceId: destInventoryId,
                parentLog: withdrawLogRes.data?._id,
                ...(currentWorker ? { worker: currentWorker._id } : {}),
            });

            // 5. Refresh inventory data
            await fetchData(false);

            // 6. If side panel is open for source, update its quantity and logs
            if (selectedInventory?._id === moveSource._id) {
                setSelectedInventory(prev => prev ? { ...prev, quantity: newSourceQty } : null);
                fetchLogs(matId, moveSource._id);
            }

            setIsMoveOpen(false);
            resetMoveForm();
        } catch (err) {
            console.error("Failed to move stock:", err);
        } finally {
            setIsMoveSubmitting(false);
        }
    };

    // Map material specDetails.color (Thai/EN glass color name) → CSS color
    const getGlassColor = (colorName?: string): string => {
        if (!colorName) return '#94a3b8';
        const lower = colorName.toLowerCase().trim();
        const map: Record<string, string> = {
            'ใส': '#bae6fd', 'clear': '#bae6fd',
            'ดำ': '#1e293b', 'black': '#1e293b',
            'ดำด้าน': '#374151',
            'ชา': '#d97706', 'tea': '#d97706', 'amber': '#d97706',
            'เขียว': '#16a34a', 'green': '#16a34a',
            'น้ำเงิน': '#2563eb', 'blue': '#2563eb',
            'ฟ้า': '#0ea5e9', 'sky': '#0ea5e9',
            'เทา': '#6b7280', 'gray': '#6b7280', 'grey': '#6b7280',
            'ทอง': '#ca8a04', 'gold': '#ca8a04',
            'เงิน': '#94a3b8', 'silver': '#94a3b8',
            'น้ำตาล': '#92400e', 'brown': '#92400e',
            'ขาว': '#cbd5e1', 'white': '#cbd5e1',
            'ม่วง': '#9333ea', 'purple': '#9333ea',
            'ชมพู': '#ec4899', 'pink': '#ec4899',
            'แดง': '#dc2626', 'red': '#dc2626',
            'ส้ม': '#ea580c', 'orange': '#ea580c',
            'ลามิเนต': '#7c3aed', 'laminate': '#7c3aed',
            'ฝ้า': '#a5b4fc', 'frosted': '#a5b4fc',
            'ทึบ': '#64748b',
        };
        return map[lower] ?? '#94a3b8';
    };

    // Append "mm" unit if value is purely numeric (no existing unit)
    const addMmUnit = (val?: string): string => {
        if (!val) return '—';
        return /^[\d.,\s]+$/.test(val.trim()) ? `${val} mm` : val;
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

    // Sorted and filtered location suggestions (Import dialog)
    const filteredLocationSuggestions = useMemo(() => {
        const query = importData.location.toLowerCase();
        const filtered = locations.filter(loc =>
            !query || loc.toLowerCase().includes(query)
        );
        return filtered.sort((a, b) => (locationUsage[b] || 0) - (locationUsage[a] || 0));
    }, [locations, importData.location, locationUsage]);

    // Sorted and filtered location suggestions (Move dialog) — excludes source location
    const moveFilteredLocationSuggestions = useMemo(() => {
        const query = moveDestLocation.toLowerCase();
        const sourceLoc = moveSource?.location.toLowerCase();
        const filtered = locations.filter(loc =>
            loc.toLowerCase() !== sourceLoc &&
            (!query || loc.toLowerCase().includes(query))
        );
        return filtered.sort((a, b) => (locationUsage[b] || 0) - (locationUsage[a] || 0));
    }, [locations, moveDestLocation, locationUsage, moveSource]);

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
                            ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 shadow-lg shadow-red-200/30 text-red-800 dark:text-red-300'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-red-200 dark:hover:border-red-900 group'
                            }`}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-colors ${showLowStockOnly ? 'bg-red-200 dark:bg-red-900 text-red-700 dark:text-red-300' : 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
                                }`}>
                                <AlertTriangle className="h-6 w-6" />
                            </div>
                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${showLowStockOnly ? 'bg-red-200 dark:bg-red-900 text-red-700 dark:text-red-300' : 'bg-red-100/50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                }`}>
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                </span>
                                {showLowStockOnly ? 'Active Filter' : 'Alert'}
                            </div>
                        </div>
                        <div>
                            <p className={`text-sm font-bold ${showLowStockOnly ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>{it.lowStock}</p>
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
                <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_auto] items-end gap-6 pb-2">
                    {/* Search Field */}
                    <div className="space-y-2">
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
                                className="pl-4 pr-10 h-12 w-full bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 focus:ring-[#E8601C] focus:border-[#E8601C] rounded-2xl transition-all font-medium text-sm"
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

                    {/* Area Filter */}
                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                            <Warehouse className="h-3 w-3" />
                            {it.area}
                        </Label>
                        <Select value={locationFilter} onValueChange={(val) => { setLocationFilter(val || "all"); setCurrentPage(1); }}>
                            <SelectTrigger className="h-12 w-full bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm focus:ring-[#E8601C]">
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
                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                            <Package className="h-3 w-3" />
                            {it.glassType}
                        </Label>
                        <Select value={glassTypeFilter} onValueChange={(val) => { setGlassTypeFilter(val || "all"); setCurrentPage(1); }}>
                            <SelectTrigger className="h-12 w-full bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm focus:ring-[#E8601C]">
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

                    {/* Reset */}
                    <div className="flex items-center pb-0.5">
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
                                    const isNearLow = mat && !isLow && inv.quantity <= mat.reorderPoint * 1.5;
                                    const statusText = isLow ? it.table.lowStock : it.table.healthy;

                                    const rowBg = isLow
                                        ? 'bg-red-50/70 dark:bg-red-950/20 hover:bg-red-100/80 dark:hover:bg-red-950/30'
                                        : isNearLow
                                            ? 'bg-amber-50/70 dark:bg-amber-950/20 hover:bg-amber-100/80 dark:hover:bg-amber-950/30'
                                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50';

                                    return (
                                        <TableRow
                                            key={inv._id}
                                            className={`group border-slate-100 dark:border-slate-800 transition-colors cursor-pointer ${rowBg}`}
                                            onClick={() => openDetails(inv)}
                                        >
                                            <TableCell className="py-5 px-6">
                                                <div className="flex flex-col">
                                                    <span className="font-black text-slate-900 dark:text-white group-hover:text-[#E8601C] transition-colors">
                                                        {mat?.name || it.table.unknown}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase flex items-center mt-1">
                                                        {mat?.specDetails?.thickness && <span className="mr-2">{addMmUnit(mat.specDetails.thickness)}</span>}
                                                        {mat?.specDetails?.color && <span>{mat.specDetails.color}</span>}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-5">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2.5 w-2.5 rounded-full shadow-sm" style={{ backgroundColor: getGlassColor(mat?.specDetails?.color) }}></div>
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
                <SheetContent showCloseButton={false} className="sm:max-w-[420px] border-l border-slate-200 dark:border-slate-800 p-0 overflow-y-auto bg-white dark:bg-slate-950 flex flex-col">
                    {selectedInventory && (() => {
                        const mat = getMaterialInfo(selectedInventory.material);
                        const isLowStock = mat?.reorderPoint != null && selectedInventory.quantity <= mat.reorderPoint;
                        const reorderPct = mat?.reorderPoint && mat.reorderPoint > 0
                            ? Math.min(100, Math.round((selectedInventory.quantity / (mat.reorderPoint * 3)) * 100))
                            : null;
                        return (
                            <div className="flex flex-col flex-1 min-h-0">

                                {/* ── Header ── */}
                                <div className="px-6 pt-6 pb-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                                    {/* Close + meta row */}
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${isLowStock ? "bg-red-500" : "bg-emerald-500"}`} />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                                #{selectedInventory._id.slice(-6).toUpperCase()}
                                            </span>
                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${selectedInventory.stockType === 'Raw'
                                                ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                                                : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400'}`}>
                                                {selectedInventory.stockType}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => setIsDetailOpen(false)}
                                            className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>

                                    {/* Material name */}
                                    <h2 className="text-xl font-black text-slate-900 dark:text-white leading-tight truncate" title={mat?.name}>
                                        {mat?.name || "N/A"}
                                    </h2>

                                    {/* Location */}
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                        <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">{selectedInventory.location}</span>
                                    </div>

                                    {/* Stock quantity + health bar */}
                                    <div className="mt-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                                        <div className="flex items-end justify-between mb-2">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{it.detail.currentStock}</p>
                                                <p className={`text-4xl font-black tabular-nums tracking-tighter leading-none ${isLowStock ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
                                                    {selectedInventory.quantity.toLocaleString()}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                {mat?.reorderPoint != null && (
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">
                                                        {lang === 'th' ? 'จุดสั่งซื้อ' : 'Reorder at'} {mat.reorderPoint}
                                                    </p>
                                                )}
                                                <p className={`text-xs font-black uppercase ${isLowStock ? "text-red-500" : "text-emerald-600"}`}>
                                                    {isLowStock ? it.table.lowStock : it.table.healthy}
                                                </p>
                                            </div>
                                        </div>
                                        {reorderPct !== null && (
                                            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${isLowStock ? "bg-red-500" : reorderPct < 50 ? "bg-amber-500" : "bg-emerald-500"}`}
                                                    style={{ width: `${reorderPct}%` }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* ── Body ── */}
                                <div className="flex-1 overflow-y-auto">

                                    {/* Technical Specs */}
                                    <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Shield className="h-3.5 w-3.5 text-[#E8601C]" />
                                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{it.detail.technical}</h3>
                                        </div>
                                        <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-900">
                                            {[
                                                { label: lang === 'th' ? 'ประเภทสต็อก' : 'Stock Type', value: selectedInventory.stockType },
                                                mat?.specDetails?.thickness ? { label: lang === 'th' ? 'ความหนา' : 'Thickness', value: addMmUnit(mat.specDetails.thickness) } : null,
                                                mat?.specDetails?.color ? { label: lang === 'th' ? 'สี' : 'Color', value: mat.specDetails.color } : null,
                                                mat?.specDetails?.glassType ? { label: lang === 'th' ? 'ประเภทกระจก' : 'Glass Type', value: mat.specDetails.glassType } : null,
                                                (mat?.specDetails?.width || mat?.specDetails?.length) ? {
                                                    label: lang === 'th' ? 'ขนาด (กว้าง × สูง)' : 'Size (W × H)',
                                                    value: (() => {
                                                        const w = mat?.specDetails?.width ? addMmUnit(mat.specDetails.width) : null;
                                                        const l = mat?.specDetails?.length ? addMmUnit(mat.specDetails.length) : null;
                                                        return w && l ? `${w} × ${l}` : (w ?? l ?? '—');
                                                    })()
                                                } : null,
                                                mat?.reorderPoint != null ? { label: lang === 'th' ? 'จุดสั่งซื้อ' : 'Reorder Point', value: mat.reorderPoint.toString() } : null,
                                            ].filter(Boolean).map((row, i) => (
                                                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                                                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{row!.label}</span>
                                                    <span className="text-[11px] font-black text-slate-900 dark:text-white">{row!.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Flow Logs */}
                                    <div className="px-6 py-5">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <History className="h-3.5 w-3.5 text-[#E8601C]" />
                                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{it.detail.logs}</h3>
                                            </div>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-600">{it.detail.last30}</span>
                                        </div>

                                        {isLoadingLogs ? (
                                            <div className="space-y-2">
                                                {[...Array(3)].map((_, i) => (
                                                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                                                ))}
                                            </div>
                                        ) : materialLogs.length > 0 ? (
                                            <div className="relative space-y-1">
                                                {/* Vertical timeline line */}
                                                <div className="absolute left-[19px] top-5 bottom-5 w-px bg-slate-100 dark:bg-slate-800" />

                                                {(() => {
                                                    // Build from ALL material logs (not just this slot's filtered logs)
                                                    // so withdraw logs in source panel are correctly identified as "move out"
                                                    const moveSourceIds = new Set(
                                                        allLogsForMaterial
                                                            .filter(l => l.parentLog)
                                                            .map(l => typeof l.parentLog === 'object' ? (l.parentLog as MaterialLog)._id : String(l.parentLog))
                                                    );
                                                    return materialLogs.map((log) => {
                                                    const isUpdate = log.quantityChanged === 0;
                                                    const isPositive = log.quantityChanged > 0;
                                                    const isMoveIn = log.actionType === 'import' && !!log.parentLog;
                                                    const isMoveOut = log.actionType === 'withdraw' && moveSourceIds.has(log._id);
                                                    const isMove = isMoveIn || isMoveOut;
                                                    const dotColor = isUpdate
                                                        ? "bg-slate-300 dark:bg-slate-600"
                                                        : isMove ? "bg-violet-500"
                                                            : log.actionType === 'import' ? "bg-emerald-500"
                                                                : log.actionType === 'cut' ? "bg-blue-500"
                                                                    : log.actionType === 'claim' ? "bg-red-500"
                                                                        : "bg-orange-500";
                                                    const qtyColor = isUpdate ? "text-slate-400"
                                                        : isMove ? "text-violet-600 dark:text-violet-400"
                                                            : isPositive ? "text-emerald-600 dark:text-emerald-400"
                                                                : "text-red-600 dark:text-red-400";
                                                    const actionLabel = isUpdate ? (lang === 'th' ? 'อัปเดต' : 'Update')
                                                        : isMoveIn ? (lang === 'th' ? 'ย้ายเข้า' : 'Move In')
                                                            : isMoveOut ? (lang === 'th' ? 'ย้ายออก' : 'Move Out')
                                                                : log.actionType === 'import' ? (lang === 'th' ? 'นำเข้า' : 'Import')
                                                                    : log.actionType === 'cut' ? (lang === 'th' ? 'ตัด' : 'Cut')
                                                                        : log.actionType === 'claim' ? (lang === 'th' ? 'เคลม' : 'Claim')
                                                                            : (lang === 'th' ? 'เบิก' : 'Withdraw');

                                                    return (
                                                        <div key={log._id} className="flex items-start gap-3 pl-1 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors">
                                                            {/* Timeline dot */}
                                                            <div className={`mt-1 h-3.5 w-3.5 rounded-full shrink-0 border-2 border-white dark:border-slate-950 ${dotColor} z-10`} />

                                                            {/* Content */}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-xs font-black text-slate-800 dark:text-slate-200 truncate">{actionLabel}</span>
                                                                    <span className={`text-sm font-black tabular-nums shrink-0 ${qtyColor}`}>
                                                                        {isUpdate
                                                                            ? <svg className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                                                                            : `${isPositive ? '+' : ''}${log.quantityChanged.toLocaleString()}`
                                                                        }
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-3 mt-0.5">
                                                                    <span className="text-[10px] text-slate-400 font-medium">
                                                                        {new Date(log.createdAt).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
                                                                            day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
                                                                        })}
                                                                    </span>
                                                                    {log.stockType && isUpdate && (
                                                                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase">{log.stockType}</span>
                                                                    )}
                                                                </div>
                                                                {typeof log.worker === 'object' && log.worker && (
                                                                    <span className="text-[10px] text-slate-400 font-medium">{(log.worker as { name: string }).name}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                    });
                                                })()}
                                            </div>
                                        ) : (
                                            <div className="py-10 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                                                <History className="h-7 w-7 text-slate-200 dark:text-slate-800 mb-2" />
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{it.detail.noLogs}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* ── Footer ── */}
                                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-2 gap-2">
                                    <Button
                                        onClick={() => handleDelete(selectedInventory._id)}
                                        variant="outline"
                                        className="rounded-xl h-11 border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 font-black"
                                    >
                                        <Trash2 className="h-4 w-4 mr-1.5" />
                                        {it.detail.delete}
                                    </Button>
                                    <Button
                                        onClick={() => openMoveDialog(selectedInventory)}
                                        className="rounded-xl h-11 bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-[#E8601C] dark:hover:bg-[#E8601C] hover:text-white transition-all font-black gap-2"
                                    >
                                        <ArrowRightLeft className="h-4 w-4" />
                                        {it.detail.moveStock}
                                    </Button>
                                </div>

                            </div>
                        );
                    })()}
                </SheetContent>
            </Sheet>

            {/* Import Dialog */}
            <Dialog open={isImportOpen} onOpenChange={(open) => {
                setIsImportOpen(open);
                if (!open) {
                    resetImportForm();
                    setLocationDropdownOpen(false);
                }
            }}>
                <DialogContent className="sm:max-w-[520px] border-slate-200 dark:border-slate-800 rounded-3xl p-0 bg-white dark:bg-slate-950 max-h-[90vh] overflow-y-auto">
                    {/* Header */}
                    <div className="px-8 pt-8 pb-6 border-b border-slate-100 dark:border-slate-800">
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                                {it.importStock}
                            </DialogTitle>
                            <DialogDescription className="text-slate-500 font-medium text-sm mt-1">
                                เพิ่มวัสดุใหม่เข้าสู่ระบบจัดการสต็อก
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    {/* Form Body */}
                    <div className="px-8 py-6 space-y-6">
                        {/* Material Selection */}
                        <div className="space-y-2">
                            <Label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                <Package className="h-3 w-3" />
                                เลือกวัสดุ
                            </Label>
                            <Select
                                value={importData.material}
                                onValueChange={(val) => setImportData({ ...importData, material: val || "" })}
                            >
                                <SelectTrigger className="h-12 w-full bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-900 dark:text-white px-4 focus:ring-[#E8601C] focus:border-[#E8601C] text-sm">
                                    <SelectValue placeholder="เลือกวัสดุที่ต้องการ...">
                                        {importData.material
                                            ? materials.find(m => m._id === importData.material)?.name || importData.material
                                            : "เลือกวัสดุที่ต้องการ..."}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 p-1">
                                    {materials.map(mat => (
                                        <SelectItem
                                            key={mat._id}
                                            value={mat._id}
                                            className="rounded-lg py-2.5 font-bold focus:bg-[#E8601C] focus:text-white text-sm"
                                        >
                                            <div className="flex flex-col">
                                                <span>{mat.name}</span>
                                                <span className="text-[10px] opacity-60">
                                                    {mat.specDetails?.thickness} · {mat.specDetails?.color}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Location - Google-style Autocomplete */}
                        <div className="space-y-2 relative">
                            <Label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                <Warehouse className="h-3 w-3" />
                                สถานที่จัดเก็บ
                            </Label>
                            <div className="relative">
                                <Input
                                    ref={locationInputRef}
                                    placeholder="พิมพ์ค้นหา เช่น A01-01, B2..."
                                    value={importData.location}
                                    onChange={(e) => {
                                        setImportData({ ...importData, location: e.target.value });
                                        setLocationDropdownOpen(true);
                                    }}
                                    onFocus={() => setLocationDropdownOpen(true)}
                                    className="h-12 w-full bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-900 dark:text-white pl-4 pr-10 uppercase focus:ring-[#E8601C] focus:border-[#E8601C] text-sm"
                                    autoComplete="off"
                                />
                                <button
                                    type="button"
                                    onClick={() => setLocationDropdownOpen(!locationDropdownOpen)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <ChevronDown className={`h-4 w-4 transition-transform ${locationDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>
                            </div>

                            {/* Dropdown */}
                            {locationDropdownOpen && filteredLocationSuggestions.length > 0 && (
                                <div
                                    ref={locationDropdownRef}
                                    className="absolute z-50 left-0 right-0 top-[calc(100%+4px)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-[200px] overflow-y-auto py-1"
                                >
                                    {filteredLocationSuggestions.map((loc, idx) => (
                                        <button
                                            key={loc}
                                            type="button"
                                            onClick={() => {
                                                setImportData({ ...importData, location: loc });
                                                setLocationDropdownOpen(false);
                                            }}
                                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm ${
                                                importData.location === loc ? 'bg-orange-50 dark:bg-orange-950/20' : ''
                                            }`}
                                        >
                                            <div className="h-2.5 w-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: getLocationColor(loc) }} />
                                            <span className={`font-bold uppercase ${importData.location === loc ? 'text-[#E8601C]' : 'text-slate-700 dark:text-slate-300'}`}>
                                                {loc}
                                            </span>
                                            {(locationUsage[loc] || 0) > 0 && (
                                                <span className="ml-auto text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                                    ใช้ {locationUsage[loc]} ครั้ง
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Stock Type & Quantity - Side by Side */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">ประเภทสต็อก</Label>
                                <Select
                                    value={importData.stockType}
                                    onValueChange={(val) => setImportData({ ...importData, stockType: (val as "Raw" | "Reuse") || "Raw" })}
                                >
                                    <SelectTrigger className="h-12 w-full bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 rounded-xl font-bold px-4 focus:ring-[#E8601C] text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
                                        <SelectItem value="Raw" className="font-bold">Raw Material</SelectItem>
                                        <SelectItem value="Reuse" className="font-bold">Reusable</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">จำนวน (QTY)</Label>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        value={importData.quantity}
                                        onChange={(e) => setImportData({ ...importData, quantity: parseInt(e.target.value) || 0 })}
                                        className="h-12 w-full bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-900 dark:text-white pl-4 pr-10 focus:ring-[#E8601C] text-sm"
                                    />
                                    <Package className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-8 py-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => setIsImportOpen(false)}
                            className="rounded-xl h-11 font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white px-6 text-sm"
                        >
                            ยกเลิก
                        </Button>
                        <Button
                            onClick={() => {
                                if (importData.location) trackLocationUsage(importData.location);
                                handleImport();
                            }}
                            disabled={isSubmitting || !importData.material || !importData.location}
                            className={`rounded-xl h-11 min-w-[140px] font-black tracking-tight text-white transition-all shadow-lg text-sm ${isSubmitting ? "bg-slate-400" : "bg-slate-900 dark:bg-white dark:text-slate-900 hover:bg-[#E8601C] dark:hover:bg-[#E8601C] dark:hover:text-white"
                                }`}
                        >
                            {isSubmitting ? "Processing..." : "ยืนยันนำเข้าสต็อก"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Move Stock Dialog */}
            <Dialog open={isMoveOpen} onOpenChange={(open) => {
                setIsMoveOpen(open);
                if (!open) resetMoveForm();
            }}>
                <DialogContent className="sm:max-w-[480px] border-slate-200 dark:border-slate-800 rounded-3xl p-0 bg-white dark:bg-slate-950 max-h-[90vh] overflow-y-auto">
                    {/* Header */}
                    <div className="px-8 pt-8 pb-6 border-b border-slate-100 dark:border-slate-800">
                        <DialogHeader>
                            <div className="flex items-center gap-3 mb-1">
                                <div className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                    <ArrowRightLeft className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                                </div>
                                <DialogTitle className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                                    {it.detail.moveStock}
                                </DialogTitle>
                            </div>
                            <DialogDescription className="text-slate-500 font-medium text-sm mt-1">
                                {it.detail.moveStockDesc}
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    {moveSource && (() => {
                        const sourceMat = getMaterialInfo(moveSource.material);
                        const sameMatSlots = inventories.filter(inv =>
                            inv._id !== moveSource._id &&
                            (typeof inv.material === 'string' ? inv.material : (inv.material as Material)._id) ===
                            (typeof moveSource.material === 'string' ? moveSource.material : (moveSource.material as Material)._id)
                        );
                        return (
                            <div className="px-8 py-6 space-y-6">
                                {/* Source Info Card */}
                                <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{it.detail.moveSource}</p>
                                    <p className="text-sm font-black text-slate-900 dark:text-white">{sourceMat?.name || "N/A"}</p>
                                    <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium">
                                        <span className="flex items-center gap-1">
                                            <MapPin className="h-3 w-3" />
                                            {moveSource.location}
                                        </span>
                                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black uppercase ${moveSource.stockType === 'Raw' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                                            {moveSource.stockType}
                                        </span>
                                        <span className="ml-auto font-black text-slate-700 dark:text-slate-200">
                                            {lang === 'th' ? 'มี' : 'Stock:'} {moveSource.quantity.toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                {/* Quantity */}
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                        <Package className="h-3 w-3" />
                                        {it.detail.moveQtyLabel}
                                    </Label>
                                    <div className="flex items-center gap-3">
                                        <Input
                                            type="number"
                                            min={1}
                                            max={moveSource.quantity}
                                            value={moveQty}
                                            onChange={(e) => setMoveQty(Math.min(moveSource.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                                            className="h-12 w-full bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 rounded-xl font-black text-slate-900 dark:text-white text-lg px-4 focus:ring-[#E8601C] focus:border-[#E8601C]"
                                        />
                                        <span className="text-xs text-slate-400 font-bold whitespace-nowrap">
                                            / {moveSource.quantity.toLocaleString()}
                                        </span>
                                    </div>
                                    {/* Quick fraction buttons */}
                                    <div className="flex gap-2">
                                        {[
                                            { label: '25%', val: Math.floor(moveSource.quantity * 0.25) },
                                            { label: '50%', val: Math.floor(moveSource.quantity * 0.5) },
                                            { label: '75%', val: Math.floor(moveSource.quantity * 0.75) },
                                            { label: lang === 'th' ? 'ทั้งหมด' : 'All', val: moveSource.quantity },
                                        ].filter(b => b.val > 0).map(b => (
                                            <button
                                                key={b.label}
                                                type="button"
                                                onClick={() => setMoveQty(b.val)}
                                                className={`flex-1 text-[10px] font-black py-1.5 rounded-lg border transition-colors ${moveQty === b.val
                                                    ? 'bg-[#E8601C] text-white border-[#E8601C]'
                                                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-[#E8601C] hover:text-[#E8601C]'}`}
                                            >
                                                {b.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Destination Type Toggle */}
                                <div className="space-y-3">
                                    <Label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                        <Warehouse className="h-3 w-3" />
                                        {it.detail.moveDest}
                                    </Label>
                                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                                        <button
                                            type="button"
                                            onClick={() => setMoveDestType("existing")}
                                            className={`py-2.5 rounded-lg text-xs font-black transition-all ${moveDestType === "existing"
                                                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                        >
                                            {it.detail.existingSlot}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMoveDestType("new")}
                                            className={`py-2.5 rounded-lg text-xs font-black transition-all ${moveDestType === "new"
                                                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                        >
                                            {it.detail.newLocation}
                                        </button>
                                    </div>

                                    {/* Existing slot list */}
                                    {moveDestType === "existing" && (
                                        sameMatSlots.length === 0 ? (
                                            <div className="py-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center">
                                                <p className="text-xs text-slate-400 font-bold">{it.detail.noDest}</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                                {sameMatSlots.map(slot => (
                                                    <button
                                                        key={slot._id}
                                                        type="button"
                                                        onClick={() => setMoveDestId(slot._id)}
                                                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${moveDestId === slot._id
                                                            ? 'border-[#E8601C] bg-orange-50 dark:bg-orange-950/20'
                                                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900'}`}
                                                    >
                                                        <div>
                                                            <p className="text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                                                <MapPin className="h-3 w-3 text-slate-400" />
                                                                {slot.location}
                                                            </p>
                                                            <p className={`text-[10px] font-black uppercase mt-0.5 ${slot.stockType === 'Raw' ? 'text-blue-500' : 'text-amber-500'}`}>
                                                                {slot.stockType}
                                                            </p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-sm font-black text-slate-700 dark:text-slate-300">{slot.quantity.toLocaleString()}</p>
                                                            <p className="text-[9px] text-slate-400 uppercase font-bold">{lang === 'th' ? 'ปัจจุบัน' : 'current'}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )
                                    )}

                                    {/* New location form */}
                                    {moveDestType === "new" && (
                                        <div className="space-y-1.5 relative">
                                            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                                <Warehouse className="h-3 w-3" />
                                                {lang === 'th' ? 'ตำแหน่งจัดเก็บ' : 'Storage Location'}
                                            </Label>
                                            <div className="relative">
                                                <Input
                                                    ref={moveLocationInputRef}
                                                    placeholder={lang === 'th' ? 'พิมพ์ค้นหา เช่น A01-01, B2...' : 'Search location, e.g. A01-01, B2...'}
                                                    value={moveDestLocation}
                                                    onChange={(e) => {
                                                        setMoveDestLocation(e.target.value);
                                                        setMoveLocationDropdownOpen(true);
                                                    }}
                                                    onFocus={() => setMoveLocationDropdownOpen(true)}
                                                    className="h-11 w-full bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-900 dark:text-white pl-4 pr-10 focus:ring-[#E8601C] focus:border-[#E8601C] text-sm"
                                                    autoComplete="off"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setMoveLocationDropdownOpen(!moveLocationDropdownOpen)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                                >
                                                    <ChevronDown className={`h-4 w-4 transition-transform ${moveLocationDropdownOpen ? 'rotate-180' : ''}`} />
                                                </button>
                                            </div>
                                            {moveLocationDropdownOpen && moveFilteredLocationSuggestions.length > 0 && (
                                                <div
                                                    ref={moveLocationDropdownRef}
                                                    className="absolute z-50 left-0 right-0 top-[calc(100%+4px)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-[180px] overflow-y-auto py-1"
                                                >
                                                    {moveFilteredLocationSuggestions.map((loc) => (
                                                        <button
                                                            key={loc}
                                                            type="button"
                                                            onClick={() => {
                                                                setMoveDestLocation(loc);
                                                                setMoveLocationDropdownOpen(false);
                                                            }}
                                                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm ${moveDestLocation === loc ? 'bg-orange-50 dark:bg-orange-950/20' : ''}`}
                                                        >
                                                            <div
                                                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                                                style={{ backgroundColor: getGlassColor(sourceMat?.specDetails?.color) }}
                                                            />
                                                            <span className="font-bold text-slate-800 dark:text-slate-200 uppercase">{loc}</span>
                                                            {locationUsage[loc] > 0 && (
                                                                <span className="ml-auto text-[10px] text-slate-400 font-medium">{locationUsage[loc]}x</span>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Footer */}
                    <div className="px-8 py-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => setIsMoveOpen(false)}
                            className="rounded-xl h-11 font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white px-6 text-sm"
                        >
                            {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                        </Button>
                        <Button
                            onClick={handleMove}
                            disabled={
                                isMoveSubmitting ||
                                moveQty <= 0 ||
                                !moveSource ||
                                moveQty > (moveSource?.quantity ?? 0) ||
                                (moveDestType === "existing" && !moveDestId) ||
                                (moveDestType === "new" && !moveDestLocation.trim())
                            }
                            className="rounded-xl h-11 min-w-[150px] font-black text-white bg-slate-900 dark:bg-white dark:text-slate-900 hover:bg-[#E8601C] dark:hover:bg-[#E8601C] dark:hover:text-white transition-all shadow-lg text-sm disabled:opacity-50"
                        >
                            <ArrowRightLeft className="h-4 w-4 mr-2" />
                            {isMoveSubmitting ? it.detail.moving : it.detail.confirmMove}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
