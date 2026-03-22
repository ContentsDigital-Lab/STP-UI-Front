"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
    Plus,
    Search,
    ClipboardList,
    Calendar,
    MapPin,
    User,
    Package,
    Clock,
    AlertTriangle,
    UserCheck,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    MoreHorizontal,
    Edit3,
    Trash2,
    X,
    CalendarClock,
    Truck,
    Hash,
    DollarSign,
    Users,
    ArrowUpRight,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Sheet,
    SheetContent,
} from "@/components/ui/sheet";
import { panesApi } from "@/lib/api/panes";
import { requestsApi } from "@/lib/api/requests";
import { customersApi } from "@/lib/api/customers";
import { workersApi } from "@/lib/api/workers";
import { OrderRequest, Customer, Worker, Pane } from "@/lib/api/types";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 10;

export default function OrderRequestsPage() {
    const { t, lang } = useLanguage();
    const it = t.order_requests;

    const [isLoading, setIsLoading] = useState(true);
    const [requests, setRequests] = useState<OrderRequest[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [workers, setWorkers] = useState<Worker[]>([]);

    const [selectedRequest, setSelectedRequest] = useState<OrderRequest | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [detailPanes, setDetailPanes] = useState<Pane[]>([]);
    const [panesLoading, setPanesLoading] = useState(false);
    const [showAllPanes, setShowAllPanes] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<string>("all");

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);

    // Create/Edit Dialog
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        customer: "",
        type: "",
        quantity: 1,
        estimatedPrice: 0,
        deadline: "",
        deliveryLocation: "",
        assignedTo: "",
        expectedDeliveryDate: "",
    });

    // WebSocket
    const requestEvents = ['request:updated'];
    useWebSocket('request', requestEvents, (event: string) => {
        console.log(`[OrderRequests] Received ${event}, refreshing...`);
        fetchData(false);
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        try {
            const [reqRes, custRes, workerRes] = await Promise.all([
                requestsApi.getAll(),
                customersApi.getAll(),
                workersApi.getAll(),
            ]);
            if (reqRes.success && reqRes.data) setRequests(reqRes.data);
            if (custRes.success && custRes.data) setCustomers(custRes.data);
            if (workerRes.success && workerRes.data) setWorkers(workerRes.data);
        } catch (error) {
            console.error("Failed to load order requests:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const getCustomerInfo = useCallback((ref: string | Customer): Customer | null => {
        if (typeof ref === "object" && ref !== null) return ref;
        return customers.find(c => c._id === ref) || null;
    }, [customers]);

    const getWorkerInfo = useCallback((ref: string | Worker): Worker | null => {
        if (typeof ref === "object" && ref !== null) return ref;
        return workers.find(w => w._id === ref) || null;
    }, [workers]);

    // Stats
    const globalStats = useMemo(() => {
        const total = requests.length;

        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const thisWeek = requests.filter(r => new Date(r.createdAt) >= weekAgo).length;

        const assigned = requests.filter(r => r.assignedTo).length;

        const threeDaysFromNow = new Date(now);
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
        const approaching = requests.filter(r => {
            if (!r.deadline) return false;
            const dl = new Date(r.deadline);
            return dl <= threeDaysFromNow && dl >= now;
        }).length;

        return { total, thisWeek, assigned, approaching };
    }, [requests]);

    // Filter options
    const productTypes = useMemo(
        () => Array.from(new Set(requests.map(r => r.details?.type).filter(Boolean))),
        [requests]
    );

    const filteredRequests = useMemo(() => {
        return requests.filter(req => {
            const cust = getCustomerInfo(req.customer);
            const worker = getWorkerInfo(req.assignedTo);
            const searchLower = searchQuery.toLowerCase();

            const matchesSearch =
                cust?.name?.toLowerCase().includes(searchLower) ||
                req.deliveryLocation?.toLowerCase().includes(searchLower) ||
                req.details?.type?.toLowerCase().includes(searchLower) ||
                worker?.name?.toLowerCase().includes(searchLower);

            const matchesType = typeFilter === "all" || req.details?.type === typeFilter;

            return matchesSearch && matchesType;
        });
    }, [requests, searchQuery, typeFilter, getCustomerInfo, getWorkerInfo]);

    const totalPages = Math.ceil(filteredRequests.length / ITEMS_PER_PAGE);
    const paginatedRequests = filteredRequests.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const resetFilters = () => {
        setSearchQuery("");
        setTypeFilter("all");
        setCurrentPage(1);
    };

    const resetForm = () => {
        setFormData({
            customer: "",
            type: "",
            quantity: 1,
            estimatedPrice: 0,
            deadline: "",
            deliveryLocation: "",
            assignedTo: "",
            expectedDeliveryDate: "",
        });
        setIsEditing(false);
        setEditId(null);
    };

    const handleSubmit = async () => {
        if (!formData.customer || !formData.type) return;
        setIsSubmitting(true);

        const payload: any = {
            details: {
                type: formData.type,
                quantity: formData.quantity,
                estimatedPrice: formData.estimatedPrice,
            },
            customer: formData.customer,
            deadline: formData.deadline ? new Date(formData.deadline).toISOString() : undefined,
            deliveryLocation: formData.deliveryLocation,
            assignedTo: formData.assignedTo || undefined,
            expectedDeliveryDate: formData.expectedDeliveryDate ? new Date(formData.expectedDeliveryDate).toISOString() : undefined,
        };

        try {
            if (isEditing && editId) {
                const res = await requestsApi.update(editId, payload);
                if (res.success && res.data) {
                    setRequests(prev => prev.map(r => r._id === editId ? res.data! : r));
                    if (selectedRequest?._id === editId) setSelectedRequest(res.data);
                    setIsFormOpen(false);
                    resetForm();
                }
            } else {
                const res = await requestsApi.create(payload);
                if (res.success && res.data) {
                    setRequests(prev => [res.data!, ...prev]);
                    setIsFormOpen(false);
                    resetForm();
                }
            }
        } catch (error) {
            console.error("Failed to save request:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = (id: string) => setDeleteTargetId(id);

    const executeDelete = async () => {
        if (!deleteTargetId) return;
        const id = deleteTargetId;
        setDeleteTargetId(null);
        try {
            const res = await requestsApi.delete(id);
            if (res.success) {
                setRequests(prev => prev.filter(r => r._id !== id));
                setIsDetailOpen(false);
                setSelectedRequest(null);
                toast.success(lang === 'th' ? 'ลบคำสั่งซื้อเรียบร้อย' : 'Request deleted');
            } else {
                toast.error(lang === 'th' ? 'ลบไม่สำเร็จ' : 'Failed to delete');
            }
        } catch (err) {
            console.error("Failed to delete request:", err);
            toast.error(lang === 'th' ? 'เกิดข้อผิดพลาด' : 'Something went wrong');
        }
    };

    const openDetails = (req: OrderRequest) => {
        setSelectedRequest(req);
        setIsDetailOpen(true);
        setDetailPanes([]);
        setPanesLoading(true);
        setShowAllPanes(false);
        panesApi.getAll({ limit: 100 }).then(res => {
            if (res.success) {
                const requestPanes = (res.data ?? []).filter(p => {
                    const pReq = typeof p.request === "string" ? p.request : (p.request as { _id?: string })?._id;
                    return pReq === req._id;
                });
                setDetailPanes(requestPanes);
            }
        }).catch(() => {}).finally(() => setPanesLoading(false));
    };

    const openEditDialog = (req: OrderRequest) => {
        const custId = typeof req.customer === 'string' ? req.customer : req.customer._id;
        const workerId = typeof req.assignedTo === 'string' ? req.assignedTo : req.assignedTo?._id || "";
        setFormData({
            customer: custId,
            type: req.details?.type || "",
            quantity: req.details?.quantity || 1,
            estimatedPrice: req.details?.estimatedPrice || 0,
            deadline: req.deadline ? req.deadline.split("T")[0] : "",
            deliveryLocation: req.deliveryLocation || "",
            assignedTo: workerId,
            expectedDeliveryDate: req.expectedDeliveryDate ? req.expectedDeliveryDate.split("T")[0] : "",
        });
        setIsEditing(true);
        setEditId(req._id);
        setIsFormOpen(true);
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return "—";
        return new Date(dateStr).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    };

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat(lang === 'th' ? 'th-TH' : 'en-US', {
            style: 'currency',
            currency: 'THB',
            minimumFractionDigits: 0,
        }).format(price);
    };

    const isApproachingDeadline = (deadline: string) => {
        if (!deadline) return false;
        const dl = new Date(deadline);
        const now = new Date();
        const threeDays = new Date(now);
        threeDays.setDate(threeDays.getDate() + 3);
        return dl <= threeDays && dl >= now;
    };

    const isPastDeadline = (deadline: string) => {
        if (!deadline) return false;
        return new Date(deadline) < new Date();
    };

    const TableSkeleton = () => (
        <>
            {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-[140px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[50px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[90px] rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-6 w-[40px]" /></TableCell>
                </TableRow>
            ))}
        </>
    );

    return (
        <div className="flex flex-col gap-4 sm:gap-6 lg:gap-8 max-w-[1600px] mx-auto w-full overflow-x-hidden">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
                <div>
                    <h1 className="flex items-center gap-3 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-normal pt-2 pb-1">
                        <ClipboardList className="h-7 w-7 sm:h-8 sm:w-8 shrink-0" />
                        {it.title}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base font-medium mt-1">
                        {it.subtitle}
                    </p>
                </div>
                <Link href="/request/create">
                    <Button
                        className="w-full sm:w-auto gap-2 bg-primary hover:bg-primary/90 dark:bg-[#E8601C] dark:hover:bg-[#E8601C]/90 text-white shadow-lg shadow-primary/20 dark:shadow-orange-500/20 px-8 transition-all font-bold rounded-xl h-11"
                    >
                        <Plus className="h-4 w-4" />
                        {it.newRequest}
                    </Button>
                </Link>
            </div>

            {/* Stat Cards */}
            {!isLoading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    {/* Total Requests */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between min-h-[140px]">
                        <div className="flex items-center justify-between mb-4">
                            <div className="h-12 w-12 rounded-2xl bg-blue-50 dark:bg-[#E8601C]/10 flex items-center justify-center text-primary dark:text-[#E8601C] group-hover:bg-primary dark:group-hover:bg-[#E8601C] group-hover:text-white dark:group-hover:text-white transition-colors">
                                <ClipboardList className="h-6 w-6" />
                            </div>
                            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded-lg">
                                Overview
                            </span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{it.totalRequests}</p>
                            <div className="flex items-baseline gap-2 mt-1">
                                <h3 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{globalStats.total}</h3>
                                <span className="text-[11px] font-semibold text-emerald-500 flex items-center bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded-md">
                                    <ArrowUpRight className="h-3 w-3 mr-0.5" />
                                    Active
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* This Week */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between min-h-[140px]">
                        <div className="flex items-center justify-between mb-4">
                            <div className="h-12 w-12 rounded-2xl bg-blue-50 dark:bg-[#E8601C]/10 flex items-center justify-center text-primary dark:text-[#E8601C] group-hover:bg-primary dark:group-hover:bg-[#E8601C] group-hover:text-white dark:group-hover:text-white transition-colors">
                                <Calendar className="h-6 w-6" />
                            </div>
                            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded-lg">
                                Recent
                            </span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{it.thisWeek}</p>
                            <h3 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{globalStats.thisWeek}</h3>
                        </div>
                    </div>

                    {/* Assigned */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between min-h-[140px]">
                        <div className="flex items-center justify-between mb-4">
                            <div className="h-12 w-12 rounded-2xl bg-blue-50 dark:bg-[#E8601C]/10 flex items-center justify-center text-primary dark:text-[#E8601C] group-hover:bg-primary dark:group-hover:bg-[#E8601C] group-hover:text-white dark:group-hover:text-white transition-colors">
                                <UserCheck className="h-6 w-6" />
                            </div>
                            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded-lg">
                                Staff
                            </span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{it.assigned}</p>
                            <div className="flex items-baseline gap-2 mt-1">
                                <h3 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{globalStats.assigned}</h3>
                                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase">
                                    / {globalStats.total}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Approaching Deadline */}
                    <div className={`p-6 rounded-3xl border shadow-sm hover:shadow-md transition-all group flex flex-col justify-between min-h-[140px] ${globalStats.approaching > 0
                        ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                        }`}>
                        <div className="flex items-center justify-between mb-4">
                            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-colors ${globalStats.approaching > 0
                                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                                : 'bg-blue-50 dark:bg-[#E8601C]/10 text-primary dark:text-[#E8601C] group-hover:bg-primary dark:group-hover:bg-[#E8601C] group-hover:text-white dark:group-hover:text-white'
                                }`}>
                                <AlertTriangle className="h-6 w-6" />
                            </div>
                            {globalStats.approaching > 0 && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-100/50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                    </span>
                                    Alert
                                </div>
                            )}
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{it.approachingDeadline}</p>
                            <h3 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{globalStats.approaching}</h3>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter & Search */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                <div className="flex flex-col lg:flex-row items-stretch lg:items-end gap-4 lg:gap-6">
                    <div className="w-full lg:max-w-md space-y-2">
                        <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                            <Search className="h-3 w-3" />
                            Quick Search
                        </Label>
                        <div className="relative group">
                            <Input
                                placeholder={it.searchPlaceholder}
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                className="pl-4 pr-10 h-12 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 focus:ring-[#E8601C] focus:border-[#E8601C] rounded-2xl transition-all font-medium text-sm"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                        <div className="w-full sm:w-[320px] lg:w-[360px] space-y-2 shrink-0">
                            <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                <Package className="h-3 w-3" />
                                {it.table.productType}
                            </Label>
                            <Select value={typeFilter} onValueChange={(val) => { setTypeFilter(val || "all"); setCurrentPage(1); }}>
                                <SelectTrigger className="h-12 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm focus:ring-[#E8601C]">
                                    <SelectValue placeholder="All Types" className="truncate text-left" />
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl border-slate-200 dark:border-slate-800 min-w-[max-content]">
                                    <SelectItem value="all" className="font-bold py-2.5">All Types</SelectItem>
                                    {productTypes.map(type => (
                                        <SelectItem key={type} value={type} className="font-bold py-2.5 px-3 min-w-[max-content] pr-10">{type}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center gap-2 sm:pt-6">
                            {(searchQuery || typeFilter !== "all") && (
                                <Button
                                    variant="ghost"
                                    onClick={resetFilters}
                                    className="h-12 rounded-2xl text-slate-500 hover:text-[#E8601C] font-bold px-4"
                                >
                                    {lang === 'th' ? 'ล้างตัวกรอง' : 'Clear Filters'}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                                <TableHead className="font-bold text-xs uppercase tracking-widest py-5 px-6 text-slate-500 dark:text-slate-400">{it.table.customer}</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400">{it.table.productType}</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-widest py-5 text-center text-slate-500 dark:text-slate-400">{it.table.quantity}</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400">{it.table.price}</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400">{it.table.deadline}</TableHead>
                                <TableHead className="font-bold text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400">{it.table.assignedTo}</TableHead>
                                <TableHead className="text-right py-5 pr-6"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableSkeleton />
                            ) : paginatedRequests.length > 0 ? (
                                paginatedRequests.map((req) => {
                                    const cust = getCustomerInfo(req.customer);
                                    const worker = getWorkerInfo(req.assignedTo);
                                    const deadlineWarning = isApproachingDeadline(req.deadline);
                                    const deadlinePast = isPastDeadline(req.deadline);

                                    return (
                                        <TableRow
                                            key={req._id}
                                            className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 border-slate-100 dark:border-slate-800 transition-colors cursor-pointer"
                                            onClick={() => openDetails(req)}
                                        >
                                            <TableCell className="py-5 px-6">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-900 dark:text-white group-hover:text-[#E8601C] transition-colors">
                                                        {cust?.name || (lang === 'th' ? 'ไม่ระบุ' : 'Unknown')}
                                                    </span>
                                                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase mt-0.5">
                                                        #{req._id.slice(-6).toUpperCase()}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-5">
                                                <span className="text-[11px] font-semibold tracking-widest uppercase px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-[#1B4B9A] dark:text-blue-400">
                                                    {req.details?.type || "—"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-5 text-center">
                                                <span className="text-xl font-bold text-slate-900 dark:text-white group-hover:scale-110 inline-block transition-transform tabular-nums">
                                                    {req.details?.quantity?.toLocaleString() || 0}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-5">
                                                <span className="font-bold text-slate-600 dark:text-slate-300 text-sm tabular-nums">
                                                    {req.details?.estimatedPrice ? formatPrice(req.details.estimatedPrice) : "—"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-5">
                                                <Badge
                                                    variant="secondary"
                                                    className={`rounded-lg px-2 py-0.5 font-bold text-[10px] tracking-wider ${deadlinePast
                                                        ? "bg-red-50 dark:bg-red-900/20 text-red-600 border-red-100 dark:border-red-900/50"
                                                        : deadlineWarning
                                                            ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 border-amber-100 dark:border-amber-900/50"
                                                            : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                                        }`}
                                                >
                                                    {formatDate(req.deadline)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-5">
                                                {worker ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-7 w-7 rounded-full bg-[#1B4B9A]/10 dark:bg-blue-900/30 flex items-center justify-center text-[10px] font-semibold text-[#1B4B9A] dark:text-blue-400">
                                                            {worker.name.substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{worker.name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic font-medium">
                                                        {lang === 'th' ? 'ยังไม่มอบหมาย' : 'Unassigned'}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-5 pr-6 text-right" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => openDetails(req)}
                                                    className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                                >
                                                    <MoreHorizontal className="h-5 w-5" />
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="h-16 w-16 rounded-3xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-700">
                                                <ClipboardList className="h-8 w-8" />
                                            </div>
                                            <p className="text-slate-500 dark:text-slate-400 font-bold tracking-tight">{it.table.noData}</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            Page {currentPage} of {totalPages}
                        </span>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => prev - 1)}
                                className="h-9 px-3 rounded-xl border-slate-200 dark:border-slate-800 font-bold"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className="flex gap-1">
                                {[...Array(totalPages)].map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setCurrentPage(i + 1)}
                                        className={`h-9 w-9 rounded-xl flex items-center justify-center text-xs font-bold transition-all ${currentPage === i + 1
                                            ? "bg-[#E8601C] text-white shadow-lg shadow-orange-500/20"
                                            : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                                            }`}
                                    >
                                        {i + 1}
                                    </button>
                                ))}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(prev => prev + 1)}
                                className="h-9 px-3 rounded-xl border-slate-200 dark:border-slate-800 font-bold"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Detail Side Panel */}
            <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <SheetContent className="sm:max-w-md border-l border-slate-200 dark:border-slate-800 p-0 overflow-y-auto bg-slate-50 dark:bg-slate-950 shadow-2xl">
                    {selectedRequest && (() => {
                        const cust = getCustomerInfo(selectedRequest.customer);
                        const worker = getWorkerInfo(selectedRequest.assignedTo);
                        const deadlinePast = isPastDeadline(selectedRequest.deadline);

                        return (
                            <div className="flex flex-col h-full">
                                {/* Panel Header */}
                                <div className="p-8 pt-14 pb-8 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 relative">

                                    <div className="space-y-4 relative z-10">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="rounded-md px-2 py-0 text-[9px] font-bold uppercase tracking-tighter border-slate-200 dark:border-slate-700 text-slate-400">
                                                #{selectedRequest._id.slice(-6).toUpperCase()}
                                            </Badge>
                                            {deadlinePast && (
                                                <Badge className="bg-red-500 text-white text-[9px] font-bold rounded-md border-none">
                                                    {lang === 'th' ? 'เลยกำหนด' : 'Overdue'}
                                                </Badge>
                                            )}
                                        </div>
                                        <div>
                                            <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
                                                {cust?.name || (lang === 'th' ? 'ไม่ระบุลูกค้า' : 'Unknown Customer')}
                                            </h2>
                                            {cust?.phone && (
                                                <p className="text-sm font-bold text-slate-400 mt-1">{cust.phone}</p>
                                            )}
                                        </div>

                                        {/* Product Details Card */}
                                        <div className="p-6 rounded-3xl mt-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 flex items-center justify-between">
                                            <div>
                                                <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-500 mb-1 block">
                                                    {it.table.productType}
                                                </span>
                                                <span className="text-lg font-bold text-[#1B4B9A] dark:text-blue-400">
                                                    {selectedRequest.details?.type || "—"}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-500 mb-1 block">
                                                    {it.table.quantity}
                                                </span>
                                                <span className="text-3xl font-bold text-[#1B4B9A] dark:text-blue-400 tabular-nums">
                                                    {selectedRequest.details?.quantity?.toLocaleString() || 0}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-8 space-y-8">
                                    {/* Order Info */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <DollarSign className="h-4 w-4 text-[#E8601C]" />
                                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">{it.detail.orderInfo}</h3>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">{it.table.price}</p>
                                                <p className="text-sm font-bold text-slate-900 dark:text-white">
                                                    {selectedRequest.details?.estimatedPrice ? formatPrice(selectedRequest.details.estimatedPrice) : "—"}
                                                </p>
                                            </div>
                                            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">{it.table.assignedTo}</p>
                                                <p className="text-sm font-bold text-slate-900 dark:text-white">
                                                    {worker?.name || (lang === 'th' ? 'ยังไม่มอบหมาย' : 'Unassigned')}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                            <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1 flex items-center gap-1">
                                                <MapPin className="h-3 w-3" />
                                                {it.detail.deliveryTo}
                                            </p>
                                            <p className="text-sm font-bold text-slate-900 dark:text-white">
                                                {selectedRequest.deliveryLocation || "—"}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Timeline */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <CalendarClock className="h-4 w-4 text-[#E8601C]" />
                                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">{it.detail.timeline}</h3>
                                        </div>
                                        <div className="space-y-3">
                                            <div className={`bg-white dark:bg-slate-900 p-4 rounded-2xl border shadow-sm ${deadlinePast
                                                ? 'border-red-200 dark:border-red-900/50'
                                                : 'border-slate-100 dark:border-slate-800'
                                                }`}>
                                                <p className={`text-[10px] font-semibold uppercase mb-1 flex items-center gap-1 ${deadlinePast ? 'text-red-500' : 'text-slate-400'}`}>
                                                    <Clock className="h-3 w-3" />
                                                    {it.detail.deadlineLabel}
                                                </p>
                                                <p className={`text-sm font-bold ${deadlinePast ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>
                                                    {formatDate(selectedRequest.deadline)}
                                                </p>
                                            </div>
                                            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1 flex items-center gap-1">
                                                    <Truck className="h-3 w-3" />
                                                    {it.detail.expectedDelivery}
                                                </p>
                                                <p className="text-sm font-bold text-slate-900 dark:text-white">
                                                    {formatDate(selectedRequest.expectedDeliveryDate)}
                                                </p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">{it.detail.createdAt}</p>
                                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                                        {formatDate(selectedRequest.createdAt)}
                                                    </p>
                                                </div>
                                                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">{it.detail.updatedAt}</p>
                                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                                        {formatDate(selectedRequest.updatedAt)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Panes */}
                                <div className="px-8 pb-8 space-y-4">
                                    <div className="flex items-center gap-2">
                                        <Package className="h-4 w-4 text-[#E8601C]" />
                                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">
                                            {lang === 'th' ? 'กระจกแต่ละชิ้น' : 'Individual Panes'}
                                        </h3>
                                        {detailPanes.length > 0 && (
                                            <span className="ml-auto text-xs font-bold text-slate-400">{detailPanes.length} {lang === 'th' ? 'ชิ้น' : 'pcs'}</span>
                                        )}
                                    </div>
                                    {panesLoading ? (
                                        <div className="space-y-2">
                                            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-2xl" />)}
                                        </div>
                                    ) : detailPanes.length === 0 ? (
                                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
                                            <p className="text-xs text-slate-400">{lang === 'th' ? 'ยังไม่มีกระจก' : 'No panes yet'}</p>
                                        </div>
                                    ) : (() => {
                                        const PANE_PEEK = 3;
                                        const visible = showAllPanes ? detailPanes : detailPanes.slice(0, PANE_PEEK);
                                        const hasMore = detailPanes.length > PANE_PEEK;
                                        return (
                                        <div className="space-y-2">
                                            {visible.map(pane => {
                                                const stCfg = {
                                                    pending:     { label: lang === 'th' ? 'รอ' : 'Pending',       dot: 'bg-amber-400' },
                                                    in_progress: { label: lang === 'th' ? 'กำลังทำ' : 'In Progress', dot: 'bg-blue-500' },
                                                    completed:   { label: lang === 'th' ? 'เสร็จ' : 'Done',        dot: 'bg-green-500' },
                                                }[pane.currentStatus] ?? { label: pane.currentStatus, dot: 'bg-gray-400' };
                                                return (
                                                    <div key={pane._id} className="bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">{pane.paneNumber}</span>
                                                                <span className="flex items-center gap-1 text-[10px] font-medium text-slate-500">
                                                                    <span className={`h-1.5 w-1.5 rounded-full ${stCfg.dot}`} />
                                                                    {stCfg.label}
                                                                </span>
                                                            </div>
                                                            {pane.dimensions && (pane.dimensions.width > 0 || pane.dimensions.height > 0) && (
                                                                <p className="text-[10px] text-slate-400 mt-0.5">
                                                                    {pane.dimensions.width}×{pane.dimensions.height}
                                                                    {pane.dimensions.thickness > 0 && ` (${pane.dimensions.thickness}mm)`}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] text-slate-400 font-medium shrink-0">{pane.currentStation}</span>
                                                    </div>
                                                );
                                            })}
                                            {hasMore && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAllPanes(v => !v)}
                                                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-2xl text-xs font-bold text-[#1B4B9A] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
                                                >
                                                    {showAllPanes ? (
                                                        <><ChevronDown className="h-3.5 w-3.5" /> {lang === 'th' ? 'แสดงน้อยลง' : 'Show less'}</>
                                                    ) : (
                                                        <><ChevronRight className="h-3.5 w-3.5" /> {lang === 'th' ? `แสดงทั้งหมด (${detailPanes.length} ชิ้น)` : `Show all (${detailPanes.length} pcs)`}</>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                        );
                                    })()}
                                </div>

                                {/* Panel Footer */}
                                <div className="mt-auto p-8 pt-0 grid grid-cols-2 gap-3">
                                    <Button
                                        onClick={() => handleDelete(selectedRequest._id)}
                                        variant="outline"
                                        className="rounded-2xl h-14 border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 font-bold tracking-tight"
                                    >
                                        <Trash2 className="h-5 w-5" />
                                    </Button>
                                    <Button
                                        onClick={() => openEditDialog(selectedRequest)}
                                        className="rounded-2xl h-14 bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-[#E8601C] dark:hover:bg-[#E8601C] hover:text-white transition-all font-bold tracking-tight"
                                    >
                                        <Edit3 className="mr-2 h-5 w-5" />
                                        {it.detail.edit}
                                    </Button>
                                </div>
                            </div>
                        );
                    })()}
                </SheetContent>
            </Sheet>

            {/* Create/Edit Dialog */}
            <Dialog open={isFormOpen} onOpenChange={(open) => {
                setIsFormOpen(open);
                if (!open) resetForm();
            }}>
                <DialogContent className="sm:max-w-[560px] border-slate-200 dark:border-slate-800 rounded-3xl p-8 bg-white dark:bg-slate-950 max-h-[90vh] overflow-y-auto">
                    <DialogHeader className="mb-6">
                        <DialogTitle className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                            {isEditing ? it.form.editTitle : it.newRequest}
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 font-medium">
                            {isEditing ? it.form.editDesc : it.form.createDesc}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-8">
                        {/* Customer Selection */}
                        <div className="space-y-3">
                            <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Users className="h-3 w-3" />
                                {it.form.selectCustomer} *
                            </Label>
                            <Select
                                value={formData.customer}
                                onValueChange={(val) => setFormData({ ...formData, customer: val || "" })}
                            >
                                <SelectTrigger className="h-14 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-slate-900 dark:text-white px-5 focus:ring-[#E8601C] focus:border-[#E8601C]">
                                    <SelectValue placeholder={lang === 'th' ? 'เลือกลูกค้า...' : 'Select a customer...'}>
                                        {(value: string | null) => {
                                            if (!value) return <span className="text-muted-foreground">{lang === 'th' ? 'เลือกลูกค้า...' : 'Select a customer...'}</span>;
                                            const c = customers.find(x => x._id === value);
                                            return c?.name || value;
                                        }}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl border-slate-200 dark:border-slate-800 p-2">
                                    {customers.map(c => (
                                        <SelectItem
                                            key={c._id}
                                            value={c._id}
                                            label={c.name}
                                            className="rounded-xl py-3 font-bold focus:bg-[#E8601C] focus:text-white"
                                        >
                                            <div className="flex flex-col">
                                                <span>{c.name}</span>
                                                {c.phone && <span className="text-[10px] opacity-70">{c.phone}</span>}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Product Details */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="col-span-1 space-y-3">
                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                    {it.form.productType} *
                                </Label>
                                <Input
                                    placeholder="e.g. Tempered"
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    className="h-14 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-slate-900 dark:text-white px-5 focus:ring-[#E8601C]"
                                />
                            </div>
                            <div className="space-y-3">
                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                    {it.form.quantity}
                                </Label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={formData.quantity}
                                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                                    className="h-14 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-slate-900 dark:text-white px-5 focus:ring-[#E8601C]"
                                />
                            </div>
                            <div className="space-y-3">
                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                    {it.form.estimatedPrice}
                                </Label>
                                <Input
                                    type="number"
                                    min={0}
                                    value={formData.estimatedPrice}
                                    onChange={(e) => setFormData({ ...formData, estimatedPrice: parseFloat(e.target.value) || 0 })}
                                    className="h-14 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-slate-900 dark:text-white px-5 focus:ring-[#E8601C]"
                                />
                            </div>
                        </div>

                        {/* Delivery Location */}
                        <div className="space-y-3">
                            <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <MapPin className="h-3 w-3" />
                                {it.form.deliveryLocation}
                            </Label>
                            <Input
                                placeholder={lang === 'th' ? 'เช่น บางนา, กรุงเทพฯ' : 'e.g. Bangna, Bangkok'}
                                value={formData.deliveryLocation}
                                onChange={(e) => setFormData({ ...formData, deliveryLocation: e.target.value })}
                                className="h-14 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-slate-900 dark:text-white px-5 focus:ring-[#E8601C]"
                            />
                        </div>

                        {/* Dates */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                    {it.form.deadline}
                                </Label>
                                <Input
                                    type="date"
                                    value={formData.deadline}
                                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                                    className="h-14 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-slate-900 dark:text-white px-5 focus:ring-[#E8601C]"
                                />
                            </div>
                            <div className="space-y-3">
                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                    {it.form.expectedDelivery}
                                </Label>
                                <Input
                                    type="date"
                                    value={formData.expectedDeliveryDate}
                                    onChange={(e) => setFormData({ ...formData, expectedDeliveryDate: e.target.value })}
                                    className="h-14 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-slate-900 dark:text-white px-5 focus:ring-[#E8601C]"
                                />
                            </div>
                        </div>

                        {/* Assign To */}
                        <div className="space-y-3">
                            <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <User className="h-3 w-3" />
                                {it.form.assignTo}
                            </Label>
                            <Select
                                value={formData.assignedTo}
                                onValueChange={(val) => setFormData({ ...formData, assignedTo: val || "" })}
                            >
                                <SelectTrigger className="h-14 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-slate-900 dark:text-white px-5 focus:ring-[#E8601C]">
                                    <SelectValue placeholder={lang === 'th' ? 'เลือกผู้รับผิดชอบ...' : 'Select a worker...'}>
                                        {(value: string | null) => {
                                            if (!value) return <span className="text-muted-foreground">{lang === 'th' ? 'เลือกผู้รับผิดชอบ...' : 'Select a worker...'}</span>;
                                            const w = workers.find(x => x._id === value);
                                            return w?.name || value;
                                        }}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl border-slate-200 dark:border-slate-800 p-2">
                                    {workers.map(w => (
                                        <SelectItem
                                            key={w._id}
                                            value={w._id}
                                            label={w.name}
                                            className="rounded-xl py-3 font-bold focus:bg-[#E8601C] focus:text-white"
                                        >
                                            <div className="flex flex-col">
                                                <span>{w.name}</span>
                                                <span className="text-[10px] opacity-70 capitalize">{w.position} • {w.role}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800">
                        <Button
                            variant="ghost"
                            onClick={() => setIsFormOpen(false)}
                            className="rounded-2xl h-14 font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white px-8"
                        >
                            {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !formData.customer || !formData.type}
                            className={`rounded-2xl h-14 min-w-[160px] font-bold tracking-tight text-white transition-all shadow-xl ${isSubmitting ? "bg-slate-400" : "bg-slate-900 dark:bg-white dark:text-slate-900 hover:bg-[#E8601C] dark:hover:bg-[#E8601C] dark:hover:text-white"
                                }`}
                        >
                            {isSubmitting
                                ? (lang === 'th' ? 'กำลังดำเนินการ...' : 'Processing...')
                                : isEditing
                                    ? (lang === 'th' ? 'บันทึกการแก้ไข' : 'Save Changes')
                                    : (lang === 'th' ? 'สร้างคำสั่งซื้อ' : 'Create Request')
                            }
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteTargetId} onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}>
                <DialogContent className="sm:max-w-[360px] border-slate-200 dark:border-slate-800 rounded-2xl p-0">
                    <div className="p-6">
                        <DialogHeader>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="h-10 w-10 rounded-xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0">
                                    <Trash2 className="h-5 w-5 text-red-500" />
                                </div>
                                <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">
                                    {lang === 'th' ? 'ยืนยันการลบ' : 'Confirm Delete'}
                                </DialogTitle>
                            </div>
                            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                {lang === 'th'
                                    ? 'ลบคำสั่งซื้อนี้ออกจากระบบ? การกระทำนี้ไม่สามารถย้อนกลับได้'
                                    : 'Remove this order request? This action cannot be undone.'}
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="px-6 pb-6 flex gap-3">
                        <Button variant="outline" className="flex-1 rounded-xl h-11 font-bold" onClick={() => setDeleteTargetId(null)}>
                            {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                        </Button>
                        <Button className="flex-1 rounded-xl h-11 font-bold bg-red-600 hover:bg-red-700 text-white" onClick={executeDelete}>
                            <Trash2 className="h-4 w-4 mr-1.5" />
                            {lang === 'th' ? 'ลบ' : 'Delete'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
