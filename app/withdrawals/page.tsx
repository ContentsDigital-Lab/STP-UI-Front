"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    Plus, Search, Trash2, ArrowDownFromLine,
    ChevronLeft, ChevronRight, Package, MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
        <div className="space-y-4 sm:space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                        <ArrowDownFromLine className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                        เบิกวัสดุ
                    </h1>
                    <p className="text-sm text-muted-foreground">บันทึกและติดตามการเบิกวัสดุแบบเรียลไทม์</p>
                </div>
                <Button onClick={() => setIsCreateOpen(true)} className="gap-2 w-full sm:w-auto">
                    <Plus className="h-4 w-4" />
                    เบิกวัสดุใหม่
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                    { label: "รายการทั้งหมด", value: withdrawals.length },
                    { label: "กระจกดิบ (Raw)", value: withdrawals.filter((w) => w.stockType === "Raw").length },
                    { label: "กระจกนำกลับ (Reuse)", value: withdrawals.filter((w) => w.stockType === "Reuse").length },
                    { label: "วันนี้", value: withdrawals.filter((w) => new Date(w.createdAt).toDateString() === new Date().toDateString()).length },
                ].map((stat) => (
                    <div key={stat.label} className="rounded-lg border bg-card p-4">
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                        <p className="mt-1 text-2xl font-bold">{isLoading ? "-" : stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="ค้นหาตามชื่อวัสดุ..."
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Select value={stockTypeFilter} onValueChange={(v) => setStockTypeFilter(v ?? "all")}>
                    <SelectTrigger className="w-[180px]">
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
            <div className="rounded-lg border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>วันที่เบิก</TableHead>
                            <TableHead>วัสดุ</TableHead>
                            <TableHead>จำนวน</TableHead>
                            <TableHead>ประเภท</TableHead>
                            <TableHead>Order</TableHead>
                            <TableHead>เบิกโดย</TableHead>
                            {isManager && <TableHead className="w-12" />}
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
                                <TableCell colSpan={isManager ? 7 : 6} className="py-12 text-center text-muted-foreground">
                                    <Package className="mx-auto mb-2 h-8 w-8 opacity-40" />
                                    ไม่มีข้อมูลการเบิกวัสดุ
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginated.map((w) => (
                                <TableRow key={w._id}>
                                    <TableCell className="text-sm">
                                        {new Date(w.withdrawnDate ?? w.createdAt).toLocaleDateString("th-TH")}
                                    </TableCell>
                                    <TableCell className="font-medium">{getMaterialName(w.material)}</TableCell>
                                    <TableCell>{w.quantity}</TableCell>
                                    <TableCell>
                                        <Badge variant={w.stockType === "Raw" ? "default" : "secondary"}>
                                            {w.stockType}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-mono text-sm text-muted-foreground">
                                        {getOrderLabel(w.order)}
                                    </TableCell>
                                    <TableCell>{getWorkerName(w.withdrawnBy)}</TableCell>
                                    {isManager && (
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors">
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
            {!isLoading && filtered.length > ITEMS_PER_PAGE && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
                    <span>แสดง {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} จาก {filtered.length} รายการ</span>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="font-medium text-foreground">{currentPage} / {totalPages}</span>
                        <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Create Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>เบิกวัสดุใหม่</DialogTitle>
                        <DialogDescription>บันทึกการเบิกวัสดุออกจากคลัง ระบบจะหักสต็อกอัตโนมัติ</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Order <span className="text-red-500">*</span></Label>
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
                        <div className="space-y-1.5">
                            <Label>วัสดุ <span className="text-red-500">*</span></Label>
                            <Select value={form.material} onValueChange={(v) => setForm((f) => ({ ...f, material: v ?? "" }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="เลือกวัสดุ...">
                                        {(value: string | null) => {
                                            if (!value) return <span className="text-muted-foreground">เลือกวัสดุ...</span>;
                                            const m = materials.find(x => x._id === value);
                                            if (!m) return value;
                                            const stock = getStockForMaterial(m._id, form.stockType);
                                            return `${m.name} (คงเหลือ: ${stock})`;
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
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label>จำนวน <span className="text-red-500">*</span></Label>
                                <Input
                                    type="number"
                                    min={1}
                                    placeholder="0"
                                    value={form.quantity}
                                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>ประเภทสต็อก</Label>
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
                        </div>
                        <div className="space-y-1.5">
                            <Label>วันที่เบิก</Label>
                            <Input
                                type="date"
                                value={form.withdrawnDate}
                                onChange={(e) => setForm((f) => ({ ...f, withdrawnDate: e.target.value }))}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)} disabled={isSubmitting}>ยกเลิก</Button>
                        <Button onClick={handleCreate} disabled={isSubmitting}>
                            {isSubmitting ? "กำลังบันทึก..." : "บันทึกการเบิก"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirm Dialog */}
            <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>ยืนยันการลบ</DialogTitle>
                        <DialogDescription>
                            ลบรายการเบิกวัสดุนี้? การกระทำนี้ไม่สามารถย้อนกลับได้
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>ยกเลิก</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                            {isDeleting ? "กำลังลบ..." : "ลบรายการ"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
