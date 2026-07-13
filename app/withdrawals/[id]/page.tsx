"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, AlertCircle, Package, User, Calendar, Hash, Factory, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withdrawalsApi } from "@/lib/api/withdrawals";
import { Order, Material, Worker } from "@/lib/api/types";

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType, label: string, value: string }) {
    return (
        <div className="flex items-start gap-3 sm:gap-4 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800/60 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors px-2 -mx-2 rounded-xl">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-[#E8601C]/10 text-blue-600 dark:text-[#E8601C] shrink-0 mt-0.5">
                <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{label}</p>
                <p className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200 mt-1 break-words">{value}</p>
            </div>
        </div>
    );
}

export default function WithdrawalDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();

    const { data: withdrawal, isLoading, error } = useQuery({
        queryKey: ['withdrawal', id],
        queryFn: async () => {
            const res = await withdrawalsApi.getById(id);
            if (!res.success) throw new Error(res.message);
            return res.data;
        }
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error || !withdrawal) {
        return (
            <div className="p-6 flex flex-col items-center gap-4">
                <AlertCircle className="h-10 w-10 text-red-500/50" />
                <p className="text-sm text-slate-500">{(error as Error)?.message || "ไม่พบข้อมูลการเบิกวัสดุ"}</p>
                <Button variant="outline" onClick={() => router.back()}>กลับ</Button>
            </div>
        );
    }

    const materialName = typeof withdrawal.material === "object" ? (withdrawal.material as Material).name : withdrawal.material;
    const orderNumber = typeof withdrawal.order === "object" ? (withdrawal.order as Order).orderNumber || `#${(withdrawal.order as Order)._id.slice(-6)}` : withdrawal.order;
    const workerName = typeof withdrawal.withdrawnBy === "object" ? (withdrawal.withdrawnBy as Worker).name : withdrawal.withdrawnBy;
    const withdrawalDate = new Date(withdrawal.withdrawnDate || withdrawal.createdAt).toLocaleDateString("th-TH", {
        day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
    });

    return (
        <div className="space-y-6 max-w-[800px] mx-auto w-full">
            {/* Header */}
            <div className="flex items-start gap-3">
                <Button variant="outline" size="sm" className="h-10 w-10 p-0 rounded-xl border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 mt-0.5" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                            <Package className="h-6 w-6 text-blue-600 dark:text-[#E8601C]" />
                            รายละเอียดการเบิกวัสดุ
                        </h1>
                    </div>
                    <p className="text-sm text-slate-500 font-medium mt-1">
                        รหัส: {withdrawal.withdrawalNumber || `#${withdrawal._id.slice(-6).toUpperCase()}`}
                    </p>
                </div>
            </div>

            {/* Info Card */}
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none p-5 sm:p-8">
                <div className="flex items-center gap-2 rounded-2xl bg-slate-100/80 dark:bg-slate-800/50 p-1 mb-6 w-fit border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm">
                    <div className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold bg-white dark:bg-slate-900 text-blue-600 dark:text-[#E8601C] shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
                        <Info className="h-4 w-4 shrink-0" />
                        ข้อมูลการเบิก
                    </div>
                </div>

                <div className="space-y-2">
                    <InfoRow icon={Package} label="วัสดุที่เบิก" value={materialName} />
                    <InfoRow icon={Hash} label="จำนวน" value={`${withdrawal.quantity} ชิ้น`} />
                    <InfoRow icon={Factory} label="ประเภทสต็อก" value={withdrawal.stockType === "Raw" ? "กระจกดิบ (Raw)" : "กระจกนำกลับ (Reuse)"} />
                    <InfoRow icon={Info} label="อ้างอิง Order" value={orderNumber} />
                    <InfoRow icon={User} label="ผู้เบิก" value={workerName} />
                    <InfoRow icon={Calendar} label="วัน-เวลาที่เบิก" value={withdrawalDate} />
                </div>
            </div>
        </div>
    );
}
