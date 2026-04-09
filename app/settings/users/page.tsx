"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { getRoleName, getRoleSlug, isAdmin, isManagerOrAbove } from "@/lib/auth/role-utils";
import { workersApi } from "@/lib/api/workers";
import { ordersApi } from "@/lib/api/orders";
import { claimsApi } from "@/lib/api/claims";
import { withdrawalsApi } from "@/lib/api/withdrawals";
import { Worker, Order, Claim, Withdrawal, Role } from "@/lib/api/types";
import { Permission, PERMISSION_LABELS } from "@/lib/auth/permissions";
import { rolesApi } from "@/lib/api/roles";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Edit, Trash2, Loader2, Search, Plus, AlertTriangle, ArrowLeft, ShieldAlert } from "lucide-react";

export default function UsersManagementPage() {
    const { user, isLoading: isAuthLoading } = useAuth();
    const router = useRouter();

    const [workers, setWorkers] = useState<Worker[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [activeTab, setActiveTab] = useState("users");
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");

    // Modal & Loading state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
    const [editRole, setEditRole] = useState<"admin" | "manager" | "worker">("worker");
    const [isSaving, setIsSaving] = useState(false);
    const [editRoleError, setEditRoleError] = useState("");

    // Delete modal state
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deletingWorker, setDeletingWorker] = useState<Worker | null>(null);
    const [deleteError, setDeleteError] = useState("");
    const [linkedOrders, setLinkedOrders] = useState<Order[]>([]);
    const [linkedClaims, setLinkedClaims] = useState<Claim[]>([]);
    const [linkedWithdrawals, setLinkedWithdrawals] = useState<Withdrawal[]>([]);
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

    // Role Management state
    const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Partial<Role> | null>(null);

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
        setEditRoleError("");
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
                toast.success(`บันทึกบทบาทของ ${selectedWorker.name} เรียบร้อย`);
            }
        } catch (error) {
            console.error("Failed to update worker role:", error);
            setEditRoleError(getApiErrorMessage(error, "ไม่สามารถบันทึกบทบาทได้"));
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
                toast.success(`สร้างบัญชี "${response.data.name}" เรียบร้อย`);
            }
        } catch (error: unknown) {
            setCreateError(getApiErrorMessage(error, "ไม่สามารถสร้างบัญชีได้"));
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
        try {
            const response = await workersApi.delete(deletingWorker._id);
            if (response.success) {
                const removedName = deletingWorker.name;
                setWorkers(workers.filter(w => w._id !== deletingWorker._id));
                setIsDeleteOpen(false);
                setDeletingWorker(null);
                toast.success(`ลบผู้ใช้ "${removedName}" เรียบร้อย`);
            }
        } catch (error: unknown) {
            setDeleteError(getApiErrorMessage(error, "ไม่สามารถลบผู้ใช้ได้"));
        } finally {
            setIsDeleting(false);
        }
    };

    // --- Role Actions ---
    const handleEditRole = (role: Role) => {
        setEditingRole(role);
        setIsRoleModalOpen(true);
    };

    const handleCreateRole = () => {
        setEditingRole({ name: "", description: "", permissions: [] });
        setIsRoleModalOpen(true);
    };

    const handleTogglePermission = (permission: Permission) => {
        if (!editingRole) return;
        const currentPerms = editingRole.permissions || [];
        const newPerms = currentPerms.includes(permission)
            ? currentPerms.filter(p => p !== permission)
            : [...currentPerms, permission];
        setEditingRole({ ...editingRole, permissions: newPerms });
    };

    const handleSaveRoleData = async () => {
        if (!editingRole?.name) return;
        setIsSaving(true);
        try {
            if (editingRole._id) {
                await rolesApi.update(editingRole._id, editingRole as any);
                toast.success(`บันทึกบทบาท "${editingRole.name}" เรียบร้อย`);
            } else {
                await rolesApi.create(editingRole as any);
                toast.success(`สร้างบทบาท "${editingRole.name}" เรียบร้อย`);
            }
            fetchWorkers(); // Refresh both workers and roles
            setIsRoleModalOpen(false);
        } catch (error) {
            console.error("Failed to save role:", error);
            toast.error(getApiErrorMessage(error, "ไม่สามารถบันทึกบทบาทได้"));
        } finally {
            setIsSaving(false);
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

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case "admin": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-200";
            case "manager": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200";
            default: return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300";
        }
    };

    const permissionGroups = Object.entries(PERMISSION_LABELS).reduce((acc, [key, value]) => {
        if (!acc[value.group]) acc[value.group] = [];
        acc[value.group].push({ key: key as Permission, ...value });
        return acc;
    }, {} as Record<string, any[]>);

    if (isAuthLoading || isLoading) {
        return (
            <div className="flex h-[60vh] w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

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
                {activeTab === "users" ? (
                    <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl h-10 px-5 text-sm shadow-lg border-0">
                        <Plus className="h-4 w-4" /> เพิ่มผู้ใช้ใหม่
                    </Button>
                ) : (
                    <Button onClick={handleCreateRole} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl h-10 px-5 text-sm shadow-lg border-0">
                        <Plus className="h-4 w-4" /> สร้างบทบาทใหม่
                    </Button>
                )}
            </div>
            
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-slate-100/50 dark:bg-slate-800/10 p-1 rounded-xl mb-4">
                    <TabsTrigger value="users" className="rounded-lg px-6 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 shadow-sm">พนักงาน</TabsTrigger>
                    <TabsTrigger value="roles" className="rounded-lg px-6 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 shadow-sm">บทบาทและสิทธิ์</TabsTrigger>
                </TabsList>

                <TabsContent value="users" className="space-y-6">
                    {/* Filters */}
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="flex flex-col sm:flex-row items-end gap-3">
                            <div className="flex-1 space-y-1.5">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest ml-1">ค้นหา</Label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <Input placeholder="ค้นหาด้วยชื่อหรือ username..." className="pl-9 h-10 rounded-xl" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                                </div>
                            </div>
                            <div className="sm:w-44 space-y-1.5">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest ml-1">บทบาท</Label>
                                <Select value={roleFilter} onValueChange={(val) => setRoleFilter(val || "all")}>
                                    <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="ทุกบทบาท" /></SelectTrigger>
                                    <SelectContent>
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
            </TabsContent>

            <Dialog open={isEditModalOpen} onOpenChange={(open) => { setIsEditModalOpen(open); if (!open) setEditRoleError(""); }}>
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
                            {editRoleError ? (
                                <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-xl px-3 py-2 mt-2">
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>{editRoleError}</span>
                                </div>
                            ) : null}
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
                <DialogContent className="gap-0 overflow-x-hidden overflow-y-visible sm:max-w-[520px] rounded-2xl border-slate-200 dark:border-slate-800 p-0 bg-white dark:bg-slate-950">
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
                        {createError ? (
                            <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-xl px-3 py-2.5">
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>{createError}</span>
                            </div>
                        ) : null}
                    </div>
                    <DialogFooter className="mx-0 mb-0 gap-2 border-t border-slate-100 bg-transparent px-6 py-4 dark:border-slate-800 sm:flex-row sm:justify-end">
                        <Button variant="ghost" className="rounded-xl" onClick={() => setIsCreateModalOpen(false)}>ยกเลิก</Button>
                        <Button onClick={handleCreateUser} disabled={isCreating} className="rounded-xl bg-blue-600 text-white font-bold px-6">สร้างบัญชี</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

                <TabsContent value="roles" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {roles.map((role) => (
                        <div key={role._id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:border-blue-200 transition-all group">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors uppercase tracking-tight truncate">{role.name}</h3>
                                    <p className="text-xs text-slate-500 line-clamp-2 mt-1">{role.description || "ไม่มีคำอธิบาย"}</p>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => handleEditRole(role)} className="h-8 w-8 p-0 shrink-0 ml-2">
                                    <Edit className="h-4 w-4 text-slate-400 group-hover:text-blue-500" />
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                                {role.permissions.slice(0, 3).map(p => (
                                    <Badge key={p} variant="secondary" className="text-[9px] font-normal px-1.5 py-0 whitespace-nowrap">
                                        {(PERMISSION_LABELS as any)[p]?.label || p}
                                    </Badge>
                                ))}
                                {role.permissions.length > 3 && (
                                    <Badge variant="secondary" className="text-[9px] font-normal px-1.5 py-0">+{role.permissions.length - 3}</Badge>
                                )}
                            </div>
                        </div>
                    ))}
                </TabsContent>
            </Tabs>

            {/* Role Editor Modal */}
            <Dialog open={isRoleModalOpen} onOpenChange={setIsRoleModalOpen}>
                <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden flex flex-col max-h-[90vh] bg-white dark:bg-slate-950">
                    <div className="px-6 pt-6 pb-4 border-b">
                        <DialogTitle>{editingRole?._id ? "แก้ไขบทบาท" : "สร้างบทบาทใหม่"}</DialogTitle>
                    </div>
                    <div className="p-6 overflow-y-auto flex-1 space-y-6">
                        <div className="grid gap-4">
                            <div className="space-y-1.5">
                                <Label>ชื่อบทบาท</Label>
                                <Input value={editingRole?.name || ""} onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })} placeholder="เช่น Senior Admin" className="rounded-xl" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>คำอธิบาย</Label>
                                <Input value={editingRole?.description || ""} onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })} placeholder="คำอธิบายสั้นๆ" className="rounded-xl" />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h4 className="text-sm font-bold flex items-center gap-2">
                                <ShieldAlert className="h-4 w-4 text-blue-500" />
                                สิทธิ์การใช้งาน
                            </h4>
                            {Object.entries(permissionGroups).map(([group, perms]) => (
                                <div key={group} className="space-y-2">
                                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b pb-1">{group}</h5>
                                    <div className="grid grid-cols-2 gap-2">
                                        {perms.map((p) => (
                                            <div 
                                                key={p.key} 
                                                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors cursor-pointer ${editingRole?.permissions?.includes(p.key) ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20' : ''}`}
                                                onClick={() => handleTogglePermission(p.key)}
                                            >
                                                <Checkbox checked={editingRole?.permissions?.includes(p.key)} onCheckedChange={() => handleTogglePermission(p.key)} />
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-semibold">{p.label}</span>
                                                    <span className="text-[9px] text-slate-500">{p.description}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <DialogFooter className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-900/50">
                        <Button variant="ghost" className="rounded-xl" onClick={() => setIsRoleModalOpen(false)}>ยกเลิก</Button>
                        <Button onClick={handleSaveRoleData} disabled={isSaving || !editingRole?.name} className="bg-blue-600 text-white rounded-xl px-6 font-bold">บันทึกบทบาท</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Modal */}
            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent className="sm:max-w-[400px] rounded-2xl p-0 overflow-hidden bg-white dark:bg-slate-950">
                    <div className="p-6">
                        <DialogTitle className="text-red-600 flex items-center gap-2">
                            <Trash2 className="h-5 w-5" />
                            ยืนยันการลบผู้ใช้
                        </DialogTitle>
                        <DialogDescription className="mt-2">ต้องการลบผู้ใช้ <span className="font-bold">{deletingWorker?.name}</span> ใช่หรือไม่?</DialogDescription>
                        {deleteError ? (
                            <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-xl px-3 py-2.5 mt-3">
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>{deleteError}</span>
                            </div>
                        ) : null}
                    </div>
                    <DialogFooter className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t">
                        <Button variant="ghost" className="rounded-xl" onClick={() => setIsDeleteOpen(false)}>ยกเลิก</Button>
                        <Button variant="destructive" className="rounded-xl font-bold" onClick={handleConfirmDelete} disabled={isDeleting}>
                            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            ลบผู้ใช้
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
