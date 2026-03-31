"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    Plus, Search, Trash2, ShieldAlert,
    ChevronLeft, ChevronRight, MoreHorizontal, ClipboardCheck,
    Eye, Package, Layers, MapPin, ArrowRight, Image as ImageIcon,
    X, ZoomIn, PackagePlus, UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { useAuth } from "@/lib/auth/auth-context";
import { isManagerOrAbove } from "@/lib/auth/role-utils";
import { getStationName } from "@/lib/utils/station-helpers";
import { claimsApi } from "@/lib/api/claims";
import { materialsApi } from "@/lib/api/materials";
import { ordersApi } from "@/lib/api/orders";
import { workersApi } from "@/lib/api/workers";
import { Claim, Material, Order, Worker } from "@/lib/api/types";

const ITEMS_PER_PAGE = 10;

export default function ClaimsPage() {
    const { user } = useAuth();
    const isManager = isManagerOrAbove(user?.role);

    const [isLoading, setIsLoading] = useState(true);
    const [claims, setClaims] = useState<Claim[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [workerMap, setWorkerMap] = useState<Map<string, Worker>>(new Map());

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [sourceFilter, setSourceFilter] = useState("all");
    const [decisionFilter, setDecisionFilter] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);

    // Create dialog
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [createForm, setCreateForm] = useState({
        order: "",
        material: "",
        source: "customer" as "customer" | "worker",
        description: "",
        reportedBy: "",
        claimDate: new Date().toISOString().slice(0, 10),
    });

    // Update decision dialog
    const [decisionTarget, setDecisionTarget] = useState<Claim | null>(null);
    const [decisionForm, setDecisionForm] = useState({
        decision: "" as "destroy" | "keep" | "",
    });
    const [isUpdating, setIsUpdating] = useState(false);

    // Delete dialog
    const [deleteTarget, setDeleteTarget] = useState<Claim | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Detail dialog — stores the "preview" claim from the table row
    const [detailClaim, setDetailClaim] = useState<Claim | null>(null);
    // Full claim fetched via getById (includes photos)
    const [detailClaimFull, setDetailClaimFull] = useState<Claim | null>(null);
    const [isDetailLoading, setIsDetailLoading] = useState(false);

    // When user opens the detail modal, fetch full data
    useEffect(() => {
        if (!detailClaim) { setDetailClaimFull(null); return; }
        setIsDetailLoading(true);
        claimsApi.getById(detailClaim._id)
            .then((res) => { if (res.success) setDetailClaimFull(res.data); })
            .catch(() => {})
            .finally(() => setIsDetailLoading(false));
    }, [detailClaim?._id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Use full data if available, otherwise fall back to preview
    const activeClaim = detailClaimFull ?? detailClaim;

    // Lightbox
    const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
    const lightboxPhotos = activeClaim?.photos ?? [];

    useEffect(() => {
        if (lightboxIdx === null) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") setLightboxIdx(null);
            if (e.key === "ArrowRight") setLightboxIdx((i) => i !== null && i < lightboxPhotos.length - 1 ? i + 1 : i);
            if (e.key === "ArrowLeft") setLightboxIdx((i) => i !== null && i > 0 ? i - 1 : i);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [lightboxIdx, lightboxPhotos.length]);

    // Initial data load (once)
    useEffect(() => {
        Promise.all([
            claimsApi.getAll(),
            materialsApi.getAll(),
            ordersApi.getAll(),
            workersApi.getAll(),
        ]).then(([cRes, mRes, oRes, workerRes]) => {
            if (cRes.success) setClaims(cRes.data);
            if (mRes.success) setMaterials(mRes.data);
            if (oRes.success) setOrders(oRes.data);
            if (workerRes.success) {
                const map = new Map<string, Worker>();
                workerRes.data.forEach((w) => map.set(w._id, w));
                setWorkerMap(map);
            }
        }).catch(() => toast.error("Failed to load data")).finally(() => setIsLoading(false));
    }, []);

    // WebSocket — all state mutations come from here after initial load
    const handleSocketEvent = useCallback((_event: string, rawData: unknown) => {
        const { action, data } = rawData as { action: string; data: Claim };
        if (!data?._id) return;
        setClaims((prev) => {
            if (action === "created") return [data, ...prev];
            if (action === "updated") return prev.map((c) => c._id === data._id ? data : c);
            if (action === "deleted") return prev.filter((c) => c._id !== data._id);
            return prev;
        });
    }, []);

    useWebSocket("claim", ["claim:updated"], handleSocketEvent);

    // Helpers
    const getMaterialName = (m: string | Material | undefined) => {
        if (!m) return "-";
        if (typeof m === "object") return m.name;
        return materials.find((x) => x._id === m)?.name ?? m.slice(-6);
    };

    const getOrderLabel = (o: string | Order | undefined) => {
        if (!o) return "-";
        if (typeof o === "object") return o.orderNumber ?? `#${o._id.slice(-6)}`;
        return `#${o.slice(-6)}`;
    };

    const getWorkerName = (w: string | Worker | undefined) => {
        if (!w) return "-";
        if (typeof w === "object") return w.name;
        return workerMap.get(w)?.name ?? w.slice(-6);
    };

    const getPaneNumber = (p: Claim["pane"]) => {
        if (!p) return null;
        if (typeof p === "object") return p.paneNumber;
        return `...${p.slice(-6)}`;
    };

    const getPaneObj = (p: Claim["pane"]): import("@/lib/api/types").Pane | null => {
        if (!p || typeof p !== "object") return null;
        return p as import("@/lib/api/types").Pane;
    };

    const PANE_STATUS_LABEL: Record<string, string> = {
        pending: "รอดำเนินการ",
        in_progress: "กำลังทำงาน",
        awaiting_scan_out: "รอสแกนออก",
        claimed: "รอตัดสินเคลม",
        completed: "เสร็จสิ้น",
    };

    const DEFECT_CODE_LABEL: Record<string, string> = {
        broken: "แตก / หัก",
        chipped: "บิ่น",
        dimension_wrong: "ขนาดไม่ถูกต้อง",
        scratch: "รอยขีดข่วน",
        other: "อื่น ๆ",
    };

    // Filtered & paginated
    const filtered = useMemo(() => {
        return claims.filter((c) => {
            const matName = getMaterialName(c.material).toLowerCase();
            const matchSearch = !searchQuery || matName.includes(searchQuery.toLowerCase()) || c.description.toLowerCase().includes(searchQuery.toLowerCase());
            const matchSource = sourceFilter === "all" || c.source === sourceFilter;
            const matchDecision = decisionFilter === "all"
                || (decisionFilter === "pending" && !c.decision)
                || c.decision === decisionFilter;
            return matchSearch && matchSource && matchDecision;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [claims, searchQuery, sourceFilter, decisionFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => { setCurrentPage(1); }, [searchQuery, sourceFilter, decisionFilter]);

    const handleCreate = async () => {
        if (!createForm.order || !createForm.material || !createForm.description || !createForm.reportedBy) {
            toast.error("กรุณากรอกข้อมูลให้ครบถ้วน");
            return;
        }
        setIsSubmitting(true);
        try {
            await claimsApi.createForOrder(createForm.order, {
                material: createForm.material,
                source: createForm.source,
                description: createForm.description,
                reportedBy: createForm.reportedBy,
                claimDate: new Date(createForm.claimDate).toISOString(),
            });
            toast.success("บันทึกการเคลมสำเร็จ");
            setIsCreateOpen(false);
            setCreateForm({ order: "", material: "", source: "customer", description: "", reportedBy: "", claimDate: new Date().toISOString().slice(0, 10) });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setIsSubmitting(false);
        }
    };


    const handleUpdateDecision = async () => {
        if (!decisionTarget || !decisionForm.decision) {
            toast.error("กรุณาเลือกผลการตัดสิน");
            return;
        }
        setIsUpdating(true);
        try {
            const res = await claimsApi.update(decisionTarget._id, {
                status: "approved",
                decision: decisionForm.decision as "destroy" | "keep",
                approvedBy: user?._id,
            });

            if (res.success) {
                toast.success("อนุมัติผลการตัดสินสำเร็จ — ระบบสร้างกระจกทดแทนอัตโนมัติแล้ว");
            }
            setDecisionTarget(null);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            await claimsApi.delete(deleteTarget._id);
            toast.success("ลบรายการสำเร็จ");
            setDeleteTarget(null);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setIsDeleting(false);
        }
    };

    const decisionBadge = (decision?: "destroy" | "keep") => {
        if (!decision) return <span className="text-xs font-medium px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">รอตัดสิน</span>;
        if (decision === "destroy") return <span className="text-xs font-medium px-2 py-1 rounded-md bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400">ทำลาย</span>;
        return <span className="text-xs font-medium px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">เก็บไว้</span>;
    };

    const sourceBadge = (source: "customer" | "worker") => (
        <span className={`text-xs font-medium px-2 py-1 rounded-md ${source === "customer" ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>
            {source === "customer" ? "ลูกค้า" : "พนักงาน"}
        </span>
    );

    return (
        <div className="space-y-6 max-w-[1440px] mx-auto w-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white truncate">รายการเคลม</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">บันทึกและติดตามการเคลมวัสดุแบบเรียลไทม์</p>
                </div>
                <Button onClick={() => setIsCreateOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white font-bold rounded-xl h-10 px-5 text-sm shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0 w-full sm:w-auto shrink-0">
                    <Plus className="h-4 w-4" />
                    เพิ่มรายการเคลม
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: "รายการทั้งหมด", value: claims.length, accent: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10", icon: ShieldAlert },
                    { label: "รอตัดสิน", value: claims.filter((c) => !c.decision).length, accent: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10", icon: ShieldAlert },
                    { label: "ทำลาย", value: claims.filter((c) => c.decision === "destroy").length, accent: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10", icon: Trash2 },
                    { label: "เก็บไว้", value: claims.filter((c) => c.decision === "keep").length, accent: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10", icon: ClipboardCheck },
                ].map((stat) => (
                    <div key={stat.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center mb-2 ${stat.accent}`}>
                            <stat.icon className="h-4 w-4" />
                        </div>
                        <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-0.5">{stat.label}</p>
                        <p className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{isLoading ? "-" : stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                    <div className="relative flex-1 space-y-1.5">
                        <Label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                            <Search className="h-3 w-3" />
                            ค้นหา
                        </Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="ค้นหาตามวัสดุหรือคำอธิบาย..."
                                className="pl-9 h-10 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-sm focus:ring-1 focus:ring-blue-600"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-3">
                        <div className="space-y-1.5 sm:w-40 shrink-0">
                            <Label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">แหล่งที่มา</Label>
                            <Select value={sourceFilter === "all" ? "" : sourceFilter} onValueChange={(v) => setSourceFilter(v || "all")}>
                                <SelectTrigger className="h-10 w-full rounded-xl text-sm border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-blue-600/20">
                                    <SelectValue placeholder="ทุกแหล่ง" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
                                    <SelectItem value="all" className="focus:bg-slate-100">ทุกแหล่ง</SelectItem>
                                    <SelectItem value="customer" className="focus:bg-slate-100">ลูกค้า</SelectItem>
                                    <SelectItem value="worker" className="focus:bg-slate-100">พนักงาน</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5 sm:w-44 shrink-0">
                            <Label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">สถานะ</Label>
                            <Select value={decisionFilter === "all" ? "" : decisionFilter} onValueChange={(v) => setDecisionFilter(v || "all")}>
                                <SelectTrigger className="h-10 w-full rounded-xl text-sm border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-blue-600/20">
                                    <SelectValue placeholder="ทุกสถานะ" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
                                    <SelectItem value="all" className="focus:bg-slate-100">ทุกสถานะ</SelectItem>
                                    <SelectItem value="pending" className="focus:bg-slate-100">รอตัดสิน</SelectItem>
                                    <SelectItem value="destroy" className="focus:bg-slate-100">ทำลาย</SelectItem>
                                    <SelectItem value="keep" className="focus:bg-slate-100">เก็บไว้</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="border-slate-100 dark:border-slate-800 hover:bg-transparent">
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 px-4 h-10">วันที่เคลม</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">Order</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">กระจกแผ่น</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">วัสดุ</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">แหล่งที่มา</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">รายละเอียด</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">ผลการตัดสิน</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">รายงานโดย</TableHead>
                            <TableHead className="w-10 py-3 h-10" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i}>
                                    {Array.from({ length: 9 }).map((_, j) => (
                                        <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : paginated.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="py-16 text-center border-none" suppressHydrationWarning>
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                            <ClipboardCheck className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                                        </div>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">ไม่มีข้อมูลการเคลม</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginated.map((c) => {
                                const paneNum = getPaneNumber(c.pane);
                                const paneObj = getPaneObj(c.pane);
                                return (
                                <TableRow
                                    key={c._id}
                                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 border-slate-100 dark:border-slate-800 cursor-pointer"
                                    onClick={() => setDetailClaim(c)}
                                >
                                    <TableCell className="text-sm py-3.5 px-4 text-slate-600 dark:text-slate-300">
                                        <div>{new Date(c.claimDate ?? c.createdAt).toLocaleDateString("th-TH")}</div>
                                        {c.claimNumber && <div className="text-[11px] font-mono text-slate-400 mt-0.5">{c.claimNumber}</div>}
                                    </TableCell>
                                    <TableCell className="font-mono text-sm text-slate-500 dark:text-slate-400 py-3.5">
                                        {getOrderLabel(c.order)}
                                    </TableCell>
                                    <TableCell className="py-3.5">
                                        {paneNum ? (
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-sm font-semibold font-mono text-slate-900 dark:text-white">{paneNum}</span>
                                                {paneObj?.dimensions && (
                                                    <span className="text-[11px] text-slate-400">
                                                        {paneObj.dimensions.width}×{paneObj.dimensions.height}×{paneObj.dimensions.thickness} มม.
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 text-xs">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-sm font-medium py-3.5 text-slate-900 dark:text-white">{getMaterialName(c.material)}</TableCell>
                                    <TableCell className="py-3.5">{sourceBadge(c.source)}</TableCell>
                                    <TableCell className="max-w-[180px] truncate text-sm text-slate-500 dark:text-slate-400 py-3.5" title={c.description}>
                                        {c.description}
                                    </TableCell>
                                    <TableCell className="py-3.5">{decisionBadge(c.decision)}</TableCell>
                                    <TableCell className="text-sm py-3.5 text-slate-600 dark:text-slate-300">{getWorkerName(c.reportedBy)}</TableCell>
                                    <TableCell className="py-3.5 pr-4" onClick={(e) => e.stopPropagation()}>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => setDetailClaim(c)}>
                                                    <Eye className="mr-2 h-4 w-4" />
                                                    ดูรายละเอียด
                                                </DropdownMenuItem>
                                                {isManager && <DropdownMenuSeparator />}
                                                {isManager && (
                                                    <DropdownMenuItem onClick={() => {
                                                        setDecisionTarget(c);
                                                        setDecisionForm({ decision: c.decision ?? "" });
                                                    }}>
                                                        <ClipboardCheck className="mr-2 h-4 w-4" />
                                                        ตัดสินผล
                                                    </DropdownMenuItem>
                                                )}
                                                {isManager && <DropdownMenuSeparator />}
                                                {isManager && (
                                                    <DropdownMenuItem
                                                        className="text-red-500 focus:text-red-500"
                                                        onClick={() => setDeleteTarget(c)}
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        ลบรายการ
                                                    </DropdownMenuItem>
                                                )}
                                                {!isManager && (
                                                    <DropdownMenuItem disabled className="text-slate-400 text-xs">
                                                        ไม่มีสิทธิ์จัดการ
                                                    </DropdownMenuItem>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
                </div>

                {/* Pagination */}
                {!isLoading && totalPages > 1 && (
                    <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-xs text-slate-400">{currentPage} / {totalPages}</span>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            {[...Array(totalPages)].map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setCurrentPage(i + 1)}
                                    className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-medium transition-colors ${currentPage === i + 1 ? "bg-blue-600 dark:bg-[#E8601C] text-white" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-lg rounded-xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">เพิ่มรายการเคลมใหม่</DialogTitle>
                        <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">บันทึกการเคลมวัสดุที่เกี่ยวข้องกับ Order</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Order <span className="text-red-500">*</span></Label>
                                <Select value={createForm.order} onValueChange={(v) => setCreateForm((f) => ({ ...f, order: v ?? "" }))}>
                                    <SelectTrigger className="h-10 rounded-xl text-sm">
                                        <SelectValue placeholder="เลือก Order...">
                                            {(value: string | null) => {
                                                if (!value) return <span className="text-slate-400">เลือก Order...</span>;
                                                const o = orders.find(x => x._id === value);
                                                return o?.orderNumber ?? `#${value.slice(-6)}`;
                                            }}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent className="!w-fit">
                                        {orders.filter((o) => o.status !== "cancelled").map((o) => (
                                            <SelectItem key={o._id} value={o._id}>
                                                {o.orderNumber ?? `#${o._id.slice(-6)}`}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">วัสดุ <span className="text-red-500">*</span></Label>
                                <Select value={createForm.material} onValueChange={(v) => setCreateForm((f) => ({ ...f, material: v ?? "" }))}>
                                    <SelectTrigger className="h-10 rounded-xl text-sm">
                                        <SelectValue placeholder="เลือกวัสดุ...">
                                            {(value: string | null) => {
                                                if (!value) return <span className="text-slate-400">เลือกวัสดุ...</span>;
                                                return materials.find(x => x._id === value)?.name ?? value;
                                            }}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {materials.map((m) => (
                                            <SelectItem key={m._id} value={m._id}>{m.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">แหล่งที่มา <span className="text-red-500">*</span></Label>
                                <Select value={createForm.source} onValueChange={(v) => setCreateForm((f) => ({ ...f, source: v as "customer" | "worker" }))}>
                                    <SelectTrigger className="h-10 rounded-xl text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="customer">ลูกค้า (Customer)</SelectItem>
                                        <SelectItem value="worker">พนักงาน (Worker)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">วันที่เคลม</Label>
                                <Input
                                    type="date"
                                    className="h-10 rounded-xl text-sm"
                                    value={createForm.claimDate}
                                    onChange={(e) => setCreateForm((f) => ({ ...f, claimDate: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">รายงานโดย <span className="text-red-500">*</span></Label>
                            <Select value={createForm.reportedBy} onValueChange={(v) => setCreateForm((f) => ({ ...f, reportedBy: v ?? "" }))}>
                                <SelectTrigger className="h-10 rounded-xl text-sm">
                                    <SelectValue placeholder="เลือกผู้รายงาน...">
                                        {(value: string | null) => {
                                            if (!value) return <span className="text-slate-400">เลือกผู้รายงาน...</span>;
                                            return workerMap.get(value)?.name ?? value;
                                        }}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from(workerMap.values()).map((w) => (
                                        <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">รายละเอียด <span className="text-red-500">*</span></Label>
                            <Textarea
                                placeholder="อธิบายปัญหาหรือเหตุผลในการเคลม..."
                                className="rounded-xl text-sm"
                                rows={3}
                                value={createForm.description}
                                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <Button variant="ghost" onClick={() => setIsCreateOpen(false)} disabled={isSubmitting} className="rounded-xl h-10 px-5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">ยกเลิก</Button>
                        <Button onClick={handleCreate} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white rounded-xl h-10 px-5 text-sm font-bold shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0">
                            {isSubmitting ? "กำลังบันทึก..." : "บันทึกการเคลม"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Decision Dialog */}
            <Dialog open={!!decisionTarget} onOpenChange={() => setDecisionTarget(null)}>
                <DialogContent className="sm:max-w-sm rounded-xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">ตัดสินผลการเคลม</DialogTitle>
                        <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
                            กำหนดผลการตัดสินสำหรับรายการเคลมนี้
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        {/* Auto approver */}
                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                            <UserCheck className="h-4 w-4 text-slate-400 shrink-0" />
                            <div>
                                <p className="text-[10px] text-slate-400 leading-none mb-0.5">อนุมัติโดย (อัตโนมัติ)</p>
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{user?.name ?? "—"}</p>
                            </div>
                        </div>

                        {/* Decision */}
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">ผลการตัดสิน <span className="text-red-500">*</span></Label>
                            <Select value={decisionForm.decision} onValueChange={(v) => setDecisionForm((f) => ({ ...f, decision: (v ?? "") as "destroy" | "keep" | "" }))}>
                                <SelectTrigger className="h-10 rounded-xl text-sm">
                                    <SelectValue placeholder="เลือกผลการตัดสิน..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="destroy">ทำลาย — กระจกเสียหาย ไม่สามารถใช้ได้</SelectItem>
                                    <SelectItem value="keep">เก็บไว้ — รับเคลม ต้องทำชดเชย</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Auto-remake info */}
                        <div className="w-full flex items-start gap-3 p-3 rounded-xl border-2 border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-left">
                            <PackagePlus className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">สร้างกระจกทดแทนอัตโนมัติ</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    เมื่ออนุมัติ ระบบจะสร้าง Pane ใหม่ภายใต้บิลเดิม พร้อมสเปกเดียวกันโดยอัตโนมัติ
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <Button variant="ghost" onClick={() => setDecisionTarget(null)} disabled={isUpdating} className="rounded-xl h-10 px-5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">ยกเลิก</Button>
                        <Button onClick={handleUpdateDecision} disabled={isUpdating} className="bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white rounded-xl h-10 px-5 text-sm font-bold shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0">
                            {isUpdating ? "กำลังดำเนินการ..." : "อนุมัติผลการตัดสิน"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Detail Dialog */}
            <Dialog open={!!detailClaim} onOpenChange={() => setDetailClaim(null)}>
                <DialogContent className="sm:max-w-2xl rounded-2xl p-0 overflow-hidden">
                    {detailClaim && (() => {
                        const paneObj = getPaneObj(activeClaim?.pane);
                        const paneNum = getPaneNumber(activeClaim?.pane);
                        return (
                            <>
                                {/* Header */}
                                <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center shrink-0">
                                            <ShieldAlert className="h-5 w-5 text-red-500" />
                                        </div>
                                        <div>
                                            <p className="font-mono text-xs text-slate-400 mb-0.5">
                                                {activeClaim?.claimNumber ?? "ไม่มีรหัส"}
                                            </p>
                                            <DialogTitle className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                                                รายละเอียดการเคลม
                                            </DialogTitle>
                                        </div>
                                    </div>
                                    <div className="shrink-0 pt-1">{decisionBadge(activeClaim?.decision)}</div>
                                </div>

                                <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                                    {/* Pane section */}
                                    {paneNum ? (
                                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                                                <Layers className="h-3.5 w-3.5 text-slate-400" />
                                                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">ข้อมูลกระจกแผ่น</span>
                                            </div>
                                            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                                                <div>
                                                    <p className="text-[11px] text-slate-400 mb-0.5">เลขแผ่น</p>
                                                    <p className="text-sm font-bold font-mono text-slate-900 dark:text-white">{paneNum}</p>
                                                </div>
                                                {paneObj?.dimensions && (
                                                    <div>
                                                        <p className="text-[11px] text-slate-400 mb-0.5">ขนาด (กว้าง × สูง × หนา)</p>
                                                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                                            {paneObj.dimensions.width} × {paneObj.dimensions.height} × {paneObj.dimensions.thickness} มม.
                                                        </p>
                                                    </div>
                                                )}
                                                {paneObj?.glassTypeLabel && (
                                                    <div>
                                                        <p className="text-[11px] text-slate-400 mb-0.5">ประเภทกระจก</p>
                                                        <p className="text-sm font-medium text-slate-900 dark:text-white">{paneObj.glassTypeLabel}</p>
                                                    </div>
                                                )}
                                                {paneObj?.currentStation && (
                                                    <div>
                                                        <p className="text-[11px] text-slate-400 mb-0.5">สถานีปัจจุบัน</p>
                                                        <div className="flex items-center gap-1.5">
                                                            <MapPin className="h-3 w-3 text-slate-400" />
                                                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                                {getStationName(paneObj.currentStation)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                                {paneObj?.currentStatus && (
                                                    <div>
                                                        <p className="text-[11px] text-slate-400 mb-0.5">สถานะ</p>
                                                        <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-md ${
                                                            paneObj.currentStatus === "completed"
                                                                ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                                : paneObj.currentStatus === "in_progress"
                                                                ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                                                : paneObj.currentStatus === "awaiting_scan_out"
                                                                ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                                                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                                                        }`}>
                                                            {PANE_STATUS_LABEL[paneObj.currentStatus] ?? paneObj.currentStatus}
                                                        </span>
                                                    </div>
                                                )}
                                                {paneObj?.jobType && (
                                                    <div>
                                                        <p className="text-[11px] text-slate-400 mb-0.5">ประเภทงาน</p>
                                                        <p className="text-sm font-medium text-slate-900 dark:text-white">{paneObj.jobType}</p>
                                                    </div>
                                                )}
                                                {paneObj?.routing && paneObj.routing.length > 0 && (
                                                    <div className="col-span-2 sm:col-span-3">
                                                        <p className="text-[11px] text-slate-400 mb-1.5">เส้นทางการผลิต</p>
                                                        <div className="flex items-center flex-wrap gap-1">
                                                            {paneObj.routing.map((s, i) => (
                                                                <React.Fragment key={i}>
                                                                    <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{getStationName(s)}</span>
                                                                    {i < paneObj.routing.length - 1 && <ArrowRight className="h-3 w-3 text-slate-300 dark:text-slate-600" />}
                                                                </React.Fragment>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {paneObj?.processes && paneObj.processes.length > 0 && (
                                                    <div className="col-span-2 sm:col-span-3">
                                                        <p className="text-[11px] text-slate-400 mb-1.5">กระบวนการ</p>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {paneObj.processes.map((p, i) => (
                                                                <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">{p}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                                            <Package className="h-4 w-4 text-slate-400 shrink-0" />
                                            <p className="text-sm text-slate-500 dark:text-slate-400">ไม่ได้ระบุกระจกแผ่น</p>
                                        </div>
                                    )}

                                    {/* Claim info */}
                                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                                            <ShieldAlert className="h-3.5 w-3.5 text-slate-400" />
                                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">ข้อมูลการเคลม</span>
                                        </div>
                                        <div className="p-4 space-y-3">
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                                                <div>
                                                    <p className="text-[11px] text-slate-400 mb-0.5">วันที่เคลม</p>
                                                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                        {new Date(activeClaim?.claimDate ?? activeClaim?.createdAt ?? detailClaim.createdAt).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] text-slate-400 mb-0.5">แหล่งที่มา</p>
                                                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                        {activeClaim?.source === "customer" ? "ลูกค้า (Customer)" : "พนักงาน (Worker)"}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] text-slate-400 mb-0.5">Order</p>
                                                    <p className="text-sm font-mono font-medium text-slate-900 dark:text-white">{getOrderLabel(activeClaim?.order)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] text-slate-400 mb-0.5">วัสดุ</p>
                                                    <p className="text-sm font-medium text-slate-900 dark:text-white">{getMaterialName(activeClaim?.material)}</p>
                                                </div>
                                                {activeClaim?.defectCode && (
                                                    <div>
                                                        <p className="text-[11px] text-slate-400 mb-0.5">ประเภทข้อบกพร่อง</p>
                                                        <p className="text-sm font-medium text-slate-900 dark:text-white">{DEFECT_CODE_LABEL[activeClaim.defectCode] ?? activeClaim.defectCode}</p>
                                                    </div>
                                                )}
                                                {activeClaim?.defectStation && (
                                                    <div>
                                                        <p className="text-[11px] text-slate-400 mb-0.5">สถานีที่เกิดปัญหา</p>
                                                        <p className="text-sm font-medium text-slate-900 dark:text-white">{getStationName(activeClaim.defectStation)}</p>
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-[11px] text-slate-400 mb-1">รายละเอียด / เหตุผล</p>
                                                <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3 leading-relaxed whitespace-pre-wrap">
                                                    {activeClaim?.description}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* People */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                                            <p className="text-[11px] text-slate-400 mb-1">รายงานโดย</p>
                                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{getWorkerName(activeClaim?.reportedBy)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                                            <p className="text-[11px] text-slate-400 mb-1">อนุมัติโดย</p>
                                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                                {activeClaim?.approvedBy ? getWorkerName(activeClaim.approvedBy) : <span className="text-slate-400 font-normal">ยังไม่ได้อนุมัติ</span>}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Photos */}
                                    {isDetailLoading ? (
                                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                                                <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
                                                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">รูปภาพ</span>
                                            </div>
                                            <div className="p-4 grid grid-cols-3 gap-3">
                                                {[0, 1, 2].map((i) => (
                                                    <div key={i} className="aspect-square rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                                                ))}
                                            </div>
                                        </div>
                                    ) : lightboxPhotos.length > 0 && (
                                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                                                <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
                                                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                                    รูปภาพ ({lightboxPhotos.length})
                                                </span>
                                                <span className="ml-auto text-[10px] text-slate-400">กดที่ภาพเพื่อขยาย</span>
                                            </div>
                                            <div className="p-4 grid grid-cols-3 gap-3">
                                                {lightboxPhotos.map((src, i) => (
                                                    <button
                                                        key={i}
                                                        type="button"
                                                        onClick={() => setLightboxIdx(i)}
                                                        className="group relative block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 aspect-square bg-slate-100 dark:bg-slate-800 hover:border-blue-400 dark:hover:border-blue-500 transition-all"
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={src} alt={`ภาพที่ ${i + 1}`} className="w-full h-full object-cover" />
                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                                            <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                                                        </div>
                                                        <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-md">
                                                            {i + 1}/{lightboxPhotos.length}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                    {isManager && (
                                        <Button
                                            variant="outline"
                                            className="rounded-xl h-9 px-4 text-sm gap-2"
                                            onClick={() => {
                                                const target = activeClaim ?? detailClaim;
                                                setDetailClaim(null);
                                                setDecisionTarget(target);
                                                setDecisionForm({ decision: target.decision ?? "" });
                                            }}
                                        >
                                            <ClipboardCheck className="h-4 w-4" />
                                            ตัดสินผล
                                        </Button>
                                    )}
                                    <div className="ml-auto">
                                        <Button variant="ghost" onClick={() => setDetailClaim(null)} className="rounded-xl h-9 px-5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">
                                            ปิด
                                        </Button>
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            {/* Delete Confirm Dialog */}
            <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
                <DialogContent className="sm:max-w-sm rounded-xl p-6">
                    <DialogHeader>
                        <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                            <Trash2 className="h-6 w-6 text-red-500" />
                        </div>
                        <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white text-center">ยืนยันการลบ</DialogTitle>
                        <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 text-center">
                            ลบรายการเคลมนี้? การกระทำนี้ไม่สามารถย้อนกลับได้
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting} className="rounded-xl h-10 px-5 text-sm">ยกเลิก</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700 rounded-xl h-10 px-5 text-sm font-semibold">
                            {isDeleting ? "กำลังลบ..." : "ลบรายการ"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Lightbox */}
            {lightboxIdx !== null && lightboxPhotos.length > 0 && (
                <div
                    className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-sm"
                    onClick={() => setLightboxIdx(null)}
                >
                    {/* Close */}
                    <button
                        type="button"
                        onClick={() => setLightboxIdx(null)}
                        className="absolute top-4 right-4 h-10 w-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
                    >
                        <X className="h-5 w-5" />
                    </button>

                    {/* Counter */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-white/10 text-white text-sm font-medium">
                        {lightboxIdx + 1} / {lightboxPhotos.length}
                    </div>

                    {/* Prev */}
                    {lightboxIdx > 0 && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => (i ?? 1) - 1); }}
                            className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
                        >
                            <ChevronLeft className="h-6 w-6" />
                        </button>
                    )}

                    {/* Image */}
                    <div
                        className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={lightboxPhotos[lightboxIdx]}
                            alt={`ภาพที่ ${lightboxIdx + 1}`}
                            className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain"
                        />
                    </div>

                    {/* Next */}
                    {lightboxIdx < lightboxPhotos.length - 1 && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => (i ?? 0) + 1); }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
                        >
                            <ChevronRight className="h-6 w-6" />
                        </button>
                    )}

                    {/* Thumbnail strip */}
                    {lightboxPhotos.length > 1 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
                            {lightboxPhotos.map((src, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setLightboxIdx(i); }}
                                    className={`h-12 w-12 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${i === lightboxIdx ? "border-white scale-110" : "border-white/30 opacity-60 hover:opacity-100"}`}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={src} alt="" className="w-full h-full object-cover" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
