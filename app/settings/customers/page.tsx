"use client";

import { useState, useEffect } from "react";
import { customersApi } from "@/lib/api/customers";
import { Customer } from "@/lib/api/types";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Edit, Trash2, Loader2, Search, Plus, Users, AlertTriangle } from "lucide-react";

export default function CustomersManagementPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    // Create/Edit modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

    // Delete confirmation state
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        phone: "",
        address: "",
        discount: "" as number | "",
        notes: "",
    });

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        setIsLoading(true);
        try {
            const response = await customersApi.getAll();
            if (response.success && response.data) {
                setCustomers(response.data);
            }
        } catch (error) {
            console.error("Failed to fetch customers:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenModal = (customer?: Customer) => {
        if (customer) {
            setEditingCustomer(customer);
            setFormData({
                name: customer.name || "",
                phone: customer.phone || "",
                address: customer.address || "",
                discount: customer.discount || "",
                notes: customer.notes || "",
            });
        } else {
            setEditingCustomer(null);
            setFormData({
                name: "",
                phone: "",
                address: "",
                discount: "",
                notes: "",
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name) return;
        setIsSubmitting(true);

        const payload: Partial<Customer> = {
            name: formData.name,
            phone: formData.phone,
            address: formData.address,
            discount: formData.discount === "" ? 0 : formData.discount,
            notes: formData.notes,
        };

        try {
            if (editingCustomer) {
                const response = await customersApi.update(editingCustomer._id, payload);
                if (response.success && response.data) {
                    setCustomers(customers.map(c =>
                        c._id === editingCustomer._id ? response.data : c
                    ));
                }
            } else {
                const response = await customersApi.create(payload);
                if (response.success && response.data) {
                    setCustomers([response.data, ...customers]);
                }
            }
            setIsModalOpen(false);
        } catch (error) {
            console.error("Failed to save customer:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteClick = (customer: Customer) => {
        setDeletingCustomer(customer);
        setIsDeleteOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!deletingCustomer) return;
        setIsDeleting(true);

        try {
            const response = await customersApi.delete(deletingCustomer._id);
            if (response.success) {
                setCustomers(customers.filter(c => c._id !== deletingCustomer._id));
                setIsDeleteOpen(false);
                setDeletingCustomer(null);
            }
        } catch (error) {
            console.error("Failed to delete customer:", error);
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredCustomers = customers.filter((customer) => {
        const searchLower = searchQuery.toLowerCase();
        return (
            customer.name.toLowerCase().includes(searchLower) ||
            (customer.phone || "").toLowerCase().includes(searchLower) ||
            (customer.address || "").toLowerCase().includes(searchLower)
        );
    });

    if (isLoading) {
        return (
            <div className="flex h-[60vh] w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Customer Management</h1>
                    <p className="text-muted-foreground">Manage customer records, contact details, and discount rates.</p>
                </div>
                <Button
                    onClick={() => handleOpenModal()}
                    className="gap-2 bg-[#1B4B9A] hover:bg-[#1B4B9A]/90 text-white"
                >
                    <Plus className="h-4 w-4" />
                    New Customer
                </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card p-4 rounded-lg shadow-sm border border-border/50">
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search customers..."
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <p className="text-sm text-muted-foreground">
                    {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? "s" : ""}
                </p>
            </div>

            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Address</TableHead>
                            <TableHead>Discount</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredCustomers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                    No customers found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredCustomers.map((customer) => (
                                <TableRow key={customer._id}>
                                    <TableCell className="font-medium">{customer.name}</TableCell>
                                    <TableCell>{customer.phone || "—"}</TableCell>
                                    <TableCell className="max-w-[200px] truncate">{customer.address || "—"}</TableCell>
                                    <TableCell>
                                        {customer.discount > 0 ? (
                                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">
                                                {customer.discount}%
                                            </Badge>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleOpenModal(customer)}
                                            >
                                                <Edit className="h-4 w-4 mr-2" />
                                                Edit
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteClick(customer)}
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle>{editingCustomer ? "Edit Customer" : "New Customer"}</DialogTitle>
                        <DialogDescription>
                            {editingCustomer
                                ? `Update details for ${editingCustomer.name}.`
                                : "Add a new customer to the system."
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Customer Name *</Label>
                            <Input
                                id="name"
                                placeholder="e.g. TechCorp Inc."
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone</Label>
                                <Input
                                    id="phone"
                                    placeholder="e.g. 081-234-5678"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="discount">Discount (%)</Label>
                                <Input
                                    id="discount"
                                    type="number"
                                    min="0"
                                    max="100"
                                    placeholder="e.g. 5"
                                    value={formData.discount}
                                    onChange={(e) => setFormData({ ...formData, discount: e.target.value === "" ? "" : parseInt(e.target.value) })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="address">Address</Label>
                            <Input
                                id="address"
                                placeholder="e.g. 123 Main St, Bangkok"
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="notes">Notes</Label>
                            <Textarea
                                id="notes"
                                placeholder="Any additional notes about this customer..."
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                className="min-h-[80px]"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSubmitting || !formData.name}
                            className="bg-[#1B4B9A] hover:bg-[#1B4B9A]/90 text-white"
                        >
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingCustomer ? "Save Changes" : "Create Customer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="h-5 w-5" />
                            Delete Customer
                        </DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. This will permanently delete the customer record.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/50">
                            <p className="text-sm text-red-800 dark:text-red-300">
                                You are about to delete <span className="font-semibold">{deletingCustomer?.name}</span>.
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsDeleteOpen(false)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
