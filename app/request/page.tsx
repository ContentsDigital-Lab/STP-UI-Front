"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
    Plus,
    Search,
    ClipboardList,
    Calendar,
    MapPin,
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
    Truck,
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
import { getStationName } from "@/lib/utils/station-helpers";
import { getRoleName } from "@/lib/auth/role-utils";
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
                req.requestNumber?.toLowerCase().includes(searchLower) ||
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
                    <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
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
        <div className="space-y-6 max-w-[1440px] mx-auto w-full">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        {it.title}
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {it.subtitle}
                    </p>
                </div>
                <Link href="/request/create">
                    <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl h-10 px-5 text-sm">
                        <Plus className="h-4 w-4" />
                        {it.newRequest}
                    </Button>
                </Link>
            </div>

            {/* Stat Cards */}
            {!isLoading && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                        { label: it.totalRequests, value: globalStats.total, icon: ClipboardList, accent: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10" },
                        { label: it.thisWeek, value: globalStats.thisWeek, icon: Calendar, accent: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10" },
                        { label: it.assigned, value: `${globalStats.assigned}/${globalStats.total}`, icon: UserCheck, accent: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10" },
                        { label: it.approachingDeadline, value: globalStats.approaching, icon: AlertTriangle, accent: globalStats.approaching > 0 ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10" : "text-slate-400 bg-slate-100 dark:bg-slate-800", danger: globalStats.approaching > 0 },
                    ].map((s, i) => (
                        <div key={i} className={`bg-white dark:bg-slate-900 rounded-xl border p-4 sm:p-5 ${s.danger ? "border-amber-200 dark:border-amber-900/40" : "border-slate-200/60 dark:border-slate-800"}`}>
                            <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-3 ${s.accent}`}>
                                <s.icon className="h-[18px] w-[18px]" />
                            </div>
                            <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-0.5">{s.label}</p>
                            <p className={`text-2xl sm:text-3xl font-bold tracking-tight ${s.danger ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"}`}>{s.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Filter & Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder={it.searchPlaceholder}
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className="pl-9 pr-9 h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl text-sm"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                <Select value={typeFilter} onValueChange={(val) => { setTypeFilter(val || "all"); setCurrentPage(1); }}>
                    <SelectTrigger className="h-10 w-full sm:w-48 rounded-xl text-sm">
                        <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {productTypes.map(type => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {(searchQuery || typeFilter !== "all") && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetFilters}
                        className="h-10 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 text-sm shrink-0"
                    >
                        {lang === 'th' ? 'ล้างตัวกรอง' : 'Clear'}
                    </Button>
                )}
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-100 dark:border-slate-800 hover:bg-transparent">
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 px-4 h-10">{lang === 'th' ? 'เลขที่' : 'Req #'}</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">{it.table.customer}</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">{it.table.productType}</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 text-center h-10">{it.table.quantity}</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">{it.table.price}</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">{it.table.deadline}</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">{it.table.assignedTo}</TableHead>
                                <TableHead className="py-3 pr-4 h-10 w-10"></TableHead>
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
                                            className="group hover:bg-slate-50/60 dark:hover:bg-slate-800/40 border-slate-100 dark:border-slate-800 cursor-pointer"
                                            onClick={() => openDetails(req)}
                                        >
                                            <TableCell className="py-3.5 px-4">
                                                <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
                                                    {req.requestNumber || `#${req._id.slice(-6).toUpperCase()}`}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-3.5">
                                                <span className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                    {cust?.name || (lang === 'th' ? 'ไม่ระบุ' : 'Unknown')}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-3.5">
                                                <span className="text-xs font-medium px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                                    {req.details?.type || "—"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-3.5 text-center">
                                                <span className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                                                    {req.details?.quantity?.toLocaleString() || 0}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-3.5">
                                                <span className="text-sm text-slate-600 dark:text-slate-300 tabular-nums">
                                                    {req.details?.estimatedPrice ? formatPrice(req.details.estimatedPrice) : "—"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-3.5">
                                                <span className={`text-sm ${deadlinePast ? "text-red-600 dark:text-red-400 font-medium" : deadlineWarning ? "text-amber-600 dark:text-amber-400 font-medium" : "text-slate-600 dark:text-slate-300"}`}>
                                                    {formatDate(req.deadline)}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-3.5">
                                                {worker ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-6 w-6 rounded-md bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                                                            {worker.name.substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <span className="text-sm text-slate-600 dark:text-slate-300">{worker.name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic">
                                                        {lang === 'th' ? 'ยังไม่มอบหมาย' : 'Unassigned'}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-3.5 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => openDetails(req)}
                                                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                                >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-20 text-center border-none">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500">
                                                <ClipboardList className="h-6 w-6" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{it.table.noData}</p>
                                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                                    {lang === 'th' ? 'ลองสร้างคำสั่งซื้อใหม่ หรือเช็คตัวกรอง' : 'Try creating a new request or check your filters'}
                                                </p>
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-xs text-slate-400">
                            {currentPage} / {totalPages}
                        </span>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => prev - 1)}
                                className="h-8 w-8 p-0 rounded-lg"
                            >
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
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(prev => prev + 1)}
                                className="h-8 w-8 p-0 rounded-lg"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Detail Side Panel */}
            <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <SheetContent className="sm:max-w-md border-l border-slate-200 dark:border-slate-800 p-0 overflow-y-auto bg-white dark:bg-slate-950">
                    {selectedRequest && (() => {
                        const cust = getCustomerInfo(selectedRequest.customer);
                        const worker = getWorkerInfo(selectedRequest.assignedTo);
                        const deadlinePast = isPastDeadline(selectedRequest.deadline);

                        return (
                            <div className="flex flex-col h-full">
                                {/* Panel Header */}
                                <div className="p-6 pt-12 pb-6 border-b border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-xs text-slate-400 font-mono">{selectedRequest.requestNumber || `#${selectedRequest._id.slice(-6).toUpperCase()}`}</span>
                                        {deadlinePast && (
                                            <Badge className="bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-medium rounded-md border-none">
                                                {lang === 'th' ? 'เลยกำหนด' : 'Overdue'}
                                            </Badge>
                                        )}
                                    </div>
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                        {cust?.name || (lang === 'th' ? 'ไม่ระบุลูกค้า' : 'Unknown Customer')}
                                    </h2>
                                    {cust?.phone && (
                                        <p className="text-sm text-slate-400 mt-0.5">{cust.phone}</p>
                                    )}

                                    <div className="mt-4 p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-between">
                                        <div>
                                            <p className="text-[11px] text-blue-500 dark:text-blue-400 mb-0.5">{it.table.productType}</p>
                                            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">{selectedRequest.details?.type || "—"}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[11px] text-blue-500 dark:text-blue-400 mb-0.5">{it.table.quantity}</p>
                                            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 tabular-nums">{selectedRequest.details?.quantity?.toLocaleString() || 0}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 space-y-6 flex-1">
                                    {/* Order Info */}
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">{it.detail.orderInfo}</h3>
                                        <div className="grid grid-cols-2 gap-2.5">
                                            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                                                <p className="text-[11px] text-slate-400 mb-0.5">{it.table.price}</p>
                                                <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                    {selectedRequest.details?.estimatedPrice ? formatPrice(selectedRequest.details.estimatedPrice) : "—"}
                                                </p>
                                            </div>
                                            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                                                <p className="text-[11px] text-slate-400 mb-0.5">{it.table.assignedTo}</p>
                                                <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                    {worker?.name || (lang === 'th' ? 'ยังไม่มอบหมาย' : 'Unassigned')}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                                            <p className="text-[11px] text-slate-400 mb-0.5 flex items-center gap-1">
                                                <MapPin className="h-3 w-3" />
                                                {it.detail.deliveryTo}
                                            </p>
                                            <p className="text-sm font-medium text-slate-900 dark:text-white">{selectedRequest.deliveryLocation || "—"}</p>
                                        </div>
                                    </div>

                                    {/* Timeline */}
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">{it.detail.timeline}</h3>
                                        <div className="space-y-2.5">
                                            <div className={`p-3 rounded-lg ${deadlinePast ? 'bg-red-50 dark:bg-red-500/10' : 'bg-slate-50 dark:bg-slate-900'}`}>
                                                <p className={`text-[11px] mb-0.5 flex items-center gap-1 ${deadlinePast ? 'text-red-500' : 'text-slate-400'}`}>
                                                    <Clock className="h-3 w-3" />
                                                    {it.detail.deadlineLabel}
                                                </p>
                                                <p className={`text-sm font-medium ${deadlinePast ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>
                                                    {formatDate(selectedRequest.deadline)}
                                                </p>
                                            </div>
                                            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                                                <p className="text-[11px] text-slate-400 mb-0.5 flex items-center gap-1">
                                                    <Truck className="h-3 w-3" />
                                                    {it.detail.expectedDelivery}
                                                </p>
                                                <p className="text-sm font-medium text-slate-900 dark:text-white">{formatDate(selectedRequest.expectedDeliveryDate)}</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2.5">
                                                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                                                    <p className="text-[11px] text-slate-400 mb-0.5">{it.detail.createdAt}</p>
                                                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{formatDate(selectedRequest.createdAt)}</p>
                                                </div>
                                                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                                                    <p className="text-[11px] text-slate-400 mb-0.5">{it.detail.updatedAt}</p>
                                                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{formatDate(selectedRequest.updatedAt)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Panes */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                                {lang === 'th' ? 'กระจกแต่ละชิ้น' : 'Individual Panes'}
                                            </h3>
                                            {detailPanes.length > 0 && (
                                                <span className="text-xs text-slate-400">{detailPanes.length} {lang === 'th' ? 'ชิ้น' : 'pcs'}</span>
                                            )}
                                        </div>
                                        {panesLoading ? (
                                            <div className="space-y-2">
                                                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
                                            </div>
                                        ) : detailPanes.length === 0 ? (
                                            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 text-center">
                                                <p className="text-xs text-slate-400">{lang === 'th' ? 'ยังไม่มีกระจก' : 'No panes yet'}</p>
                                            </div>
                                        ) : (() => {
                                            const PANE_PEEK = 3;
                                            const visible = showAllPanes ? detailPanes : detailPanes.slice(0, PANE_PEEK);
                                            const hasMore = detailPanes.length > PANE_PEEK;
                                            return (
                                            <div className="space-y-1.5">
                                                {visible.map(pane => {
                                                    const stCfg = ({
                                                        pending:            { label: lang === 'th' ? 'รอ' : 'Pending',             dot: 'bg-amber-400' },
                                                        in_progress:        { label: lang === 'th' ? 'กำลังทำ' : 'In Progress',     dot: 'bg-blue-500' },
                                                        completed:          { label: lang === 'th' ? 'เสร็จ' : 'Done',             dot: 'bg-green-500' },
                                                        awaiting_scan_out:  { label: lang === 'th' ? 'รอสแกนออก' : 'Awaiting Out', dot: 'bg-amber-500' },
                                                    } as Record<string, { label: string; dot: string }>)[pane.currentStatus] ?? { label: pane.currentStatus, dot: 'bg-gray-400' };
                                                    return (
                                                        <div key={pane._id} className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 flex items-center gap-3">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs font-mono font-medium text-slate-900 dark:text-white">{pane.paneNumber}</span>
                                                                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
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
                                                            <span className="text-[10px] text-slate-400 shrink-0">{getStationName(pane.currentStation)}</span>
                                                        </div>
                                                    );
                                                })}
                                                {hasMore && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowAllPanes(v => !v)}
                                                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
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
                                </div>

                                {/* Panel Footer */}
                                <div className="p-6 pt-0 grid grid-cols-2 gap-2.5 mt-auto">
                                    <Button
                                        onClick={() => handleDelete(selectedRequest._id)}
                                        variant="outline"
                                        className="rounded-xl h-11 border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 font-medium"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        onClick={() => openEditDialog(selectedRequest)}
                                        className="rounded-xl h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                                    >
                                        <Edit3 className="mr-2 h-4 w-4" />
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
                <DialogContent className="sm:max-w-[520px] rounded-xl p-6 max-h-[90vh] overflow-y-auto">
                    <DialogHeader className="mb-4">
                        <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">
                            {isEditing ? it.form.editTitle : it.newRequest}
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-500">
                            {isEditing ? it.form.editDesc : it.form.createDesc}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5">
                        {/* Customer Selection */}
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                {it.form.selectCustomer} <span className="text-red-400">*</span>
                            </Label>
                            <Select
                                value={formData.customer}
                                onValueChange={(val) => setFormData({ ...formData, customer: val || "" })}
                            >
                                <SelectTrigger className="h-10 rounded-xl">
                                    <SelectValue placeholder={lang === 'th' ? 'เลือกลูกค้า...' : 'Select a customer...'}>
                                        {(value: string | null) => {
                                            if (!value) return <span className="text-muted-foreground">{lang === 'th' ? 'เลือกลูกค้า...' : 'Select a customer...'}</span>;
                                            const c = customers.find(x => x._id === value);
                                            return c?.name || value;
                                        }}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {customers.map(c => (
                                        <SelectItem key={c._id} value={c._id} label={c.name}>
                                            <div className="flex flex-col">
                                                <span>{c.name}</span>
                                                {c.phone && <span className="text-[11px] text-slate-400">{c.phone}</span>}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Product Details */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {it.form.productType} <span className="text-red-400">*</span>
                                </Label>
                                <Input
                                    placeholder="e.g. Tempered"
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    className="h-10 rounded-xl"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">{it.form.quantity}</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={formData.quantity}
                                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                                    className="h-10 rounded-xl"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">{it.form.estimatedPrice}</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    value={formData.estimatedPrice}
                                    onChange={(e) => setFormData({ ...formData, estimatedPrice: parseFloat(e.target.value) || 0 })}
                                    className="h-10 rounded-xl"
                                />
                            </div>
                        </div>

                        {/* Delivery Location */}
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">{it.form.deliveryLocation}</Label>
                            <Input
                                placeholder={lang === 'th' ? 'เช่น บางนา, กรุงเทพฯ' : 'e.g. Bangna, Bangkok'}
                                value={formData.deliveryLocation}
                                onChange={(e) => setFormData({ ...formData, deliveryLocation: e.target.value })}
                                className="h-10 rounded-xl"
                            />
                        </div>

                        {/* Dates */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">{it.form.deadline}</Label>
                                <Input
                                    type="date"
                                    value={formData.deadline}
                                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                                    className="h-10 rounded-xl"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">{it.form.expectedDelivery}</Label>
                                <Input
                                    type="date"
                                    value={formData.expectedDeliveryDate}
                                    onChange={(e) => setFormData({ ...formData, expectedDeliveryDate: e.target.value })}
                                    className="h-10 rounded-xl"
                                />
                            </div>
                        </div>

                        {/* Assign To */}
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">{it.form.assignTo}</Label>
                            <Select
                                value={formData.assignedTo}
                                onValueChange={(val) => setFormData({ ...formData, assignedTo: val || "" })}
                            >
                                <SelectTrigger className="h-10 rounded-xl">
                                    <SelectValue placeholder={lang === 'th' ? 'เลือกผู้รับผิดชอบ...' : 'Select a worker...'}>
                                        {(value: string | null) => {
                                            if (!value) return <span className="text-muted-foreground">{lang === 'th' ? 'เลือกผู้รับผิดชอบ...' : 'Select a worker...'}</span>;
                                            const w = workers.find(x => x._id === value);
                                            return w?.name || value;
                                        }}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {workers.map(w => (
                                        <SelectItem key={w._id} value={w._id} label={w.name}>
                                            <div className="flex flex-col">
                                                <span>{w.name}</span>
                                                <span className="text-[11px] text-slate-400 capitalize">{w.position} • {getRoleName(w.role)}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <Button
                            variant="ghost"
                            onClick={() => setIsFormOpen(false)}
                            className="rounded-xl h-10 text-sm"
                        >
                            {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !formData.customer || !formData.type}
                            className="rounded-xl h-10 min-w-[140px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
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
                <DialogContent className="sm:max-w-[360px] rounded-xl p-6">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="h-9 w-9 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center shrink-0">
                                <Trash2 className="h-4 w-4 text-red-500" />
                            </div>
                            <DialogTitle className="text-base font-semibold text-slate-900 dark:text-white">
                                {lang === 'th' ? 'ยืนยันการลบ' : 'Confirm Delete'}
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-sm text-slate-500">
                            {lang === 'th'
                                ? 'ลบคำสั่งซื้อนี้ออกจากระบบ? การกระทำนี้ไม่สามารถย้อนกลับได้'
                                : 'Remove this order request? This action cannot be undone.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex gap-2.5 mt-4">
                        <Button variant="outline" className="flex-1 rounded-xl h-10 text-sm" onClick={() => setDeleteTargetId(null)}>
                            {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                        </Button>
                        <Button className="flex-1 rounded-xl h-10 text-sm bg-red-600 hover:bg-red-700 text-white" onClick={executeDelete}>
                            <Trash2 className="h-4 w-4 mr-1.5" />
                            {lang === 'th' ? 'ลบ' : 'Delete'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
