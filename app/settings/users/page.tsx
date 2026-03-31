"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { getRoleName, getRoleSlug, isAdmin, isManagerOrAbove } from "@/lib/auth/role-utils";
import { workersApi } from "@/lib/api/workers";
import { ordersApi } from "@/lib/api/orders";
import { claimsApi } from "@/lib/api/claims";
import { withdrawalsApi } from "@/lib/api/withdrawals";
import { rolesApi } from "@/lib/api/roles";
import { Worker, Order, Claim, Withdrawal, Role } from "@/lib/api/types";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Loader2, Search, Plus, AlertTriangle, ArrowLeft } from "lucide-react";

export default function UsersManagementPage() {
    const { user, isLoading: isAuthLoading } = useAuth();
    const router = useRouter();

    const [workers, setWorkers] = useState<Worker[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");

    // Edit modal state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
    const [editRole, setEditRole] = useState<"admin" | "manager" | "worker">("worker");
    const [isSaving, setIsSaving] = useState(false);

    // Delete modal state
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deletingWorker, setDeletingWorker] = useState<Worker | null>(null);
    const [deleteError, setDeleteError] = useState("");
    const [linkedOrders, setLinkedOrders] = useState<Order[]>([]);
    const [linkedClaims, setLinkedClaims] = useState<Claim[]>([]);
    const [linkedWithdrawals, setLinkedWithdrawals] = useState<Withdrawal[]>([]);

    // Roles
    const [roles, setRoles] = useState<Role[]>([]);

    // Create modal state
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState("");
    const [createForm, setCreateForm] = useState({
        name: "",
        username: "",
        password: "",
        position: "",
        role: "worker",
    });

    useEffect(() => {
        if (!isAuthLoading) {
            if (!isManagerOrAbove(user?.role)) {
                router.push("/settings");
            } else {
                fetchWorkers();
            }
        }
    }, [isAuthLoading, user, router]);

    const fetchWorkers = async () => {
        setIsLoading(true);
        try {
            const [workersRes, rolesRes] = await Promise.all([
                workersApi.getAll(),
                rolesApi.getAll({ limit: 100 }),
            ]);
            if (workersRes.success && workersRes.data) setWorkers(workersRes.data);
            if (rolesRes.success && rolesRes.data) setRoles(rolesRes.data);
        } catch (error) {
            console.error("Failed to fetch workers:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const roleBySlug = (slug: string) => roles.find(r => r.slug === slug);

    const handleEditClick = (worker: Worker) => {
        setSelectedWorker(worker);
        const slug = getRoleSlug(worker.role);
        setEditRole(
            slug === "admin" || slug === "manager" || slug === "worker" ? slug : "worker",
        );
        setIsEditModalOpen(true);
    };

    const handleSaveRole = async () => {
        if (!selectedWorker) return;
        setIsSaving(true);
        try {
            const targetRole = roleBySlug(editRole);
            const rolePayload = targetRole ? targetRole._id : editRole;
            const response = await workersApi.update(selectedWorker._id, { role: rolePayload });
            if (response.success) {
                const updatedRole = targetRole ?? editRole;
                setWorkers((prev) =>
                    prev.map((w) => (w._id === selectedWorker._id ? { ...w, role: updatedRole as Role | string } : w))
                );
                setIsEditModalOpen(false);
            }
        } catch (error) {
            console.error("Failed to update worker role:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateUser = async () => {
        if (!createForm.name || !createForm.username || !createForm.password || !createForm.position) return;
        setIsCreating(true);
        setCreateError("");
        try {
            const targetRole = roleBySlug(createForm.role);
            const payload = { ...createForm, role: targetRole ? targetRole._id : createForm.role };
            const response = await workersApi.create(payload);
            if (response.success && response.data) {
                setWorkers([response.data, ...workers]);
                setIsCreateModalOpen(false);
                setCreateForm({ name: "", username: "", password: "", position: "", role: "worker" });
            }
        } catch (error: unknown) {
            setCreateError(error instanceof Error ? error.message : "Failed to create user");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteClick = (worker: Worker) => {
        setDeletingWorker(worker);
        setDeleteError("");
        setLinkedOrders([]);
        setLinkedClaims([]);
        setLinkedWithdrawals([]);
        setIsDeleteOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!deletingWorker) return;
        setIsDeleting(true);
        setDeleteError("");
        setLinkedOrders([]);
        setLinkedClaims([]);
        setLinkedWithdrawals([]);
        try {
            const response = await workersApi.delete(deletingWorker._id);
            if (response.success) {
                setWorkers(workers.filter(w => w._id !== deletingWorker._id));
                setIsDeleteOpen(false);
                setDeletingWorker(null);
            }
        } catch (error: any) {
            const msg = error.message || "Failed to delete user";
            setDeleteError(msg);

            if (msg.toLowerCase().includes("referenced by")) {
                const workerId = deletingWorker._id;
                const fetches: Promise<void>[] = [];

                fetches.push(
                    ordersApi.getAll().then((ordersRes) => {
                        if (ordersRes.success && ordersRes.data) {
                            const matched = ordersRes.data.filter((o) => {
                                const assignee = typeof o.assignedTo === "object" ? o.assignedTo?._id : o.assignedTo;
                                const historyMatch = o.stationHistory?.some((h) => h.completedBy === workerId);
                                return assignee === workerId || historyMatch;
                            });
                            setLinkedOrders(matched);
                        }
                    }).catch(() => {})
                );

                fetches.push(
                    claimsApi.getAll().then((claimsRes) => {
                        if (claimsRes.success && claimsRes.data) {
                            const matched = claimsRes.data.filter((c) => {
                                const reporter = typeof c.reportedBy === "object" ? c.reportedBy?._id : c.reportedBy;
                                const approver = typeof c.approvedBy === "object" ? c.approvedBy?._id : c.approvedBy;
                                return reporter === workerId || approver === workerId;
                            });
                            setLinkedClaims(matched);
                        }
                    }).catch(() => {})
                );

                fetches.push(
                    withdrawalsApi.getAll().then((withdrawalsRes) => {
                        if (withdrawalsRes.success && withdrawalsRes.data) {
                            const matched = withdrawalsRes.data.filter((w) => {
                                const withdrawnBy = typeof w.withdrawnBy === "object" ? w.withdrawnBy?._id : w.withdrawnBy;
                                return withdrawnBy === workerId;
                            });
                            setLinkedWithdrawals(matched);
                        }
                    }).catch(() => {})
                );

                await Promise.allSettled(fetches);
            }
        } finally {
            setIsDeleting(false);
        }
    };

    const isSelf = (workerId: string) => user?._id === workerId;

    const filteredWorkers = workers.filter((worker) => {
        const matchesSearch =
            worker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            worker.username.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole = roleFilter === "all" || getRoleSlug(worker.role) === roleFilter;
        return matchesSearch && matchesRole;
    });

    if (isAuthLoading || isLoading) {
        return (
            <div className="flex h-[60vh] w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!isManagerOrAbove(user?.role)) {
        return null; // the useEffect will redirect them
    }

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case "admin": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-200";
            case "manager": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200";
            default: return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300";
        }
    };

    return (
        <div className="space-y-6 max-w-[1440px] mx-auto w-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={() => router.back()}
                        className="h-9 w-9 rounded-full flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                    </button>
                    <div className="space-y-0.5 min-w-0">
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white truncate">จัดการผู้ใช้</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">จัดการบัญชีผู้ใช้และสิทธิ์การเข้าถึง</p>
                    </div>
                </div>
                <Button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white font-bold rounded-xl h-10 px-5 text-sm shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0 w-full sm:w-auto shrink-0"
                >
                    <Plus className="h-4 w-4" />
                    เพิ่มผู้ใช้ใหม่
                </Button>
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
                                placeholder="ค้นหาด้วยชื่อหรือ username..."
                                className="pl-9 h-10 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-sm"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5 sm:w-44 shrink-0">
                        <Label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">บทบาท</Label>
                        <Select value={roleFilter === "all" ? "" : roleFilter} onValueChange={(val) => setRoleFilter(val || "all")}>
                            <SelectTrigger className="h-10 w-full rounded-xl text-sm border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                <SelectValue placeholder="ทุกบทบาท" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
                                <SelectItem value="all">ทุกบทบาท</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="worker">Worker</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="border-slate-100 dark:border-slate-800 hover:bg-transparent">
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 px-4 h-10">ชื่อ</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">Username</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">ตำแหน่ง</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">บทบาท</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10 text-right pr-4">จัดการ</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredWorkers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="py-16 text-center border-none">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                            <Search className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                                        </div>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">ไม่พบผู้ใช้</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredWorkers.map((worker) => (
                                <TableRow key={worker._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 border-slate-100 dark:border-slate-800">
                                    <TableCell className="font-medium text-sm text-slate-900 dark:text-white py-3.5 px-4">{worker.name}</TableCell>
                                    <TableCell className="text-sm text-slate-500 dark:text-slate-400 py-3.5">{worker.username}</TableCell>
                                    <TableCell className="text-sm text-slate-600 dark:text-slate-300 py-3.5">{worker.position}</TableCell>
                                    <TableCell className="py-3.5">
                                        <Badge variant="outline" className={`text-xs font-medium px-2 py-0.5 rounded-md border-0 ${getRoleBadgeColor(getRoleSlug(worker.role))}`}>
                                            {getRoleName(worker.role)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right py-3.5 pr-4">
                                        <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="rounded-lg h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                    onClick={() => handleEditClick(worker)}
                                                    disabled={isSelf(worker._id) || (!isAdmin(user?.role) && getRoleSlug(worker.role) === "admin")}
                                                    title={isSelf(worker._id) ? "ไม่สามารถแก้ไขตัวเองได้" : !isAdmin(user?.role) && getRoleSlug(worker.role) === "admin" ? "ไม่สามารถแก้ไข Admin ได้" : "แก้ไขบทบาท"}
                                                >
                                                <Edit className="h-4 w-4 text-slate-500" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="rounded-lg h-8 w-8 p-0 hover:bg-red-50 dark:hover:bg-red-950"
                                                onClick={() => handleDeleteClick(worker)}
                                                disabled={isSelf(worker._id) || (!isAdmin(user?.role) && getRoleSlug(worker.role) === "admin")}
                                                title={isSelf(worker._id) ? "ไม่สามารถลบตัวเองได้" : "ลบผู้ใช้"}
                                            >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                </div>
            </div>

            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                <DialogContent className="sm:max-w-[425px] rounded-2xl border-slate-200 dark:border-slate-800 p-0 bg-white dark:bg-slate-950">
                    <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-semibold text-slate-900 dark:text-white">แก้ไขบทบาท</DialogTitle>
                            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                เปลี่ยนสิทธิ์การเข้าถึงสำหรับ {selectedWorker?.name}
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="px-6 py-5 space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">บทบาท</Label>
                            <Select
                                value={editRole}
                                onValueChange={(val) => {
                                    if (val) setEditRole(val as "admin" | "manager" | "worker");
                                }}
                            >
                                <SelectTrigger className="h-10 rounded-xl text-sm border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                    <SelectValue placeholder="เลือกบทบาท" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
                                    {isAdmin(user?.role) && <SelectItem value="admin">Admin</SelectItem>}
                                    <SelectItem value="manager">Manager</SelectItem>
                                    <SelectItem value="worker">Worker</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-400 mt-2">
                                {editRole === "admin" && "มีสิทธิ์เข้าถึงทุกส่วนของระบบ"}
                                {editRole === "manager" && "ดูข้อมูลและจัดการพนักงานได้ แต่ไม่สามารถจัดการ Admin"}
                                {editRole === "worker" && "เข้าถึงเครื่องมือปฏิบัติงานมาตรฐาน"}
                            </p>
                        </div>
                    </div>
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                        <Button variant="ghost" className="rounded-xl h-10 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white px-4" onClick={() => setIsEditModalOpen(false)}>
                            ยกเลิก
                        </Button>
                        <Button
                            onClick={handleSaveRole}
                            disabled={isSaving || (!isAdmin(user?.role) && editRole === "admin")}
                            className="rounded-xl h-10 min-w-[120px] bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white text-sm font-bold shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0"
                        >
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            บันทึก
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isCreateModalOpen} onOpenChange={(open) => { setIsCreateModalOpen(open); if (!open) setCreateError(""); }}>
                <DialogContent className="sm:max-w-[520px] rounded-2xl border-slate-200 dark:border-slate-800 p-0 bg-white dark:bg-slate-950 max-h-[90vh] overflow-y-auto">
                    <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-semibold text-slate-900 dark:text-white">เพิ่มผู้ใช้ใหม่</DialogTitle>
                            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                สร้างบัญชีผู้ใช้ใหม่สำหรับระบบ
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="px-6 py-5 space-y-5">
                        <div className="space-y-1.5">
                            <Label htmlFor="create-name" className="text-sm font-medium text-slate-700 dark:text-slate-300">ชื่อ-นามสกุล <span className="text-red-400">*</span></Label>
                            <Input
                                id="create-name"
                                placeholder="เช่น สมชาย ใจดี"
                                className="h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                                value={createForm.name}
                                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="create-username" className="text-sm font-medium text-slate-700 dark:text-slate-300">Username <span className="text-red-400">*</span></Label>
                                <Input
                                    id="create-username"
                                    placeholder="เช่น somchai"
                                    className="h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                                    value={createForm.username}
                                    onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="create-password" className="text-sm font-medium text-slate-700 dark:text-slate-300">รหัสผ่าน <span className="text-red-400">*</span></Label>
                                <Input
                                    id="create-password"
                                    type="password"
                                    placeholder="อย่างน้อย 6 ตัวอักษร"
                                    minLength={6}
                                    className="h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                                    value={createForm.password}
                                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                                />
                                {createForm.password.length > 0 && createForm.password.length < 6 && (
                                    <p className="text-xs text-amber-500">
                                        ต้องการอีก {6 - createForm.password.length} ตัวอักษร
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="create-position" className="text-sm font-medium text-slate-700 dark:text-slate-300">ตำแหน่ง <span className="text-red-400">*</span></Label>
                                <Input
                                    id="create-position"
                                    placeholder="เช่น Operator"
                                    className="h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                                    value={createForm.position}
                                    onChange={(e) => setCreateForm({ ...createForm, position: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="create-role" className="text-sm font-medium text-slate-700 dark:text-slate-300">บทบาท</Label>
                                <Select
                                    value={createForm.role}
                                    onValueChange={(val) => {
                                        if (val) setCreateForm({ ...createForm, role: val as "admin" | "manager" | "worker" });
                                    }}
                                >
                                    <SelectTrigger className="h-10 rounded-xl text-sm border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                        <SelectValue placeholder="เลือกบทบาท" />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
                                        {isAdmin(user?.role) && <SelectItem value="admin">Admin</SelectItem>}
                                        <SelectItem value="manager">Manager</SelectItem>
                                        <SelectItem value="worker">Worker</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {createError && (
                            <div className="text-sm font-medium text-red-500 bg-red-50 dark:bg-red-500/10 p-3 rounded-xl">
                                {createError}
                            </div>
                        )}
                    </div>
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                        <Button variant="ghost" className="rounded-xl h-10 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white px-4" onClick={() => setIsCreateModalOpen(false)} disabled={isCreating}>
                            ยกเลิก
                        </Button>
                        <Button
                            onClick={handleCreateUser}
                            disabled={isCreating || !createForm.name || !createForm.username || createForm.password.length < 6 || !createForm.position}
                            className="rounded-xl h-10 min-w-[140px] bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white text-sm font-bold shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0"
                        >
                            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            สร้างผู้ใช้
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteOpen} onOpenChange={(open) => { setIsDeleteOpen(open); if (!open) { setDeleteError(""); setLinkedOrders([]); setLinkedClaims([]); setLinkedWithdrawals([]); } }}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="h-5 w-5" />
                            Delete User
                        </DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. This will permanently delete the user account.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-3">
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/50">
                            <p className="text-sm text-red-800 dark:text-red-300">
                                You are about to delete <span className="font-semibold">{deletingWorker?.name}</span> ({deletingWorker?.username}).
                            </p>
                        </div>
                        {deleteError && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
                                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                                    {deleteError}
                                </p>
                                {linkedOrders.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Linked orders:</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {linkedOrders.map((o) => (
                                                <span
                                                    key={o._id}
                                                    className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200"
                                                >
                                                    {o.orderNumber || o._id}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {linkedClaims.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Linked claims:</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {linkedClaims.map((c) => (
                                                <span
                                                    key={c._id}
                                                    className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200"
                                                >
                                                    {c.claimNumber || c._id.slice(-8)}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {linkedWithdrawals.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Linked withdrawals:</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {linkedWithdrawals.map((w) => {
                                                const orderRef = typeof w.order === "object" ? w.order?.orderNumber : null;
                                                return (
                                                    <span
                                                        key={w._id}
                                                        className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200"
                                                    >
                                                        {orderRef ? `Order ${orderRef}` : w._id.slice(-8)}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                                    Please reassign or remove the linked record(s) before deleting this user.
                                </p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsDeleteOpen(false)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        {!deleteError && (
                            <Button
                                onClick={handleConfirmDelete}
                                disabled={isDeleting}
                                className="bg-red-600 hover:bg-red-700 text-white"
                            >
                                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Delete
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
