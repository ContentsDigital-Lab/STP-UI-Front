"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
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
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Loader2, Search, Plus, Users, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

const ITEMS_PER_PAGE = 20;

// ── Phone Number Format Helper ──────────────────────────────────────────────
const formatPhoneNumber = (val: string) => {
    const digits = val.replace(/\D/g, '').substring(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};

export default function CustomersManagementPage() {
    const router = useRouter();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [serverPage, setServerPage] = useState(1);
    const [searchPage, setSearchPage] = useState(1);
    const [paginationMeta, setPaginationMeta] = useState({
        page: 1,
        limit: ITEMS_PER_PAGE,
        total: 0,
        totalPages: 1,
    });
    const [allCustomersCache, setAllCustomersCache] = useState<Customer[] | null>(null);
    const [listLoading, setListLoading] = useState(true);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [listRefreshKey, setListRefreshKey] = useState(0);
    const [searchFetchKey, setSearchFetchKey] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => clearTimeout(t);
    }, [searchQuery]);

    const isSearchActive = debouncedSearch.trim().length > 0;

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
        if (debouncedSearch.trim()) return;
        let cancelled = false;
        (async () => {
            setListLoading(true);
            try {
                const response = await customersApi.getAll({
                    page: serverPage,
                    limit: ITEMS_PER_PAGE,
                    sort: "-createdAt",
                });
                if (cancelled) return;
                if (response.success && response.data) {
                    setCustomers(response.data);
                    if (response.pagination) {
                        setPaginationMeta(response.pagination);
                    }
                    setHasLoadedOnce(true);
                }
            } catch (error) {
                console.error("Failed to fetch customers:", error);
            } finally {
                if (!cancelled) setListLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [serverPage, debouncedSearch, listRefreshKey]);

    useEffect(() => {
        if (!debouncedSearch.trim()) {
            setAllCustomersCache(null);
            return;
        }
        let cancelled = false;
        setListLoading(true);
        setSearchPage(1);
        (async () => {
            const acc: Customer[] = [];
            let page = 1;
            let totalPages = 1;
            try {
                do {
                    const res = await customersApi.getAll({
                        page,
                        limit: 100,
                        sort: "-createdAt",
                    });
                    if (cancelled || !res.success || !res.data) break;
                    acc.push(...res.data);
                    totalPages = res.pagination?.totalPages ?? 1;
                    page++;
                    if (page > 100) break;
                } while (page <= totalPages);
                if (!cancelled) {
                    setAllCustomersCache(acc);
                    setHasLoadedOnce(true);
                }
            } catch (error) {
                console.error("Failed to load customers for search:", error);
            } finally {
                if (!cancelled) setListLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [debouncedSearch, searchFetchKey]);

    const filteredForSearch = useMemo(() => {
        if (!isSearchActive || allCustomersCache === null) return [];
        const q = debouncedSearch.toLowerCase();
        return allCustomersCache.filter(
            (customer) =>
                customer.name.toLowerCase().includes(q) ||
                (customer.phone || "").toLowerCase().includes(q) ||
                (customer.address || "").toLowerCase().includes(q)
        );
    }, [isSearchActive, allCustomersCache, debouncedSearch]);

    const displayCustomers = useMemo(() => {
        if (isSearchActive) {
            return filteredForSearch.slice(
                (searchPage - 1) * ITEMS_PER_PAGE,
                searchPage * ITEMS_PER_PAGE
            );
        }
        return customers;
    }, [isSearchActive, filteredForSearch, searchPage, customers]);

    const totalPages = Math.max(
        1,
        isSearchActive
            ? Math.ceil(filteredForSearch.length / ITEMS_PER_PAGE) || 1
            : paginationMeta.totalPages
    );
    const totalItems = isSearchActive ? filteredForSearch.length : paginationMeta.total;
    const activePage = isSearchActive ? searchPage : serverPage;

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
            phone: formData.phone.replace(/\D/g, ''),
            address: formData.address,
            discount: formData.discount === "" ? 0 : formData.discount,
            notes: formData.notes,
        };

        try {
            if (editingCustomer) {
                const response = await customersApi.update(editingCustomer._id, payload);
                if (response.success && response.data) {
                    if (debouncedSearch.trim()) {
                        setSearchFetchKey((k) => k + 1);
                    } else {
                        setCustomers((prev) =>
                            prev.map((c) => (c._id === editingCustomer._id ? response.data! : c))
                        );
                    }
                }
            } else {
                const response = await customersApi.create(payload);
                if (response.success && response.data) {
                    if (debouncedSearch.trim()) {
                        setSearchFetchKey((k) => k + 1);
                    } else {
                        setServerPage(1);
                        setListRefreshKey((k) => k + 1);
                    }
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
                setIsDeleteOpen(false);
                setDeletingCustomer(null);
                if (debouncedSearch.trim()) {
                    setSearchFetchKey((k) => k + 1);
                } else if (customers.length === 1 && serverPage > 1) {
                    setServerPage((p) => p - 1);
                } else {
                    setListRefreshKey((k) => k + 1);
                }
            }
        } catch (error) {
            console.error("Failed to delete customer:", error);
        } finally {
            setIsDeleting(false);
        }
    };

    if (!hasLoadedOnce && listLoading) {
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
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white truncate">จัดการลูกค้า</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">จัดการข้อมูลลูกค้า ที่อยู่ และส่วนลด</p>
                    </div>
                </div>
                <Button
                    onClick={() => handleOpenModal()}
                    className="gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white font-bold rounded-xl h-10 px-5 text-sm shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0 w-full sm:w-auto shrink-0"
                >
                    <Plus className="h-4 w-4" />
                    เพิ่มลูกค้า
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
                                placeholder="ค้นหาด้วยชื่อ, เบอร์โทร, ที่อยู่..."
                                className="pl-9 h-10 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-sm"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap shrink-0 pb-2.5">
                        {totalItems} รายการ
                    </span>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative">
                {listLoading && hasLoadedOnce && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-slate-900/70 backdrop-blur-[1px] rounded-2xl">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}
                <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="border-slate-100 dark:border-slate-800 hover:bg-transparent">
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 px-4 h-10">ชื่อลูกค้า</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">เบอร์โทร</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">ที่อยู่</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">ส่วนลด</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10 text-right pr-4">จัดการ</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {!listLoading && displayCustomers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="py-16 text-center border-none">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                            <Users className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                                        </div>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">ไม่พบลูกค้า</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            displayCustomers.map((customer) => (
                                <TableRow key={customer._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 border-slate-100 dark:border-slate-800">
                                    <TableCell className="font-medium text-sm text-slate-900 dark:text-white py-3.5 px-4">{customer.name}</TableCell>
                                    <TableCell className="text-sm text-slate-500 dark:text-slate-400 py-3.5">{customer.phone || "—"}</TableCell>
                                    <TableCell className="max-w-[200px] truncate text-sm text-slate-600 dark:text-slate-300 py-3.5">{customer.address || "—"}</TableCell>
                                    <TableCell className="py-3.5">
                                        {customer.discount > 0 ? (
                                            <Badge variant="outline" className="text-xs font-medium px-2 py-0.5 rounded-md border-0 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                                                {customer.discount}%
                                            </Badge>
                                        ) : (
                                            <span className="text-slate-300 dark:text-slate-700">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right py-3.5 pr-4">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="rounded-lg h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                onClick={() => handleOpenModal(customer)}
                                                title="แก้ไข"
                                            >
                                                <Edit className="h-4 w-4 text-slate-500" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="rounded-lg h-8 w-8 p-0 hover:bg-red-50 dark:hover:bg-red-950"
                                                onClick={() => handleDeleteClick(customer)}
                                                title="ลบ"
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

                {totalPages > 1 && (
                    <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                            {activePage} / {totalPages} ({totalItems} รายการ)
                        </span>
                        <div className="flex items-center justify-center gap-1">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={activePage === 1 || listLoading}
                                onClick={() =>
                                    isSearchActive
                                        ? setSearchPage((p) => Math.max(1, p - 1))
                                        : setServerPage((p) => Math.max(1, p - 1))
                                }
                                className="h-8 w-8 p-0 rounded-lg"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            {[...Array(Math.min(totalPages, 7))].map((_, i) => {
                                let pageNum: number;
                                if (totalPages <= 7) {
                                    pageNum = i + 1;
                                } else if (activePage <= 4) {
                                    pageNum = i + 1;
                                } else if (activePage >= totalPages - 3) {
                                    pageNum = totalPages - 6 + i;
                                } else {
                                    pageNum = activePage - 3 + i;
                                }
                                return (
                                    <button
                                        type="button"
                                        key={pageNum}
                                        disabled={listLoading}
                                        onClick={() =>
                                            isSearchActive ? setSearchPage(pageNum) : setServerPage(pageNum)
                                        }
                                        className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-medium transition-colors disabled:opacity-50 ${activePage === pageNum
                                            ? "bg-blue-600 text-white dark:bg-[#E8601C]"
                                            : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                            }`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={activePage === totalPages || listLoading}
                                onClick={() =>
                                    isSearchActive
                                        ? setSearchPage((p) => Math.min(totalPages, p + 1))
                                        : setServerPage((p) => Math.min(totalPages, p + 1))
                                }
                                className="h-8 w-8 p-0 rounded-lg"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create/Edit Dialog */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-[520px] rounded-2xl border-slate-200 dark:border-slate-800 p-0 bg-white dark:bg-slate-950 max-h-[90vh] overflow-y-auto">
                    <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-semibold text-slate-900 dark:text-white">{editingCustomer ? "แก้ไขลูกค้า" : "เพิ่มลูกค้า"}</DialogTitle>
                            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                {editingCustomer
                                    ? `แก้ไขข้อมูลสำหรับ ${editingCustomer.name}`
                                    : "เพิ่มลูกค้าใหม่เข้าสู่ระบบ"
                                }
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="px-6 py-5 space-y-5">
                        <div className="space-y-1.5">
                            <Label htmlFor="name" className="text-sm font-medium text-slate-700 dark:text-slate-300">ชื่อลูกค้า <span className="text-red-400">*</span></Label>
                            <Input
                                id="name"
                                placeholder="เช่น บริษัท ABC จำกัด"
                                className="h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="phone" className="text-sm font-medium text-slate-700 dark:text-slate-300">เบอร์โทร</Label>
                                <Input
                                    id="phone"
                                    placeholder="เช่น 081-234-5678"
                                    className="h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                                    value={formData.phone}
                                    onChange={(e) => {
                                        const formatted = formatPhoneNumber(e.target.value);
                                        setFormData({ ...formData, phone: formatted });
                                    }}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="discount" className="text-sm font-medium text-slate-700 dark:text-slate-300">ส่วนลด (%)</Label>
                                <Input
                                    id="discount"
                                    type="number"
                                    min="0"
                                    max="100"
                                    placeholder="เช่น 5"
                                    className="h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                                    value={formData.discount}
                                    onChange={(e) => setFormData({ ...formData, discount: e.target.value === "" ? "" : parseInt(e.target.value) })}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="address" className="text-sm font-medium text-slate-700 dark:text-slate-300">ที่อยู่</Label>
                            <Input
                                id="address"
                                placeholder="เช่น 123 ถนนสุขุมวิท กรุงเทพฯ"
                                className="h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="notes" className="text-sm font-medium text-slate-700 dark:text-slate-300">หมายเหตุ</Label>
                            <Textarea
                                id="notes"
                                placeholder="รายละเอียดเพิ่มเติมเกี่ยวกับลูกค้า..."
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                className="min-h-[80px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                            />
                        </div>
                    </div>
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                        <Button variant="ghost" className="rounded-xl h-10 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white px-4" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
                            ยกเลิก
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSubmitting || !formData.name}
                            className="rounded-xl h-10 min-w-[140px] bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white text-sm font-bold shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0"
                        >
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingCustomer ? "บันทึก" : "สร้างลูกค้า"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirm Dialog */}
            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent className="sm:max-w-sm rounded-2xl border-slate-200 dark:border-slate-800 p-0 bg-white dark:bg-slate-950">
                    <div className="px-6 pt-6 pb-4">
                        <DialogHeader>
                            <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                                <Trash2 className="h-6 w-6 text-red-500" />
                            </div>
                            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white text-center">ยืนยันการลบ</DialogTitle>
                            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 text-center">
                                ลบ <span className="font-semibold text-slate-700 dark:text-slate-300">{deletingCustomer?.name}</span> ออกจากระบบ? การกระทำนี้ไม่สามารถย้อนกลับได้
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                        <Button variant="ghost" className="rounded-xl h-10 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white px-4" onClick={() => setIsDeleteOpen(false)} disabled={isDeleting}>
                            ยกเลิก
                        </Button>
                        <Button
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            variant="destructive"
                            className="bg-red-600 hover:bg-red-700 rounded-xl h-10 px-5 text-sm font-bold"
                        >
                            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            ลบลูกค้า
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
