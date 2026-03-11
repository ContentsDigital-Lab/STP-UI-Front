"use client";

import { useState, useEffect, useMemo } from "react";
import { materialLogsApi } from "@/lib/api/material-logs";
import { MaterialLog } from "@/lib/api/types";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, FilterX, Clock, ArrowUpRight, ArrowDownRight, Edit3, Trash2, History } from "lucide-react";

const ITEMS_PER_PAGE = 15;

export default function MaterialLogsPage() {
    const [logs, setLogs] = useState<MaterialLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [actionFilter, setActionFilter] = useState<string>("all");
    const [dateFilter, setDateFilter] = useState<string>("all"); // "all", "today", "7days", "30days"

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            // Note: API doc says limit is supported but we want full client-side search, so we fetch all or a large number
            const response = await materialLogsApi.getAll({ limit: 1000 });
            if (response.success && response.data) {
                setLogs(response.data);
            }
        } catch (error) {
            console.error("Failed to fetch material logs:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Filter Logic
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            // Smart Search across multiple fields
            const searchLower = searchQuery.toLowerCase();
            const matName = (typeof log.material === 'object' ? log.material.name : String(log.material)).toLowerCase();
            const workerName = (typeof log.worker === 'object' ? log.worker.username : String(log.worker)).toLowerCase();
            const location = (log.warehouseLocation || "").toLowerCase();
            const note = (log.note || "").toLowerCase();

            const matchesSearch = !searchQuery || 
                matName.includes(searchLower) || 
                workerName.includes(searchLower) ||
                location.includes(searchLower) ||
                note.includes(searchLower);

            // Action Type Filter
            const matchesAction = actionFilter === "all" || log.action.toLowerCase() === actionFilter.toLowerCase();

            // Date Range Filter
            let matchesDate = true;
            if (dateFilter !== "all") {
                const logDate = new Date(log.createdAt);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                if (dateFilter === "today") {
                    matchesDate = logDate >= today;
                } else if (dateFilter === "7days") {
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(today.getDate() - 7);
                    matchesDate = logDate >= sevenDaysAgo;
                } else if (dateFilter === "30days") {
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(today.getDate() - 30);
                    matchesDate = logDate >= thirtyDaysAgo;
                }
            }

            return matchesSearch && matchesAction && matchesDate;
        });
    }, [logs, searchQuery, actionFilter, dateFilter]);

    const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
    const paginatedLogs = filteredLogs.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const resetFilters = () => {
        setSearchQuery("");
        setActionFilter("all");
        setDateFilter("all");
        setCurrentPage(1);
    };

    const hasActiveFilters = searchQuery || actionFilter !== "all" || dateFilter !== "all";

    // Helper to render action badges with colors
    const renderActionBadge = (action: string) => {
        switch (action) {
            case "Import":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        นำเข้า <ArrowDownRight className="h-3 w-3" />
                    </span>
                );
            case "Withdraw":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-100">
                        เบิกจ่าย <ArrowUpRight className="h-3 w-3" />
                    </span>
                );
            case "Update":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                        แก้ไข <Edit3 className="h-3 w-3" />
                    </span>
                );
            case "Delete":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-100">
                        ลบ <Trash2 className="h-3 w-3" />
                    </span>
                );
            default:
                return <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">{action}</span>;
        }
    };

    // Helper to render quantity change
    const renderQuantityChange = (log: MaterialLog) => {
        const diff = log.newQuantity - log.previousQuantity;
        const colorClass = diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-slate-500";
        const sign = diff > 0 ? "+" : "";

        return (
            <div className="flex flex-col">
                <div className="flex items-center gap-2 text-[13px] font-medium text-slate-700">
                    <span>{log.previousQuantity}</span>
                    <span className="text-slate-300">➔</span>
                    <span className="font-bold">{log.newQuantity}</span>
                </div>
                {diff !== 0 && (
                    <span className={`text-[11px] font-bold ${colorClass}`}>
                        ({sign}{diff})
                    </span>
                )}
            </div>
        );
    };

    const TableSkeleton = () => (
        <>
            {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-8 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[140px]" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[80px]" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-[90px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-[120px]" /></TableCell>
                </TableRow>
            ))}
        </>
    );

    return (
        <div className="flex flex-col gap-6 p-2 md:p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl lg:text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Logs / ประวัติ</h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">ติดตามประวัติการเคลื่อนไหวของสต็อก นำเข้า เบิกจ่าย แก้ไข และลบ</p>
                </div>
                <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-3 lg:px-5 lg:py-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">รายการทั้งหมด</span>
                        <span className="text-xl font-black text-slate-900 dark:text-white leading-none">{logs.length}</span>
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_auto] items-end gap-5">
                    {/* Search Field */}
                    <div className="space-y-2">
                        <Label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                            <Search className="h-3 w-3" />
                            ค้นหาประวัติ
                        </Label>
                        <div className="relative group">
                            <Input
                                placeholder="ค้นหาด้วยชื่อวัสดุ, พนักงาน, สถานที่..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="pl-4 pr-10 h-12 w-full bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 focus:ring-[#1B4B9A] focus:border-[#1B4B9A] rounded-2xl transition-all font-medium text-sm"
                            />
                        </div>
                    </div>

                    {/* Action Filter */}
                    <div className="space-y-2">
                        <Label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">การกระทำ (Action)</Label>
                        <Select value={actionFilter} onValueChange={(val) => { setActionFilter(val || "all"); setCurrentPage(1); }}>
                            <SelectTrigger className="h-12 w-full bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm focus:ring-[#1B4B9A]">
                                <SelectValue placeholder="ทั้งหมด" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-slate-200 dark:border-slate-800">
                                <SelectItem value="all" className="font-bold">ทั้งหมด</SelectItem>
                                <SelectItem value="import" className="font-bold text-emerald-600">นำเข้า (Import)</SelectItem>
                                <SelectItem value="withdraw" className="font-bold text-orange-600">เบิกจ่าย (Withdraw)</SelectItem>
                                <SelectItem value="update" className="font-bold text-blue-600">แก้ไข (Update)</SelectItem>
                                <SelectItem value="delete" className="font-bold text-red-600">ลบ (Delete)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Date Filter */}
                    <div className="space-y-2">
                        <Label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">ช่วงเวลา</Label>
                        <Select value={dateFilter} onValueChange={(val) => { setDateFilter(val || "all"); setCurrentPage(1); }}>
                            <SelectTrigger className="h-12 w-full bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm focus:ring-[#1B4B9A]">
                                <SelectValue placeholder="ทุกช่วงเวลา" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-slate-200 dark:border-slate-800">
                                <SelectItem value="all" className="font-bold">ทุกช่วงเวลา</SelectItem>
                                <SelectItem value="today" className="font-bold">วันนี้</SelectItem>
                                <SelectItem value="7days" className="font-bold">7 วันที่ผ่านมา</SelectItem>
                                <SelectItem value="30days" className="font-bold">30 วันที่ผ่านมา</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center pb-1">
                        {hasActiveFilters && (
                            <Button
                                variant="ghost"
                                onClick={resetFilters}
                                className="h-10 rounded-xl text-slate-500 hover:text-slate-700 font-bold px-4"
                            >
                                <FilterX className="h-4 w-4 mr-2" />
                                ล้างตัวกรอง
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Table Content */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                                <TableHead className="font-black text-xs uppercase tracking-widest py-5 px-6 text-slate-500 dark:text-slate-400">วันเวลา</TableHead>
                                <TableHead className="font-black text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400">วัสดุ</TableHead>
                                <TableHead className="font-black text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400">การกระทำ</TableHead>
                                <TableHead className="font-black text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400">ความเปลี่ยนแปลง</TableHead>
                                <TableHead className="font-black text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400">สถานที่</TableHead>
                                <TableHead className="font-black text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400">พนักงาน</TableHead>
                                <TableHead className="font-black text-xs uppercase tracking-widest py-5 text-slate-500 dark:text-slate-400">หมายเหตุ</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableSkeleton />
                            ) : paginatedLogs.length > 0 ? (
                                paginatedLogs.map((log) => {
                                    const materialName = typeof log.material === 'object' ? (log.material as any).name : log.material;
                                    const workerName = typeof log.worker === 'object' ? (log.worker as any).username : log.worker;
                                    
                                    return (
                                        <TableRow
                                            key={log._id}
                                            className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 border-slate-100 dark:border-slate-800 transition-colors"
                                        >
                                            <TableCell className="py-4 px-6">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-900 dark:text-white text-[13px]">
                                                        {new Date(log.createdAt).toLocaleDateString()}
                                                    </span>
                                                    <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <span className="font-bold text-slate-900 dark:text-white text-sm">
                                                    {materialName || "-"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-4">
                                                {renderActionBadge(log.action)}
                                            </TableCell>
                                            <TableCell className="py-4">
                                                {renderQuantityChange(log)}
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <span className="text-[13px] font-bold text-slate-600 dark:text-slate-400">
                                                    {log.warehouseLocation || "-"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                                                    {workerName || "-"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <span className="text-[12px] text-slate-500 max-w-[200px] truncate block">
                                                    {log.note || "-"}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-40 text-center">
                                        <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                                            <History className="h-10 w-10 mb-3 opacity-20" />
                                            <p className="font-medium">ไม่พบประวัติการทำรายการ</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Pagination Controls */}
            {!isLoading && totalPages > 1 && (
                <div className="flex justify-center mt-2 pb-10">
                    <Pagination>
                        <PaginationContent className="bg-white dark:bg-slate-900 p-1.5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                            <PaginationItem>
                                <PaginationPrevious
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    className={`rounded-xl h-9 px-4 font-bold ${currentPage === 1 ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                />
                            </PaginationItem>

                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(p => p === 1 || p === totalPages || Math.abs(currentPage - p) <= 1)
                                .map((page, i, arr) => {
                                    if (i > 0 && arr[i - 1] !== page - 1) {
                                        return (
                                            <PaginationItem key={`ellipsis-${page}`}>
                                                <span className="px-4 py-2">...</span>
                                            </PaginationItem>
                                        );
                                    }
                                    return (
                                        <PaginationItem key={page}>
                                            <PaginationLink
                                                onClick={() => setCurrentPage(page)}
                                                isActive={currentPage === page}
                                                className={`rounded-xl h-9 w-9 font-bold cursor-pointer ${currentPage === page
                                                    ? 'bg-[#1B4B9A] text-white hover:bg-[#1B4B9A]/90 hover:text-white'
                                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                                                    }`}
                                            >
                                                {page}
                                            </PaginationLink>
                                        </PaginationItem>
                                    );
                                })}

                            <PaginationItem>
                                <PaginationNext
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    className={`rounded-xl h-9 px-4 font-bold ${currentPage === totalPages ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}
        </div>
    );
}
