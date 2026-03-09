"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { workersApi } from "@/lib/api/workers";
import { Worker } from "@/lib/api/types";
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
import { Badge } from "@/components/ui/badge";
import { Edit, Loader2, Search, ShieldAlert } from "lucide-react";

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

    useEffect(() => {
        if (!isAuthLoading) {
            if (user?.role !== "admin" && user?.role !== "manager") {
                router.push("/settings");
            } else {
                fetchWorkers();
            }
        }
    }, [isAuthLoading, user, router]);

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

    const filteredWorkers = workers.filter((worker) => {
        const matchesSearch =
            worker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            worker.username.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole = roleFilter === "all" || worker.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    if (isAuthLoading || isLoading) {
        return (
            <div className="flex h-[60vh] w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (user?.role !== "admin" && user?.role !== "manager") {
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
        <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">User Management</h1>
                    <p className="text-muted-foreground">Manage user accounts and roles.</p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card p-4 rounded-lg shadow-sm border border-border/50">
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search users..."
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="w-full sm:w-[180px]">
                    <Select value={roleFilter} onValueChange={(val) => setRoleFilter(val || "all")}>
                        <SelectTrigger>
                            <SelectValue placeholder="Filter by Role" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Roles</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="worker">Worker</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Username</TableHead>
                            <TableHead>Position</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredWorkers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    No users found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredWorkers.map((worker) => (
                                <TableRow key={worker._id}>
                                    <TableCell className="font-medium">{worker.name}</TableCell>
                                    <TableCell>{worker.username}</TableCell>
                                    <TableCell>{worker.position}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={getRoleBadgeColor(worker.role)}>
                                            {worker.role.charAt(0).toUpperCase() + worker.role.slice(1)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEditClick(worker)}
                                            disabled={user.role === "manager" && worker.role === "admin"}
                                            title={user.role === "manager" && worker.role === "admin" ? "Managers cannot edit admins" : "Edit user role"}
                                        >
                                            <Edit className="h-4 w-4 mr-2" />
                                            Edit
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Edit User Role</DialogTitle>
                        <DialogDescription>
                            Change the permissions for {selectedWorker?.name}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Role</label>
                            <Select
                                value={editRole}
                                onValueChange={(val) => {
                                    if (val) setEditRole(val as "admin" | "manager" | "worker");
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a role" />
                                </SelectTrigger>
                                <SelectContent>
                                    {user?.role === "admin" && <SelectItem value="admin">Admin</SelectItem>}
                                    <SelectItem value="manager">Manager</SelectItem>
                                    <SelectItem value="worker">Worker</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground mt-2">
                                {editRole === "admin" && "Admins have full access to the system."}
                                {editRole === "manager" && "Managers can view all data and manage workers, but cannot manage admins."}
                                {editRole === "worker" && "Workers can access standard operational tools."}
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveRole}
                            disabled={isSaving || (user?.role === "manager" && editRole === "admin")}
                            className="bg-[#1B4B9A] hover:bg-[#1B4B9A]/90 text-white"
                        >
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
