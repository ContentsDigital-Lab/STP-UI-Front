"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import {
    Plus,
    Search,
    TrendingUp,
    AlertTriangle,
    Boxes,
    Package,
    Warehouse,
    ChevronLeft,
    ChevronRight,
    MoreHorizontal,
    History,
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
import { workersApi } from "@/lib/api/workers";
import { Inventory, Material, MaterialLog, Worker } from "@/lib/api/types";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { useAuth } from "@/lib/auth/auth-context";

const ITEMS_PER_PAGE = 10;

const getMatId = (mat: string | Material | null | undefined): string | null => {
    if (!mat) return null;
    return typeof mat === 'string' ? mat : mat._id;
};

export default function InventoryPage() {
    const { t, lang } = useLanguage();
    const it = t.inventory_dashboard;
    const { user: currentWorker } = useAuth();

    const [isLoading, setIsLoading] = useState(true);
    const [inventories, setInventories] = useState<Inventory[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [workerMap, setWorkerMap] = useState<Map<string, Worker>>(new Map());
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
        workersApi.getAll().then(res => {
            if (res.success && res.data) setWorkerMap(new Map(res.data.map(w => [w._id, w])));
        }).catch(() => {});
    }, []);

    const fetchData = async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        try {
            const [invRes, matRes] = await Promise.all([
                inventoriesApi.getAll(),
                materialsApi.getAll()
            ]);

            if (invRes.success && invRes.data) {
                setInventories(invRes.data);
                // Build locationColors from server storageColor — overrides localStorage
                const serverColors: Record<string, string> = {};
                for (const inv of invRes.data) {
                    if (inv.location && inv.storageColor) serverColors[inv.location] = inv.storageColor;
                }
                if (Object.keys(serverColors).length > 0) {
                    setLocationColors(prev => ({ ...prev, ...serverColors }));
                    localStorage.setItem('locationColorMap', JSON.stringify({ ...JSON.parse(localStorage.getItem('locationColorMap') ?? '{}'), ...serverColors }));
                }
            }
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
                getMatId(inv.material) === importData.material &&
                inv.location.toLowerCase() === importData.location.toLowerCase() &&
                inv.stockType === importData.stockType
            );

            if (existing) {
                const newQty = existing.quantity + importData.quantity;
                const color = getLocationColor(importData.location);
                const updatePayload: Record<string, unknown> = { quantity: newQty };
                if (!existing.storageColor) updatePayload.storageColor = color;
                const response = await inventoriesApi.update(existing._id, updatePayload);
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
                const color = getLocationColor(importData.location);
                const response = await inventoriesApi.create({ ...importData, storageColor: color });
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
        const openMatId = getMatId(inv.material);
        const logMatId = payload?.data?.material ? getMatId(payload.data.material) : null;
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
        const matId = getMatId(moveSource.material);
        if (!matId) {
            toast.error(lang === 'th' ? 'ไม่พบข้อมูลวัสดุ' : 'Material data not found');
            setIsMoveSubmitting(false);
            return;
        }

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
                    getMatId(inv.material) === matId &&
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
                        storageColor: getLocationColor(destLoc),
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
    const addMmUnit = (val?: string | number): string => {
        if (val === undefined || val === null || val === '') return '—';
        const str = String(val);
        return /^[\d.,\s]+$/.test(str.trim()) ? `${str} mm` : str;
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
            const matchesThickness = thicknessFilter === "all" || mat?.specDetails?.thickness?.toString() === thicknessFilter;
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

    const topMaterialName = globalStats.topMaterials[0]
        ? (getMaterialInfo(globalStats.topMaterials[0].material)?.name || "N/A")
        : "—";

    type StatRow =
        | { key: string; kind: "stat"; label: string; value: string; icon: typeof Boxes; accent: string }
        | { key: string; kind: "low"; label: string; value: number };

    const statRows: StatRow[] = [
        { key: "total", kind: "stat", label: it.totalItems, value: String(globalStats.totalItems), icon: Boxes, accent: "text-blue-600 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400" },
        { key: "low", kind: "low", label: it.lowStock, value: globalStats.lowStockCount },
        { key: "qty", kind: "stat", label: it.totalQuantity, value: globalStats.totalQuantity.toLocaleString(), icon: TrendingUp, accent: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400" },
        { key: "top", kind: "stat", label: it.mostStocked, value: topMaterialName, icon: Package, accent: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 dark:text-indigo-400" },
    ];

    return (
        <div className="space-y-6 max-w-[1440px] mx-auto w-full">
            {/* Page Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{it.title}</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{it.subtitle}</p>
                </div>
                <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto shrink-0">
                    <Link href="/inventory/materials" className="w-full sm:w-auto">
                        <Button variant="outline" className="w-full gap-2 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-xl h-10 px-0 sm:px-4">
                            <Settings2 className="h-4 w-4 shrink-0" />
                            <span className="truncate">{it.manageMaterials}</span>
                        </Button>
                    </Link>
                    <Button
                        onClick={() => setIsImportOpen(true)}
                        className="w-full sm:w-auto gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white rounded-xl h-10 px-0 sm:px-4 shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0"
                    >
                        <Plus className="h-4 w-4 shrink-0" />
                        <span className="truncate">{it.importStock}</span>
                    </Button>
                </div>
            </div>

            {/* Stat cards */}
            {!isLoading && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {statRows.map((item) => {
                        if (item.kind === "low") {
                            return (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => {
                                        setShowLowStockOnly(!showLowStockOnly);
                                        setCurrentPage(1);
                                    }}
                                    className={`text-left bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 p-3 sm:p-5 transition-colors flex flex-col justify-between ${showLowStockOnly
                                        ? "border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 ring-1 ring-red-200 dark:ring-red-900"
                                        : "hover:border-slate-300 dark:hover:border-slate-700"
                                        }`}
                                >
                                    <div>
                                        <div className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg mb-2 sm:mb-3 ${showLowStockOnly
                                            ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                                            : "bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400"
                                            }`}>
                                            <AlertTriangle className="h-4 w-4" />
                                        </div>
                                        <p className={`line-clamp-1 text-[11px] sm:text-xs font-semibold ${showLowStockOnly ? "text-red-700 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
                                            {item.label}
                                        </p>
                                    </div>
                                    <p className={`mt-1 text-lg sm:text-xl font-bold tabular-nums truncate ${showLowStockOnly ? "text-red-800 dark:text-red-200" : "text-slate-900 dark:text-white"}`}>
                                        {item.value}
                                    </p>
                                </button>
                            );
                        }
                        const Icon = item.icon;
                        return (
                            <div
                                key={item.key}
                                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 p-3 sm:p-5 flex flex-col justify-between"
                            >
                                <div>
                                    <div className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg mb-2 sm:mb-3 ${item.accent}`}>
                                        <Icon className="h-4 w-4" />
                                    </div>
                                    <p className="line-clamp-1 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400">{item.label}</p>
                                </div>
                                <p className="mt-1 text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate" title={item.value}>
                                    {item.value}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Filter & Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" aria-hidden />
                    <Input
                        placeholder={it.searchPlaceholder}
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                        }}
                        className="pl-9 pr-9 h-10 w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl text-sm focus-visible:ring-2 focus-visible:ring-blue-600/20 focus-visible:border-blue-600"
                        aria-label={it.searchPlaceholder}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                            aria-label="Clear search"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                <Select value={locationFilter} onValueChange={(val) => { setLocationFilter(val || "all"); setCurrentPage(1); }}>
                    <SelectTrigger className="h-10 w-full sm:w-[min(100%,200px)] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-blue-600/20" aria-label={it.area}>
                        <SelectValue placeholder="ทุกพื้นที่" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 min-w-[max-content]">
                        <SelectItem value="all" className="py-2 pr-8">ทุกพื้นที่</SelectItem>
                        {locations.map(loc => (
                            <SelectItem key={loc} value={loc} className="py-2 pr-8 min-w-[max-content]">{loc}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={glassTypeFilter} onValueChange={(val) => { setGlassTypeFilter(val || "all"); setCurrentPage(1); }}>
                    <SelectTrigger className="h-10 w-full sm:w-[min(100%,200px)] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-blue-600/20" aria-label={it.glassType}>
                        <SelectValue placeholder="ทุกประเภท" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 min-w-[max-content]">
                        <SelectItem value="all" className="py-2 pr-8">ทุกประเภท</SelectItem>
                        {glassTypes.map(type => (
                            <SelectItem key={type} value={type} className="py-2 pr-8 min-w-[max-content]">{type}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {(searchQuery || locationFilter !== "all" || glassTypeFilter !== "all" || showLowStockOnly) && (
                    <Button
                        variant="ghost"
                        onClick={resetFilters}
                        className="h-10 shrink-0 rounded-xl text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 px-3"
                    >
                        {it.clearFilters}
                    </Button>
                )}
            </div>

            {/* Main Table Content */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 h-10 py-3 px-4">{it.table.identity}</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 h-10 py-3 px-4">{it.table.area}</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 h-10 py-3 px-4">{it.table.health}</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 h-10 py-3 px-4">{it.table.type}</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 h-10 py-3 px-4 text-center">{it.table.quantity}</TableHead>
                                <TableHead className="text-right h-10 py-3 px-4"></TableHead>
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
                                            <TableCell className="py-3.5 px-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                        {mat?.name || it.table.unknown}
                                                    </span>
                                                    <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center mt-0.5">
                                                        {mat?.specDetails?.thickness && <span className="mr-2">{addMmUnit(mat.specDetails.thickness)}</span>}
                                                        {mat?.specDetails?.color && <span>{mat.specDetails.color}</span>}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-3.5 px-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: inv.storageColor || locationColors[inv.location] || '#94a3b8' }}></div>
                                                    <span className="text-sm text-slate-600 dark:text-slate-300">{inv.location}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-3.5 px-4">
                                                <Badge
                                                    variant="secondary"
                                                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${isLow
                                                        ? "bg-red-50 dark:bg-red-900/20 text-red-600 border-red-100 dark:border-red-900/50"
                                                        : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border-emerald-100 dark:border-emerald-900/50"
                                                        }`}
                                                >
                                                    {statusText}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-3.5 px-4">
                                                <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${inv.stockType === "Raw"
                                                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                                                    : "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                                                    }`}>
                                                    {inv.stockType}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-3.5 px-4 text-center">
                                                <span className="text-sm font-medium text-slate-900 dark:text-white tabular-nums">
                                                    {inv.quantity.toLocaleString()}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => openDetails(inv)}
                                                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
                                            <div className="h-14 w-14 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-700">
                                                <Boxes className="h-7 w-7" />
                                            </div>
                                            <p className="text-sm text-slate-500 dark:text-slate-400">ไม่พบข้อมูลที่ต้องการ</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-400 tabular-nums">
                            {currentPage} / {totalPages}
                        </span>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => prev - 1)}
                                className="h-8 w-8 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            {[...Array(totalPages)].map((_, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => setCurrentPage(i + 1)}
                                    className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-medium transition-colors ${currentPage === i + 1
                                        ? "bg-blue-600 text-white"
                                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                        }`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                            <Button
                                variant="ghost"
                                size="icon"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(prev => prev + 1)}
                                className="h-8 w-8 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Item Detail Side Panel */}
            <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <SheetContent showCloseButton={false} className="sm:max-w-[420px] border-l border-slate-200 dark:border-slate-800 p-0 overflow-y-auto bg-white dark:bg-slate-950 flex flex-col shadow-none">
                    {selectedInventory && (() => {
                        const mat = getMaterialInfo(selectedInventory.material);
                        const isLowStock = mat?.reorderPoint != null && selectedInventory.quantity <= mat.reorderPoint;
                        const reorderPct = mat?.reorderPoint && mat.reorderPoint > 0
                            ? Math.min(100, Math.round((selectedInventory.quantity / (mat.reorderPoint * 3)) * 100))
                            : null;
                        return (
                            <div className="flex flex-col flex-1 min-h-0">

                                {/* ── Header ── */}
                                <div className="px-6 pt-6 pb-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950">
                                    {/* Close + meta row */}
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${isLowStock ? "bg-red-500" : "bg-emerald-500"}`} />
                                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                                #{selectedInventory._id.slice(-6).toUpperCase()}
                                            </span>
                                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${selectedInventory.stockType === 'Raw'
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
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight truncate" title={mat?.name}>
                                        {mat?.name || "N/A"}
                                    </h2>

                                    {/* Location */}
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                        <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">{selectedInventory.location}</span>
                                    </div>

                                    {/* Stock quantity + health bar */}
                                    <div className="mt-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                        <div className="flex items-end justify-between mb-2">
                                            <div>
                                                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-0.5">{it.detail.currentStock}</p>
                                                <p className={`text-3xl font-semibold tabular-nums tracking-tight leading-none ${isLowStock ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
                                                    {selectedInventory.quantity.toLocaleString()}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                {mat?.reorderPoint != null && (
                                                    <p className="text-xs text-slate-400">
                                                        {lang === 'th' ? 'จุดสั่งซื้อ' : 'Reorder at'} {mat.reorderPoint}
                                                    </p>
                                                )}
                                                <p className={`text-xs font-medium ${isLowStock ? "text-red-500" : "text-emerald-600"}`}>
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
                                    <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Shield className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">{it.detail.technical}</h3>
                                        </div>
                                        <div className="space-y-2">
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
                                                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                                                    <span className="text-xs text-slate-500 dark:text-slate-400">{row!.label}</span>
                                                    <span className="text-xs font-medium text-slate-900 dark:text-white text-right">{row!.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Flow Logs */}
                                    <div className="px-6 py-5 bg-white dark:bg-slate-950">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <History className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">{it.detail.logs}</h3>
                                            </div>
                                            <span className="text-xs text-slate-400">{it.detail.last30}</span>
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

                                                    // Resolve worker name (object or ID via workerMap)
                                                    const workerName = log.worker
                                                        ? (typeof log.worker === 'object'
                                                            ? ((log.worker as Worker).name || (log.worker as Worker).username)
                                                            : (workerMap.get(String(log.worker))?.name ?? workerMap.get(String(log.worker))?.username ?? null))
                                                        : null;

                                                    // Resolve location(s)
                                                    const srcLoc = log.referenceId && !log.referenceType
                                                        ? inventories.find(inv => inv._id === log.referenceId)?.location ?? null
                                                        : null;
                                                    let fromLoc: string | null = null;
                                                    let toLoc: string | null = null;
                                                    if (isMove && srcLoc) {
                                                        if (isMoveIn) {
                                                            toLoc = srcLoc;
                                                            const parentId = typeof log.parentLog === 'object' ? (log.parentLog as MaterialLog)._id : String(log.parentLog ?? '');
                                                            const parentLog = allLogsForMaterial.find(l => l._id === parentId);
                                                            fromLoc = parentLog?.referenceId && !parentLog?.referenceType
                                                                ? inventories.find(inv => inv._id === parentLog.referenceId)?.location ?? null
                                                                : null;
                                                        } else {
                                                            fromLoc = srcLoc;
                                                            const childLog = allLogsForMaterial.find(l => {
                                                                if (!l.parentLog) return false;
                                                                const pid = typeof l.parentLog === 'object' ? (l.parentLog as MaterialLog)._id : String(l.parentLog);
                                                                return pid === log._id;
                                                            });
                                                            toLoc = childLog?.referenceId && !childLog?.referenceType
                                                                ? inventories.find(inv => inv._id === childLog.referenceId)?.location ?? null
                                                                : null;
                                                        }
                                                    }

                                                    // stockType fallback
                                                    const stockType = log.stockType ?? (log.referenceId && !log.referenceType
                                                        ? inventories.find(inv => inv._id === log.referenceId)?.stockType
                                                        : undefined);

                                                    return (
                                                        <div key={log._id} className="flex items-start gap-3 pl-1 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors">
                                                            {/* Timeline dot */}
                                                            <div className={`mt-1 h-3.5 w-3.5 rounded-full shrink-0 border-2 border-white dark:border-slate-950 ${dotColor} z-10`} />

                                                            {/* Content */}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">{actionLabel}</span>
                                                                    <span className={`text-sm font-medium tabular-nums shrink-0 ${qtyColor}`}>
                                                                        {isUpdate
                                                                            ? <svg className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                                                                            : `${isPositive ? '+' : ''}${log.quantityChanged.toLocaleString()}`
                                                                        }
                                                                    </span>
                                                                </div>

                                                                {/* Time + stockType */}
                                                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                                    <span className="text-[10px] text-slate-400 font-medium">
                                                                        {new Date(log.createdAt).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
                                                                            day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
                                                                        })}
                                                                    </span>
                                                                    {stockType && (
                                                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${stockType === 'Raw' ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700' : 'bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 border-violet-100 dark:border-violet-900/40'}`}>{stockType}</span>
                                                                    )}
                                                                </div>

                                                                {/* Location */}
                                                                {isMove && (fromLoc || toLoc) ? (
                                                                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                                                                        <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-0.5">
                                                                            <svg className="h-2.5 w-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
                                                                            {fromLoc ?? '?'}
                                                                        </span>
                                                                        <svg className="h-3 w-3 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                                                                        <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-0.5">
                                                                            <svg className="h-2.5 w-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
                                                                            {toLoc ?? '?'}
                                                                        </span>
                                                                    </div>
                                                                ) : srcLoc && !isMove ? (
                                                                    <div className="flex items-center gap-1 mt-1">
                                                                        <svg className="h-2.5 w-2.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
                                                                        <span className="text-[10px] text-slate-400 font-medium">{srcLoc}</span>
                                                                    </div>
                                                                ) : null}

                                                                {/* Worker */}
                                                                {workerName && (
                                                                    <div className="flex items-center gap-1 mt-1">
                                                                        <svg className="h-2.5 w-2.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/></svg>
                                                                        <span className="text-[10px] text-slate-400 font-medium">{workerName}</span>
                                                                    </div>
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
                                                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{it.detail.noLogs}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* ── Footer ── */}
                                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 grid grid-cols-2 gap-2">
                                    <Button
                                        onClick={() => handleDelete(selectedInventory._id)}
                                        variant="outline"
                                        className="rounded-xl h-10 border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                                    >
                                        <Trash2 className="h-4 w-4 mr-1.5" />
                                        {it.detail.delete}
                                    </Button>
                                    <Button
                                        onClick={() => openMoveDialog(selectedInventory)}
                                        className="rounded-xl h-10 font-bold bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white gap-2 shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0"
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
                <DialogContent className="sm:max-w-[520px] border-slate-200 dark:border-slate-800 rounded-xl p-0 bg-white dark:bg-slate-950 max-h-[90vh] overflow-y-auto shadow-none">
                    {/* Header */}
                    <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
                                {it.importStock}
                            </DialogTitle>
                            <DialogDescription className="text-slate-500 text-sm mt-1">
                                เพิ่มวัสดุใหม่เข้าสู่ระบบจัดการสต็อก
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    {/* Form Body */}
                    <div className="px-6 py-5 space-y-5">
                        {/* Material Selection */}
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <Package className="h-3.5 w-3.5" />
                                เลือกวัสดุ
                            </Label>
                            <Select
                                value={importData.material}
                                onValueChange={(val) => setImportData({ ...importData, material: val || "" })}
                            >
                                <SelectTrigger className="h-10 w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white px-3 focus-visible:ring-2 focus-visible:ring-blue-600/20 focus-visible:border-blue-600 text-sm">
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
                                            className="rounded-lg py-2 text-sm focus:text-blue-600 dark:focus:text-blue-400"
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
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <Warehouse className="h-3.5 w-3.5" />
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
                                    className="h-10 w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white pl-3 pr-10 text-sm focus-visible:ring-2 focus-visible:ring-blue-600/20 focus-visible:border-blue-600"
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
                                    className="absolute z-50 left-0 right-0 top-[calc(100%+4px)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl max-h-[200px] overflow-y-auto py-1"
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
                                                importData.location === loc ? 'bg-blue-50 dark:bg-blue-950/30' : ''
                                            }`}
                                        >
                                            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: getLocationColor(loc) }} />
                                            <span className={`text-sm font-medium ${importData.location === loc ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                                {loc}
                                            </span>
                                            {(locationUsage[loc] || 0) > 0 && (
                                                <span className="ml-auto text-[10px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
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
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">ประเภทสต็อก</Label>
                                <Select
                                    value={importData.stockType}
                                    onValueChange={(val) => setImportData({ ...importData, stockType: (val as "Raw" | "Reuse") || "Raw" })}
                                >
                                    <SelectTrigger className="h-10 w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl px-3 text-sm focus-visible:ring-2 focus-visible:ring-blue-600/20">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
                                        <SelectItem value="Raw" className="font-medium">Raw Material</SelectItem>
                                        <SelectItem value="Reuse" className="font-medium">Reusable</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">จำนวน (QTY)</Label>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        value={importData.quantity}
                                        onChange={(e) => setImportData({ ...importData, quantity: parseInt(e.target.value) || 0 })}
                                        className="h-10 w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white pl-3 pr-10 text-sm focus-visible:ring-2 focus-visible:ring-blue-600/20 focus-visible:border-blue-600"
                                    />
                                    <Package className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => setIsImportOpen(false)}
                            className="rounded-xl h-10 text-slate-500 hover:text-slate-900 dark:hover:text-white px-4 text-sm"
                        >
                            ยกเลิก
                        </Button>
                        <Button
                            onClick={() => {
                                if (importData.location) trackLocationUsage(importData.location);
                                handleImport();
                            }}
                            disabled={isSubmitting || !importData.material || !importData.location}
                            className={`rounded-xl h-10 min-w-[140px] text-white text-sm font-bold shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0 ${isSubmitting ? "bg-slate-400" : "bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600"
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
                <DialogContent className="sm:max-w-[480px] border-slate-200 dark:border-slate-800 rounded-xl p-0 bg-white dark:bg-slate-950 max-h-[90vh] overflow-y-auto shadow-none">
                    {/* Header */}
                    <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                        <DialogHeader>
                            <div className="flex items-center gap-3 mb-1">
                                <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                    <ArrowRightLeft className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                                </div>
                                <DialogTitle className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
                                    {it.detail.moveStock}
                                </DialogTitle>
                            </div>
                            <DialogDescription className="text-slate-500 text-sm mt-1">
                                {it.detail.moveStockDesc}
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    {moveSource && (() => {
                        const sourceMat = getMaterialInfo(moveSource.material);
                        const sameMatSlots = inventories.filter(inv =>
                            inv._id !== moveSource._id &&
                            getMatId(inv.material) === getMatId(moveSource.material)
                        );
                        return (
                            <div className="px-6 py-5 space-y-5">
                                {/* Source Info Card */}
                                <div className="rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 space-y-1">
                                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{it.detail.moveSource}</p>
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">{sourceMat?.name || "N/A"}</p>
                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                        <span className="flex items-center gap-1">
                                            <MapPin className="h-3 w-3" />
                                            {moveSource.location}
                                        </span>
                                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase ${moveSource.stockType === 'Raw' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                                            {moveSource.stockType}
                                        </span>
                                        <span className="ml-auto font-medium text-slate-700 dark:text-slate-200">
                                            {lang === 'th' ? 'มี' : 'Stock:'} {moveSource.quantity.toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                {/* Quantity */}
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                        <Package className="h-3.5 w-3.5" />
                                        {it.detail.moveQtyLabel}
                                    </Label>
                                    <div className="flex items-center gap-3">
                                        <Input
                                            type="number"
                                            min={1}
                                            max={moveSource.quantity}
                                            value={moveQty}
                                            onChange={(e) => setMoveQty(Math.min(moveSource.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                                            className="h-10 w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-base px-3 focus-visible:ring-2 focus-visible:ring-blue-600/20 focus-visible:border-blue-600"
                                        />
                                        <span className="text-xs text-slate-400 whitespace-nowrap">
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
                                                className={`flex-1 text-xs font-medium py-1.5 rounded-lg border transition-colors ${moveQty === b.val
                                                    ? 'bg-blue-600 text-white border-blue-600 dark:bg-[#E8601C] dark:border-[#E8601C]'
                                                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-blue-300 hover:text-blue-600 dark:hover:border-orange-500/50 dark:hover:text-orange-400'}`}
                                            >
                                                {b.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Destination Type Toggle */}
                                <div className="space-y-3">
                                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                        <Warehouse className="h-3.5 w-3.5" />
                                        {it.detail.moveDest}
                                    </Label>
                                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                                        <button
                                            type="button"
                                            onClick={() => setMoveDestType("existing")}
                                            className={`py-2.5 rounded-lg text-xs font-medium transition-colors ${moveDestType === "existing"
                                                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                        >
                                            {it.detail.existingSlot}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMoveDestType("new")}
                                            className={`py-2.5 rounded-lg text-xs font-medium transition-colors ${moveDestType === "new"
                                                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                        >
                                            {it.detail.newLocation}
                                        </button>
                                    </div>

                                    {/* Existing slot list */}
                                    {moveDestType === "existing" && (
                                        sameMatSlots.length === 0 ? (
                                            <div className="py-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center">
                                                <p className="text-xs text-slate-400">{it.detail.noDest}</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                                {sameMatSlots.map(slot => (
                                                    <button
                                                        key={slot._id}
                                                        type="button"
                                                        onClick={() => setMoveDestId(slot._id)}
                                                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-colors ${moveDestId === slot._id
                                                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30'
                                                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900'}`}
                                                    >
                                                        <div>
                                                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                                                <MapPin className="h-3 w-3 text-slate-400" />
                                                                {slot.location}
                                                            </p>
                                                            <p className={`text-xs font-medium mt-0.5 ${slot.stockType === 'Raw' ? 'text-blue-500' : 'text-amber-500'}`}>
                                                                {slot.stockType}
                                                            </p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{slot.quantity.toLocaleString()}</p>
                                                            <p className="text-xs text-slate-400">{lang === 'th' ? 'ปัจจุบัน' : 'current'}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )
                                    )}

                                    {/* New location form */}
                                    {moveDestType === "new" && (
                                        <div className="space-y-1.5 relative">
                                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                                <Warehouse className="h-3.5 w-3.5" />
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
                                                    className="h-10 w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white pl-3 pr-10 text-sm focus-visible:ring-2 focus-visible:ring-blue-600/20 focus-visible:border-blue-600"
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
                                                    className="absolute z-50 left-0 right-0 top-[calc(100%+4px)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl max-h-[180px] overflow-y-auto py-1"
                                                >
                                                    {moveFilteredLocationSuggestions.map((loc) => (
                                                        <button
                                                            key={loc}
                                                            type="button"
                                                            onClick={() => {
                                                                setMoveDestLocation(loc);
                                                                setMoveLocationDropdownOpen(false);
                                                            }}
                                                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm ${moveDestLocation === loc ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
                                                        >
                                                            <div
                                                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                                                style={{ backgroundColor: getGlassColor(sourceMat?.specDetails?.color) }}
                                                            />
                                                            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{loc}</span>
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
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => setIsMoveOpen(false)}
                            className="rounded-xl h-10 text-slate-500 hover:text-slate-900 dark:hover:text-white px-4 text-sm"
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
                            className="rounded-xl h-10 min-w-[150px] text-white font-bold bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-sm disabled:opacity-50 shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0"
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
