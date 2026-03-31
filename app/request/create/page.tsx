"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    ChevronLeft,
    ChevronDown,
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
    PanelRightClose,
    PanelRightOpen,
    X,
    Layers,
    Copy,
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GlassDesigner, HoleData, VertexData } from "@/components/glass-designer";
import { panesApi } from "@/lib/api/panes";
import { requestsApi } from "@/lib/api/requests";
import { stationsApi } from "@/lib/api/stations";
import { customersApi } from "@/lib/api/customers";
import { workersApi } from "@/lib/api/workers";
import { Customer, Worker, Material } from "@/lib/api/types";
import { materialsApi } from "@/lib/api/materials";
import jsPDF from "jspdf";
import { toast } from "sonner";
import { getCachedPricingSettings, cachePricingSettings, DEFAULT_PRICING, type PricingSettings } from "@/lib/pricing-settings";
import { pricingSettingsApi } from "@/lib/api/pricing-settings";
import { jobTypesApi, type JobType } from "@/lib/api/job-types";
import { useWebSocket } from "@/lib/hooks/use-socket";

// ─── Multi-pane spec type ────────────────────────────────────────────────────

interface PaneSpec {
    id: string;
    glassWidth: number;
    glassHeight: number;
    holes: HoleData[];
    vertices: VertexData[];
    glassType: string;
    thickness: string;
    quantity: number;
    estimatedPrice: number;
    pricePerSqFt: number;
    grindingRate: number;
    holePriceEach: number;
    notchQty: number;
    notchPrice: number;
    priceAutoFilled: boolean;
    rawGlassType: string;
    rawGlassColor: string;
    sheetsPerPane: number;
}

let _paneIdSeq = 0;
const createDefaultPane = (ps: PricingSettings): PaneSpec => ({
    id: `pane_${++_paneIdSeq}_${Date.now()}`,
    glassWidth: 800,
    glassHeight: 600,
    holes: [],
    vertices: [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 600 }, { x: 0, y: 600 }],
    glassType: "",
    thickness: "",
    quantity: 1,
    estimatedPrice: 1,
    pricePerSqFt: 0,
    grindingRate: 50,
    holePriceEach: ps.holePriceEach,
    notchQty: 0,
    notchPrice: ps.notchPrice,
    priceAutoFilled: false,
    rawGlassType: "",
    rawGlassColor: "",
    sheetsPerPane: 1,
});

const EDGE_THRESHOLD = 5; // mm — cutout within this distance of an edge counts as a notch

const isEdgeCutout = (hole: HoleData, glassW: number, glassH: number): boolean => {
    const t = EDGE_THRESHOLD;
    const type = hole.type || 'circle';
    if (type === 'circle') {
        const r = hole.diameter / 2;
        return (hole.x - r <= t) || (hole.x + r >= glassW - t) ||
               (hole.y - r <= t) || (hole.y + r >= glassH - t);
    }
    if (type === 'rectangle') {
        const hw = (hole.width || 100) / 2;
        const hh = (hole.height || 60) / 2;
        return (hole.x - hw <= t) || (hole.x + hw >= glassW - t) ||
               (hole.y - hh <= t) || (hole.y + hh >= glassH - t);
    }
    if (type === 'slot') {
        const hl = (hole.length || 80) / 2;
        const hw = (hole.width || 20) / 2;
        return (hole.x - hl <= t) || (hole.x + hl >= glassW - t) ||
               (hole.y - hw <= t) || (hole.y + hw >= glassH - t);
    }
    if (type === 'custom' && hole.points && hole.points.length >= 3) {
        return hole.points.some(pt =>
            (hole.x + pt.x <= t) || (hole.x + pt.x >= glassW - t) ||
            (hole.y + pt.y <= t) || (hole.y + pt.y >= glassH - t)
        );
    }
    return false;
};

const countEdgeAndInterior = (holes: HoleData[], glassW: number, glassH: number) => {
    let notches = 0;
    let interior = 0;
    for (const h of holes) {
        if (isEdgeCutout(h, glassW, glassH)) notches++;
        else interior++;
    }
    return { notches, interior };
};

const calcPanePrice = (p: PaneSpec) => {
    const wM = p.glassWidth / 1000;
    const hM = p.glassHeight / 1000;
    const sqFt = wM * hM * 10.764;
    const glassPrice = sqFt * p.pricePerSqFt;
    const grindingCost = 2 * (wM + hM) * p.grindingRate;
    const { notches: autoNotchQty, interior: autoHoleQty } = countEdgeAndInterior(p.holes, p.glassWidth, p.glassHeight);
    const drillCost = autoHoleQty * p.holePriceEach;
    const notchCost = p.notchQty * p.notchPrice;
    const perPane = glassPrice + grindingCost + drillCost + notchCost;
    const total = perPane * p.quantity;
    return { sqFt, glassPrice, grindingCost, drillCost, notchCost, perPane, total, autoNotchQty, autoHoleQty };
};

