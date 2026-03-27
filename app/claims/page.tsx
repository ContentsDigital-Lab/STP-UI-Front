"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    Plus, Search, Trash2, ShieldAlert,
    ChevronLeft, ChevronRight, MoreHorizontal, ClipboardCheck,
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
import { claimsApi } from "@/lib/api/claims";
import { materialsApi } from "@/lib/api/materials";
import { ordersApi } from "@/lib/api/orders";
import { workersApi } from "@/lib/api/workers";
import { Claim, Material, Order, Worker } from "@/lib/api/types";

const ITEMS_PER_PAGE = 10;

export default function ClaimsPage() {
    const { user } = useAuth();
    const isManager = user?.role === "admin" || user?.role === "manager";

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
        approvedBy: "",
    });
    const [isUpdating, setIsUpdating] = useState(false);

    // Delete dialog
    const [deleteTarget, setDeleteTarget] = useState<Claim | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

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
            await claimsApi.update(decisionTarget._id, {
                decision: decisionForm.decision,
                approvedBy: decisionForm.approvedBy || undefined,
            });
            toast.success("อัปเดตผลการตัดสินสำเร็จ");
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
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">วัสดุ</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">แหล่งที่มา</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">รายละเอียด</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">ผลการตัดสิน</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">รายงานโดย</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">อนุมัติโดย</TableHead>
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
                                <TableCell colSpan={9} className="py-16 text-center border-none">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                            <ClipboardCheck className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                                        </div>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">ไม่มีข้อมูลการเคลม</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginated.map((c) => (
                                <TableRow key={c._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 border-slate-100 dark:border-slate-800">
                                    <TableCell className="text-sm py-3.5 px-4 text-slate-600 dark:text-slate-300">
                                        {new Date(c.claimDate ?? c.createdAt).toLocaleDateString("th-TH")}
                                    </TableCell>
                                    <TableCell className="font-mono text-sm text-slate-500 dark:text-slate-400 py-3.5">
                                        {getOrderLabel(c.order)}
                                    </TableCell>
                                    <TableCell className="text-sm font-medium py-3.5 text-slate-900 dark:text-white">{getMaterialName(c.material)}</TableCell>
                                    <TableCell className="py-3.5">{sourceBadge(c.source)}</TableCell>
                                    <TableCell className="max-w-[200px] truncate text-sm text-slate-500 dark:text-slate-400 py-3.5" title={c.description}>
                                        {c.description}
                                    </TableCell>
                                    <TableCell className="py-3.5">{decisionBadge(c.decision)}</TableCell>
                                    <TableCell className="text-sm py-3.5 text-slate-600 dark:text-slate-300">{getWorkerName(c.reportedBy)}</TableCell>
                                    <TableCell className="text-sm py-3.5">{c.approvedBy ? getWorkerName(c.approvedBy) : <span className="text-slate-400 text-xs">-</span>}</TableCell>
                                    <TableCell className="py-3.5 pr-4">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {isManager && (
                                                    <DropdownMenuItem onClick={() => {
                                                        setDecisionTarget(c);
                                                        setDecisionForm({ decision: c.decision ?? "", approvedBy: typeof c.approvedBy === "object" ? c.approvedBy?._id ?? "" : c.approvedBy ?? "" });
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
                            ))
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
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">ผลการตัดสิน <span className="text-red-500">*</span></Label>
                            <Select value={decisionForm.decision} onValueChange={(v) => setDecisionForm((f) => ({ ...f, decision: (v ?? "") as "destroy" | "keep" | "" }))}>
                                <SelectTrigger className="h-10 rounded-xl text-sm">
                                    <SelectValue placeholder="เลือกผลการตัดสิน..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="destroy">ทำลาย (Destroy)</SelectItem>
                                    <SelectItem value="keep">เก็บไว้ (Keep)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">อนุมัติโดย</Label>
                            <Select value={decisionForm.approvedBy} onValueChange={(v) => setDecisionForm((f) => ({ ...f, approvedBy: v ?? "" }))}>
                                <SelectTrigger className="h-10 rounded-xl text-sm">
                                    <SelectValue placeholder="เลือกผู้อนุมัติ...">
                                        {(value: string | null) => {
                                            if (!value) return <span className="text-slate-400">เลือกผู้อนุมัติ...</span>;
                                            const w = workerMap.get(value);
                                            return w ? `${w.name} (${w.role})` : value;
                                        }}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from(workerMap.values()).filter((w) => w.role === "admin" || w.role === "manager").map((w) => (
                                        <SelectItem key={w._id} value={w._id}>{w.name} ({w.role})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <Button variant="ghost" onClick={() => setDecisionTarget(null)} disabled={isUpdating} className="rounded-xl h-10 px-5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">ยกเลิก</Button>
                        <Button onClick={handleUpdateDecision} disabled={isUpdating} className="bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white rounded-xl h-10 px-5 text-sm font-bold shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0">
                            {isUpdating ? "กำลังบันทึก..." : "บันทึกผลการตัดสิน"}
                        </Button>
                    </div>
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
        </div>
    );
}
