"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
    Ban,
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
import { getStationName, formatPaneDimWithUnit } from "@/lib/utils/station-helpers";
import { getRoleName } from "@/lib/auth/role-utils";
import { toast } from "sonner";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { useAuth } from "@/lib/auth/auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { useWebSocket } from "@/lib/hooks/use-socket";

const ITEMS_PER_PAGE = 10;

export default function OrderRequestsPage() {
    const { t, lang } = useLanguage();
    const router = useRouter();
    const it = t.order_requests;
    
    const { user } = useAuth();
    const canCreate = hasPermission(user, "orders:create");
    const canManage = hasPermission(user, "orders:manage");

    const [isLoading, setIsLoading] = useState(true);
    const [requests, setRequests] = useState<OrderRequest[]>([]);
    const [allRequests, setAllRequests] = useState<OrderRequest[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [workers, setWorkers] = useState<Worker[]>([]);

    const [selectedRequest, setSelectedRequest] = useState<OrderRequest | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [detailPanes, setDetailPanes] = useState<Pane[]>([]);
    const [panesLoading, setPanesLoading] = useState(false);
    const [showAllPanes, setShowAllPanes] = useState(false);
    // Panes pagination inside detail panel
    const [panesTotal, setPanesTotal] = useState(0);
    const [visibleCount, setVisibleCount] = useState(100);
    const [isLoadingMorePanes, setIsLoadingMorePanes] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCard, setActiveCard] = useState<string>("");
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [customerFilter, setCustomerFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string>("all");

    // Server-side pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [serverTotal, setServerTotal] = useState(0);
    const [serverTotalPages, setServerTotalPages] = useState(1);

    // Create/Edit Dialog
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
    const [cancelReason, setCancelReason] = useState("");
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [originalDeadline, setOriginalDeadline] = useState("");
    const [deadlineChangeReason, setDeadlineChangeReason] = useState("");
    const [formData, setFormData] = useState({
        customer: "",
        referenceId: "",
        type: "",
        quantity: 1,
        estimatedPrice: 0,
        deadline: "",
        deliveryLocation: "",
        assignedTo: "",
        expectedDeliveryDate: "",
    });

    const isSearchActive = searchQuery !== "" || typeFilter !== "all" || customerFilter !== "all" || statusFilter !== "all" || activeCard !== "";

    // WebSocket
    const requestEvents = ['request:updated'];
    useWebSocket('request', requestEvents, (event: string) => {
        console.log(`[OrderRequests] Received ${event}, refreshing...`);
        fetchData(false);
    });

    useEffect(() => {
        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage]);

    const fetchData = async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        try {
            const [reqRes, custRes, workerRes] = await Promise.all([
                requestsApi.getAll({ page: currentPage, limit: ITEMS_PER_PAGE, status: statusFilter === 'all' ? undefined : statusFilter }),
                customersApi.getAll(),
                workersApi.getAll(),
            ]);
            if (reqRes.success && reqRes.data) {
                setRequests(reqRes.data);
                if (reqRes.pagination) {
                    setServerTotal(reqRes.pagination.total);
                    setServerTotalPages(reqRes.pagination.totalPages);
                }
            }
            if (custRes.success && custRes.data) setCustomers(custRes.data);
            if (workerRes.success && workerRes.data) setWorkers(workerRes.data);

            // Background fetch: get all records (up to API max 100) for stats & search
            requestsApi.getAll({ limit: 100, status: statusFilter === 'all' ? undefined : statusFilter }).then(allRes => {
                if (allRes.success && allRes.data) setAllRequests(allRes.data);
            }).catch(() => {});
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

    // Stats — computed from allRequests (full dataset) for accuracy
    const globalStats = useMemo(() => {
        const total = serverTotal || allRequests.length;

        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const thisWeek = allRequests.filter(r => new Date(r.createdAt) >= weekAgo).length;

        const assigned = allRequests.filter(r => r.assignedTo).length;

        const threeDaysFromNow = new Date(now);
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
        const approaching = allRequests.filter(r => {
            if (!r.deadline) return false;
            const dl = new Date(r.deadline);
            return dl <= threeDaysFromNow && dl >= now;
        }).length;

        return { total, thisWeek, assigned, approaching };
    }, [allRequests, serverTotal]);

    // Filter options — derived from full dataset
    const productTypes = useMemo(
        () => {
            const types = allRequests.map(r => {
                const t = r.details?.type;
                if (!t) return null;
                const pIdx = t.indexOf('(');
                return pIdx !== -1 ? t.substring(0, pIdx).trim() : t.trim();
            }).filter(Boolean);
            return Array.from(new Set(types));
        },
        [allRequests]
    );

    // When search/filter is active, search across allRequests (full dataset) with client-side pagination.
    // When no search, use server-paginated `requests` directly.
    const filteredRequests = useMemo(() => {
        if (!isSearchActive) return requests;

        return allRequests.filter(req => {
            const cust = getCustomerInfo(req.customer);
            const worker = getWorkerInfo(req.assignedTo);
            const searchLower = searchQuery.toLowerCase();

            const matchesSearch = !searchQuery ||
                req.requestNumber?.toLowerCase().includes(searchLower) ||
                cust?.name?.toLowerCase().includes(searchLower) ||
                req.deliveryLocation?.toLowerCase().includes(searchLower) ||
                req.details?.type?.toLowerCase().includes(searchLower) ||
                worker?.name?.toLowerCase().includes(searchLower);

            const reqBaseType = req.details?.type ? (req.details.type.indexOf('(') !== -1 ? req.details.type.substring(0, req.details.type.indexOf('(')).trim() : req.details.type.trim()) : "";
            const matchesType = typeFilter === "all" || reqBaseType === typeFilter;
            const matchesCustomer = customerFilter === "all" || cust?._id === customerFilter;
            const matchesStatus = statusFilter === "all" || req.status === statusFilter;

            let matchesCard = true;
            if (activeCard === "week") {
                const now = new Date();
                const weekAgo = new Date(now);
                weekAgo.setDate(weekAgo.getDate() - 7);
                matchesCard = new Date(req.createdAt) >= weekAgo;
            } else if (activeCard === "assigned") {
                matchesCard = !!req.assignedTo;
            } else if (activeCard === "deadline") {
                if (!req.deadline) matchesCard = false;
                else {
                    const dl = new Date(req.deadline);
                    const now = new Date();
                    const threeDaysFromNow = new Date(now);
                    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
                    matchesCard = dl <= threeDaysFromNow && dl >= now;
                }
            }

            return matchesSearch && matchesType && matchesCustomer && matchesStatus && matchesCard;
        });
    }, [requests, allRequests, searchQuery, typeFilter, customerFilter, statusFilter, activeCard, isSearchActive, getCustomerInfo, getWorkerInfo]);

    const totalPages = isSearchActive
        ? Math.ceil(filteredRequests.length / ITEMS_PER_PAGE)
        : serverTotalPages;
    const totalItems = isSearchActive ? filteredRequests.length : serverTotal;
    const paginatedRequests = isSearchActive
        ? filteredRequests.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
        : filteredRequests;

    const resetFilters = () => {
        setSearchQuery("");
        setTypeFilter("all");
        setCustomerFilter("all");
        setStatusFilter("all");
        setActiveCard("");
        setCurrentPage(1);
    };

    const resetForm = () => {
        setFormData({
            customer: "",
            referenceId: "",
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
        setOriginalDeadline("");
        setDeadlineChangeReason("");
    };

    const handleSubmit = async () => {
        if (!formData.customer || !formData.type) return;

        const isDeadlineChanged = isEditing && originalDeadline !== formData.deadline;
        if (isDeadlineChanged && !deadlineChangeReason.trim()) {
            toast.error(lang === 'th' ? 'กรุณาระบุเหตุผลการเลื่อนกำหนดส่ง' : 'Please provide a reason for changing the deadline');
            return;
        }

        setIsSubmitting(true);

        const payload: any = {
            details: {
                type: formData.type,
                quantity: formData.quantity,
                estimatedPrice: formData.estimatedPrice,
            },
            customer: formData.customer,
            referenceId: formData.referenceId || undefined,
            deadline: formData.deadline ? new Date(formData.deadline).toISOString() : undefined,
            deliveryLocation: formData.deliveryLocation,
            assignedTo: formData.assignedTo || undefined,
            expectedDeliveryDate: formData.expectedDeliveryDate ? new Date(formData.expectedDeliveryDate).toISOString() : undefined,
            ...(isDeadlineChanged && { deadlineChangeReason }),
        };

        try {
            if (isEditing && editId) {
                const res = await requestsApi.update(editId, payload);
                if (res.success && res.data) {
                    if (selectedRequest?._id === editId) setSelectedRequest(res.data);
                    setIsFormOpen(false);
                    resetForm();
                    fetchData(false);
                }
            } else {
                const res = await requestsApi.create(payload);
                if (res.success && res.data) {
                    setIsFormOpen(false);
                    resetForm();
                    setCurrentPage(1);
                    fetchData(false);
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
                setIsDetailOpen(false);
                setSelectedRequest(null);
                toast.success(lang === 'th' ? 'ลบคำสั่งซื้อเรียบร้อย' : 'Request deleted');
                fetchData(false);
            } else {
                toast.error(lang === 'th' ? 'ลบไม่สำเร็จ' : 'Failed to delete');
            }
        } catch (err) {
            console.error("Failed to delete request:", err);
            toast.error(lang === 'th' ? 'เกิดข้อผิดพลาด' : 'Something went wrong');
        }
    };

    const handleCancelClick = (id: string) => {
        setCancelTargetId(id);
        setCancelReason("");
    };

    const executeCancel = async () => {
        if (!cancelTargetId) return;
        if (!cancelReason.trim()) {
            toast.error(lang === 'th' ? 'กรุณาระบุเหตุผลการยกเลิก' : 'Please provide a cancellation reason');
            return;
        }
        
        setIsSubmitting(true);
        try {
            const res = await requestsApi.cancel(cancelTargetId, cancelReason);
            if (res.success) {
                setCancelTargetId(null);
                setCancelReason("");
                setIsDetailOpen(false);
                setSelectedRequest(null);
                fetchData(false);
                toast.success(lang === 'th' ? 'ยกเลิกออเดอร์สำเร็จ' : 'Request cancelled');
            } else {
                toast.error(lang === 'th' ? 'ยกเลิกออเดอร์ไม่สำเร็จ' : 'Failed to cancel request');
            }
        } catch (err) {
            console.error("Failed to cancel request:", err);
            toast.error(lang === 'th' ? 'เกิดข้อผิดพลาดในการยกเลิก' : 'Something went wrong');
        } finally {
            setIsSubmitting(false);
        }
    };

    const openDetails = (req: OrderRequest) => {
        setSelectedRequest(req);
        setIsDetailOpen(true);
        setDetailPanes([]);
        setPanesLoading(true);
        setShowAllPanes(false);
        setVisibleCount(100);
        
        // Use the request's total quantity since panes API might not return pagination object
        const total = req.details?.quantity || 0;
        setPanesTotal(total);

        // Fetch all panes for this request (up to 10000) and paginate locally
        panesApi.getAll({ request: req._id, limit: 10000 }).then(res => {
            if (res.success) {
                setDetailPanes(res.data ?? []);
                // Only override if we didn't have a quantity in details and we got pagination
                if (!total && res.pagination?.total) {
                    setPanesTotal(res.pagination.total);
                } else if (!total) {
                    setPanesTotal((res.data ?? []).length);
                }
            }
        }).catch(() => {}).finally(() => setPanesLoading(false));
    };

    const loadMorePanes = () => {
        setVisibleCount(prev => prev + 100);
    };

    const openEditDialog = (req: OrderRequest) => {
        const custId = typeof req.customer === 'string' ? req.customer : req.customer._id;
        const workerId = typeof req.assignedTo === 'string' ? req.assignedTo : req.assignedTo?._id || "";
        setFormData({
            customer: custId,
            referenceId: req.referenceId || "",
            type: req.details?.type || "",
            quantity: req.details?.quantity || 1,
            estimatedPrice: req.details?.estimatedPrice || 0,
            deadline: req.deadline ? req.deadline.split("T")[0] : "",
            deliveryLocation: req.deliveryLocation || "",
            assignedTo: workerId,
            expectedDeliveryDate: req.expectedDeliveryDate ? req.expectedDeliveryDate.split("T")[0] : "",
        });
        setOriginalDeadline(req.deadline ? req.deadline.split("T")[0] : "");
        setDeadlineChangeReason("");
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
                    <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[140px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[50px]" /></TableCell>
                    {false && <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>}
                    <TableCell><Skeleton className="h-6 w-[90px] rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-6 w-[40px]" /></TableCell>
                </TableRow>
            ))}
        </>
    );

    return (
        <PermissionGuard permission={["orders:view", "orders:create", "orders:manage"]}>
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
                {canCreate && (
                    <Link href="/request/create">
                        <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl h-10 px-5 text-sm">
                            <Plus className="h-4 w-4" />
                            {it.newRequest}
                        </Button>
                    </Link>
                )}
            </div>

            {/* Stat Cards */}
            {!isLoading && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                        { filterValue: "all", label: it.totalRequests, value: globalStats.total, icon: ClipboardList, accent: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10" },
                        { filterValue: "week", label: it.thisWeek, value: globalStats.thisWeek, icon: Calendar, accent: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10" },
                        { filterValue: "assigned", label: it.assigned, value: `${globalStats.assigned}/${globalStats.total}`, icon: UserCheck, accent: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10" },
                        { filterValue: "deadline", label: it.approachingDeadline, value: globalStats.approaching, icon: AlertTriangle, accent: globalStats.approaching > 0 ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10" : "text-slate-400 bg-slate-100 dark:bg-slate-800", danger: globalStats.approaching > 0 },
                    ].map((s, i) => {
                        const isHighlighted = activeCard === s.filterValue;
                        const handleCardClick = () => {
                            if (s.filterValue === "all") {
                                setActiveCard(activeCard === "all" ? "" : "all");
                            } else {
                                setActiveCard(activeCard === s.filterValue ? "" : s.filterValue);
                            }
                            setCurrentPage(1);
                        };
                        return (
                            <div 
                                key={i} 
                                onClick={handleCardClick}
                                className={`rounded-xl p-4 sm:p-5 transition-all duration-200 cursor-pointer ${
                                    isHighlighted
                                        ? s.danger
                                            ? "bg-red-50/50 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-700 ring-1 ring-red-500/20"
                                            : "bg-blue-50/50 dark:bg-blue-900/20 border-2 border-blue-400 dark:border-blue-700 ring-1 ring-blue-500/20"
                                        : "bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow"
                                }`}
                            >
                                <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-3 ${s.accent}`}>
                                    <s.icon className="h-[18px] w-[18px]" />
                                </div>
                                <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-0.5">{s.label}</p>
                                <p className={`text-2xl sm:text-3xl font-bold tracking-tight ${s.danger ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"}`}>{s.value}</p>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Filter & Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-4">
                <div className="flex-1 space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest ml-1">ค้นหา</label>
                    <div className="relative">
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
                </div>

                <div className="sm:w-[200px] space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest ml-1">ลูกค้า</label>
                    <Select value={customerFilter} onValueChange={(val) => { setCustomerFilter(val || "all"); setCurrentPage(1); }}>
                        <SelectTrigger className="h-10 w-full rounded-xl text-sm">
                            <SelectValue placeholder={lang === 'th' ? "ลูกค้าทั้งหมด" : "All Customers"}>
                                {customerFilter === "all" ? (lang === 'th' ? "ลูกค้าทั้งหมด" : "All Customers") : (customers.find(c => c._id === customerFilter)?.name || customerFilter)}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{lang === 'th' ? "ลูกค้าทั้งหมด" : "All Customers"}</SelectItem>
                            {customers.map(cust => (
                                <SelectItem key={cust._id} value={cust._id}>{cust.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="sm:w-[160px] space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest ml-1">ประเภท</label>
                    <Select value={typeFilter} onValueChange={(val) => { setTypeFilter(val || "all"); setCurrentPage(1); }}>
                        <SelectTrigger className="h-10 w-full rounded-xl text-sm">
                            <SelectValue placeholder={lang === 'th' ? "ทุกประเภท" : "All Types"}>
                                {typeFilter === "all" ? (lang === 'th' ? "ทุกประเภท" : "All Types") : typeFilter}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{lang === 'th' ? "ทุกประเภท" : "All Types"}</SelectItem>
                            {productTypes.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                
                <div className="sm:w-[160px] space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest ml-1">{lang === 'th' ? 'สถานะ' : 'Status'}</label>
                    <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val || "all"); setCurrentPage(1); }}>
                        <SelectTrigger className="h-10 w-full rounded-xl text-sm">
                            <SelectValue placeholder={lang === 'th' ? 'ทุกสถานะ' : 'All Statuses'}>
                                {statusFilter === 'all' ? (lang === 'th' ? 'ทุกสถานะ' : 'All Statuses') : (lang === 'th' && statusFilter === 'draft' ? 'ฉบับร่าง' : statusFilter === 'draft' ? 'Draft' : lang === 'th' && statusFilter === 'pending' ? 'รอดำเนินการ' : statusFilter === 'pending' ? 'Pending' : lang === 'th' && statusFilter === 'completed' ? 'เสร็จสิ้น' : statusFilter === 'completed' ? 'Completed' : lang === 'th' && statusFilter === 'cancelled' ? 'ยกเลิก' : statusFilter === 'cancelled' ? 'Cancelled' : statusFilter)}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{lang === 'th' ? 'ทุกสถานะ' : 'All Statuses'}</SelectItem>
                            <SelectItem value="draft">{lang === 'th' ? 'ฉบับร่าง' : 'Draft'}</SelectItem>
                            <SelectItem value="pending">{lang === 'th' ? 'รอดำเนินการ' : 'Pending'}</SelectItem>
                            <SelectItem value="completed">{lang === 'th' ? 'เสร็จสิ้น' : 'Completed'}</SelectItem>
                            <SelectItem value="cancelled">{lang === 'th' ? 'ยกเลิก' : 'Cancelled'}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {(searchQuery || typeFilter !== "all" || customerFilter !== "all" || statusFilter !== "all" || (activeCard !== "" && activeCard !== "all")) && (
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
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 px-4 h-10 w-[12%]">{lang === 'th' ? 'เลขที่' : 'Req #'}</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10 w-[12%]">{lang === 'th' ? 'หมายเลข PO' : 'PO Number'}</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10 w-[15%]">{it.table.customer}</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10 w-[25%]">{it.table.productType}</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 text-center h-10 w-[8%]">{it.table.quantity}</TableHead>
                                {false && <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">{it.table.price}</TableHead>}
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10 w-[12%]">{it.table.deadline}</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10 w-[10%]">{lang === 'th' ? 'สถานะ' : 'Status'}</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10 w-[12%]">{it.table.assignedTo}</TableHead>
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
                                            onClick={() => req.status === 'draft' ? router.push(`/request/create?editId=${req._id}`) : openDetails(req)}
                                        >
                                            <TableCell className="py-3.5 px-4">
                                                <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
                                                    {req.requestNumber || `#${req._id.slice(-6).toUpperCase()}`}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-3.5">
                                                {req.referenceId ? (
                                                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                                        {req.referenceId}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-3.5">
                                                <span className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                    {cust?.name || (lang === 'th' ? 'ไม่ระบุ' : 'Unknown')}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-3.5">
                                                <span className={`text-xs font-medium px-2 py-1 rounded-md ${req.details?.type?.includes('inch') ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                                                    {req.details?.type || "—"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-3.5 text-center">
                                                <span className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                                                    {req.details?.quantity?.toLocaleString() || 0}
                                                </span>
                                            </TableCell>
                                            {false && (
                                            <TableCell className="py-3.5">
                                                <span className="text-sm text-slate-600 dark:text-slate-300 tabular-nums">
                                                    {req.details?.estimatedPrice ? formatPrice(req.details.estimatedPrice) : "—"}
                                                </span>
                                            </TableCell>
                                            )}
                                            <TableCell className="py-3.5">
                                                <span className={`text-sm ${deadlinePast ? "text-red-600 dark:text-red-400 font-medium" : deadlineWarning ? "text-amber-600 dark:text-amber-400 font-medium" : "text-slate-600 dark:text-slate-300"}`}>
                                                    {formatDate(req.deadline)}
                                                </span>
                                            </TableCell>

                                            <TableCell className="py-3.5">
                                                {(() => {
                                                    switch(req.status) {
                                                        case 'draft':
                                                            return <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-none font-medium text-[11px] px-2">{lang === 'th' ? 'แบบร่าง' : 'Draft'}</Badge>;
                                                        case 'pending':
                                                            return <Badge className="bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-none font-medium text-[11px] px-2">{lang === 'th' ? 'รอผลิต' : 'Pending'}</Badge>;
                                                        case 'in_progress':
                                                            return <Badge className="bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-none font-medium text-[11px] px-2">{lang === 'th' ? 'กำลังดำเนินการ' : 'In Progress'}</Badge>;
                                                        case 'completed':
                                                            return <Badge className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none font-medium text-[11px] px-2">{lang === 'th' ? 'เสร็จสิ้น' : 'Completed'}</Badge>;
                                                        case 'cancelled':
                                                            return <Badge className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-none font-medium text-[11px] px-2">{lang === 'th' ? 'ยกเลิกแล้ว' : 'Cancelled'}</Badge>;
                                                        default:
                                                            return <Badge className="bg-slate-50 dark:bg-slate-800 text-slate-500 border-none font-medium text-[11px] px-2">{req.status}</Badge>;
                                                    }
                                                })()}
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
                                                <div className="flex justify-end gap-1">
                                                    {req.status !== 'draft' && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                router.push(`/request/create?editId=${req._id}`);
                                                            }}
                                                            title={lang === 'th' ? 'แก้ไข' : 'Edit'}
                                                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openDetails(req);
                                                        }}
                                                        title={lang === 'th' ? 'รายละเอียด' : 'Details'}
                                                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                                    >
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={10} className="py-20 text-center border-none">
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
                            {currentPage} / {totalPages} ({totalItems} {lang === 'th' ? 'รายการ' : 'total'})
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
                            {[...Array(Math.min(totalPages, 7))].map((_, i) => {
                                let pageNum: number;
                                if (totalPages <= 7) {
                                    pageNum = i + 1;
                                } else if (currentPage <= 4) {
                                    pageNum = i + 1;
                                } else if (currentPage >= totalPages - 3) {
                                    pageNum = totalPages - 6 + i;
                                } else {
                                    pageNum = currentPage - 3 + i;
                                }
                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => setCurrentPage(pageNum)}
                                        className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-medium transition-colors ${currentPage === pageNum
                                            ? "bg-blue-600 text-white"
                                            : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                            }`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
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
                    <button autoFocus className="sr-only">Focus Trap</button>
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

                                        {deadlinePast && selectedRequest.status !== 'completed' && selectedRequest.status !== 'cancelled' && (
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
                                    {selectedRequest.referenceId && (
                                        <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300">
                                            <span className="text-slate-400">Ref:</span> {selectedRequest.referenceId}
                                        </div>
                                    )}

                                    <div className={`mt-4 p-4 rounded-xl flex items-center justify-between ${selectedRequest.details?.type?.includes('inch') ? 'bg-purple-50 dark:bg-purple-500/10' : 'bg-blue-50 dark:bg-blue-500/10'}`}>
                                        <div>
                                            <p className={`text-[11px] mb-0.5 ${selectedRequest.details?.type?.includes('inch') ? 'text-purple-500 dark:text-purple-400' : 'text-blue-500 dark:text-blue-400'}`}>{it.table.productType}</p>
                                            <p className={`text-sm font-semibold ${selectedRequest.details?.type?.includes('inch') ? 'text-purple-700 dark:text-purple-300' : 'text-blue-700 dark:text-blue-300'}`}>{selectedRequest.details?.type || "—"}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-[11px] mb-0.5 ${selectedRequest.details?.type?.includes('inch') ? 'text-purple-500 dark:text-purple-400' : 'text-blue-500 dark:text-blue-400'}`}>{it.table.quantity}</p>
                                            <p className={`text-2xl font-bold tabular-nums ${selectedRequest.details?.type?.includes('inch') ? 'text-purple-700 dark:text-purple-300' : 'text-blue-700 dark:text-blue-300'}`}>{selectedRequest.details?.quantity?.toLocaleString() || 0}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 space-y-6 flex-1">
                                    {/* Cancellation Reason */}
                                    {selectedRequest.status === 'cancelled' && selectedRequest.cancelReason && (
                                        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <Ban className="h-4 w-4 text-red-600 dark:text-red-400" />
                                                <h4 className="text-sm font-semibold text-red-600 dark:text-red-400">
                                                    {lang === 'th' ? 'เหตุผลที่ยกเลิกออเดอร์' : 'Cancellation Reason'}
                                                </h4>
                                            </div>
                                            <p className="text-sm text-red-700 dark:text-red-300 ml-6">
                                                {selectedRequest.cancelReason}
                                            </p>
                                        </div>
                                    )}

                                    {/* Deadline Change Reason */}
                                    {selectedRequest.deadlineChangeReason && (
                                        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                                <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                                                    {lang === 'th' ? 'เหตุผลการเลื่อนกำหนดส่ง' : 'Reason for Deadline Change'}
                                                </h4>
                                            </div>
                                            <p className="text-sm text-amber-700 dark:text-amber-300 ml-6">
                                                {selectedRequest.deadlineChangeReason}
                                            </p>
                                        </div>
                                    )}

                                    {/* Order Info */}
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">{it.detail.orderInfo}</h3>
                                        <div className="grid grid-cols-2 gap-2.5">
                                            {false && (
                                            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                                                <p className="text-[11px] text-slate-400 mb-0.5">{it.table.price}</p>
                                                <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                    {selectedRequest?.details?.estimatedPrice ? formatPrice(selectedRequest!.details!.estimatedPrice) : "—"}
                                                </p>
                                            </div>
                                            )}
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
                                            {panesTotal > 0 && (
                                                <span className="text-xs text-slate-400">{panesTotal} {lang === 'th' ? 'ชิ้น' : 'pcs'}</span>
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
                                            const visible = showAllPanes ? detailPanes.slice(0, visibleCount) : detailPanes.slice(0, PANE_PEEK);
                                            const hasMore = detailPanes.length > PANE_PEEK;
                                            const currentlyVisible = visible.length;
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
                                                                        {(() => {
                                                                            const pd = formatPaneDimWithUnit(pane, selectedRequest);
                                                                            return pd.dimStr ? (
                                                                                <>
                                                                                    {pd.dimStr}
                                                                                    {pd.thicknessStr && ` ${pd.thicknessStr}`}
                                                                                </>
                                                                            ) : null;
                                                                        })()}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <span className="text-[10px] text-slate-400 shrink-0">{getStationName(pane.currentStation)}</span>
                                                        </div>
                                                    );
                                                })}
                                                {hasMore && !showAllPanes && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowAllPanes(true)}
                                                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
                                                    >
                                                        <ChevronDown className="h-3.5 w-3.5" /> {lang === 'th' ? `แสดงเพิ่มเติม` : `Show more`}
                                                    </button>
                                                )}
                                                {showAllPanes && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowAllPanes(false)}
                                                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
                                                    >
                                                        <ChevronRight className="h-3.5 w-3.5" /> {lang === 'th' ? 'แสดงน้อยลง' : 'Show less'}
                                                    </button>
                                                )}
                                                {showAllPanes && currentlyVisible < detailPanes.length && (
                                                    <button
                                                        type="button"
                                                        onClick={loadMorePanes}
                                                        className="w-full flex items-center justify-center gap-1.5 py-2 mt-2 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                                                    >
                                                        {lang === 'th' ? `โหลดเพิ่ม (แสดง ${currentlyVisible}/${detailPanes.length})` : `Load more (${currentlyVisible}/${detailPanes.length})`}
                                                    </button>
                                                )}
                                            </div>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* Panel Footer */}
                                {canManage && (
                                    <div className={`p-6 pt-0 grid ${selectedRequest.status !== 'completed' && selectedRequest.status !== 'cancelled' && selectedRequest.status !== 'draft' ? 'grid-cols-3' : 'grid-cols-2'} gap-2.5 mt-auto`}>
                                        <Button
                                            onClick={() => handleDelete(selectedRequest._id)}
                                            variant="outline"
                                            className="rounded-xl h-11 border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 font-medium"
                                            title={lang === 'th' ? 'ลบรายการ' : 'Delete Item'}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            {lang === 'th' ? 'ลบ' : 'Delete'}
                                        </Button>

                                        {selectedRequest.status !== 'completed' && selectedRequest.status !== 'cancelled' && selectedRequest.status !== 'draft' && (
                                            <Button
                                                onClick={() => handleCancelClick(selectedRequest._id)}
                                                variant="outline"
                                                className="rounded-xl h-11 border-orange-200 dark:border-orange-900 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950 font-medium"
                                                title={lang === 'th' ? 'ยกเลิกออเดอร์' : 'Cancel Request'}
                                            >
                                                <Ban className="mr-2 h-4 w-4" />
                                                {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                                            </Button>
                                        )}
                                        
                                        <Button
                                            onClick={() => openEditDialog(selectedRequest)}
                                            className="rounded-xl h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                                            title={lang === 'th' ? 'แก้ไขด่วน' : 'Quick Edit'}
                                        >
                                            <Edit3 className="mr-2 h-4 w-4" />
                                            {it.detail.edit}
                                        </Button>
                                    </div>
                                )}
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

                        {/* Reference ID */}
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                {lang === 'th' ? 'หมายเลข PO / รหัสอ้างอิง' : 'PO Number / Reference'}
                            </Label>
                            <Input
                                placeholder={lang === 'th' ? 'เช่น PO-12345 หรือชื่อโครงการ...' : 'e.g. PO-12345 or Project Name...'}
                                value={formData.referenceId}
                                onChange={(e) => setFormData({ ...formData, referenceId: e.target.value })}
                                className="h-10 rounded-xl"
                            />
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
                            {false && (
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
                            )}
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

                        {/* Deadline Change Reason */}
                        {isEditing && originalDeadline !== formData.deadline && (
                            <div className="space-y-1.5 p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200/50 dark:border-amber-900/30">
                                <Label className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1.5 mb-2">
                                    <AlertTriangle className="h-4 w-4" />
                                    {lang === 'th' ? 'เหตุผลการเปลี่ยนกำหนดส่ง' : 'Reason for changing deadline'} <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    placeholder={lang === 'th' ? 'ระบุเหตุผลที่เลื่อนกำหนดส่ง...' : 'Enter reason for changing deadline...'}
                                    value={deadlineChangeReason}
                                    onChange={(e) => setDeadlineChangeReason(e.target.value)}
                                    className="h-10 rounded-xl bg-white dark:bg-slate-950 border-amber-200 dark:border-amber-900/50 focus-visible:ring-amber-500"
                                />
                            </div>
                        )}

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

            {/* Cancel Confirmation Dialog */}
            <Dialog open={!!cancelTargetId} onOpenChange={(open) => { if (!open) setCancelTargetId(null); }}>
                <DialogContent className="sm:max-w-[400px] rounded-xl p-6">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="h-9 w-9 rounded-lg bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center shrink-0">
                                <Ban className="h-4 w-4 text-orange-500" />
                            </div>
                            <DialogTitle className="text-base font-semibold text-slate-900 dark:text-white">
                                {lang === 'th' ? 'ยืนยันการยกเลิกออเดอร์' : 'Confirm Cancellation'}
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-sm text-slate-500">
                            {lang === 'th'
                                ? 'กรุณาระบุเหตุผลในการยกเลิกออเดอร์นี้ การดำเนินการนี้ไม่สามารถย้อนกลับได้'
                                : 'Please provide a reason for cancelling this request. This action cannot be undone.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label htmlFor="cancel-reason" className="text-sm font-medium mb-2 block text-slate-700 dark:text-slate-300">
                            {lang === 'th' ? 'เหตุผลการยกเลิก' : 'Cancellation Reason'} <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="cancel-reason"
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            placeholder={lang === 'th' ? 'เช่น ลูกค้ายกเลิก, กระจกหมด...' : 'e.g., Customer cancelled, out of stock...'}
                            className="w-full rounded-xl"
                            autoFocus
                        />
                    </div>
                    <div className="flex gap-2.5 mt-2">
                        <Button variant="outline" className="flex-1 rounded-xl h-10 text-sm font-medium" onClick={() => setCancelTargetId(null)}>
                            {lang === 'th' ? 'กลับ' : 'Back'}
                        </Button>
                        <Button 
                            className="flex-1 rounded-xl h-10 text-sm bg-orange-600 hover:bg-orange-700 text-white" 
                            onClick={executeCancel}
                            disabled={isSubmitting || !cancelReason.trim()}
                        >
                            {isSubmitting ? (
                                <span className="flex items-center gap-2">
                                    <span className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    {lang === 'th' ? 'กำลังดำเนินการ...' : 'Processing...'}
                                </span>
                            ) : (
                                <>
                                    <Ban className="h-4 w-4 mr-1.5" />
                                    {lang === 'th' ? 'ยืนยันการยกเลิก' : 'Confirm Cancel'}
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
        </PermissionGuard>
    );
}