export default function CreateBillPage() {
    const { t, lang } = useLanguage();
    const router = useRouter();

    const [customers, setCustomers] = useState<Customer[]>([]);
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

    // ── Pricing settings (shared) ────────────────────────────────────────────
    const [pricingSettings, setPricingSettings] = useState<PricingSettings>(() => getCachedPricingSettings());

    // ── Multi-pane state ─────────────────────────────────────────────────────
    const [panes, setPanes] = useState<PaneSpec[]>(() => [createDefaultPane(getCachedPricingSettings())]);
    const [activeTab, setActiveTab] = useState(0);
    const activeTabRef = useRef(0);
    activeTabRef.current = activeTab;

    const ap = panes[activeTab] ?? panes[0];

    const updatePane = useCallback((updates: Partial<PaneSpec>) => {
        setPanes(prev => prev.map((p, i) => {
            if (i !== activeTabRef.current) return p;
            const merged = { ...p, ...updates };
            if ('holes' in updates || 'glassWidth' in updates || 'glassHeight' in updates) {
                const { notches } = countEdgeAndInterior(merged.holes, merged.glassWidth, merged.glassHeight);
                merged.notchQty = notches;
            }
            return merged;
        }));
    }, []);

    const addPane = useCallback(() => {
        setPanes(prev => {
            const newPanes = [...prev, createDefaultPane(pricingSettings)];
            setActiveTab(newPanes.length - 1);
            return newPanes;
        });
    }, [pricingSettings]);

    const removePane = useCallback((idx: number) => {
        setPanes(prev => {
            if (prev.length <= 1) return prev;
            const newPanes = prev.filter((_, i) => i !== idx);
            const cur = activeTabRef.current;
            const newActive = cur >= newPanes.length ? newPanes.length - 1 : cur > idx ? cur - 1 : cur;
            setActiveTab(newActive);
            return newPanes;
        });
    }, []);

    const duplicatePane = useCallback((idx: number) => {
        setPanes(prev => {
            const source = prev[idx];
            const clone: PaneSpec = {
                ...source,
                id: `pane_${++_paneIdSeq}_${Date.now()}`,
                holes: source.holes.map(h => ({ ...h })),
                vertices: source.vertices.map(v => ({ ...v })),
            };
            const newPanes = [...prev.slice(0, idx + 1), clone, ...prev.slice(idx + 1)];
            setActiveTab(idx + 1);
            return newPanes;
        });
    }, []);

    // ── Order-level data (shared across all panes) ───────────────────────────
    const [orderData, setOrderData] = useState({
        customer: "",
        deadline: "",
        deliveryLocation: "",
        assignedTo: "",
        expectedDeliveryDate: "",
    });

    // ── New customer dialog ──────────────────────────────────────────────────
    const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);
    const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
    const [newCustomerForm, setNewCustomerForm] = useState({
        name: "",
        phone: "",
        address: "",
        discount: 0,
        notes: "",
    });

    // ── Combobox state ───────────────────────────────────────────────────────
    const [customerOpen, setCustomerOpen] = useState(false);
    const [customerSearch, setCustomerSearch] = useState("");
    const [glassTypeOpen, setGlassTypeOpen] = useState(false);
    const [glassTypeSearch, setGlassTypeSearch] = useState("");
    const [glassTypes, setGlassTypes] = useState(['Clear', 'Tinted', 'Tempered', 'Laminated', 'Low-E', 'Reflective', 'Frosted', 'Patterned']);
    const [jobTypeOptions, setJobTypeOptions] = useState<JobType[]>([]);
    const [rawGlassTypeOptions, setRawGlassTypeOptions] = useState<string[]>([]);
    const [thicknessOpen, setThicknessOpen] = useState(false);
    const [thicknessSearch, setThicknessSearch] = useState("");
    const [thicknesses, setThicknesses] = useState(['3mm', '5mm', '6mm', '8mm', '10mm', '12mm', '15mm', '19mm']);
    const customerRef = useRef<HTMLDivElement>(null);
    const glassTypeRef = useRef<HTMLDivElement>(null);
    const thicknessRef = useRef<HTMLDivElement>(null);

    // ── Pricing calc for active pane ─────────────────────────────────────────
    const pricingCalc = useMemo(() => calcPanePrice(ap), [ap]);

    // ── Auto-fill pricePerSqFt + grindingRate when glassType & thickness are set ──
    useEffect(() => {
        if (!ap.glassType || !ap.thickness) return;
        // User already manually edited the price — don't overwrite
        if (ap.pricePerSqFt !== 0 && !ap.priceAutoFilled) return;
        // Try server settings first, fallback to DEFAULT_PRICING at leaf level
        const suggested = pricingSettings.glassPrices[ap.glassType]?.[ap.thickness]
            ?? DEFAULT_PRICING.glassPrices[ap.glassType]?.[ap.thickness];
        if (!suggested) return;
        setPanes(prev => prev.map((p, i) =>
            i === activeTabRef.current
                ? { ...p, pricePerSqFt: suggested.pricePerSqFt, grindingRate: suggested.grindingRate, priceAutoFilled: true }
                : p
        ));
    }, [ap.glassType, ap.thickness, ap.pricePerSqFt, ap.priceAutoFilled, pricingSettings]);

    // ── Sync computed price → estimatedPrice on active pane ──────────────────
    useEffect(() => {
        if (ap.pricePerSqFt > 0) {
            const newPrice = Math.round(pricingCalc.perPane * 100) / 100;
            setPanes(prev => prev.map((p, i) =>
                i === activeTabRef.current && p.estimatedPrice !== newPrice
                    ? { ...p, estimatedPrice: newPrice }
                    : p
            ));
        }
    }, [pricingCalc.perPane, ap.pricePerSqFt]);

    // ── Sync combobox search values on tab switch ────────────────────────────
    useEffect(() => {
        const p = panes[activeTab];
        if (p) {
            setGlassTypeSearch(p.glassType);
            setThicknessSearch(p.thickness);
        }
        setGlassTypeOpen(false);
        setThicknessOpen(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // ── Fetch pricing settings from server on mount ──────────────────────────
    useEffect(() => {
        pricingSettingsApi.get().then(res => {
            if (res.data) {
                // Merge: if server has empty glassPrices (old DB document), fall back to defaults
                const merged: PricingSettings = {
                    ...res.data,
                    glassPrices: Object.keys(res.data.glassPrices ?? {}).length > 0
                        ? res.data.glassPrices
                        : DEFAULT_PRICING.glassPrices,
                };
                setPricingSettings(merged);
                cachePricingSettings(merged);
            }
        }).catch(() => {});
    }, []);

    // ── Load job types from API ───────────────────────────────────────────────
    useEffect(() => {
        jobTypesApi.getAll().then(res => {
            if (res.success && res.data && res.data.length > 0) {
                const active = res.data.filter(jt => jt.isActive);
                setJobTypeOptions(active);
                // Replace glassTypes list with job type codes from API
                setGlassTypes(active.map(jt => jt.code));
            }
        }).catch(() => {/* fallback to hardcoded defaults */});
    }, []);

    // ── Subscribe to pricing:updated WebSocket event ─────────────────────────
    useWebSocket('pricing', ['pricing:updated'], (event, data) => {
        if (event === 'pricing:updated') {
            const updated = data as PricingSettings;
            setPricingSettings(updated);
            cachePricingSettings(updated);
        }
    });

    // ── Refs for closures ────────────────────────────────────────────────────
    const latestCustomers = useRef(customers);
    latestCustomers.current = customers;
    const orderDataRef = useRef(orderData);
    orderDataRef.current = orderData;
    const panesRef = useRef(panes);
    panesRef.current = panes;
    const isSubmittingRef = useRef(isSubmitting);
    isSubmittingRef.current = isSubmitting;

    // ── Load customers, workers & materials ──────────────────────────────────
    useEffect(() => {
        const load = async () => {
            try {
                const [custRes, workerRes, matRes] = await Promise.all([
                    customersApi.getAll(),
                    workersApi.getAll(),
                    materialsApi.getAll().catch(() => null),
                ]);
                if (custRes.success && custRes.data) setCustomers(custRes.data);
                if (workerRes.success && workerRes.data) setWorkers(workerRes.data);

                if (matRes?.success && matRes.data) {
                    const rawTypes = new Set<string>();
                    const extraThicknesses = new Set<string>();
                    for (const mat of matRes.data) {
                        const gt = mat.specDetails?.glassType?.trim();
                        const th = mat.specDetails?.thickness?.trim();
                        if (gt) rawTypes.add(gt);
                        if (th) {
                            const num = parseInt(th);
                            extraThicknesses.add(isNaN(num) ? th : `${num}mm`);
                        }
                    }
                    // rawGlassTypeOptions = ชนิดกระจกดิบจากคลัง (Clear, Tinted, ...)
                    if (rawTypes.size > 0) setRawGlassTypeOptions([...rawTypes]);
                    setThicknesses(prev => {
                        const merged = new Set(prev);
                        for (const t of extraThicknesses) merged.add(t);
                        return [...merged].sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
                    });
                }
            } catch (err) {
                console.error("Failed to load data:", err);
            }
        };
        load();
    }, []);

    // ── Click-outside for comboboxes ─────────────────────────────────────────
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
                setCustomerOpen(false);
                const selected = latestCustomers.current.find(c => c._id === orderDataRef.current.customer);
                setCustomerSearch(selected ? selected.name : "");
            }
            if (glassTypeRef.current && !glassTypeRef.current.contains(e.target as Node)) {
                setGlassTypeOpen(false);
                const curPane = panesRef.current[activeTabRef.current];
                setGlassTypeSearch(curPane?.glassType || "");
            }
            if (thicknessRef.current && !thicknessRef.current.contains(e.target as Node)) {
                setThicknessOpen(false);
                const curPane = panesRef.current[activeTabRef.current];
                setThicknessSearch(curPane?.thickness || "");
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // ── Filtered combobox lists ──────────────────────────────────────────────
    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.phone?.toLowerCase().includes(customerSearch.toLowerCase())
    );

    const filteredGlassTypes = glassTypes.filter(t =>
        t.toLowerCase().includes(glassTypeSearch.toLowerCase())
    );

    const availableThicknesses = useMemo(() => {
        if (!ap.glassType) return thicknesses;
        const typeEntry = pricingSettings.glassPrices[ap.glassType];
        if (!typeEntry || Object.keys(typeEntry).length === 0) return thicknesses;
        return Object.keys(typeEntry).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
    }, [ap.glassType, pricingSettings.glassPrices, thicknesses]);

    const filteredThicknesses = availableThicknesses.filter(t =>
        t.toLowerCase().includes(thicknessSearch.toLowerCase()) ||
        t.replace('mm', '').includes(thicknessSearch)
    );

    // ── Handler: new customer dialog ─────────────────────────────────────────
    const openNewCustomerDialog = (prefillName: string) => {
        setNewCustomerForm({ name: prefillName, phone: "", address: "", discount: 0, notes: "" });
        setCustomerOpen(false);
        setIsNewCustomerOpen(true);
    };

    const handleCreateCustomer = async () => {
        if (!newCustomerForm.name.trim()) return;
        setIsCreatingCustomer(true);
        try {
            const payload: Partial<Customer> = { name: newCustomerForm.name.trim() };
            if (newCustomerForm.phone.trim()) payload.phone = newCustomerForm.phone.trim();
            if (newCustomerForm.address.trim()) payload.address = newCustomerForm.address.trim();
            if (newCustomerForm.discount > 0) payload.discount = newCustomerForm.discount;
            if (newCustomerForm.notes.trim()) payload.notes = newCustomerForm.notes.trim();

            const res = await customersApi.create(payload);
            if (res.success && res.data) {
                setCustomers(prev => [...prev, res.data!]);
                setOrderData(prev => ({ ...prev, customer: res.data!._id }));
                setCustomerSearch(res.data!.name);
                setIsNewCustomerOpen(false);
                toast.success(lang === 'th' ? `เพิ่มลูกค้า "${res.data!.name}" สำเร็จ` : `Customer "${res.data!.name}" created`);
            }
        } catch {
            toast.error(lang === 'th' ? 'ไม่สามารถเพิ่มลูกค้าได้' : 'Failed to create customer');
        } finally {
            setIsCreatingCustomer(false);
        }
    };

    // ── Handler: add glass type ──────────────────────────────────────────────
    const handleAddGlassType = (type: string) => {
        setGlassTypes(prev => [...prev, type]);
        const typeEntry = pricingSettings.glassPrices[type];
        const typeThicknesses = typeEntry && Object.keys(typeEntry).length > 0 ? Object.keys(typeEntry) : null;
        const currentThicknessValid = !typeThicknesses || typeThicknesses.includes(ap.thickness);
        const newThickness = currentThicknessValid ? ap.thickness : "";
        const suggested = newThickness ? pricingSettings.glassPrices[type]?.[newThickness] : null;
        const jt = jobTypeOptions.find(j => j.code === type);
        updatePane({
            glassType: type,
            thickness: newThickness,
            sheetsPerPane: jt?.sheetsPerPane ?? (/laminated/i.test(type) ? 2 : 1),
            ...(suggested ? { pricePerSqFt: suggested.pricePerSqFt, grindingRate: suggested.grindingRate, priceAutoFilled: true } : { pricePerSqFt: 0, grindingRate: 50, priceAutoFilled: false }),
        });
        setGlassTypeSearch(type);
        setThicknessSearch(newThickness);
        setGlassTypeOpen(false);
        toast.success(lang === 'th' ? `เพิ่มประเภท "${type}" สำเร็จ` : `Glass type "${type}" added`);
    };

    // ── Handler: add thickness ───────────────────────────────────────────────
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
        const suggested = pricingSettings.glassPrices[ap.glassType]?.[value];
        updatePane({
            thickness: value,
            ...(suggested ? { pricePerSqFt: suggested.pricePerSqFt, grindingRate: suggested.grindingRate, priceAutoFilled: true } : { pricePerSqFt: 0, grindingRate: 50, priceAutoFilled: false }),
        });
        setThicknessSearch(value);
        setThicknessOpen(false);
        toast.success(lang === 'th' ? `เพิ่มความหนา ${value} สำเร็จ` : `Thickness ${value} added`);
    };

    // ── Handler: holes & vertices (stable callbacks via ref) ─────────────────
    const handleHolesChange = useCallback((newHoles: HoleData[]) => {
        setPanes(prev => prev.map((p, i) => {
            if (i !== activeTabRef.current) return p;
            const { notches } = countEdgeAndInterior(newHoles, p.glassWidth, p.glassHeight);
            return { ...p, holes: newHoles, notchQty: notches };
        }));
    }, []);

    const handleVerticesChange = useCallback((newVerts: VertexData[]) => {
        setPanes(prev => prev.map((p, i) => i === activeTabRef.current ? { ...p, vertices: newVerts } : p));
    }, []);

    // ── Keyboard shortcuts ───────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            if (!mod) return;
            const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
            if (inInput && e.key !== 's' && e.key !== 'p') return;
            if (e.key === 's') {
                e.preventDefault();
                const od = orderDataRef.current;
                const ps = panesRef.current;
                if (!isSubmittingRef.current && od.customer && ps.some(p => p.glassType)) {
                    document.getElementById('__bill-submit-btn')?.click();
                }
                return;
            }
            if (e.key === 'p') {
                e.preventDefault();
                document.getElementById('__bill-pdf-btn')?.click();
                return;
            }
            if (e.key === '\\' || e.key === '|') {
                e.preventDefault();
                setIsRightPanelOpen(v => !v);
                return;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // ── Submit: create request + panes for ALL specs ─────────────────────────
    const handleSubmit = async () => {
        const validPanes = panes.filter(p => p.glassType);
        if (!orderData.customer || validPanes.length === 0) return;
        setIsSubmitting(true);

        const totalQty = validPanes.reduce((sum, p) => sum + p.quantity, 0);
        const totalPrice = validPanes.reduce((sum, p) => sum + calcPanePrice(p).total, 0);
        const typeDesc = validPanes.map(p => `${p.glassType} ${p.thickness} (${p.glassWidth}×${p.glassHeight}mm)`).join(' + ');

        const payload = {
            details: {
                type: typeDesc,
                quantity: totalQty,
                estimatedPrice: Math.round(totalPrice * 100) / 100,
            },
            customer: orderData.customer,
            deadline: orderData.deadline ? new Date(orderData.deadline).toISOString() : undefined,
            deliveryLocation: orderData.deliveryLocation,
            assignedTo: orderData.assignedTo || undefined,
            expectedDeliveryDate: orderData.expectedDeliveryDate ? new Date(orderData.expectedDeliveryDate).toISOString() : undefined,
        };

        try {
            const res = await requestsApi.create(payload);
            if (res.success) {
                const requestId = res.data._id;

                let orderReleaseStationId = "";
                try {
                    const stRes = await stationsApi.getAll();
                    if (stRes.success && Array.isArray(stRes.data)) {
                        const ors = stRes.data.find(s => /order.?rele/i.test(s.name));
                        if (ors) orderReleaseStationId = ors._id;
                    }
                } catch { /* use fallback */ }

                let panesCreated = 0;
                for (const pane of validPanes) {
                    const thicknessMm = parseFloat(pane.thickness) || 0;
                    const glassSpec = [
                        pane.glassType,
                        pane.thickness,
                        pane.rawGlassType ? `(ดิบ: ${pane.rawGlassColor ? pane.rawGlassColor + ' ' : ''}${pane.rawGlassType} ${pane.thickness}mm×${pane.sheetsPerPane}แผ่น)` : null,
                        `${pane.glassWidth}×${pane.glassHeight}mm`,
                    ].filter(Boolean).join(' ');
                    const qty = Math.max(1, pane.quantity);
                    for (let i = 0; i < qty; i++) {
                        try {
                            await panesApi.create({
                                request: requestId,
                                dimensions: { width: pane.glassWidth, height: pane.glassHeight, thickness: thicknessMm },
                                glassType: pane.glassType,
                                glassTypeLabel: glassSpec,
                                jobType: pane.glassType,
                                ...(pane.rawGlassType ? {
                                    rawGlass: {
                                        glassType: pane.rawGlassType,
                                        color: pane.rawGlassColor,
                                        thickness: parseFloat(pane.thickness) || 0,
                                        sheetsPerPane: pane.sheetsPerPane,
                                    },
                                } : {}),
<<<<<<< HEAD
                                ...(orderReleaseStationId ? { currentStation: orderReleaseStationId } : {}),
=======
                                holes: pane.holes,
                                currentStation: "Order_Reless",
>>>>>>> origin/main
                            } as Record<string, unknown>);
                            panesCreated++;
                        } catch (paneErr) {
                            console.error(`[CreateBill] Failed to create pane:`, paneErr);
                        }
                    }
                }

                if (panesCreated > 0) {
                    toast.success(lang === 'th'
                        ? `สร้างคำสั่งซื้อสำเร็จ — สร้างกระจก ${panesCreated} ชิ้น`
                        : `Order created — ${panesCreated} panes created`);
                } else {
                    toast.success(lang === 'th' ? 'สร้างคำสั่งซื้อสำเร็จ' : 'Order request created successfully');
                }
                router.push("/request");
            }
        } catch (err) {
            console.error("Failed to create request:", err);
            toast.error(lang === 'th' ? 'ไม่สามารถสร้างคำสั่งซื้อได้' : 'Failed to create order request');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── PDF export (active pane) ─────────────────────────────────────────────
    const handleExportPDF = () => {
        const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 15;

        pdf.setFontSize(18);
        pdf.setFont("helvetica", "bold");
        pdf.text("Standard Plus - Glass Bill", margin, margin + 5);

        pdf.setFontSize(9);
        pdf.setFont("helvetica", "normal");
        const cust = customers.find(c => c._id === orderData.customer);
        pdf.text(`Customer: ${cust?.name || '—'}`, margin, margin + 13);
        pdf.text(`Date: ${new Date().toLocaleDateString()}`, margin, margin + 18);
        pdf.text(`Type: ${ap.glassType} ${ap.thickness}`, pageW / 2, margin + 13);
        pdf.text(`Qty: ${ap.quantity}`, pageW / 2, margin + 18);
        let nextInfoY = margin + 23;
        if (panes.length > 1) {
            pdf.text(`Pane spec ${activeTab + 1} of ${panes.length}`, pageW / 2, nextInfoY);
            nextInfoY += 5;
        }
        if (orderData.deadline) {
            pdf.text(`Deadline: ${orderData.deadline}`, pageW / 2, nextInfoY);
        }

        pdf.setDrawColor(200);
        pdf.line(margin, margin + 27, pageW - margin, margin + 27);

        const drawAreaX = margin;
        const drawAreaY = margin + 32;
        const drawAreaW = pageW - margin * 2;
        const drawAreaH = pageH - drawAreaY - margin - 20;

        const scaleX = drawAreaW / (ap.glassWidth * 1.3);
        const scaleY = drawAreaH / (ap.glassHeight * 1.3);
        const scale = Math.min(scaleX, scaleY);
        const gW = ap.glassWidth * scale;
        const gH = ap.glassHeight * scale;
        const gX = drawAreaX + (drawAreaW - gW) / 2;
        const gY = drawAreaY + (drawAreaH - gH) / 2;

        pdf.setFillColor(220, 235, 250);
        pdf.setDrawColor(27, 75, 154);
        pdf.setLineWidth(0.5);
        pdf.rect(gX, gY, gW, gH, "FD");

        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        pdf.setDrawColor(100);
        pdf.setLineWidth(0.2);

        const dimY = gY + gH + 8;
        pdf.line(gX, dimY, gX + gW, dimY);
        pdf.line(gX, gY + gH + 2, gX, dimY + 3);
        pdf.line(gX + gW, gY + gH + 2, gX + gW, dimY + 3);
        pdf.text(`${ap.glassWidth} mm`, gX + gW / 2, dimY + 5, { align: "center" });

        const dimX = gX - 8;
        pdf.line(dimX, gY, dimX, gY + gH);
        pdf.line(gX - 2, gY, dimX - 3, gY);
        pdf.line(gX - 2, gY + gH, dimX - 3, gY + gH);
        pdf.text(`${ap.glassHeight} mm`, dimX - 3, gY + gH / 2, { angle: 90, align: "center" });

        pdf.setDrawColor(232, 96, 28);
        pdf.setLineWidth(0.3);
        const hScaleX = gW / ap.glassWidth;
        const hScaleY = gH / ap.glassHeight;
        ap.holes.forEach((hole, i) => {
            const hx = gX + hole.x * hScaleX;
            const hy = gY + (ap.glassHeight - hole.y) * hScaleY;
            const type = hole.type || 'circle';
            let labelText = '';

            if (type === 'circle') {
                const hr = (hole.diameter / 2) * hScaleX;
                pdf.circle(hx, hy, Math.max(hr, 1.5));
                pdf.line(hx - hr - 1.5, hy, hx + hr + 1.5, hy);
                pdf.line(hx, hy - hr - 1.5, hx, hy + hr + 1.5);
                labelText = `C${i + 1}: ⌀${hole.diameter}mm`;
            } else if (type === 'rectangle') {
                const w = (hole.width || 100) * hScaleX;
                const h = (hole.height || 60) * hScaleY;
                pdf.rect(hx - w / 2, hy - h / 2, w, h);
                pdf.line(hx - w / 2 - 1.5, hy, hx + w / 2 + 1.5, hy);
                pdf.line(hx, hy - h / 2 - 1.5, hx, hy + h / 2 + 1.5);
                labelText = `C${i + 1}: ${hole.width || 100}×${hole.height || 60}mm`;
            } else if (type === 'slot') {
                const len = (hole.length || 80) * hScaleX;
                const w = (hole.width || 20) * hScaleY;
                const r = w / 2;
                const halfBody = (len - w) / 2;
                pdf.line(hx - halfBody, hy - r, hx + halfBody, hy - r);
                pdf.line(hx - halfBody, hy + r, hx + halfBody, hy + r);
                const arcSegs = 12;
                for (let s = 0; s < arcSegs; s++) {
                    const a1 = -Math.PI / 2 + (Math.PI * s / arcSegs);
                    const a2 = -Math.PI / 2 + (Math.PI * (s + 1) / arcSegs);
                    pdf.line(hx + halfBody + Math.cos(a1) * r, hy + Math.sin(a1) * r,
                             hx + halfBody + Math.cos(a2) * r, hy + Math.sin(a2) * r);
                    const b1 = Math.PI / 2 + (Math.PI * s / arcSegs);
                    const b2 = Math.PI / 2 + (Math.PI * (s + 1) / arcSegs);
                    pdf.line(hx - halfBody + Math.cos(b1) * r, hy + Math.sin(b1) * r,
                             hx - halfBody + Math.cos(b2) * r, hy + Math.sin(b2) * r);
                }
                pdf.line(hx - len / 2 - 1.5, hy, hx + len / 2 + 1.5, hy);
                labelText = `C${i + 1}: ${hole.length || 80}×${hole.width || 20}mm`;
            } else if (type === 'custom' && hole.points && hole.points.length >= 3) {
                const pts = hole.points;
                for (let p = 0; p < pts.length; p++) {
                    const p1 = pts[p];
                    const p2 = pts[(p + 1) % pts.length];
                    pdf.line(hx + p1.x * hScaleX, hy - p1.y * hScaleY,
                             hx + p2.x * hScaleX, hy - p2.y * hScaleY);
                }
                labelText = `C${i + 1}: custom ${pts.length}pts`;
            }
            pdf.setFontSize(6);
            pdf.text(labelText, hx + 5, hy + 1);
        });

        if (ap.holes.length > 0) {
            const tableY = pageH - margin - 15;
            pdf.setFontSize(7);
            pdf.setFont("helvetica", "bold");
            pdf.setDrawColor(150);
            pdf.text("CUTOUTS", margin, tableY);
            pdf.setFont("helvetica", "normal");
            ap.holes.forEach((hole, i) => {
                const type = hole.type || 'circle';
                const tx = margin + (i % 3) * 70;
                const ty = tableY + 4 + Math.floor(i / 3) * 5;
                let desc = '';
                if (type === 'circle') desc = `⌀${hole.diameter}mm`;
                else if (type === 'rectangle') desc = `${hole.width || 100}×${hole.height || 60}mm`;
                else if (type === 'slot') desc = `${hole.length || 80}×${hole.width || 20}mm slot`;
                else if (type === 'custom') desc = `custom ${hole.points?.length || 0}pts`;
                pdf.text(`C${i + 1}[${type}]: X=${hole.x} Y=${hole.y} ${desc}`, tx, ty);
            });
        }

        pdf.setFontSize(7);
        pdf.setTextColor(150);
        pdf.text("Generated by Standard Plus System", margin, pageH - margin + 3);
        pdf.text(`Page 1 of 1`, pageW - margin, pageH - margin + 3, { align: "right" });

        pdf.save(`bill_${cust?.name || 'glass'}_pane${activeTab + 1}_${Date.now()}.pdf`);
    };

    // ── DXF export (active pane) ─────────────────────────────────────────────
    const handleExportDXF = () => {
        const ap = panes[activeTab];
        const w = ap.glassWidth;
        const h = ap.glassHeight;
        const rows: string[] = [];
        const dxf = (...pairs: [number, string | number][]) =>
            pairs.forEach(([code, val]) => rows.push(String(code), String(val)));

        // HEADER
        dxf([0, 'SECTION'], [2, 'HEADER'],
            [9, '$INSUNITS'], [70, 4],   // 4 = millimetres
            [0, 'ENDSEC']);

        // ENTITIES
        dxf([0, 'SECTION'], [2, 'ENTITIES']);

        // Glass outline on layer "outline"
        dxf([0, 'LWPOLYLINE'], [8, 'outline'], [62, 5],  // color: blue
            [90, 4], [70, 1]);  // 4 vertices, closed
        dxf([10, 0], [20, 0]);
        dxf([10, w], [20, 0]);
        dxf([10, w], [20, h]);
        dxf([10, 0], [20, h]);

        // Holes on layer "holes"
        for (const hole of ap.holes) {
            if (hole.type === 'circle') {
                dxf([0, 'CIRCLE'], [8, 'holes'], [62, 1],  // color: red
                    [10, hole.x], [20, hole.y], [30, 0],
                    [40, hole.diameter / 2]);
            } else if (hole.type === 'rectangle') {
                const hw = (hole.width  ?? hole.diameter) / 2;
                const hh = (hole.height ?? hole.diameter) / 2;
                dxf([0, 'LWPOLYLINE'], [8, 'holes'], [62, 1], [90, 4], [70, 1]);
                dxf([10, hole.x - hw], [20, hole.y - hh]);
                dxf([10, hole.x + hw], [20, hole.y - hh]);
                dxf([10, hole.x + hw], [20, hole.y + hh]);
                dxf([10, hole.x - hw], [20, hole.y + hh]);
            } else if (hole.type === 'slot') {
                // Slot = rectangle with rounded ends; export as rect (CNC will interpret)
                const sl = (hole.length ?? hole.diameter) / 2;
                const sr = hole.diameter / 2;
                dxf([0, 'LWPOLYLINE'], [8, 'holes'], [62, 1], [90, 4], [70, 1]);
                dxf([10, hole.x - sl], [20, hole.y - sr]);
                dxf([10, hole.x + sl], [20, hole.y - sr]);
                dxf([10, hole.x + sl], [20, hole.y + sr]);
                dxf([10, hole.x - sl], [20, hole.y + sr]);
            } else if (hole.type === 'custom' && hole.points && hole.points.length >= 2) {
                dxf([0, 'LWPOLYLINE'], [8, 'holes'], [62, 1],
                    [90, hole.points.length], [70, 1]);
                for (const pt of hole.points) {
                    dxf([10, hole.x + pt.x], [20, hole.y + pt.y]);
                }
            }
        }

        dxf([0, 'ENDSEC'], [0, 'EOF']);

        const content = rows.join('\n');
        const blob = new Blob([content], { type: 'application/dxf' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        const custName = customers.find(c => c._id === orderData.customer)?.name ?? 'glass';
        a.download = `bill_${custName}_pane${activeTab + 1}_${Date.now()}.dxf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`Export DXF สำเร็จ — ${ap.holes.length} รูตัด`);
    };

    // ── DXF import (into active pane) ────────────────────────────────────────
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
                const currentPane = panesRef.current[activeTabRef.current];

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
                            type: 'circle',
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

                const finalWidth = maxX > 0 ? maxX : currentPane.glassWidth;
                const finalHeight = maxY > 0 ? maxY : currentPane.glassHeight;
                const validHoles = importedHoles.filter(h => h.x <= finalWidth && h.y <= finalHeight);
                const outOfBounds = importedHoles.length - validHoles.length;

                updatePane({
                    ...(maxX > 0 ? { glassWidth: maxX } : {}),
                    ...(maxY > 0 ? { glassHeight: maxY } : {}),
                    vertices: [{ x: 0, y: 0 }, { x: finalWidth, y: 0 }, { x: finalWidth, y: finalHeight }, { x: 0, y: finalHeight }],
                    holes: validHoles,
                });

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

    const selectedCustomer = customers.find(c => c._id === orderData.customer);
    const grandTotal = useMemo(() => panes.reduce((sum, p) => sum + calcPanePrice(p).total, 0), [panes]);

    return (
        <div className="flex flex-col lg:h-full lg:overflow-hidden">
            {/* Top Header Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-3 sm:px-6 py-3 gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <Link href="/request">
                        <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9 text-slate-400 hover:text-slate-900 dark:hover:text-white shrink-0">
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div className="min-w-0">
                        <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight truncate">
                            {lang === 'th' ? 'สร้างบิล / คำสั่งซื้อ' : 'Create Bill / Order Request'}
                        </h1>
                        <p className="text-[11px] text-slate-400 font-bold hidden sm:block">
                            {lang === 'th' ? 'ออกแบบกระจก กำหนดรูเจาะ และส่งคำสั่งซื้อ' : 'Design glass, place drill holes, and submit order request'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
                    <Button
                        onClick={handleImportDXF}
                        variant="outline"
                        className="inline-flex items-center justify-center whitespace-nowrap gap-2 rounded-xl font-bold text-xs h-9 px-3 border-slate-200 dark:border-slate-800 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300"
                    >
                        <FileUp className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                        <span className="hidden sm:inline">Import DXF</span>
                        <span className="sm:hidden">DXF</span>
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            id="__bill-pdf-btn"
                            className="inline-flex items-center justify-center whitespace-nowrap gap-2 rounded-xl font-bold text-xs h-9 px-3 border border-slate-200 dark:border-slate-800 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                            <FileDown className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                            <span className="hidden sm:inline">Export</span>
                            <ChevronDown className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl min-w-[140px]">
                            <DropdownMenuItem onClick={handleExportPDF} className="rounded-lg text-xs font-semibold gap-2">
                                <FileDown className="h-3.5 w-3.5 text-slate-400" />
                                Export PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleExportDXF} className="rounded-lg text-xs font-semibold gap-2">
                                <FileDown className="h-3.5 w-3.5 text-slate-400" />
                                Export DXF
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
                        className="rounded-xl h-9 w-9 text-slate-400 hover:text-slate-900 dark:hover:text-white hidden lg:flex"
                        title={isRightPanelOpen ? (lang === 'th' ? "ซ่อนแผงตั้งค่า" : "Hide Panel") : (lang === 'th' ? "แสดงแผงตั้งค่า" : "Show Panel")}
                    >
                        {isRightPanelOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
                    </Button>
                    <Button
                        id="__bill-submit-btn"
                        onClick={handleSubmit}
                        disabled={isSubmitting || !orderData.customer || !panes.some(p => p.glassType)}
                        className="gap-1.5 rounded-xl font-bold text-xs h-9 bg-primary hover:bg-primary/90 dark:bg-[#E8601C] dark:hover:bg-[#E8601C]/90 text-white shadow-lg shadow-primary/20 dark:shadow-orange-500/20 px-4 sm:px-6 ml-auto sm:ml-0"
                        title="บันทึก (Ctrl/⌘+S)"
                    >
                        <Save className="h-3.5 w-3.5" />
                        {isSubmitting
                            ? (lang === 'th' ? 'บันทึก...' : 'Saving...')
                            : (lang === 'th' ? 'บันทึก' : 'Save')
                        }
                    </Button>
                </div>
            </div>

            {/* Main Content - Split Layout */}
            <div className="flex flex-col lg:flex-row lg:flex-1 lg:overflow-hidden">
                {/* Left: Glass Designer Canvas */}
                <div className={`flex flex-col min-w-0 h-[50vh] sm:h-[60vh] lg:h-auto lg:flex-1 ${isRightPanelOpen ? "lg:border-r border-slate-200 dark:border-slate-800" : ""}`}>
                    <GlassDesigner
                        key={ap.id}
                        width={ap.glassWidth}
                        height={ap.glassHeight}
                        holes={ap.holes}
                        onHolesChange={handleHolesChange}
                        vertices={ap.vertices}
                        onVerticesChange={handleVerticesChange}
                        thickness={parseInt(ap.thickness) || 6}
                    />
                </div>

                {/* Right: Form Panel */}
                <div className={`w-full shrink-0 bg-white dark:bg-slate-900 border-t lg:border-t-0 border-slate-200 dark:border-slate-800 ${isRightPanelOpen ? "lg:w-[380px] lg:overflow-y-auto lg:block" : "lg:hidden"}`}>
                    {/* ── Pane Tabs (inside right panel) ───────────────── */}
                    <div className="flex items-center gap-1 px-4 sm:px-6 pt-4 sm:pt-5 pb-0 overflow-x-auto">
                        {panes.map((pane, idx) => {
                            const isActive = idx === activeTab;
                            return (
                                <div
                                    key={pane.id}
                                    role="tab"
                                    tabIndex={0}
                                    onClick={() => setActiveTab(idx)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveTab(idx); }}
                                    className={`group relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer select-none ${
                                        isActive
                                            ? 'bg-[#E8601C]/10 text-[#E8601C]'
                                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <span className="truncate max-w-[100px]">
                                        {pane.glassType ? `${pane.glassType} ${idx + 1}` : (lang === 'th' ? `แผ่น ${idx + 1}` : `Pane ${idx + 1}`)}
                                    </span>
                                    {panes.length > 1 && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger
                                                className={`p-0.5 rounded text-slate-300 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer focus:outline-none ${
                                                    isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                                }`}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <X className="h-2.5 w-2.5" />
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="start" className="rounded-xl min-w-[130px]">
                                                <DropdownMenuItem onClick={() => duplicatePane(idx)} className="rounded-lg text-xs font-semibold gap-2">
                                                    <Copy className="h-3.5 w-3.5" />
                                                    {lang === 'th' ? 'ทำซ้ำ' : 'Duplicate'}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => removePane(idx)} className="rounded-lg text-xs font-semibold gap-2 text-red-600 focus:text-red-600">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                    {lang === 'th' ? 'ลบ' : 'Remove'}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>
                            );
                        })}
                        <button
                            onClick={addPane}
                            className="flex items-center gap-0.5 px-2 py-1.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-[#E8601C] hover:bg-[#E8601C]/5 transition-colors whitespace-nowrap shrink-0"
                        >
                            <Plus className="h-3 w-3" />
                        </button>
                    </div>

                    <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white lg:hidden">
                            {lang === 'th' ? 'รายละเอียดคำสั่งซื้อ' : 'Order Details'}
                        </h3>
                        {/* Customer Section */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-primary dark:text-[#E8601C]" />
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.15em]">
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
                                            openNewCustomerDialog(customerSearch.trim());
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
                                                            setOrderData(prev => ({ ...prev, customer: c._id }));
                                                            setCustomerSearch(c.name);
                                                            setCustomerOpen(false);
                                                        }}
                                                        className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-left text-sm font-bold transition-colors ${
                                                            orderData.customer === c._id
                                                                ? 'bg-[#E8601C]/10 text-[#E8601C]'
                                                                : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                                                        }`}
                                                    >
                                                        <div className="flex flex-col">
                                                            <span>{c.name}</span>
                                                            {c.phone && <span className="text-[10px] opacity-60 font-medium">{c.phone}</span>}
                                                        </div>
                                                        {orderData.customer === c._id && <Check className="h-4 w-4 shrink-0" />}
                                                    </button>
                                                ))
                                            ) : customerSearch.trim() ? (
                                                <button
                                                    type="button"
                                                    onClick={() => openNewCustomerDialog(customerSearch.trim())}
                                                    className="flex items-center gap-2 w-full px-3 py-3 rounded-xl text-sm font-bold text-blue-600 dark:text-[#E8601C] hover:bg-blue-50 dark:hover:bg-[#E8601C]/10 transition-colors"
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
                                        <Badge className="bg-emerald-50 text-emerald-600 border-none text-[10px] font-semibold mt-1">
                                            Discount: {selectedCustomer.discount}%
                                        </Badge>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ลักษณะงาน (per-pane) */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Package className="h-4 w-4 text-primary dark:text-[#E8601C]" />
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.15em]">
                                    {lang === 'th' ? 'ลักษณะงาน' : 'Job Type'}
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
                                                                const priceTable = Object.keys(pricingSettings.glassPrices[type] ?? {}).length > 0
                                                                    ? pricingSettings.glassPrices
                                                                    : DEFAULT_PRICING.glassPrices;
                                                                const typeEntry = priceTable[type];
                                                                const typeThicknesses = typeEntry && Object.keys(typeEntry).length > 0 ? Object.keys(typeEntry) : null;
                                                                const currentThicknessValid = !typeThicknesses || typeThicknesses.includes(ap.thickness);
                                                                const newThickness = currentThicknessValid ? ap.thickness : "";
                                                                const suggested = newThickness
                                                                    ? (pricingSettings.glassPrices[type]?.[newThickness] ?? DEFAULT_PRICING.glassPrices[type]?.[newThickness])
                                                                    : null;
                                                                const jt = jobTypeOptions.find(j => j.code === type);
                                                                const rawSuggest = jt?.defaultRawGlassTypes?.[0];
                                                                updatePane({
                                                                    glassType: type,
                                                                    thickness: newThickness,
                                                                    sheetsPerPane: jt?.sheetsPerPane ?? (/laminated/i.test(type) ? 2 : 1),
                                                                    ...(rawSuggest && !ap.rawGlassType ? { rawGlassType: rawSuggest } : {}),
                                                                    ...(suggested ? { pricePerSqFt: suggested.pricePerSqFt, grindingRate: suggested.grindingRate, priceAutoFilled: true } : { pricePerSqFt: 0, grindingRate: 50, priceAutoFilled: false }),
                                                                });
                                                                setGlassTypeSearch(type);
                                                                setThicknessSearch(newThickness);
                                                                setGlassTypeOpen(false);
                                                            }}
                                                            className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-left text-sm font-bold transition-colors ${
                                                                ap.glassType === type
                                                                    ? 'bg-[#E8601C]/10 text-[#E8601C]'
                                                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                                                            }`}
                                                        >
                                                            <span>{type}</span>
                                                            {ap.glassType === type && <Check className="h-4 w-4 shrink-0" />}
                                                        </button>
                                                    ))
                                                ) : glassTypeSearch.trim() ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAddGlassType(glassTypeSearch.trim())}
                                                        className="flex items-center gap-2 w-full px-3 py-3 rounded-xl text-sm font-bold text-blue-600 dark:text-[#E8601C] hover:bg-blue-50 dark:hover:bg-[#E8601C]/10 transition-colors"
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
                                    <Label className="text-[10px] font-semibold text-slate-400 uppercase mb-1.5 block">
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
                                                        const suggested = pricingSettings.glassPrices[ap.glassType]?.[match];
                                                        updatePane({
                                                            thickness: match,
                                                            ...(suggested ? { pricePerSqFt: suggested.pricePerSqFt, grindingRate: suggested.grindingRate, priceAutoFilled: true } : { pricePerSqFt: 0, grindingRate: 50, priceAutoFilled: false }),
                                                        });
                                                        setThicknessSearch(match);
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
                                                                    const suggested = pricingSettings.glassPrices[ap.glassType]?.[t]
                                                                        ?? DEFAULT_PRICING.glassPrices[ap.glassType]?.[t];
                                                                    updatePane({
                                                                        thickness: t,
                                                                        ...(suggested ? { pricePerSqFt: suggested.pricePerSqFt, grindingRate: suggested.grindingRate, priceAutoFilled: true } : { pricePerSqFt: 0, grindingRate: 50, priceAutoFilled: false }),
                                                                    });
                                                                    setThicknessSearch(t);
                                                                    setThicknessOpen(false);
                                                                }}
                                                                className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-left text-sm font-bold transition-colors ${
                                                                    ap.thickness === t
                                                                        ? 'bg-[#E8601C]/10 text-[#E8601C]'
                                                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                                                                }`}
                                                            >
                                                                <span>{t}</span>
                                                                {ap.thickness === t && <Check className="h-4 w-4 shrink-0" />}
                                                            </button>
                                                        ))
                                                    ) : thicknessSearch.trim() ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAddThickness(thicknessSearch.trim())}
                                                            className="flex items-center gap-2 w-full px-3 py-3 rounded-xl text-sm font-bold text-blue-600 dark:text-[#E8601C] hover:bg-blue-50 dark:hover:bg-[#E8601C]/10 transition-colors"
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

                            {/* กระจกดิบสำหรับเบิก */}
                            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-3">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <Layers className="h-3 w-3" />
                                    {lang === 'th' ? 'กระจกดิบที่ใช้ (สำหรับเบิกจากคลัง)' : 'Raw Glass for Withdrawal'}
                                </p>

                                {/* rawGlassType */}
                                <Select
                                    value={ap.rawGlassType}
                                    onValueChange={(v) => updatePane({ rawGlassType: v ?? "" })}
                                >
                                    <SelectTrigger className="h-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm focus:ring-[#E8601C]">
                                        <SelectValue placeholder={lang === 'th' ? 'ชนิดกระจกดิบ...' : 'Raw glass type...'} />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-2xl">
                                        {(rawGlassTypeOptions.length > 0
                                            ? rawGlassTypeOptions
                                            : ['Clear', 'Tinted', 'Reflective', 'Frosted', 'Patterned']
                                        ).map(t => (
                                            <SelectItem key={t} value={t} className="font-semibold">{t}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                {/* rawGlassColor quick-select */}
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-semibold text-slate-400 uppercase">
                                        {lang === 'th' ? 'สีกระจก' : 'Glass Color'}
                                    </Label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {['ใส', 'เขียว', 'ชา', 'เทา', 'บรอนซ์'].map(color => (
                                            <button
                                                key={color}
                                                type="button"
                                                onClick={() => updatePane({ rawGlassColor: ap.rawGlassColor === color ? '' : color })}
                                                className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-colors ${
                                                    ap.rawGlassColor === color
                                                        ? 'bg-[#E8601C] text-white border-[#E8601C]'
                                                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-[#E8601C]/50'
                                                }`}
                                            >
                                                {color}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* sheetsPerPane — only for laminated glass */}
                                {/laminated/i.test(ap.glassType) && (
                                    <>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-semibold text-slate-400 uppercase">
                                                {lang === 'th' ? 'จำนวนแผ่นดิบต่อชิ้น' : 'Sheets/pane'}
                                            </Label>
                                            <Input
                                                type="number"
                                                min={2}
                                                max={10}
                                                value={ap.sheetsPerPane}
                                                onChange={(e) => updatePane({ sheetsPerPane: Math.max(2, parseInt(e.target.value) || 2) })}
                                                className="h-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm px-4 focus:ring-[#E8601C]"
                                            />
                                        </div>

                                        {ap.sheetsPerPane > 1 && (
                                            <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 rounded-xl border border-amber-100 dark:border-amber-900/30">
                                                ⚠️ จะเบิกกระจกดิบ <span className="font-bold">{ap.sheetsPerPane} แผ่น</span> ต่อชิ้น — ระบบจะหักสต็อกตามจำนวนนี้
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Dimensions (per-pane) */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Ruler className="h-4 w-4 text-primary dark:text-[#E8601C]" />
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.15em]">
                                    {lang === 'th' ? 'ขนาดกระจก' : 'Dimensions'}
                                </h3>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-semibold text-slate-400 uppercase">
                                        {lang === 'th' ? 'กว้าง' : 'Width'} (mm)
                                    </Label>
                                    <Input
                                        type="number"
                                        min={50}
                                        value={ap.glassWidth}
                                        onChange={(e) => {
                                            const w = Math.max(1, parseInt(e.target.value) || 1);
                                            updatePane({
                                                glassWidth: w,
                                                vertices: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: ap.glassHeight }, { x: 0, y: ap.glassHeight }],
                                            });
                                        }}
                                        className="h-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm px-4 focus:ring-[#E8601C]"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-semibold text-slate-400 uppercase">
                                        {lang === 'th' ? 'สูง' : 'Height'} (mm)
                                    </Label>
                                    <Input
                                        type="number"
                                        min={50}
                                        value={ap.glassHeight}
                                        onChange={(e) => {
                                            const h = Math.max(1, parseInt(e.target.value) || 1);
                                            updatePane({
                                                glassHeight: h,
                                                vertices: [{ x: 0, y: 0 }, { x: ap.glassWidth, y: 0 }, { x: ap.glassWidth, y: h }, { x: 0, y: h }],
                                            });
                                        }}
                                        className="h-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm px-4 focus:ring-[#E8601C]"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Cutouts List (per-pane) */}
                        {ap.holes.length > 0 && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.15em]">
                                        {lang === 'th' ? 'รูเจาะ / คัทเอาท์' : 'Cutouts'} ({ap.holes.length})
                                    </h3>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => updatePane({ holes: [] })}
                                        className="text-[10px] text-red-400 hover:text-red-600 h-6 px-2 rounded-lg"
                                    >
                                        {lang === 'th' ? 'ลบทั้งหมด' : 'Clear All'}
                                    </Button>
                                </div>
                                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                    {ap.holes.map((hole, i) => {
                                        const type = hole.type || 'circle';
                                        const shapeIcons: Record<string, string> = { circle: '●', rectangle: '■', slot: '⬭', custom: '⬡' };
                                        return (
                                            <div
                                                key={hole.id}
                                                className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2 group"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <GripVertical className="h-3 w-3 text-slate-300" />
                                                    <Badge variant="outline" className="text-[9px] font-bold rounded-md border-slate-200 dark:border-slate-700 text-[#E8601C] px-1.5 py-0">
                                                        <span className="mr-0.5">{shapeIcons[type]}</span>
                                                        C{i + 1}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                                                    <span>X:{hole.x}</span>
                                                    <span>Y:{hole.y}</span>
                                                    {type === 'circle' && (
                                                        <span className="flex items-center gap-0.5">
                                                            ⌀
                                                            <input
                                                                type="number" min={5} max={500} value={hole.diameter}
                                                                onChange={(e) => {
                                                                    const val = parseInt(e.target.value);
                                                                    if (!val || val < 5) return;
                                                                    updatePane({ holes: ap.holes.map(h => h.id === hole.id ? { ...h, diameter: val } : h) });
                                                                }}
                                                                className="w-10 bg-transparent border-b border-slate-300 dark:border-slate-600 text-center text-[11px] font-semibold outline-none focus:border-[#E8601C] transition-colors"
                                                            />
                                                        </span>
                                                    )}
                                                    {type === 'rectangle' && (
                                                        <>
                                                            <span className="flex items-center gap-0.5">
                                                                W:
                                                                <input
                                                                    type="number" min={10} max={500} value={hole.width || 100}
                                                                    onChange={(e) => {
                                                                        const val = parseInt(e.target.value);
                                                                        if (!val || val < 10) return;
                                                                        updatePane({ holes: ap.holes.map(h => h.id === hole.id ? { ...h, width: val } : h) });
                                                                    }}
                                                                    className="w-10 bg-transparent border-b border-slate-300 dark:border-slate-600 text-center text-[11px] font-semibold outline-none focus:border-[#E8601C] transition-colors"
                                                                />
                                                            </span>
                                                            <span className="flex items-center gap-0.5">
                                                                H:
                                                                <input
                                                                    type="number" min={10} max={500} value={hole.height || 60}
                                                                    onChange={(e) => {
                                                                        const val = parseInt(e.target.value);
                                                                        if (!val || val < 10) return;
                                                                        updatePane({ holes: ap.holes.map(h => h.id === hole.id ? { ...h, height: val } : h) });
                                                                    }}
                                                                    className="w-10 bg-transparent border-b border-slate-300 dark:border-slate-600 text-center text-[11px] font-semibold outline-none focus:border-[#E8601C] transition-colors"
                                                                />
                                                            </span>
                                                        </>
                                                    )}
                                                    {type === 'slot' && (
                                                        <>
                                                            <span className="flex items-center gap-0.5">
                                                                W:
                                                                <input
                                                                    type="number" min={5} max={200} value={hole.width || 20}
                                                                    onChange={(e) => {
                                                                        const val = parseInt(e.target.value);
                                                                        if (!val || val < 5) return;
                                                                        updatePane({ holes: ap.holes.map(h => h.id === hole.id ? { ...h, width: val } : h) });
                                                                    }}
                                                                    className="w-10 bg-transparent border-b border-slate-300 dark:border-slate-600 text-center text-[11px] font-semibold outline-none focus:border-[#E8601C] transition-colors"
                                                                />
                                                            </span>
                                                            <span className="flex items-center gap-0.5">
                                                                L:
                                                                <input
                                                                    type="number" min={10} max={500} value={hole.length || 80}
                                                                    onChange={(e) => {
                                                                        const val = parseInt(e.target.value);
                                                                        if (!val || val < 10) return;
                                                                        updatePane({ holes: ap.holes.map(h => h.id === hole.id ? { ...h, length: val } : h) });
                                                                    }}
                                                                    className="w-10 bg-transparent border-b border-slate-300 dark:border-slate-600 text-center text-[11px] font-semibold outline-none focus:border-[#E8601C] transition-colors"
                                                                />
                                                            </span>
                                                        </>
                                                    )}
                                                    {type === 'custom' && (
                                                        <span>{hole.points?.length || 0} pts</span>
                                                    )}
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 rounded-md text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => updatePane({ holes: ap.holes.filter(h => h.id !== hole.id) })}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Order Details */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-primary dark:text-[#E8601C]" />
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.15em]">
                                    {lang === 'th' ? 'รายละเอียดคำสั่งซื้อ' : 'Order Details'}
                                </h3>
                            </div>

                            {/* Quantity (per-pane) */}
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-semibold text-slate-400 uppercase">
                                    {lang === 'th' ? 'จำนวน' : 'Quantity'}
                                </Label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={ap.quantity}
                                    onChange={(e) => updatePane({ quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                                    className="h-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm px-4 focus:ring-[#E8601C]"
                                />
                            </div>

                            {/* ── Price Calculator (per-pane) ──────────────── */}
                            <div className="space-y-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 p-3">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">
                                    {lang === 'th' ? 'คำนวณราคา' : 'Price Calculator'}
                                </p>

                                <div className="grid grid-cols-4 gap-1.5">
                                    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-center">
                                        <p className="text-[8px] font-semibold text-slate-400 uppercase mb-0.5">{lang === 'th' ? 'พื้นที่' : 'Area'}</p>
                                        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{pricingCalc.sqFt.toFixed(2)}</p>
                                        <p className="text-[8px] text-slate-400">ตร.ฟ.</p>
                                    </div>
                                    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-center">
                                        <p className="text-[8px] font-semibold text-slate-400 uppercase mb-0.5">{lang === 'th' ? 'รูเจาะ' : 'Holes'}</p>
                                        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{pricingCalc.autoHoleQty}</p>
                                        <p className="text-[8px] text-slate-400">{lang === 'th' ? 'รู' : 'pcs'}</p>
                                    </div>
                                    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-center">
                                        <p className="text-[8px] font-semibold text-slate-400 uppercase mb-0.5">{lang === 'th' ? 'บาก' : 'Notch'}</p>
                                        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{pricingCalc.autoNotchQty}</p>
                                        <p className="text-[8px] text-slate-400">{lang === 'th' ? 'ชิ้น' : 'pcs'}</p>
                                    </div>
                                    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-center">
                                        <p className="text-[8px] font-semibold text-slate-400 uppercase mb-0.5">{lang === 'th' ? 'จำนวน' : 'Qty'}</p>
                                        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{ap.quantity}</p>
                                        <p className="text-[8px] text-slate-400">{lang === 'th' ? 'แผ่น' : 'panes'}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-[9px] font-semibold text-slate-400 uppercase flex items-center gap-1">
                                            {lang === 'th' ? 'ราคา/ตร.ฟ. (฿)' : 'Price/sq.ft (฿)'}
                                            {ap.priceAutoFilled && <span className="text-[8px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 px-1 py-0.5 rounded-md">แนะนำ</span>}
                                        </Label>
                                        <Input
                                            type="number" min={0} placeholder="0"
                                            value={ap.pricePerSqFt || ""}
                                            onChange={e => updatePane({ pricePerSqFt: parseFloat(e.target.value) || 0, priceAutoFilled: false })}
                                            className="h-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold px-3 focus:ring-[#E8601C]"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[9px] font-semibold text-slate-400 uppercase flex items-center gap-1">
                                            {lang === 'th' ? 'เจียร/ม (฿)' : 'Grind/m (฿)'}
                                            {ap.priceAutoFilled && <span className="text-[8px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 px-1 py-0.5 rounded-md">แนะนำ</span>}
                                        </Label>
                                        <Input
                                            type="number" min={0}
                                            value={ap.grindingRate}
                                            onChange={e => updatePane({ grindingRate: parseFloat(e.target.value) || 0, priceAutoFilled: false })}
                                            className="h-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold px-3 focus:ring-[#E8601C]"
                                        />
                                    </div>

                                    {pricingCalc.autoHoleQty > 0 && (
                                        <div className="col-span-2 space-y-1">
                                            <Label className="text-[9px] font-semibold text-slate-400 uppercase">
                                                {lang === 'th' ? `ราคา/รู (฿) — ${pricingCalc.autoHoleQty} รู` : `Price/hole (฿) — ${pricingCalc.autoHoleQty} holes`}
                                            </Label>
                                            <Input
                                                type="number" min={0}
                                                value={ap.holePriceEach}
                                                onChange={e => updatePane({ holePriceEach: parseFloat(e.target.value) || 0 })}
                                                className="h-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold px-3 focus:ring-[#E8601C]"
                                            />
                                        </div>
                                    )}

                                    <div className="space-y-1">
                                        <Label className="text-[9px] font-semibold text-slate-400 uppercase">
                                            {lang === 'th' ? 'บาก (ชิ้น)' : 'Notches'}
                                        </Label>
                                        <Input
                                            type="number" min={0}
                                            value={ap.notchQty}
                                            onChange={e => updatePane({ notchQty: parseInt(e.target.value) || 0 })}
                                            className="h-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold px-3 focus:ring-[#E8601C]"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[9px] font-semibold text-slate-400 uppercase">
                                            {lang === 'th' ? 'ราคา/บาก (฿)' : 'Price/notch (฿)'}
                                        </Label>
                                        <Input
                                            type="number" min={0}
                                            value={ap.notchPrice}
                                            onChange={e => updatePane({ notchPrice: parseFloat(e.target.value) || 0 })}
                                            className="h-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold px-3 focus:ring-[#E8601C]"
                                        />
                                    </div>
                                </div>

                                {ap.pricePerSqFt > 0 && (
                                    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 space-y-1.5">
                                        <div className="flex justify-between text-[11px] text-slate-500">
                                            <span>{lang === 'th' ? 'เนื้อกระจก' : 'Glass'}</span>
                                            <span className="font-semibold">฿{pricingCalc.glassPrice.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-[11px] text-slate-500">
                                            <span>{lang === 'th' ? 'ค่าเจียร' : 'Grinding'}</span>
                                            <span className="font-semibold">฿{pricingCalc.grindingCost.toFixed(2)}</span>
                                        </div>
                                        {pricingCalc.drillCost > 0 && (
                                            <div className="flex justify-between text-[11px] text-slate-500">
                                                <span>{lang === 'th' ? `ค่าเจาะ (×${pricingCalc.autoHoleQty})` : `Drilling (×${pricingCalc.autoHoleQty})`}</span>
                                                <span className="font-semibold">฿{pricingCalc.drillCost.toFixed(2)}</span>
                                            </div>
                                        )}
                                        {pricingCalc.notchCost > 0 && (
                                            <div className="flex justify-between text-[11px] text-slate-500">
                                                <span>{lang === 'th' ? `ค่าบาก (×${ap.notchQty})` : `Notching (×${ap.notchQty})`}</span>
                                                <span className="font-semibold">฿{pricingCalc.notchCost.toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="border-t border-slate-200 dark:border-slate-700 pt-1.5 mt-0.5 space-y-0.5">
                                            <div className="flex justify-between text-[12px] font-bold text-slate-700 dark:text-slate-200">
                                                <span>{lang === 'th' ? 'ราคา/แผ่น' : 'Per pane'}</span>
                                                <span className="text-[#E8601C]">฿{pricingCalc.perPane.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between text-[13px] font-bold text-slate-800 dark:text-white">
                                                <span>{lang === 'th' ? `รวม ×${ap.quantity} แผ่น` : `Total ×${ap.quantity}`}</span>
                                                <span className="text-[#E8601C]">฿{pricingCalc.total.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-1">
                                    <Label className="text-[9px] font-semibold text-slate-400 uppercase">
                                        {lang === 'th' ? 'ราคาประมาณ (฿) — แก้ไขได้' : 'Est. Price (฿) — editable'}
                                    </Label>
                                    <Input
                                        type="number" min={0}
                                        value={ap.estimatedPrice}
                                        onChange={(e) => updatePane({ estimatedPrice: Math.max(0, parseFloat(e.target.value) || 0) })}
                                        className="h-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold px-3 focus:ring-[#E8601C]"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-semibold text-slate-400 uppercase">
                                        {lang === 'th' ? 'กำหนดส่ง' : 'Deadline'}
                                    </Label>
                                    <Input
                                        type="date"
                                        value={orderData.deadline}
                                        onChange={(e) => setOrderData(prev => ({ ...prev, deadline: e.target.value }))}
                                        className="h-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm px-4 focus:ring-[#E8601C]"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-semibold text-slate-400 uppercase">
                                        {lang === 'th' ? 'วันส่งที่คาดหวัง' : 'Expected Delivery'}
                                    </Label>
                                    <Input
                                        type="date"
                                        value={orderData.expectedDeliveryDate}
                                        onChange={(e) => setOrderData(prev => ({ ...prev, expectedDeliveryDate: e.target.value }))}
                                        className="h-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm px-4 focus:ring-[#E8601C]"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-semibold text-slate-400 uppercase flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {lang === 'th' ? 'สถานที่จัดส่ง' : 'Delivery Location'}
                                </Label>
                                <Input
                                    placeholder={lang === 'th' ? 'เช่น บางนา, กรุงเทพฯ' : 'e.g. Bangna, Bangkok'}
                                    value={orderData.deliveryLocation}
                                    onChange={(e) => setOrderData(prev => ({ ...prev, deliveryLocation: e.target.value }))}
                                    className="h-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm px-4 focus:ring-[#E8601C]"
                                />
                            </div>

                        </div>

                        {/* ── Order Summary (visible when 2+ panes) ───────── */}
                        {panes.length > 1 && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Layers className="h-4 w-4 text-primary dark:text-[#E8601C]" />
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.15em]">
                                        {lang === 'th' ? 'สรุปคำสั่งซื้อ' : 'Order Summary'}
                                    </h3>
                                </div>
                                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 p-3 space-y-1.5">
                                    {panes.map((p, idx) => {
                                        const calc = calcPanePrice(p);
                                        const label = p.glassType
                                            ? `${p.glassType} ${p.thickness} (${p.glassWidth}×${p.glassHeight})`
                                            : (lang === 'th' ? 'ยังไม่ระบุ' : 'Not specified');
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => setActiveTab(idx)}
                                                className={`flex items-center justify-between w-full text-[11px] p-2 rounded-xl cursor-pointer transition-colors ${
                                                    idx === activeTab
                                                        ? 'bg-[#E8601C]/10 text-[#E8601C]'
                                                        : 'hover:bg-white dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 font-bold truncate min-w-0">
                                                    <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 ${
                                                        idx === activeTab
                                                            ? 'bg-[#E8601C]/20 text-[#E8601C]'
                                                            : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                                    }`}>
                                                        {idx + 1}
                                                    </span>
                                                    <span className="truncate">{label}</span>
                                                    <span className="text-slate-400 shrink-0">×{p.quantity}</span>
                                                </div>
                                                <span className="font-bold shrink-0 ml-2">
                                                    ฿{calc.total.toFixed(0)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                    <div className="border-t border-slate-200 dark:border-slate-700 pt-2 mt-1 flex justify-between items-center px-2">
                                        <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200">
                                            {lang === 'th'
                                                ? `รวม ${panes.reduce((s, p) => s + p.quantity, 0)} แผ่น`
                                                : `Total ${panes.reduce((s, p) => s + p.quantity, 0)} panes`
                                            }
                                        </span>
                                        <span className="text-[14px] font-bold text-[#E8601C]">
                                            ฿{grandTotal.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* New Customer Dialog */}
            <Dialog open={isNewCustomerOpen} onOpenChange={setIsNewCustomerOpen}>
                <DialogContent className="sm:max-w-[440px] rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold">
                            {lang === 'th' ? 'เพิ่มลูกค้าใหม่' : 'Add New Customer'}
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-500">
                            {lang === 'th' ? 'กรอกข้อมูลลูกค้าเพื่อบันทึกเข้าระบบ' : 'Fill in customer details to save to the system'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase">
                                {lang === 'th' ? 'ชื่อลูกค้า' : 'Customer Name'} <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                placeholder={lang === 'th' ? 'เช่น บริษัท ABC จำกัด' : 'e.g. ABC Company'}
                                value={newCustomerForm.name}
                                onChange={(e) => setNewCustomerForm(f => ({ ...f, name: e.target.value }))}
                                className="h-11 rounded-xl border-slate-200 dark:border-slate-800"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">
                                    {lang === 'th' ? 'เบอร์โทร' : 'Phone'}
                                </Label>
                                <Input
                                    placeholder={lang === 'th' ? 'เช่น 081-234-5678' : 'e.g. 081-234-5678'}
                                    value={newCustomerForm.phone}
                                    onChange={(e) => setNewCustomerForm(f => ({ ...f, phone: e.target.value }))}
                                    className="h-11 rounded-xl border-slate-200 dark:border-slate-800"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase">
                                    {lang === 'th' ? 'ส่วนลด (%)' : 'Discount (%)'}
                                </Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    placeholder="0"
                                    value={newCustomerForm.discount || ""}
                                    onChange={(e) => setNewCustomerForm(f => ({ ...f, discount: parseFloat(e.target.value) || 0 }))}
                                    className="h-11 rounded-xl border-slate-200 dark:border-slate-800"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase">
                                {lang === 'th' ? 'ที่อยู่' : 'Address'}
                            </Label>
                            <Input
                                placeholder={lang === 'th' ? 'เช่น 123 ถ.สุขุมวิท กรุงเทพฯ' : 'e.g. 123 Sukhumvit Rd, Bangkok'}
                                value={newCustomerForm.address}
                                onChange={(e) => setNewCustomerForm(f => ({ ...f, address: e.target.value }))}
                                className="h-11 rounded-xl border-slate-200 dark:border-slate-800"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase">
                                {lang === 'th' ? 'หมายเหตุ' : 'Notes'}
                            </Label>
                            <Input
                                placeholder={lang === 'th' ? 'ข้อมูลเพิ่มเติม (ไม่จำเป็น)' : 'Additional info (optional)'}
                                value={newCustomerForm.notes}
                                onChange={(e) => setNewCustomerForm(f => ({ ...f, notes: e.target.value }))}
                                className="h-11 rounded-xl border-slate-200 dark:border-slate-800"
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setIsNewCustomerOpen(false)}
                            disabled={isCreatingCustomer}
                            className="rounded-xl font-bold"
                        >
                            {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                        </Button>
                        <Button
                            onClick={handleCreateCustomer}
                            disabled={isCreatingCustomer || !newCustomerForm.name.trim()}
                            className="rounded-xl font-bold bg-[#E8601C] hover:bg-[#E8601C]/90 text-white"
                        >
                            {isCreatingCustomer
                                ? (lang === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                : (lang === 'th' ? 'เพิ่มลูกค้า' : 'Add Customer')
                            }
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
