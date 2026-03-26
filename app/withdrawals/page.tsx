"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    Plus, Search, Trash2, ArrowDownFromLine,
    ChevronLeft, ChevronRight, Package, MoreHorizontal,
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
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { useAuth } from "@/lib/auth/auth-context";
import { withdrawalsApi } from "@/lib/api/withdrawals";
import { materialsApi } from "@/lib/api/materials";
import { inventoriesApi } from "@/lib/api/inventories";
import { ordersApi } from "@/lib/api/orders";
import { workersApi } from "@/lib/api/workers";
import { Withdrawal, Material, Inventory, Order, Worker } from "@/lib/api/types";

const ITEMS_PER_PAGE = 10;

export default function WithdrawalsPage() {
    const { user } = useAuth();
    const isManager = user?.role === "admin" || user?.role === "manager";

    const [isLoading, setIsLoading] = useState(true);
    const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [inventories, setInventories] = useState<Inventory[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [workerMap, setWorkerMap] = useState<Map<string, Worker>>(new Map());

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [stockTypeFilter, setStockTypeFilter] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);

    // Create dialog
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [form, setForm] = useState({
        order: "",
        material: "",
        quantity: "",
        stockType: "Raw" as "Raw" | "Reuse",
        withdrawnDate: new Date().toISOString().slice(0, 10),
    });

    // Delete dialog
    const [deleteTarget, setDeleteTarget] = useState<Withdrawal | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Initial data load (once)
    useEffect(() => {
        Promise.all([
            withdrawalsApi.getAll(),
            materialsApi.getAll(),
            inventoriesApi.getAll(),
            ordersApi.getAll(),
            workersApi.getAll(),
        ]).then(([wRes, mRes, iRes, oRes, workerRes]) => {
            if (wRes.success) setWithdrawals(wRes.data);
            if (mRes.success) setMaterials(mRes.data);
            if (iRes.success) setInventories(iRes.data);
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
        const { action, data } = rawData as { action: string; data: Withdrawal };
        if (!data?._id) return;
        setWithdrawals((prev) => {
            if (action === "created") return [data, ...prev];
            if (action === "updated") return prev.map((w) => w._id === data._id ? data : w);
            if (action === "deleted") return prev.filter((w) => w._id !== data._id);
            return prev;
        });
    }, []);

    useWebSocket("withdrawal", ["withdrawal:updated"], handleSocketEvent);

    const getStockForMaterial = useCallback((materialId: string, stockType?: "Raw" | "Reuse") => {
        return inventories
            .filter((inv) => {
                const invMatId = inv.material && typeof inv.material === "object" ? inv.material._id : inv.material;
                return invMatId === materialId && (!stockType || inv.stockType === stockType);
            })
            .reduce((sum, inv) => sum + inv.quantity, 0);
    }, [inventories]);

    // Helpers to resolve populated or string IDs
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

    // Filtered & paginated data
    const filtered = useMemo(() => {
        return withdrawals.filter((w) => {
            const matName = getMaterialName(w.material).toLowerCase();
            const matchSearch = !searchQuery || matName.includes(searchQuery.toLowerCase());
            const matchType = stockTypeFilter === "all" || w.stockType === stockTypeFilter;
            return matchSearch && matchType;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [withdrawals, searchQuery, stockTypeFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    // Reset page on filter change
    useEffect(() => { setCurrentPage(1); }, [searchQuery, stockTypeFilter]);

    const handleCreate = async () => {
        if (!form.order || !form.material || !form.quantity) {
            toast.error("กรุณากรอกข้อมูลให้ครบถ้วน");
            return;
        }
        setIsSubmitting(true);
        try {
            await withdrawalsApi.create({
                order: form.order,
                material: form.material,
                quantity: Number(form.quantity),
                stockType: form.stockType,
                withdrawnBy: user?._id,
                withdrawnDate: new Date(form.withdrawnDate).toISOString(),
            });
            toast.success("เบิกวัสดุสำเร็จ");
            setIsCreateOpen(false);
            setForm({ order: "", material: "", quantity: "", stockType: "Raw", withdrawnDate: new Date().toISOString().slice(0, 10) });
            // State updated via WebSocket event
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            await withdrawalsApi.delete(deleteTarget._id);
            toast.success("ลบรายการสำเร็จ");
            setDeleteTarget(null);
            // State updated via WebSocket event
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-6 max-w-[1440px] mx-auto w-full">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">เบิกวัสดุ</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">บันทึกและติดตามการเบิกวัสดุแบบเรียลไทม์</p>
                </div>
                <Button onClick={() => setIsCreateOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl h-10 px-5 text-sm">
                    <Plus className="h-4 w-4" />
                    เบิกวัสดุใหม่
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: "รายการทั้งหมด", value: withdrawals.length, accent: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10", icon: ArrowDownFromLine },
                    { label: "กระจกดิบ (Raw)", value: withdrawals.filter((w) => w.stockType === "Raw").length, accent: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10", icon: Package },
                    { label: "กระจกนำกลับ (Reuse)", value: withdrawals.filter((w) => w.stockType === "Reuse").length, accent: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10", icon: Package },
                    { label: "วันนี้", value: withdrawals.filter((w) => new Date(w.createdAt).toDateString() === new Date().toDateString()).length, accent: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10", icon: Package },
                ].map((stat) => (
                    <div key={stat.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 p-4 sm:p-5">
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-3 ${stat.accent}`}>
                            <stat.icon className="h-[18px] w-[18px]" />
                        </div>
                        <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-0.5">{stat.label}</p>
                        <p className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{isLoading ? "-" : stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="ค้นหาตามชื่อวัสดุ..."
                        className="pl-9 h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Select value={stockTypeFilter} onValueChange={(v) => setStockTypeFilter(v ?? "all")}>
                    <SelectTrigger className="h-10 w-full sm:w-48 rounded-xl text-sm">
                        <SelectValue placeholder="ประเภทสต็อก" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">ทุกประเภท</SelectItem>
                        <SelectItem value="Raw">กระจกดิบ (Raw)</SelectItem>
                        <SelectItem value="Reuse">กระจกนำกลับ (Reuse)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 overflow-hidden">
                <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="border-slate-100 dark:border-slate-800 hover:bg-transparent">
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 px-4 h-10">วันที่เบิก</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">วัสดุ</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">จำนวน</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">ประเภท</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">Order</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">เบิกโดย</TableHead>
                            {isManager && <TableHead className="w-10 py-3 h-10" />}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i}>
                                    {Array.from({ length: isManager ? 7 : 6 }).map((_, j) => (
                                        <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : paginated.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={isManager ? 7 : 6} className="py-16 text-center border-none">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                            <Package className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                                        </div>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">ไม่มีข้อมูลการเบิกวัสดุ</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginated.map((w) => (
                                <TableRow key={w._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 border-slate-100 dark:border-slate-800">
                                    <TableCell className="text-sm py-3.5 px-4 text-slate-600 dark:text-slate-300">
                                        {new Date(w.withdrawnDate ?? w.createdAt).toLocaleDateString("th-TH")}
                                    </TableCell>
                                    <TableCell className="text-sm font-medium py-3.5 text-slate-900 dark:text-white">{getMaterialName(w.material)}</TableCell>
                                    <TableCell className="text-sm py-3.5 tabular-nums">{w.quantity}</TableCell>
                                    <TableCell className="py-3.5">
                                        <span className={`text-xs font-medium px-2 py-1 rounded-md ${w.stockType === "Raw" ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>
                                            {w.stockType}
                                        </span>
                                    </TableCell>
                                    <TableCell className="font-mono text-sm text-slate-500 dark:text-slate-400 py-3.5">
                                        {getOrderLabel(w.order)}
                                    </TableCell>
                                    <TableCell className="text-sm py-3.5 text-slate-600 dark:text-slate-300">{getWorkerName(w.withdrawnBy)}</TableCell>
                                    {isManager && (
                                        <TableCell className="py-3.5 pr-4">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem
                                                        className="text-red-500 focus:text-red-500"
                                                        onClick={() => setDeleteTarget(w)}
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        ลบรายการ
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                </div>
            </div>

            {/* Pagination */}
            {!isLoading && totalPages > 1 && (
                <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between -mt-6 bg-white dark:bg-slate-900 rounded-b-xl">
                    <span className="text-xs text-slate-400">
                        {currentPage} / {totalPages}
                    </span>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        {[...Array(totalPages)].map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrentPage(i + 1)}
                                className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-medium transition-colors ${currentPage === i + 1
                                    ? "bg-blue-600 text-white"
                                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                    }`}
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

            {/* Create Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-md rounded-xl p-6">
                    <DialogHeader className="mb-2">
                        <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">เบิกวัสดุใหม่</DialogTitle>
                        <DialogDescription className="text-sm text-slate-500">บันทึกการเบิกวัสดุออกจากคลัง ระบบจะหักสต็อกอัตโนมัติ</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Order <span className="text-red-400">*</span></Label>
                            <Select value={form.order} onValueChange={(v) => setForm((f) => ({ ...f, order: v ?? "" }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="เลือก Order...">
                                        {(value: string | null) => {
                                            if (!value) return <span className="text-muted-foreground">เลือก Order...</span>;
                                            const o = orders.find(x => x._id === value);
                                            if (!o) return value;
                                            return `${o.orderNumber ?? `#${o._id.slice(-6)}`} — ${o.customer && typeof o.customer === "object" ? o.customer.name : "-"}`;
                                        }}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="!w-fit">
                                    {orders.filter((o) => o.status !== "cancelled").map((o) => (
                                        <SelectItem key={o._id} value={o._id}>
                                            {o.orderNumber ?? `#${o._id.slice(-6)}`} — {o.customer && typeof o.customer === "object" ? o.customer.name : o.customer?.slice(-6) ?? "-"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">ประเภทสต็อก</Label>
                                <Select value={form.stockType} onValueChange={(v) => setForm((f) => ({ ...f, stockType: v as "Raw" | "Reuse" }))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Raw">Raw (กระจกดิบ)</SelectItem>
                                        <SelectItem value="Reuse">Reuse (นำกลับ)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">วัสดุ <span className="text-red-400">*</span></Label>
                                <Select value={form.material} onValueChange={(v) => setForm((f) => ({ ...f, material: v ?? "" }))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="เลือกวัสดุ...">
                                            {(value: string | null) => {
                                                if (!value) return <span className="text-muted-foreground">เลือกวัสดุ...</span>;
                                                const m = materials.find(x => x._id === value);
                                                if (!m) return value;
                                                const stock = getStockForMaterial(m._id, form.stockType);
                                                return `${m.name} (${stock})`;
                                            }}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent className="!w-fit">
                                        {materials.map((m) => {
                                            const stock = getStockForMaterial(m._id, form.stockType);
                                            return (
                                                <SelectItem key={m._id} value={m._id}>
                                                    <span className="flex items-center justify-between gap-3 w-full">
                                                        <span>{m.name}</span>
                                                        <span className={`text-xs font-semibold ${stock <= 0 ? "text-red-500" : stock <= (m.reorderPoint || 10) ? "text-amber-500" : "text-emerald-500"}`}>
                                                            คงเหลือ: {stock}
                                                        </span>
                                                    </span>
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">จำนวน <span className="text-red-400">*</span></Label>
                                <Input
                                    type="number"
                                    min={1}
                                    placeholder="0"
                                    value={form.quantity}
                                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">วันที่เบิก</Label>
                            <Input
                                type="date"
                                value={form.withdrawnDate}
                                onChange={(e) => setForm((f) => ({ ...f, withdrawnDate: e.target.value }))}
                            />
                        </div>
                    </div>
                    <DialogFooter className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <Button variant="ghost" className="rounded-xl h-10 text-sm" onClick={() => setIsCreateOpen(false)} disabled={isSubmitting}>ยกเลิก</Button>
                        <Button className="rounded-xl h-10 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium" onClick={handleCreate} disabled={isSubmitting}>
                            {isSubmitting ? "กำลังบันทึก..." : "บันทึกการเบิก"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirm Dialog */}
            <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
                <DialogContent className="sm:max-w-[360px] rounded-xl p-6">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="h-9 w-9 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center shrink-0">
                                <Trash2 className="h-4 w-4 text-red-500" />
                            </div>
                            <DialogTitle className="text-base font-semibold text-slate-900 dark:text-white">ยืนยันการลบ</DialogTitle>
                        </div>
                        <DialogDescription className="text-sm text-slate-500">
                            ลบรายการเบิกวัสดุนี้? การกระทำนี้ไม่สามารถย้อนกลับได้
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex gap-2.5 mt-4">
                        <Button variant="outline" className="flex-1 rounded-xl h-10 text-sm" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>ยกเลิก</Button>
                        <Button className="flex-1 rounded-xl h-10 text-sm bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete} disabled={isDeleting}>
                            {isDeleting ? "กำลังลบ..." : "ลบรายการ"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
