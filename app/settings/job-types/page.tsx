"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { jobTypesApi, JobType } from "@/lib/api/job-types";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Loader2, Plus, Layers, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function JobTypesManagementPage() {
    const router = useRouter();
    const [jobTypes, setJobTypes] = useState<JobType[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingJobType, setEditingJobType] = useState<JobType | null>(null);

    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deletingJobType, setDeletingJobType] = useState<JobType | null>(null);

    const [formData, setFormData] = useState({
        name: "",
        code: "",
        description: "",
        sheetsPerPane: "1",
        defaultRawGlassTypes: "",
        isActive: true,
    });

    useEffect(() => {
        fetchJobTypes();
    }, []);

    const fetchJobTypes = async () => {
        setIsLoading(true);
        try {
            const res = await jobTypesApi.getAll();
            if (res.success && res.data) {
                setJobTypes(res.data);
            }
        } catch {
            toast.error("ไม่สามารถโหลดข้อมูลลักษณะงานได้");
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenModal = (jt?: JobType) => {
        if (jt) {
            setEditingJobType(jt);
            setFormData({
                name: jt.name,
                code: jt.code,
                description: jt.description || "",
                sheetsPerPane: String(jt.sheetsPerPane),
                defaultRawGlassTypes: jt.defaultRawGlassTypes.join(", "),
                isActive: jt.isActive,
            });
        } else {
            setEditingJobType(null);
            setFormData({ name: "", code: "", description: "", sheetsPerPane: "1", defaultRawGlassTypes: "", isActive: true });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async () => {
        if (!formData.name.trim() || !formData.code.trim()) return;
        setIsSubmitting(true);
        try {
            const payload = {
                name: formData.name.trim(),
                code: formData.code.trim(),
                description: formData.description.trim() || undefined,
                sheetsPerPane: parseInt(formData.sheetsPerPane) || 1,
                defaultRawGlassTypes: formData.defaultRawGlassTypes
                    .split(",")
                    .map((s: string) => s.trim())
                    .filter(Boolean),
                isActive: formData.isActive,
            };

            if (editingJobType) {
                const res = await jobTypesApi.update(editingJobType._id, payload);
                if (res.success) {
                    toast.success(`อัปเดต "${payload.name}" สำเร็จ`);
                    setJobTypes(prev => prev.map(jt => jt._id === editingJobType._id ? res.data : jt));
                }
            } else {
                const res = await jobTypesApi.create(payload);
                if (res.success) {
                    toast.success(`เพิ่ม "${payload.name}" สำเร็จ`);
                    setJobTypes(prev => [...prev, res.data]);
                }
            }
            setIsModalOpen(false);
        } catch {
            toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleActive = async (jt: JobType) => {
        try {
            const res = await jobTypesApi.update(jt._id, {
                name: jt.name,
                code: jt.code,
                sheetsPerPane: jt.sheetsPerPane,
                isActive: !jt.isActive,
            });
            if (res.success) {
                setJobTypes(prev => prev.map(j => j._id === jt._id ? res.data : j));
            }
        } catch {
            toast.error("ไม่สามารถเปลี่ยนสถานะได้");
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deletingJobType) return;
        setIsDeleting(true);
        try {
            const res = await jobTypesApi.delete(deletingJobType._id);
            if (res.success) {
                toast.success(`ลบ "${deletingJobType.name}" สำเร็จ`);
                setJobTypes(prev => prev.filter(jt => jt._id !== deletingJobType._id));
            }
        } catch {
            toast.error("ไม่สามารถลบข้อมูลได้");
        } finally {
            setIsDeleting(false);
            setIsDeleteOpen(false);
            setDeletingJobType(null);
        }
    };

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
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white truncate">จัดการลักษณะงาน</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            กำหนดประเภทงานกระจก เช่น ลามิเนต เทมเปอร์ พร้อมจำนวนแผ่นกระจกดิบที่ใช้
                        </p>
                    </div>
                </div>
                <Button onClick={() => handleOpenModal()} className="gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white font-bold rounded-xl h-10 px-5 text-sm shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0 w-full sm:w-auto shrink-0">
                    <Plus className="h-4 w-4" />
                    เพิ่มลักษณะงาน
                </Button>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    </div>
                ) : jobTypes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                        <Layers className="h-10 w-10 opacity-40" />
                        <p className="text-sm font-medium">ยังไม่มีลักษณะงาน</p>
                        <Button variant="outline" size="sm" onClick={() => handleOpenModal()} className="gap-2 rounded-xl">
                            <Plus className="h-4 w-4" />
                            เพิ่มลักษณะงานแรก
                        </Button>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-100 dark:border-slate-800 hover:bg-transparent">
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 px-4 h-10">ชื่อลักษณะงาน</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">Code</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">แผ่น/ช่อง</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">กระจกดิบเริ่มต้น</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10">สถานะ</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-3 h-10 text-right pr-4 w-24">จัดการ</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {jobTypes.map(jt => (
                                <TableRow key={jt._id} className="border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                                    <TableCell>
                                        <div>
                                            <p className="font-semibold text-slate-900 dark:text-white">{jt.name}</p>
                                            {jt.description && (
                                                <p className="text-xs text-slate-400 mt-0.5">{jt.description}</p>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="font-mono text-xs">{jt.code}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <span className="font-bold text-slate-900 dark:text-white">{jt.sheetsPerPane}</span>
                                        <span className="text-xs text-slate-400 ml-1">แผ่น</span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {jt.defaultRawGlassTypes.length > 0
                                                ? jt.defaultRawGlassTypes.map(t => (
                                                    <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                                                ))
                                                : <span className="text-xs text-slate-400">—</span>
                                            }
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <button
                                            type="button"
                                            onClick={() => handleToggleActive(jt)}
                                            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                                                jt.isActive
                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 hover:bg-emerald-200'
                                                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'
                                            }`}
                                        >
                                            {jt.isActive ? 'เปิดใช้' : 'ปิดใช้'}
                                        </button>
                                    </TableCell>
                                    <TableCell className="text-right pr-4">
                                        <div className="flex items-center gap-1 justify-end">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                                                onClick={() => handleOpenModal(jt)}
                                                title="แก้ไข"
                                            >
                                                <Edit className="h-4 w-4 text-slate-500" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-950"
                                                onClick={() => { setDeletingJobType(jt); setIsDeleteOpen(true); }}
                                                title="ลบ"
                                            >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Create/Edit Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-md rounded-2xl border-slate-200 dark:border-slate-800 p-0 bg-white dark:bg-slate-950 max-h-[90vh] overflow-y-auto">
                    <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-semibold text-slate-900 dark:text-white">{editingJobType ? "แก้ไขลักษณะงาน" : "เพิ่มลักษณะงานใหม่"}</DialogTitle>
                            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                {editingJobType ? `แก้ไขข้อมูลสำหรับ ${editingJobType.name}` : "กำหนดประเภทงานกระจกใหม่"}
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="px-6 py-5 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">ชื่อ <span className="text-red-400">*</span></Label>
                                <Input
                                    value={formData.name}
                                    onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                                    placeholder="เช่น ลามิเนต"
                                    className="h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Code <span className="text-red-400">*</span></Label>
                                <Input
                                    value={formData.code}
                                    onChange={e => setFormData(p => ({ ...p, code: e.target.value }))}
                                    placeholder="เช่น Laminated"
                                    className="h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">คำอธิบาย</Label>
                            <Input
                                value={formData.description}
                                onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                                placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                                className="h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">จำนวนแผ่นกระจกดิบ/ช่อง</Label>
                            <Input
                                type="number"
                                min="1"
                                value={formData.sheetsPerPane}
                                onChange={e => setFormData(p => ({ ...p, sheetsPerPane: e.target.value }))}
                                className="h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                            />
                            <p className="text-xs text-slate-400">ลามิเนต = 2 แผ่น, เทมเปอร์ = 1 แผ่น</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">ชนิดกระจกดิบเริ่มต้น</Label>
                            <Input
                                value={formData.defaultRawGlassTypes}
                                onChange={e => setFormData(p => ({ ...p, defaultRawGlassTypes: e.target.value }))}
                                placeholder="เช่น Clear, Tinted (คั่นด้วยจุลภาค)"
                                className="h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                            />
                            <p className="text-xs text-slate-400">ใช้ auto-fill เมื่อเลือกลักษณะงานนี้</p>
                        </div>
                        <div className="flex items-center gap-3 pt-1">
                            <button
                                type="button"
                                onClick={() => setFormData(p => ({ ...p, isActive: !p.isActive }))}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                                    formData.isActive ? 'bg-blue-600 dark:bg-[#E8601C]' : 'bg-slate-200 dark:bg-slate-700'
                                }`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                    formData.isActive ? 'translate-x-6' : 'translate-x-1'
                                }`} />
                            </button>
                            <Label className="text-sm font-medium cursor-pointer text-slate-700 dark:text-slate-300" onClick={() => setFormData(p => ({ ...p, isActive: !p.isActive }))}>
                                เปิดใช้งาน
                            </Label>
                        </div>
                    </div>
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                        <Button variant="ghost" className="rounded-xl h-10 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white px-4" onClick={() => setIsModalOpen(false)}>ยกเลิก</Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !formData.name.trim() || !formData.code.trim()}
                            className="rounded-xl h-10 min-w-[120px] bg-blue-600 hover:bg-blue-700 dark:bg-[#E8601C] dark:hover:bg-orange-600 text-white text-sm font-bold shadow-lg shadow-blue-500/20 dark:shadow-orange-500/20 border-0"
                        >
                            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {editingJobType ? "บันทึก" : "เพิ่ม"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent className="sm:max-w-sm rounded-2xl border-slate-200 dark:border-slate-800 p-0 bg-white dark:bg-slate-950">
                    <div className="px-6 pt-6 pb-4">
                        <DialogHeader>
                            <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                                <Trash2 className="h-6 w-6 text-red-500" />
                            </div>
                            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white text-center">ยืนยันการลบ</DialogTitle>
                            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 text-center">
                                ลบลักษณะงาน <span className="font-semibold text-slate-700 dark:text-slate-300">&quot;{deletingJobType?.name}&quot;</span> ออกจากระบบ? การดำเนินการนี้ไม่สามารถย้อนกลับได้
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                        <Button variant="ghost" className="rounded-xl h-10 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white px-4" onClick={() => setIsDeleteOpen(false)}>ยกเลิก</Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700 rounded-xl h-10 px-5 text-sm font-bold"
                        >
                            {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            ลบ
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
