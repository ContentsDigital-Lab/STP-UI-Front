"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { workersApi } from "@/lib/api/workers";
import { ordersApi } from "@/lib/api/orders";
import { claimsApi } from "@/lib/api/claims";
import { withdrawalsApi } from "@/lib/api/withdrawals";
import { Worker, Order, Claim, Withdrawal } from "@/lib/api/types";
import { Role, Permission, PERMISSION_LABELS } from "@/lib/auth/permissions";
import { rolesApi } from "@/lib/api/roles";
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

    // User Edit modal state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
    const [editRole, setEditRole] = useState<"admin" | "manager" | "worker">("worker");
    const [isSaving, setIsSaving] = useState(false);

    // User Create modal state
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState("");
    const [createForm, setCreateForm] = useState({
        name: "",
        username: "",
        password: "",
        position: "",
        role: "worker" as "admin" | "manager" | "worker",
    });

    // Delete modal state
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deletingWorker, setDeletingWorker] = useState<Worker | null>(null);
    const [deleteError, setDeleteError] = useState("");
    const [linkedOrders, setLinkedOrders] = useState<Order[]>([]);
    const [linkedClaims, setLinkedClaims] = useState<Claim[]>([]);
    const [linkedWithdrawals, setLinkedWithdrawals] = useState<Withdrawal[]>([]);

    // Role Management state
    const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Partial<Role> | null>(null);

    const fetchWorkers = async () => {
        setIsLoading(true);
        try {
            const response = await workersApi.getAll();
            if (response.success && response.data) {
                setWorkers(response.data);
            }
        } catch (error) {
            console.error("Failed to fetch workers:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchRoles = async () => {
        try {
            const response = await rolesApi.getAll();
            if (response.success && response.data) {
                setRoles(response.data);
            }
        } catch (error) {
            console.error("Failed to fetch roles:", error);
        }
    };

    useEffect(() => {
        if (!isAuthLoading) {
            if (user?.role !== "admin" && user?.role !== "manager") {
                router.push("/settings");
            } else {
                fetchWorkers();
                fetchRoles();
            }
        }
    }, [isAuthLoading, user, router]);

    // --- User Actions ---
    const handleEditClick = (worker: Worker) => {
        setSelectedWorker(worker);
        setEditRole(worker.role);
        setIsEditModalOpen(true);
    };

    const handleSaveRole = async () => {
        if (!selectedWorker) return;
        setIsSaving(true);
        try {
            const response = await workersApi.update(selectedWorker._id, { role: editRole });
            if (response.success) {
                setWorkers((prev) =>
                    prev.map((w) => (w._id === selectedWorker._id ? { ...w, role: editRole } : w))
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
            const response = await workersApi.create(createForm);
            if (response.success && response.data) {
                setWorkers([response.data, ...workers]);
                setIsCreateModalOpen(false);
                setCreateForm({ name: "", username: "", password: "", position: "", role: "worker" });
            }
        } catch (error: any) {
            setCreateError(error.message || "Failed to create user");
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
                setWorkers(workers.filter(w => w._id !== deletingWorker._id));
                setIsDeleteOpen(false);
                setDeletingWorker(null);
            }
        } catch (error: any) {
            const msg = error.message || "Failed to delete user";
            setDeleteError(msg);
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
                await rolesApi.update(editingRole._id, editingRole);
            } else {
                await rolesApi.create(editingRole);
            }
            fetchRoles();
            setIsRoleModalOpen(false);
        } catch (error) {
            console.error("Failed to save role:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const isSelf = (workerId: string) => user?._id === workerId;

    const filteredWorkers = workers.filter((worker) => {
        const matchesSearch =
            worker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            worker.username.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole = roleFilter === "all" || worker.role === roleFilter;
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

                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="px-4">ชื่อ</TableHead>
                                    <TableHead>Username</TableHead>
                                    <TableHead>ตำแหน่ง</TableHead>
                                    <TableHead>บทบาท</TableHead>
                                    <TableHead className="text-right pr-4">จัดการ</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredWorkers.map((worker) => (
                                    <TableRow key={worker._id}>
                                        <TableCell className="font-medium px-4">{worker.name}</TableCell>
                                        <TableCell>{worker.username}</TableCell>
                                        <TableCell>{worker.position}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={`border-0 ${getRoleBadgeColor(worker.role)}`}>
                                                {worker.role.toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right pr-4">
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="sm" onClick={() => handleEditClick(worker)} disabled={isSelf(worker._id)}><Edit className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(worker)} disabled={isSelf(worker._id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                <TabsContent value="roles" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {roles.map((role) => (
                        <div key={role._id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:border-blue-200 transition-all group">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors uppercase tracking-tight">{role.name}</h3>
                                    <p className="text-xs text-slate-500 line-clamp-2">{role.description || "ไม่มีคำอธิบาย"}</p>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => handleEditRole(role)}><Edit className="h-4 w-4 text-slate-400 group-hover:text-blue-500" /></Button>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                                {role.permissions.slice(0, 3).map(p => (
                                    <Badge key={p} variant="secondary" className="text-[9px] font-normal px-1.5 py-0">
                                        {PERMISSION_LABELS[p]?.label || p}
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
                <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="px-6 pt-6 pb-4 border-b">
                        <DialogTitle>{editingRole?._id ? "แก้ไขบทบาท" : "สร้างบทบาทใหม่"}</DialogTitle>
                    </div>
                    <div className="p-6 overflow-y-auto flex-1 space-y-6">
                        <div className="grid gap-4">
                            <div className="space-y-1.5">
                                <Label>ชื่อบทบาท</Label>
                                <Input value={editingRole?.name} onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })} placeholder="เช่น Senior Admin" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>คำอธิบาย</Label>
                                <Input value={editingRole?.description} onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })} placeholder="จัดการทุกอย่างในระบบ" />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h4 className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
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
                                                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors cursor-pointer ${editingRole?.permissions?.includes(p.key) ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                                                onClick={() => handleTogglePermission(p.key)}
                                            >
                                                <Checkbox 
                                                    checked={editingRole?.permissions?.includes(p.key)} 
                                                    onCheckedChange={() => handleTogglePermission(p.key)} 
                                                />
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
                    <div className="px-6 py-4 border-t flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/50">
                        <Button variant="ghost" onClick={() => setIsRoleModalOpen(false)}>ยกเลิก</Button>
                        <Button 
                            onClick={handleSaveRoleData} 
                            disabled={isSaving || !editingRole?.name} 
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6"
                        >
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            บันทึกบทบาท
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Standard Modals (User Create, Edit, Delete) */}
            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                <DialogContent className="sm:max-w-[450px]">
                    <DialogTitle>เพิ่มผู้ใช้ใหม่</DialogTitle>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <Input placeholder="ชื่อ-นามสกุล" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
                            <Input placeholder="Username" value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} />
                        </div>
                        <Input placeholder="รหัสผ่าน" type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
                        <div className="grid grid-cols-2 gap-4">
                            <Input placeholder="ตำแหน่ง" value={createForm.position} onChange={(e) => setCreateForm({ ...createForm, position: e.target.value })} />
                            <Select value={createForm.role} onValueChange={(val: any) => setCreateForm({...createForm, role: val})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="manager">Manager</SelectItem>
                                    <SelectItem value="worker">Worker</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleCreateUser} disabled={isCreating} className="w-full bg-blue-600 text-white">สร้างบัญชีผู้ใช้</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogTitle>เปลี่ยนบทบาท: {selectedWorker?.name}</DialogTitle>
                    <div className="py-6">
                        <Select value={editRole} onValueChange={(val: any) => setEditRole(val)}>
                            <SelectTrigger className="h-12 text-lg"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="worker">Worker</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSaveRole} disabled={isSaving} className="w-full bg-blue-600 text-white font-bold h-11 rounded-xl">บันทึกการเปลี่ยนแปลง</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-red-600 flex items-center gap-2">
                            <Trash2 className="h-5 w-5" />
                            ยืนยันการลบผู้ใช้
                        </DialogTitle>
                        <DialogDescription>
                            คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ <span className="font-bold text-slate-900 dark:text-white">{deletingWorker?.name}</span>?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-slate-500">การดำเนินการนี้ไม่สามารถย้อนคืนได้ และข้อมูลที่เกี่ยวข้องกับผู้ใช้นี้อาจได้รับผลกระทบ</p>
                        {deleteError && (
                            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-lg border border-red-100 dark:border-red-800">
                                {deleteError}
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsDeleteOpen(false)} disabled={isDeleting} className="rounded-xl">ยกเลิก</Button>
                        <Button onClick={handleConfirmDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-6">
                            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            ลบผู้ใช้
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
