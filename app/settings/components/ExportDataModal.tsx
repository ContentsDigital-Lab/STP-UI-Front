"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Material } from "@/lib/api/types";
import { FileDown, Table, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { materialsApi } from "@/lib/api/materials";
import { customersApi } from "@/lib/api/customers";
import { workersApi } from "@/lib/api/workers";
import { ordersApi } from "@/lib/api/orders";
import { inventoriesApi } from "@/lib/api/inventories";
import { panesApi } from "@/lib/api/panes";
import { requestsApi } from "@/lib/api/requests";
import { jobTypesApi } from "@/lib/api/job-types";
import { rolesApi } from "@/lib/api/roles";
import { withdrawalsApi } from "@/lib/api/withdrawals";
import { claimsApi } from "@/lib/api/claims";
import { stationsApi } from "@/lib/api/stations";
import { materialLogsApi } from "@/lib/api/material-logs";
import { paneLogsApi } from "@/lib/api/pane-logs";

interface ExportDataModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface ExportField {
    key: string;
    label: string;
    selected: boolean;
}

const MATERIAL_FIELDS: ExportField[] = [
    { key: "code", label: "รหัสวัสดุ", selected: true },
    { key: "name", label: "ชื่อวัสดุ", selected: true },
    { key: "brand", label: "ยี่ห้อ", selected: true },
    { key: "glassType", label: "ประเภทกระจก", selected: true },
    { key: "color", label: "สี", selected: true },
    { key: "thickness", label: "ความหนา", selected: true },
    { key: "width", label: "กว้าง", selected: true },
    { key: "length", label: "ยาว", selected: true },
    { key: "sqft", label: "ตารางฟุต", selected: true },
    { key: "unit", label: "หน่วย", selected: true },
    { key: "reorderPoint", label: "จุดแจ้งเตือน", selected: true },
    { key: "isActive", label: "สถานะ", selected: true },
    { key: "createdAt", label: "วันที่เพิ่ม", selected: false },
    { key: "_id", label: "รหัสระบบ", selected: false },
];

const CUSTOMER_FIELDS: ExportField[] = [
    { key: "name", label: "ชื่อลูกค้า", selected: true },
    { key: "address", label: "ที่อยู่", selected: true },
    { key: "phone", label: "เบอร์โทร", selected: true },
    { key: "discount", label: "ส่วนลด (%)", selected: true },
    { key: "notes", label: "หมายเหตุ", selected: true },
    { key: "createdAt", label: "วันที่เพิ่ม", selected: false },
    { key: "_id", label: "รหัสระบบ", selected: false },
];

const WORKER_FIELDS: ExportField[] = [
    { key: "name", label: "ชื่อ-นามสกุล", selected: true },
    { key: "username", label: "ชื่อผู้ใช้", selected: true },
    { key: "position", label: "ตำแหน่ง", selected: true },
    { key: "role", label: "สิทธิ์การใช้งาน", selected: true },
    { key: "createdAt", label: "วันที่เพิ่ม", selected: false },
    { key: "_id", label: "รหัสระบบ", selected: false },
];

const ORDER_FIELDS: ExportField[] = [
    { key: "orderNumber", label: "หมายเลขคำสั่งผลิต", selected: true },
    { key: "code", label: "รหัสคำสั่ง (QR)", selected: true },
    { key: "priority", label: "ระดับความสำคัญ", selected: true },
    { key: "status", label: "สถานะ", selected: true },
    { key: "quantity", label: "จำนวน (แผ่น)", selected: true },
    { key: "notes", label: "หมายเหตุ", selected: true },
    { key: "createdAt", label: "วันที่เพิ่ม", selected: false },
    { key: "_id", label: "รหัสระบบ", selected: false },
];

const INVENTORY_FIELDS: ExportField[] = [
    { key: "inventoryNumber", label: "หมายเลขคลัง", selected: true },
    { key: "stockType", label: "ประเภทสต็อก", selected: true },
    { key: "quantity", label: "จำนวน", selected: true },
    { key: "location", label: "สถานที่เก็บ", selected: true },
    { key: "storageColor", label: "สีชั้นวาง", selected: true },
    { key: "isActive", label: "สถานะ", selected: true },
    { key: "createdAt", label: "วันที่เพิ่ม", selected: false },
    { key: "_id", label: "รหัสระบบ", selected: false },
];

const PANE_FIELDS: ExportField[] = [
    { key: "paneNumber", label: "หมายเลขกระจก", selected: true },
    { key: "qrCode", label: "QR Code", selected: true },
    { key: "glassTypeLabel", label: "ชนิดกระจก", selected: true },
    { key: "currentStatus", label: "สถานะปัจจุบัน", selected: true },
    { key: "dimensions", label: "ขนาด (กxยxส)", selected: true },
    { key: "createdAt", label: "วันที่เพิ่ม", selected: false },
    { key: "_id", label: "รหัสระบบ", selected: false },
];

const REQUEST_FIELDS: ExportField[] = [
    { key: "requestNumber", label: "หมายเลขคำขอ", selected: true },
    { key: "status", label: "สถานะ", selected: true },
    { key: "deadline", label: "วันกำหนดส่ง", selected: true },
    { key: "expectedDeliveryDate", label: "วันส่งมอบคาดการณ์", selected: true },
    { key: "deliveryLocation", label: "สถานที่จัดส่ง", selected: true },
    { key: "cancelReason", label: "เหตุผลยกเลิก", selected: false },
    { key: "createdAt", label: "วันที่เพิ่ม", selected: false },
    { key: "_id", label: "รหัสระบบ", selected: false },
];

const JOB_TYPE_FIELDS: ExportField[] = [
    { key: "code", label: "รหัส", selected: true },
    { key: "name", label: "ชื่อลักษณะงาน", selected: true },
    { key: "description", label: "รายละเอียด", selected: true },
    { key: "sheetsPerPane", label: "จำนวนแผ่นต่อกระจก", selected: true },
    { key: "isActive", label: "สถานะ", selected: true },
    { key: "createdAt", label: "วันที่เพิ่ม", selected: false },
    { key: "_id", label: "รหัสระบบ", selected: false },
];

const ROLE_FIELDS: ExportField[] = [
    { key: "name", label: "ชื่อบทบาท", selected: true },
    { key: "slug", label: "รหัสบทบาท", selected: true },
    { key: "description", label: "รายละเอียด", selected: true },
    { key: "isSystem", label: "สิทธิ์ระบบพื้นฐาน", selected: true },
    { key: "createdAt", label: "วันที่เพิ่ม", selected: false },
    { key: "_id", label: "รหัสระบบ", selected: false },
];

const WITHDRAWAL_FIELDS: ExportField[] = [
    { key: "withdrawalNumber", label: "หมายเลขเบิก", selected: true },
    { key: "quantity", label: "จำนวน", selected: true },
    { key: "stockType", label: "ประเภทสต็อก", selected: true },
    { key: "withdrawnDate", label: "วันที่เบิก", selected: true },
    { key: "createdAt", label: "วันที่บันทึก", selected: false },
    { key: "_id", label: "รหัสระบบ", selected: false },
];

const CLAIM_FIELDS: ExportField[] = [
    { key: "claimNumber", label: "หมายเลขเคลม", selected: true },
    { key: "source", label: "แหล่งที่มา", selected: true },
    { key: "description", label: "รายละเอียด", selected: true },
    { key: "status", label: "สถานะ", selected: true },
    { key: "decision", label: "การตัดสินใจ", selected: true },
    { key: "defectCode", label: "รหัสข้อบกพร่อง", selected: true },
    { key: "createdAt", label: "วันที่บันทึก", selected: false },
    { key: "_id", label: "รหัสระบบ", selected: false },
];

const STATION_FIELDS: ExportField[] = [
    { key: "name", label: "ชื่อสถานีงาน", selected: true },
    { key: "code", label: "รหัสสถานี", selected: true },
    { key: "type", label: "ประเภท", selected: true },
    { key: "status", label: "สถานะการทำงาน", selected: true },
    { key: "isActive", label: "สถานะเปิดใช้งาน", selected: true },
    { key: "createdAt", label: "วันที่บันทึก", selected: false },
    { key: "_id", label: "รหัสระบบ", selected: false },
];

const MATERIAL_LOG_FIELDS: ExportField[] = [
    { key: "actionType", label: "ประเภทการทำงาน", selected: true },
    { key: "quantityChanged", label: "จำนวนที่เปลี่ยนแปลง", selected: true },
    { key: "referenceType", label: "ประเภทอ้างอิง", selected: true },
    { key: "stockType", label: "ประเภทสต็อก", selected: true },
    { key: "createdAt", label: "วันที่บันทึก", selected: true },
    { key: "_id", label: "รหัสระบบ", selected: false },
];

const PANE_LOG_FIELDS: ExportField[] = [
    { key: "action", label: "การกระทำ", selected: true },
    { key: "completedAt", label: "วันที่เสร็จสิ้น", selected: true },
    { key: "createdAt", label: "วันที่บันทึก", selected: true },
    { key: "_id", label: "รหัสระบบ", selected: false },
];

export function ExportDataModal({ open, onOpenChange }: ExportDataModalProps) {
    const [dataType, setDataType] = useState("materials");
    const [fields, setFields] = useState<ExportField[]>(MATERIAL_FIELDS);
    const [isExporting, setIsExporting] = useState(false);

    React.useEffect(() => {
        if (dataType === "materials") setFields(MATERIAL_FIELDS);
        else if (dataType === "customers") setFields(CUSTOMER_FIELDS);
        else if (dataType === "workers") setFields(WORKER_FIELDS);
        else if (dataType === "orders") setFields(ORDER_FIELDS);
        else if (dataType === "inventories") setFields(INVENTORY_FIELDS);
        else if (dataType === "panes") setFields(PANE_FIELDS);
        else if (dataType === "requests") setFields(REQUEST_FIELDS);
        else if (dataType === "jobTypes") setFields(JOB_TYPE_FIELDS);
        else if (dataType === "roles") setFields(ROLE_FIELDS);
        else if (dataType === "withdrawals") setFields(WITHDRAWAL_FIELDS);
        else if (dataType === "claims") setFields(CLAIM_FIELDS);
        else if (dataType === "stations") setFields(STATION_FIELDS);
        else if (dataType === "materialLogs") setFields(MATERIAL_LOG_FIELDS);
        else if (dataType === "paneLogs") setFields(PANE_LOG_FIELDS);
    }, [dataType]);

    const handleToggleField = (key: string) => {
        setFields(prev => prev.map(f => f.key === key ? { ...f, selected: !f.selected } : f));
    };

    const handleLabelChange = (key: string, newLabel: string) => {
        setFields(prev => prev.map(f => f.key === key ? { ...f, label: newLabel } : f));
    };

    const prepareExportData = (selectedFields: ExportField[], rawData: any[]) => {
        return rawData.map(item => {
            const rowData: Record<string, any> = {};
            selectedFields.forEach(field => {
                let value: any = "";
                if (dataType === "materials") {
                    if (["thickness", "color", "glassType", "width", "length", "sqft"].includes(field.key)) {
                        value = item.specDetails?.[field.key as keyof typeof item.specDetails] ?? "";
                    } else if (field.key === "isActive") {
                        value = item.isActive ? "ใช้งาน" : "ยกเลิก";
                    } else if (field.key === "createdAt") {
                        value = item.createdAt ? new Date(item.createdAt).toLocaleString("th-TH") : "";
                    } else {
                        value = item[field.key] ?? "";
                    }
                } else if (dataType === "customers") {
                    if (field.key === "createdAt") {
                        value = item.createdAt ? new Date(item.createdAt).toLocaleString("th-TH") : "";
                    } else {
                        value = item[field.key] ?? "";
                    }
                } else if (dataType === "workers") {
                    if (field.key === "role") {
                        value = typeof item.role === "string" ? item.role : (item.role?.name || "");
                    } else if (field.key === "createdAt") {
                        value = item.createdAt ? new Date(item.createdAt).toLocaleString("th-TH") : "";
                    } else {
                        value = item[field.key] ?? "";
                    }
                } else if (dataType === "panes") {
                    if (field.key === "dimensions") {
                        const d = item.dimensions;
                        value = d ? `${d.width}x${d.length || d.height}x${d.thickness}` : "";
                    } else if (field.key === "createdAt") {
                        value = item.createdAt ? new Date(item.createdAt).toLocaleString("th-TH") : "";
                    } else {
                        value = item[field.key] ?? "";
                    }
                } else if (dataType === "inventories" && field.key === "isActive") {
                    value = item.isActive ? "ใช้งาน" : "ยกเลิก";
                } else if (dataType === "jobTypes" && field.key === "isActive") {
                    value = item.isActive ? "ใช้งาน" : "ยกเลิก";
                } else if (dataType === "roles" && field.key === "isSystem") {
                    value = item.isSystem ? "ใช่" : "ไม่ใช่";
                } else if (dataType === "requests" && ["deadline", "expectedDeliveryDate"].includes(field.key)) {
                    value = item[field.key] ? new Date(item[field.key]).toLocaleDateString("th-TH") : "";
                } else if (dataType === "withdrawals" && field.key === "withdrawnDate") {
                    value = item.withdrawnDate ? new Date(item.withdrawnDate).toLocaleString("th-TH") : "";
                } else if (dataType === "paneLogs" && field.key === "completedAt") {
                    value = item.completedAt ? new Date(item.completedAt).toLocaleString("th-TH") : "";
                } else if (dataType === "stations" && field.key === "isActive") {
                    value = item.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน";
                } else {
                    // Default generic handler
                    if (field.key === "createdAt") {
                        value = item.createdAt ? new Date(item.createdAt).toLocaleString("th-TH") : "";
                    } else {
                        value = item[field.key] ?? "";
                    }
                }
                
                rowData[field.label] = value;
            });
            return rowData;
        });
    };

    const fetchData = async () => {
        setIsExporting(true);
        try {
            if (dataType === "materials") {
                const res = await materialsApi.getAll();
                if (res.success) return res.data;
                throw new Error(res.message || "Failed to fetch materials");
            } else if (dataType === "customers") {
                const res = await customersApi.getAll();
                if (res.success) return res.data;
                throw new Error(res.message || "Failed to fetch customers");
            } else if (dataType === "workers") {
                const res = await workersApi.getAll();
                if (res.success) return res.data;
                throw new Error(res.message || "Failed to fetch workers");
            } else if (dataType === "orders") {
                const res = await ordersApi.getAll();
                if (res.success) return res.data;
                throw new Error(res.message || "Failed to fetch orders");
            } else if (dataType === "inventories") {
                const res = await inventoriesApi.getAll();
                if (res.success) return res.data;
                throw new Error(res.message || "Failed to fetch inventories");
            } else if (dataType === "panes") {
                const res = await panesApi.getAll();
                if (res.success) return res.data;
                throw new Error(res.message || "Failed to fetch panes");
            } else if (dataType === "requests") {
                const res = await requestsApi.getAll();
                if (res.success) return res.data;
                throw new Error(res.message || "Failed to fetch requests");
            } else if (dataType === "jobTypes") {
                const res = await jobTypesApi.getAll();
                if (res.success) return res.data;
                throw new Error(res.message || "Failed to fetch job types");
            } else if (dataType === "roles") {
                const res = await rolesApi.getAll();
                if (res.success) return res.data;
                throw new Error(res.message || "Failed to fetch roles");
            } else if (dataType === "withdrawals") {
                const res = await withdrawalsApi.getAll();
                if (res.success) return res.data;
                throw new Error(res.message || "Failed to fetch withdrawals");
            } else if (dataType === "claims") {
                const res = await claimsApi.getAll();
                if (res.success) return res.data;
                throw new Error(res.message || "Failed to fetch claims");
            } else if (dataType === "stations") {
                const res = await stationsApi.getAll();
                if (res.success) return res.data;
                throw new Error(res.message || "Failed to fetch stations");
            } else if (dataType === "materialLogs") {
                const res = await materialLogsApi.getAll();
                if (res.success) return res.data;
                throw new Error(res.message || "Failed to fetch material logs");
            } else if (dataType === "paneLogs") {
                const res = await paneLogsApi.getAll();
                if (res.success) return res.data;
                throw new Error(res.message || "Failed to fetch pane logs");
            }
        } catch (e: any) {
            toast.error(e.message || "ไม่สามารถโหลดข้อมูลได้");
            return null;
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportCSV = async () => {
        const selectedFields = fields.filter(f => f.selected);
        if (selectedFields.length === 0) {
            toast.error("กรุณาเลือกข้อมูลที่ต้องการนำออกอย่างน้อย 1 รายการ");
            return;
        }

        const dataToExport = await fetchData();
        if (!dataToExport) return;

        try {
            const data = prepareExportData(selectedFields, dataToExport);
            const headers = selectedFields.map(f => f.label);

            const csvRows = [
                headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(",")
            ];

            for (const row of data) {
                csvRows.push(headers.map(h => `"${String(row[h]).replace(/"/g, '""')}"`).join(","));
            }

            const csvString = csvRows.join("\n");
            // Add BOM for Excel UTF-8 support
            const blob = new Blob(["\uFEFF" + csvString], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${dataType}_export_${new Date().toISOString().split("T")[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            toast.success("นำออกข้อมูลสำเร็จ (CSV)");
            onOpenChange(false);
        } catch (error) {
            console.error("Export CSV failed:", error);
            toast.error("เกิดข้อผิดพลาดในการนำออกข้อมูล CSV");
        }
    };

    const handleExportExcel = async () => {
        const selectedFields = fields.filter(f => f.selected);
        if (selectedFields.length === 0) {
            toast.error("กรุณาเลือกข้อมูลที่ต้องการนำออกอย่างน้อย 1 รายการ");
            return;
        }

        const dataToExport = await fetchData();
        if (!dataToExport) return;

        try {
            const data = prepareExportData(selectedFields, dataToExport);
            const XLSX = await import("xlsx");
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
            XLSX.writeFile(workbook, `${dataType}_export_${new Date().toISOString().split("T")[0]}.xlsx`);

            toast.success("นำออกข้อมูลสำเร็จ (Excel)");
            onOpenChange(false);
        } catch (error) {
            console.error("Export Excel failed:", error);
            toast.error("เกิดข้อผิดพลาดในการนำออกข้อมูล Excel");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] border-slate-200 dark:border-slate-800 rounded-2xl">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <FileDown className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        นำออกข้อมูล
                    </DialogTitle>
                    <DialogDescription>
                        เลือกข้อมูลที่ต้องการนำออก และตั้งชื่อคอลัมน์ได้ตามต้องการ
                    </DialogDescription>
                </DialogHeader>

                <div className="px-1 py-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">ประเภทข้อมูล</label>
                    <Select value={dataType} onValueChange={(val) => { if (val) setDataType(val); }}>
                        <SelectTrigger className="w-full rounded-xl border-slate-200 dark:border-slate-800 focus:ring-blue-500">
                            <SelectValue placeholder="เลือกประเภทข้อมูล" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
                            <SelectItem value="materials" className="rounded-lg cursor-pointer">ข้อมูลวัสดุ (Materials)</SelectItem>
                            <SelectItem value="customers" className="rounded-lg cursor-pointer">ข้อมูลลูกค้า (Customers)</SelectItem>
                            <SelectItem value="workers" className="rounded-lg cursor-pointer">ข้อมูลผู้ใช้งาน (Users / Workers)</SelectItem>
                            <SelectItem value="orders" className="rounded-lg cursor-pointer">ข้อมูลคำสั่งผลิต (Orders)</SelectItem>
                            <SelectItem value="inventories" className="rounded-lg cursor-pointer">ข้อมูลสินค้าคงคลัง (Inventories)</SelectItem>
                            <SelectItem value="panes" className="rounded-lg cursor-pointer">ข้อมูลกระจก (Panes)</SelectItem>
                            <SelectItem value="requests" className="rounded-lg cursor-pointer">ข้อมูลคำขอสั่งผลิต (Requests)</SelectItem>
                            <SelectItem value="withdrawals" className="rounded-lg cursor-pointer">ข้อมูลการเบิกวัสดุ (Withdrawals)</SelectItem>
                            <SelectItem value="jobTypes" className="rounded-lg cursor-pointer">ข้อมูลลักษณะงาน (Job Types)</SelectItem>
                            <SelectItem value="roles" className="rounded-lg cursor-pointer">ข้อมูลบทบาท (Roles)</SelectItem>
                            <SelectItem value="claims" className="rounded-lg cursor-pointer">ข้อมูลการเคลม (Claims)</SelectItem>
                            <SelectItem value="stations" className="rounded-lg cursor-pointer">ข้อมูลสถานีงาน (Stations)</SelectItem>
                            <SelectItem value="materialLogs" className="rounded-lg cursor-pointer">ประวัติใช้วัสดุ (Material Logs)</SelectItem>
                            <SelectItem value="paneLogs" className="rounded-lg cursor-pointer">ประวัติกระจก (Pane Logs)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="max-h-[50vh] overflow-y-auto px-1 py-2 space-y-3">
                    {fields.map((field) => (
                        <div key={field.key} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                            <Checkbox
                                id={`export-field-${field.key}`}
                                checked={field.selected}
                                onCheckedChange={() => handleToggleField(field.key)}
                                className="ml-2"
                            />
                            <div className="flex-1">
                                <Input
                                    value={field.label}
                                    onChange={(e) => handleLabelChange(field.key, e.target.value)}
                                    disabled={!field.selected}
                                    className="h-8 text-sm bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                                    placeholder="ชื่อคอลัมน์"
                                />
                            </div>
                            <span className="text-xs text-slate-400 w-24 truncate" title={`(${field.key})`}>
                                ({field.key})
                            </span>
                        </div>
                    ))}
                </div>

                <DialogFooter className="mt-4 gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
                        ยกเลิก
                    </Button>
                    <div className="flex gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger render={
                                <Button disabled={isExporting} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                                    <FileDown className="h-4 w-4 mr-2" />
                                    {isExporting ? "กำลังนำออก..." : "นำออกข้อมูล"}
                                    <ChevronDown className="h-4 w-4 ml-2" />
                                </Button>
                            } />
                            <DropdownMenuContent align="end" className="w-56 rounded-xl border-slate-200 dark:border-slate-800">
                                <DropdownMenuItem onClick={handleExportCSV} className="cursor-pointer focus:bg-slate-100 dark:focus:bg-slate-800">
                                    <FileDown className="h-4 w-4 mr-2 text-slate-500 dark:text-slate-400" />
                                    ดาวน์โหลดเป็น CSV
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleExportExcel} className="cursor-pointer focus:bg-slate-100 dark:focus:bg-slate-800">
                                    <Table className="h-4 w-4 mr-2 text-green-600 dark:text-green-500" />
                                    ดาวน์โหลดเป็น Excel (XLSX)
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
