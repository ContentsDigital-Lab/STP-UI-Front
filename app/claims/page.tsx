"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    Plus, Search, Trash2, ShieldAlert,
    ChevronLeft, ChevronRight, MoreHorizontal, ClipboardCheck,
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
        if (typeof o === "object") return `#${o._id.slice(-6)}`;
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
        if (!decision) return <Badge variant="outline" className="text-muted-foreground">รอตัดสิน</Badge>;
        if (decision === "destroy") return <Badge variant="destructive">ทำลาย</Badge>;
        return <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">เก็บไว้</Badge>;
    };

    const sourceBadge = (source: "customer" | "worker") => (
        <Badge variant={source === "customer" ? "default" : "outline"}>
            {source === "customer" ? "ลูกค้า" : "พนักงาน"}
        </Badge>
    );

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <ShieldAlert className="h-6 w-6 text-primary" />
                        รายการเคลม
                    </h1>
                    <p className="text-sm text-muted-foreground">บันทึกและติดตามการเคลมวัสดุแบบเรียลไทม์</p>
                </div>
                <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    เพิ่มรายการเคลม
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                    { label: "รายการทั้งหมด", value: claims.length },
                    { label: "รอตัดสิน", value: claims.filter((c) => !c.decision).length },
                    { label: "ทำลาย", value: claims.filter((c) => c.decision === "destroy").length },
                    { label: "เก็บไว้", value: claims.filter((c) => c.decision === "keep").length },
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
                        placeholder="ค้นหาตามวัสดุหรือคำอธิบาย..."
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v ?? "all")}>
                    <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="แหล่งที่มา" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">ทุกแหล่ง</SelectItem>
                        <SelectItem value="customer">ลูกค้า</SelectItem>
                        <SelectItem value="worker">พนักงาน</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={decisionFilter} onValueChange={(v) => setDecisionFilter(v ?? "all")}>
                    <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="ผลการตัดสิน" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">ทุกสถานะ</SelectItem>
                        <SelectItem value="pending">รอตัดสิน</SelectItem>
                        <SelectItem value="destroy">ทำลาย</SelectItem>
                        <SelectItem value="keep">เก็บไว้</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <div className="rounded-lg border bg-card overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>วันที่เคลม</TableHead>
                            <TableHead>Order</TableHead>
                            <TableHead>วัสดุ</TableHead>
                            <TableHead>แหล่งที่มา</TableHead>
                            <TableHead>รายละเอียด</TableHead>
                            <TableHead>ผลการตัดสิน</TableHead>
                            <TableHead>รายงานโดย</TableHead>
                            <TableHead>อนุมัติโดย</TableHead>
                            <TableHead className="w-12" />
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
                                <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                                    <ClipboardCheck className="mx-auto mb-2 h-8 w-8 opacity-40" />
                                    ไม่มีข้อมูลการเคลม
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginated.map((c) => (
                                <TableRow key={c._id}>
                                    <TableCell className="text-sm">
                                        {new Date(c.claimDate ?? c.createdAt).toLocaleDateString("th-TH")}
                                    </TableCell>
                                    <TableCell className="font-mono text-sm text-muted-foreground">
                                        {getOrderLabel(c.order)}
                                    </TableCell>
                                    <TableCell className="font-medium">{getMaterialName(c.material)}</TableCell>
                                    <TableCell>{sourceBadge(c.source)}</TableCell>
                                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground" title={c.description}>
                                        {c.description}
                                    </TableCell>
                                    <TableCell>{decisionBadge(c.decision)}</TableCell>
                                    <TableCell>{getWorkerName(c.reportedBy)}</TableCell>
                                    <TableCell>{c.approvedBy ? getWorkerName(c.approvedBy) : <span className="text-muted-foreground text-xs">-</span>}</TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors">
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
                                                    <DropdownMenuItem disabled className="text-muted-foreground text-xs">
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
            {!isLoading && filtered.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
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
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>เพิ่มรายการเคลมใหม่</DialogTitle>
                        <DialogDescription>บันทึกการเคลมวัสดุที่เกี่ยวข้องกับ Order</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label>Order <span className="text-red-500">*</span></Label>
                                <Select value={createForm.order} onValueChange={(v) => setCreateForm((f) => ({ ...f, order: v ?? "" }))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="เลือก Order..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {orders.filter((o) => o.status !== "cancelled").map((o) => (
                                            <SelectItem key={o._id} value={o._id}>
                                                #{o._id.slice(-6)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>วัสดุ <span className="text-red-500">*</span></Label>
                                <Select value={createForm.material} onValueChange={(v) => setCreateForm((f) => ({ ...f, material: v ?? "" }))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="เลือกวัสดุ..." />
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
                                <Label>แหล่งที่มา <span className="text-red-500">*</span></Label>
                                <Select value={createForm.source} onValueChange={(v) => setCreateForm((f) => ({ ...f, source: v as "customer" | "worker" }))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="customer">ลูกค้า (Customer)</SelectItem>
                                        <SelectItem value="worker">พนักงาน (Worker)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>วันที่เคลม</Label>
                                <Input
                                    type="date"
                                    value={createForm.claimDate}
                                    onChange={(e) => setCreateForm((f) => ({ ...f, claimDate: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>รายงานโดย <span className="text-red-500">*</span></Label>
                            <Select value={createForm.reportedBy} onValueChange={(v) => setCreateForm((f) => ({ ...f, reportedBy: v ?? "" }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="เลือกผู้รายงาน..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from(workerMap.values()).map((w) => (
                                        <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>รายละเอียด <span className="text-red-500">*</span></Label>
                            <Textarea
                                placeholder="อธิบายปัญหาหรือเหตุผลในการเคลม..."
                                rows={3}
                                value={createForm.description}
                                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)} disabled={isSubmitting}>ยกเลิก</Button>
                        <Button onClick={handleCreate} disabled={isSubmitting}>
                            {isSubmitting ? "กำลังบันทึก..." : "บันทึกการเคลม"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Decision Dialog */}
            <Dialog open={!!decisionTarget} onOpenChange={() => setDecisionTarget(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>ตัดสินผลการเคลม</DialogTitle>
                        <DialogDescription>
                            กำหนดผลการตัดสินสำหรับรายการเคลมนี้
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>ผลการตัดสิน <span className="text-red-500">*</span></Label>
                            <Select value={decisionForm.decision} onValueChange={(v) => setDecisionForm((f) => ({ ...f, decision: (v ?? "") as "destroy" | "keep" | "" }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="เลือกผลการตัดสิน..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="destroy">ทำลาย (Destroy)</SelectItem>
                                    <SelectItem value="keep">เก็บไว้ (Keep)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>อนุมัติโดย</Label>
                            <Select value={decisionForm.approvedBy} onValueChange={(v) => setDecisionForm((f) => ({ ...f, approvedBy: v ?? "" }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="เลือกผู้อนุมัติ..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from(workerMap.values()).filter((w) => w.role === "admin" || w.role === "manager").map((w) => (
                                        <SelectItem key={w._id} value={w._id}>{w.name} ({w.role})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDecisionTarget(null)} disabled={isUpdating}>ยกเลิก</Button>
                        <Button onClick={handleUpdateDecision} disabled={isUpdating}>
                            {isUpdating ? "กำลังบันทึก..." : "บันทึกผลการตัดสิน"}
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
                            ลบรายการเคลมนี้? การกระทำนี้ไม่สามารถย้อนกลับได้
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
