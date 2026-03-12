"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    ChevronLeft,
    Save,
    FileDown,
    FileUp,
    Users,
    Package,
    Ruler,
    MapPin,
    CalendarDays,
    User,
    Trash2,
    GripVertical,
    ChevronsUpDown,
    Check,
    Plus,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { GlassDesigner, HoleData, VertexData } from "@/components/glass-designer";
import { requestsApi } from "@/lib/api/requests";
import { customersApi } from "@/lib/api/customers";
import { workersApi } from "@/lib/api/workers";
import { Customer, Worker } from "@/lib/api/types";
import jsPDF from "jspdf";
import { toast } from "sonner";

export default function CreateBillPage() {
    const { t, lang } = useLanguage();
    const router = useRouter();

    const [customers, setCustomers] = useState<Customer[]>([]);
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Glass design state
    const [glassWidth, setGlassWidth] = useState(800);
    const [glassHeight, setGlassHeight] = useState(600);
    const [holes, setHoles] = useState<HoleData[]>([]);
    const [vertices, setVertices] = useState<VertexData[]>([
        { x: 0, y: 0 },
        { x: 800, y: 0 },
        { x: 800, y: 600 },
        { x: 0, y: 600 },
    ]);

    // Combobox state
    const [customerOpen, setCustomerOpen] = useState(false);
    const [customerSearch, setCustomerSearch] = useState("");
    const [glassTypeOpen, setGlassTypeOpen] = useState(false);
    const [glassTypeSearch, setGlassTypeSearch] = useState("");
    const [glassTypes, setGlassTypes] = useState(['Clear', 'Tinted', 'Tempered', 'Laminated', 'Low-E', 'Reflective', 'Frosted', 'Patterned']);
    const [thicknessOpen, setThicknessOpen] = useState(false);
    const [thicknessSearch, setThicknessSearch] = useState("");
    const [thicknesses, setThicknesses] = useState(['3mm', '5mm', '6mm', '8mm', '10mm', '12mm', '15mm', '19mm']);
    const customerRef = useRef<HTMLDivElement>(null);
    const glassTypeRef = useRef<HTMLDivElement>(null);
    const thicknessRef = useRef<HTMLDivElement>(null);

    // Order form state
    const [formData, setFormData] = useState({
        customer: "",
        glassType: "",
        thickness: "",
        quantity: 1,
        estimatedPrice: 1,
        deadline: "",
        deliveryLocation: "",
        assignedTo: "",
        expectedDeliveryDate: "",
    });

    const latestCustomers = useRef(customers);
    latestCustomers.current = customers;
    const latestFormData = useRef(formData);
    latestFormData.current = formData;

    useEffect(() => {
        const load = async () => {
            try {
                const [custRes, workerRes] = await Promise.all([
                    customersApi.getAll(),
                    workersApi.getAll(),
                ]);
                if (custRes.success && custRes.data) setCustomers(custRes.data);
                if (workerRes.success && workerRes.data) setWorkers(workerRes.data);
            } catch (err) {
                console.error("Failed to load data:", err);
            }
        };
        load();
    }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
                setCustomerOpen(false);
                const selected = latestCustomers.current.find(c => c._id === latestFormData.current.customer);
                setCustomerSearch(selected ? selected.name : "");
            }
            if (glassTypeRef.current && !glassTypeRef.current.contains(e.target as Node)) {
                setGlassTypeOpen(false);
                setGlassTypeSearch(latestFormData.current.glassType);
            }
            if (thicknessRef.current && !thicknessRef.current.contains(e.target as Node)) {
                setThicknessOpen(false);
                setThicknessSearch(latestFormData.current.thickness ? latestFormData.current.thickness.replace('mm', '') : "");
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.phone?.toLowerCase().includes(customerSearch.toLowerCase())
    );

    const filteredGlassTypes = glassTypes.filter(t =>
        t.toLowerCase().includes(glassTypeSearch.toLowerCase())
    );

    const handleCreateCustomer = async (name: string) => {
        try {
            const res = await customersApi.create({ name });
            if (res.success && res.data) {
                setCustomers(prev => [...prev, res.data!]);
                setFormData(prev => ({ ...prev, customer: res.data!._id }));
                setCustomerSearch(name);
                setCustomerOpen(false);
                toast.success(lang === 'th' ? `เพิ่มลูกค้า "${name}" สำเร็จ` : `Customer "${name}" created`);
            }
        } catch {
            toast.error(lang === 'th' ? 'ไม่สามารถเพิ่มลูกค้าได้' : 'Failed to create customer');
        }
    };

    const handleAddGlassType = (type: string) => {
        setGlassTypes(prev => [...prev, type]);
        setFormData(prev => ({ ...prev, glassType: type }));
        setGlassTypeSearch(type);
        setGlassTypeOpen(false);
        toast.success(lang === 'th' ? `เพิ่มประเภท "${type}" สำเร็จ` : `Glass type "${type}" added`);
    };

    const filteredThicknesses = thicknesses.filter(t =>
        t.toLowerCase().includes(thicknessSearch.toLowerCase()) ||
        t.replace('mm', '').includes(thicknessSearch)
    );

    const handleAddThickness = (raw: string) => {
        const num = parseInt(raw);
        if (isNaN(num) || num <= 0) {
            toast.error(lang === 'th' ? 'กรุณาใส่ตัวเลขที่ถูกต้อง' : 'Please enter a valid positive number');
            return;
        }
        const value = `${num}mm`;
        if (thicknesses.includes(value)) {
            toast.warning(lang === 'th' ? `${value} มีอยู่แล้ว` : `${value} already exists`);
            return;
        }
        setThicknesses(prev => [...prev, value].sort((a, b) => parseInt(a) - parseInt(b)));
        setFormData(prev => ({ ...prev, thickness: value }));
        setThicknessSearch(String(num));
        setThicknessOpen(false);
        toast.success(lang === 'th' ? `เพิ่มความหนา ${value} สำเร็จ` : `Thickness ${value} added`);
    };

    const handleHolesChange = useCallback((newHoles: HoleData[]) => {
        setHoles(newHoles);
    }, []);

    const handleSubmit = async () => {
        if (!formData.customer || !formData.glassType) return;
        setIsSubmitting(true);

        const glassSpec = `${formData.glassType} ${formData.thickness} (${glassWidth}×${glassHeight}mm)`;
        if (holes.length > 0) {
            // Include hole info in the type description
        }

        const payload = {
            details: {
                type: glassSpec,
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
            const res = await requestsApi.create(payload);
            if (res.success) {
                toast.success(lang === 'th' ? 'สร้างคำสั่งซื้อสำเร็จ' : 'Order request created successfully');
                router.push("/request");
            }
        } catch (err) {
            console.error("Failed to create request:", err);
            toast.error(lang === 'th' ? 'ไม่สามารถสร้างคำสั่งซื้อได้' : 'Failed to create order request');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleExportPDF = () => {
        const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 15;

        // Header
        pdf.setFontSize(18);
        pdf.setFont("helvetica", "bold");
        pdf.text("Standard Plus - Glass Bill", margin, margin + 5);

        pdf.setFontSize(9);
        pdf.setFont("helvetica", "normal");
        const cust = customers.find(c => c._id === formData.customer);
        pdf.text(`Customer: ${cust?.name || '—'}`, margin, margin + 13);
        pdf.text(`Date: ${new Date().toLocaleDateString()}`, margin, margin + 18);
        pdf.text(`Type: ${formData.glassType} ${formData.thickness}`, pageW / 2, margin + 13);
        pdf.text(`Qty: ${formData.quantity}`, pageW / 2, margin + 18);
        if (formData.deadline) {
            pdf.text(`Deadline: ${formData.deadline}`, pageW / 2, margin + 23);
        }

        // Separator
        pdf.setDrawColor(200);
        pdf.line(margin, margin + 27, pageW - margin, margin + 27);

        // Glass drawing area
        const drawAreaX = margin;
        const drawAreaY = margin + 32;
        const drawAreaW = pageW - margin * 2;
        const drawAreaH = pageH - drawAreaY - margin - 20;

        // Scale glass to fit
        const scaleX = drawAreaW / (glassWidth * 1.3);
        const scaleY = drawAreaH / (glassHeight * 1.3);
        const scale = Math.min(scaleX, scaleY);
        const gW = glassWidth * scale;
        const gH = glassHeight * scale;
        const gX = drawAreaX + (drawAreaW - gW) / 2;
        const gY = drawAreaY + (drawAreaH - gH) / 2;

        // Glass panel
        pdf.setFillColor(220, 235, 250);
        pdf.setDrawColor(27, 75, 154);
        pdf.setLineWidth(0.5);
        pdf.rect(gX, gY, gW, gH, "FD");

        // Dimension lines
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        pdf.setDrawColor(100);
        pdf.setLineWidth(0.2);

        // Bottom dimension (width)
        const dimY = gY + gH + 8;
        pdf.line(gX, dimY, gX + gW, dimY);
        pdf.line(gX, gY + gH + 2, gX, dimY + 3);
        pdf.line(gX + gW, gY + gH + 2, gX + gW, dimY + 3);
        pdf.text(`${glassWidth} mm`, gX + gW / 2, dimY + 5, { align: "center" });

        // Left dimension (height)
        const dimX = gX - 8;
        pdf.line(dimX, gY, dimX, gY + gH);
        pdf.line(gX - 2, gY, dimX - 3, gY);
        pdf.line(gX - 2, gY + gH, dimX - 3, gY + gH);
        pdf.text(`${glassHeight} mm`, dimX - 3, gY + gH / 2, { angle: 90, align: "center" });

        // Holes
        pdf.setDrawColor(232, 96, 28);
        pdf.setLineWidth(0.3);
        holes.forEach((hole, i) => {
            const hx = gX + (hole.x / glassWidth) * gW;
            const hy = gY + ((glassHeight - hole.y) / glassHeight) * gH;
            const hr = (hole.diameter / 2 / glassWidth) * gW;
            pdf.circle(hx, hy, Math.max(hr, 1.5));
            // Crosshairs
            pdf.line(hx - hr - 1.5, hy, hx + hr + 1.5, hy);
            pdf.line(hx, hy - hr - 1.5, hx, hy + hr + 1.5);
            pdf.setFontSize(6);
            pdf.text(`H${i + 1}: ⌀${hole.diameter}mm`, hx + hr + 3, hy + 1);
        });

        // Hole table
        if (holes.length > 0) {
            const tableY = pageH - margin - 15;
            pdf.setFontSize(7);
            pdf.setFont("helvetica", "bold");
            pdf.setDrawColor(150);
            pdf.text("HOLES", margin, tableY);
            pdf.setFont("helvetica", "normal");
            holes.forEach((hole, i) => {
                const tx = margin + (i % 4) * 55;
                const ty = tableY + 4 + Math.floor(i / 4) * 5;
                pdf.text(`H${i + 1}: X=${hole.x}mm Y=${hole.y}mm ⌀${hole.diameter}mm`, tx, ty);
            });
        }

        // Footer
        pdf.setFontSize(7);
        pdf.setTextColor(150);
        pdf.text("Generated by Standard Plus System", margin, pageH - margin + 3);
        pdf.text(`Page 1 of 1`, pageW - margin, pageH - margin + 3, { align: "right" });

        pdf.save(`bill_${cust?.name || 'glass'}_${Date.now()}.pdf`);
    };

    const handleImportDXF = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.dxf';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const DxfParser = (await import('dxf-parser')).default;
                const parser = new DxfParser();
                const dxf = parser.parseSync(text);

                if (!dxf?.entities || dxf.entities.length === 0) {
                    toast.error(lang === 'th' ? 'ไฟล์ DXF ไม่มีข้อมูลรูปทรง' : 'DXF file contains no entities.');
                    return;
                }

                const warnings: string[] = [];
                const importedHoles: HoleData[] = [];
                let maxX = 0;
                let maxY = 0;
                let skippedHoles = 0;

                dxf.entities.forEach((entity: any) => {
                    if (entity.type === 'CIRCLE') {
                        const cx = Math.round(entity.center?.x || 0);
                        const cy = Math.round(entity.center?.y || 0);
                        const dia = Math.round((entity.radius || 0) * 2);
                        if (cx < 0 || cy < 0 || dia <= 0) {
                            skippedHoles++;
                            return;
                        }
                        importedHoles.push({
                            id: `dxf_${Date.now()}_${importedHoles.length}`,
                            x: cx,
                            y: cy,
                            diameter: dia,
                        });
                    }
                    if (entity.type === 'LINE' || entity.type === 'LWPOLYLINE') {
                        const verts = entity.vertices || [];
                        verts.forEach((v: any) => {
                            const vx = Math.round(v.x || 0);
                            const vy = Math.round(v.y || 0);
                            if (vx > maxX) maxX = vx;
                            if (vy > maxY) maxY = vy;
                        });
                    }
                });

                if (maxX <= 0 && maxY <= 0 && importedHoles.length === 0) {
                    toast.error(lang === 'th' ? 'ไม่พบข้อมูลขนาดหรือรูเจาะในไฟล์ DXF' : 'No valid dimensions or holes found in DXF file.');
                    return;
                }

                if (maxX > 0) setGlassWidth(maxX);
                if (maxY > 0) setGlassHeight(maxY);

                const finalWidth = maxX > 0 ? maxX : glassWidth;
                const finalHeight = maxY > 0 ? maxY : glassHeight;

                setVertices([{ x: 0, y: 0 }, { x: finalWidth, y: 0 }, { x: finalWidth, y: finalHeight }, { x: 0, y: finalHeight }]);

                const validHoles = importedHoles.filter(h => h.x <= finalWidth && h.y <= finalHeight);
                const outOfBounds = importedHoles.length - validHoles.length;

                setHoles(validHoles);

                if (skippedHoles > 0) warnings.push(lang === 'th' ? `${skippedHoles} รูถูกข้ามเนื่องจากค่าลบหรือขนาดไม่ถูกต้อง` : `${skippedHoles} hole(s) skipped due to negative position or invalid size.`);
                if (outOfBounds > 0) warnings.push(lang === 'th' ? `${outOfBounds} รูถูกข้ามเนื่องจากอยู่นอกขอบเขตกระจก` : `${outOfBounds} hole(s) skipped because they fall outside the glass bounds.`);

                if (warnings.length > 0) {
                    toast.warning(warnings.join(' '));
                } else {
                    const parts: string[] = [];
                    if (maxX > 0 || maxY > 0) parts.push(`${finalWidth}×${finalHeight}mm`);
                    if (validHoles.length > 0) parts.push(lang === 'th' ? `${validHoles.length} รู` : `${validHoles.length} hole(s)`);
                    toast.success((lang === 'th' ? 'นำเข้าสำเร็จ: ' : 'Imported: ') + parts.join(', '));
                }
            } catch (err) {
                console.error("Failed to parse DXF:", err);
                toast.error(lang === 'th' ? 'ไม่สามารถอ่านไฟล์ DXF ได้ กรุณาตรวจสอบรูปแบบไฟล์' : 'Failed to parse DXF file. Please check the file format.');
            }
        };
        input.click();
    };

    const selectedCustomer = customers.find(c => c._id === formData.customer);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Top Header Bar */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                <div className="flex items-center gap-3">
                    <Link href="/request">
                        <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9 text-slate-400 hover:text-slate-900 dark:hover:text-white">
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                            {lang === 'th' ? 'สร้างบิล / คำสั่งซื้อ' : 'Create Bill / Order Request'}
                        </h1>
                        <p className="text-[11px] text-slate-400 font-bold">
                            {lang === 'th' ? 'ออกแบบกระจก กำหนดรูเจาะ และส่งคำสั่งซื้อ' : 'Design glass, place drill holes, and submit order request'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleImportDXF} className="gap-1.5 rounded-xl font-bold text-xs h-9 border-slate-200 dark:border-slate-800">
                        <FileUp className="h-3.5 w-3.5" />
                        Import DXF
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1.5 rounded-xl font-bold text-xs h-9 border-slate-200 dark:border-slate-800">
                        <FileDown className="h-3.5 w-3.5" />
                        Export PDF
                    </Button>
                    <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
                    <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !formData.customer || !formData.glassType}
                        className="gap-1.5 rounded-xl font-black text-xs h-9 bg-[#E8601C] hover:bg-[#E8601C]/90 text-white shadow-lg shadow-orange-500/20 px-6"
                    >
                        <Save className="h-3.5 w-3.5" />
                        {isSubmitting
                            ? (lang === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                            : (lang === 'th' ? 'บันทึกคำสั่งซื้อ' : 'Save Order')
                        }
                    </Button>
                </div>
            </div>

            {/* Main Content - Split Layout */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left: Glass Designer Canvas */}
                <div className="flex-1 flex flex-col border-r border-slate-200 dark:border-slate-800 min-w-0">
                    <GlassDesigner
                        width={glassWidth}
                        height={glassHeight}
                        holes={holes}
                        onHolesChange={handleHolesChange}
                        vertices={vertices}
                        onVerticesChange={setVertices}
                    />
                </div>

                {/* Right: Form Panel */}
                <div className="w-[380px] shrink-0 overflow-y-auto bg-white dark:bg-slate-900">
                    <div className="p-6 space-y-8">
                        {/* Customer Section */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-[#E8601C]" />
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.15em]">
                                    {lang === 'th' ? 'ลูกค้า' : 'Customer'}
                                </h3>
                            </div>
                            <div ref={customerRef} className="relative">
                                <input
                                    placeholder={lang === 'th' ? 'ค้นหาหรือเพิ่มลูกค้า...' : 'Search or add customer...'}
                                    value={customerSearch}
                                    onChange={(e) => {
                                        setCustomerSearch(e.target.value);
                                        setCustomerOpen(true);
                                    }}
                                    onFocus={() => {
                                        setCustomerSearch("");
                                        setCustomerOpen(true);
                                        setGlassTypeOpen(false);
                                        setThicknessOpen(false);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && customerSearch.trim() && filteredCustomers.length === 0) {
                                            handleCreateCustomer(customerSearch.trim());
                                        }
                                    }}
                                    className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm pl-4 pr-10 hover:border-[#E8601C]/50 transition-colors outline-none focus:ring-1 focus:ring-[#E8601C] focus:border-[#E8601C]"
                                />
                                <ChevronsUpDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                                {customerOpen && (
                                    <div className="absolute z-50 w-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                                        <div className="max-h-[220px] overflow-y-auto p-1.5">
                                            {filteredCustomers.length > 0 ? (
                                                filteredCustomers.map(c => (
                                                    <button
                                                        key={c._id}
                                                        type="button"
                                                        onClick={() => {
                                                            setFormData(prev => ({ ...prev, customer: c._id }));
                                                            setCustomerSearch(c.name);
                                                            setCustomerOpen(false);
                                                        }}
                                                        className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-left text-sm font-bold transition-colors ${
                                                            formData.customer === c._id
                                                                ? 'bg-[#E8601C]/10 text-[#E8601C]'
                                                                : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                                                        }`}
                                                    >
                                                        <div className="flex flex-col">
                                                            <span>{c.name}</span>
                                                            {c.phone && <span className="text-[10px] opacity-60 font-medium">{c.phone}</span>}
                                                        </div>
                                                        {formData.customer === c._id && <Check className="h-4 w-4 shrink-0" />}
                                                    </button>
                                                ))
                                            ) : customerSearch.trim() ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleCreateCustomer(customerSearch.trim())}
                                                    className="flex items-center gap-2 w-full px-3 py-3 rounded-xl text-sm font-bold text-[#E8601C] hover:bg-[#E8601C]/10 transition-colors"
                                                >
                                                    <Plus className="h-4 w-4" />
                                                    {lang === 'th' ? `เพิ่ม "${customerSearch.trim()}"` : `Add "${customerSearch.trim()}"`}
                                                </button>
                                            ) : (
                                                <p className="text-center text-sm text-slate-400 py-4">{lang === 'th' ? 'ไม่พบลูกค้า' : 'No customers found'}</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {selectedCustomer && (
                                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 text-xs space-y-1">
                                    {selectedCustomer.phone && (
                                        <p className="text-slate-500"><span className="font-bold text-slate-700 dark:text-slate-300">Tel:</span> {selectedCustomer.phone}</p>
                                    )}
                                    {selectedCustomer.address && (
                                        <p className="text-slate-500"><span className="font-bold text-slate-700 dark:text-slate-300">Addr:</span> {selectedCustomer.address}</p>
                                    )}
                                    {selectedCustomer.discount > 0 && (
                                        <Badge className="bg-emerald-50 text-emerald-600 border-none text-[10px] font-bold mt-1">
                                            Discount: {selectedCustomer.discount}%
                                        </Badge>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Glass Specifications */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Package className="h-4 w-4 text-[#E8601C]" />
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.15em]">
                                    {lang === 'th' ? 'ข้อมูลกระจก' : 'Glass Specification'}
                                </h3>
                            </div>

                            <div className="space-y-3">
                                <div ref={glassTypeRef} className="relative">
                                    <input
                                        placeholder={lang === 'th' ? 'ค้นหาหรือเพิ่มประเภท...' : 'Search or add type...'}
                                        value={glassTypeSearch}
                                        onChange={(e) => {
                                            setGlassTypeSearch(e.target.value);
                                            setGlassTypeOpen(true);
                                        }}
                                        onFocus={() => {
                                            setGlassTypeSearch("");
                                            setGlassTypeOpen(true);
                                            setCustomerOpen(false);
                                            setThicknessOpen(false);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && glassTypeSearch.trim() && filteredGlassTypes.length === 0) {
                                                handleAddGlassType(glassTypeSearch.trim());
                                            }
                                        }}
                                        className="w-full h-11 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm pl-4 pr-10 hover:border-[#E8601C]/50 transition-colors outline-none focus:ring-1 focus:ring-[#E8601C] focus:border-[#E8601C]"
                                    />
                                    <ChevronsUpDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                                    {glassTypeOpen && (
                                        <div className="absolute z-50 w-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                                            <div className="max-h-[220px] overflow-y-auto p-1.5">
                                                {filteredGlassTypes.length > 0 ? (
                                                    filteredGlassTypes.map(type => (
                                                        <button
                                                            key={type}
                                                            type="button"
                                                            onClick={() => {
                                                                setFormData(prev => ({ ...prev, glassType: type }));
                                                                setGlassTypeSearch(type);
                                                                setGlassTypeOpen(false);
                                                            }}
                                                            className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-left text-sm font-bold transition-colors ${
                                                                formData.glassType === type
                                                                    ? 'bg-[#E8601C]/10 text-[#E8601C]'
                                                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                                                            }`}
                                                        >
                                                            <span>{type}</span>
                                                            {formData.glassType === type && <Check className="h-4 w-4 shrink-0" />}
                                                        </button>
                                                    ))
                                                ) : glassTypeSearch.trim() ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAddGlassType(glassTypeSearch.trim())}
                                                        className="flex items-center gap-2 w-full px-3 py-3 rounded-xl text-sm font-bold text-[#E8601C] hover:bg-[#E8601C]/10 transition-colors"
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                        {lang === 'th' ? `เพิ่ม "${glassTypeSearch.trim()}"` : `Add "${glassTypeSearch.trim()}"`}
                                                    </button>
                                                ) : (
                                                    <p className="text-center text-sm text-slate-400 py-4">{lang === 'th' ? 'ไม่พบประเภท' : 'No types found'}</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <Label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block">
                                        {lang === 'th' ? 'ความหนา' : 'Thickness'}
                                    </Label>
                                    <div ref={thicknessRef} className="relative">
                                        <input
                                            placeholder={lang === 'th' ? 'ค้นหาหรือเพิ่ม (mm)...' : 'Search or add (mm)...'}
                                            value={thicknessSearch}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/[^0-9]/g, '');
                                                setThicknessSearch(val);
                                                setThicknessOpen(true);
                                            }}
                                            onFocus={() => {
                                                setThicknessSearch("");
                                                setThicknessOpen(true);
                                                setCustomerOpen(false);
                                                setGlassTypeOpen(false);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && thicknessSearch.trim()) {
                                                    const match = `${thicknessSearch}mm`;
                                                    if (thicknesses.includes(match)) {
                                                        setFormData(prev => ({ ...prev, thickness: match }));
                                                        setThicknessSearch(thicknessSearch);
                                                        setThicknessOpen(false);
                                                    } else {
                                                        handleAddThickness(thicknessSearch.trim());
                                                    }
                                                }
                                            }}
                                            className="w-full h-11 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm pl-4 pr-10 hover:border-[#E8601C]/50 transition-colors outline-none focus:ring-1 focus:ring-[#E8601C] focus:border-[#E8601C]"
                                        />
                                        <ChevronsUpDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                                        {thicknessOpen && (
                                            <div className="absolute z-50 w-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                                                <div className="max-h-[220px] overflow-y-auto p-1.5">
                                                    {filteredThicknesses.length > 0 ? (
                                                        filteredThicknesses.map(t => (
                                                            <button
                                                                key={t}
                                                                type="button"
                                                                onClick={() => {
                                                                    setFormData(prev => ({ ...prev, thickness: t }));
                                                                    setThicknessSearch(t.replace('mm', ''));
                                                                    setThicknessOpen(false);
                                                                }}
                                                                className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-left text-sm font-bold transition-colors ${
                                                                    formData.thickness === t
                                                                        ? 'bg-[#E8601C]/10 text-[#E8601C]'
                                                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                                                                }`}
                                                            >
                                                                <span>{t}</span>
                                                                {formData.thickness === t && <Check className="h-4 w-4 shrink-0" />}
                                                            </button>
                                                        ))
                                                    ) : thicknessSearch.trim() ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAddThickness(thicknessSearch.trim())}
                                                            className="flex items-center gap-2 w-full px-3 py-3 rounded-xl text-sm font-bold text-[#E8601C] hover:bg-[#E8601C]/10 transition-colors"
                                                        >
                                                            <Plus className="h-4 w-4" />
                                                            {lang === 'th' ? `เพิ่ม "${thicknessSearch.trim()}mm"` : `Add "${thicknessSearch.trim()}mm"`}
                                                        </button>
                                                    ) : (
                                                        <p className="text-center text-sm text-slate-400 py-4">{lang === 'th' ? 'ไม่พบ' : 'No match'}</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Dimensions */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Ruler className="h-4 w-4 text-[#E8601C]" />
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.15em]">
                                    {lang === 'th' ? 'ขนาดกระจก' : 'Dimensions'}
                                </h3>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold text-slate-400 uppercase">
                                        {lang === 'th' ? 'กว้าง' : 'Width'} (mm)
                                    </Label>
                                    <Input
                                        type="number"
                                        min={50}
                                        value={glassWidth}
                                        onChange={(e) => {
                                            const w = Math.max(1, parseInt(e.target.value) || 1);
                                            setGlassWidth(w);
                                            setVertices([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: glassHeight }, { x: 0, y: glassHeight }]);
                                        }}
                                        className="h-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-black text-sm px-4 focus:ring-[#E8601C]"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold text-slate-400 uppercase">
                                        {lang === 'th' ? 'สูง' : 'Height'} (mm)
                                    </Label>
                                    <Input
                                        type="number"
                                        min={50}
                                        value={glassHeight}
                                        onChange={(e) => {
                                            const h = Math.max(1, parseInt(e.target.value) || 1);
                                            setGlassHeight(h);
                                            setVertices([{ x: 0, y: 0 }, { x: glassWidth, y: 0 }, { x: glassWidth, y: h }, { x: 0, y: h }]);
                                        }}
                                        className="h-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-black text-sm px-4 focus:ring-[#E8601C]"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Holes List */}
                        {holes.length > 0 && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.15em]">
                                        {lang === 'th' ? 'รูเจาะ' : 'Drill Holes'} ({holes.length})
                                    </h3>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setHoles([])}
                                        className="text-[10px] text-red-400 hover:text-red-600 h-6 px-2 rounded-lg"
                                    >
                                        {lang === 'th' ? 'ลบทั้งหมด' : 'Clear All'}
                                    </Button>
                                </div>
                                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                    {holes.map((hole, i) => (
                                        <div
                                            key={hole.id}
                                            className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2 group"
                                        >
                                            <div className="flex items-center gap-2">
                                                <GripVertical className="h-3 w-3 text-slate-300" />
                                                <Badge variant="outline" className="text-[9px] font-black rounded-md border-slate-200 dark:border-slate-700 text-[#E8601C] px-1.5 py-0">
                                                    H{i + 1}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500">
                                                <span>X: {hole.x}</span>
                                                <span>Y: {hole.y}</span>
                                                <span>⌀{hole.diameter}</span>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 rounded-md text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={() => setHoles(holes.filter(h => h.id !== hole.id))}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Order Details */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-[#E8601C]" />
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.15em]">
                                    {lang === 'th' ? 'รายละเอียดคำสั่งซื้อ' : 'Order Details'}
                                </h3>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold text-slate-400 uppercase">
                                        {lang === 'th' ? 'จำนวน' : 'Quantity'}
                                    </Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={formData.quantity}
                                        onChange={(e) => setFormData({ ...formData, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                                        className="h-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-black text-sm px-4 focus:ring-[#E8601C]"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold text-slate-400 uppercase">
                                        {lang === 'th' ? 'ราคาประมาณ (฿)' : 'Est. Price (฿)'}
                                    </Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={formData.estimatedPrice}
                                        onChange={(e) => setFormData({ ...formData, estimatedPrice: Math.max(0, parseFloat(e.target.value) || 0) })}
                                        className="h-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-black text-sm px-4 focus:ring-[#E8601C]"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold text-slate-400 uppercase">
                                        {lang === 'th' ? 'กำหนดส่ง' : 'Deadline'}
                                    </Label>
                                    <Input
                                        type="date"
                                        value={formData.deadline}
                                        onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                                        className="h-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm px-4 focus:ring-[#E8601C]"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold text-slate-400 uppercase">
                                        {lang === 'th' ? 'วันส่งที่คาดหวัง' : 'Expected Delivery'}
                                    </Label>
                                    <Input
                                        type="date"
                                        value={formData.expectedDeliveryDate}
                                        onChange={(e) => setFormData({ ...formData, expectedDeliveryDate: e.target.value })}
                                        className="h-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm px-4 focus:ring-[#E8601C]"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {lang === 'th' ? 'สถานที่จัดส่ง' : 'Delivery Location'}
                                </Label>
                                <Input
                                    placeholder={lang === 'th' ? 'เช่น บางนา, กรุงเทพฯ' : 'e.g. Bangna, Bangkok'}
                                    value={formData.deliveryLocation}
                                    onChange={(e) => setFormData({ ...formData, deliveryLocation: e.target.value })}
                                    className="h-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm px-4 focus:ring-[#E8601C]"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {lang === 'th' ? 'มอบหมายให้' : 'Assign To'}
                                </Label>
                                <Select
                                    value={formData.assignedTo}
                                    onValueChange={(val) => setFormData({ ...formData, assignedTo: val || "" })}
                                >
                                    <SelectTrigger className="h-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm focus:ring-[#E8601C]">
                                        <SelectValue placeholder={lang === 'th' ? 'เลือกผู้รับผิดชอบ...' : 'Select worker...'}>
                                            {(value: string | null) => {
                                                if (!value) return <span className="text-muted-foreground">{lang === 'th' ? 'เลือกผู้รับผิดชอบ...' : 'Select worker...'}</span>;
                                                const w = workers.find(x => x._id === value);
                                                return w?.name || value;
                                            }}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent className="rounded-2xl">
                                        {workers.map(w => (
                                            <SelectItem key={w._id} value={w._id} className="font-bold rounded-xl" label={w.name}>
                                                <div className="flex flex-col">
                                                    <span>{w.name}</span>
                                                    <span className="text-[10px] opacity-60 capitalize">{w.position}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
