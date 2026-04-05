"use client";

import { useNode, useEditor } from "@craftjs/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Zap, Send, Navigation, Globe, MessageSquare, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { fetchApi } from "@/lib/api/config";
import { panesApi } from "@/lib/api/panes";

import { Pane } from "@/lib/api/types";
import { usePreview } from "../PreviewContext";
import { useStationContext } from "../StationContext";

const VARIANT_MAP: Record<string, string> = {
    primary: "bg-blue-700 text-white hover:bg-blue-800 active:bg-blue-900 dark:bg-blue-600 dark:hover:bg-blue-500 dark:active:bg-blue-400",
    outline: "border-2 border-blue-700 text-blue-700 bg-white hover:bg-blue-50 active:bg-blue-100 dark:border-blue-500 dark:text-blue-400 dark:bg-slate-900 dark:hover:bg-blue-900/20",
    danger:  "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 dark:bg-red-700 dark:hover:bg-red-600",
    success: "bg-green-700 text-white hover:bg-green-800 active:bg-green-900 dark:bg-green-600 dark:hover:bg-green-500",
};
const SIZE_MAP = {
    sm: "px-4 py-2.5 text-sm min-h-[44px]",
    md: "px-6 py-3 text-base min-h-[52px]",
    lg: "px-8 py-4 text-lg font-bold min-h-[60px]",
};

const ACTION_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
    "submit-form":  { icon: Send,          label: "บันทึกข้อมูลลง Order", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    "navigate":     { icon: Navigation,    label: "Navigate",    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
    "api-call":     { icon: Globe,         label: "API Call",    color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300" },
    "show-confirm": { icon: MessageSquare, label: "Confirm",     color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
};

interface ButtonBlockProps {
    label?:          string;
    variant?:        "primary" | "outline" | "danger" | "success";
    size?:           "sm" | "md" | "lg";
    fullWidth?:      boolean;
    align?:          "left" | "center" | "right";
    action?:         "none" | "submit-form" | "navigate" | "api-call" | "show-confirm";
    actionEndpoint?: string;
    actionMethod?:   string;
    navigateTo?:     string;
    confirmText?:    string;
}

const ALIGN_MAP = { left: "justify-start", center: "justify-center", right: "justify-end" };

/** Thai display names for common API field keys */
const FIELD_LABEL: Record<string, string> = {
    customer:  "ลูกค้า",
    material:  "วัสดุ",
    quantity:  "จำนวน",
    stations:  "สถานี",
    request:   "บิล/คำขอ",
    order:     "ออเดอร์",
    date:      "วันที่",
    assignedTo:"ผู้รับผิดชอบ",
    priority:  "ลำดับความสำคัญ",
};

/**
 * Parse Zod/backend error messages to extract field names.
 * Supports: "[request] expected string" and "Invalid input: ..."
 */
function extractMissingFields(msg: string): string[] {
    const found: string[] = [];
    const bracketRe = /\[([^\]]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = bracketRe.exec(msg)) !== null) {
        found.push(m[1]);
    }
    return found;
}

/** Convert raw backend/Zod error strings into user-friendly Thai messages */
function toFriendlyError(msg: string): string {
    if (!msg) return "เกิดข้อผิดพลาด กรุณาลองใหม่";
    const fields = extractMissingFields(msg);
    if (fields.length > 0) {
        const thaiNames = fields.map((f) => FIELD_LABEL[f] ?? f);
        return `ข้อมูลที่ขาด: ${thaiNames.join(", ")} — กรุณากรอกให้ครบ`;
    }
    if (msg.includes("Validation failed") || msg.includes("Invalid input") || msg.includes("received undefined"))
        return "ข้อมูลไม่ครบถ้วน กรุณาตรวจสอบฟอร์ม";
    if (msg.includes("401") || msg.toLowerCase().includes("unauthorized"))
        return "ไม่มีสิทธิ์ดำเนินการ กรุณาเข้าสู่ระบบใหม่";
    if (msg.includes("404") || msg.toLowerCase().includes("not found"))
        return "ไม่พบข้อมูลที่ต้องการ";
    if (msg.includes("500") || msg.toLowerCase().includes("server"))
        return "เซิร์ฟเวอร์มีปัญหา กรุณาลองใหม่ภายหลัง";
    return msg;
}

export function ButtonBlock({
    label = "ปุ่มกด",
    variant = "primary",
    size = "md",
    fullWidth = false,
    align = "left",
    action = "none",
    actionEndpoint = "",
    actionMethod = "POST",
    navigateTo = "",
    confirmText = "",
}: ButtonBlockProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview  = usePreview();
    const router     = useRouter();
    const [feedback, setFeedback] = useState<"" | "ok" | "loading" | "error">("");
    const [errorMsg, setErrorMsg] = useState("");
    const [showConfirm, setShowConfirm] = useState(false);
    const [pendingBody, setPendingBody] = useState<Record<string, unknown> | null>(null);
    const [confirmSummary, setConfirmSummary] = useState<{ customerName: string; materialName: string; quantity: string; stationCount: number } | null>(null);
    const actionCfg  = action && action !== "none" ? ACTION_CONFIG[action] : null;
    const { formData, fieldLabels, resetForm, orderId, requestId, requestData, orderData, selectedRecord, triggerRefresh } = useStationContext();
    const { query } = useEditor();

    // ── Preview click handler ─────────────────────────────────────────────────
    const handlePreviewClick = async () => {
        if (action === "navigate" && navigateTo) {
            router.push(navigateTo);
            return;
        }
        if (action === "show-confirm") {
            const ok = window.confirm(confirmText || "ต้องการดำเนินการต่อใช่ไหม?");
            if (!ok) return;
            setFeedback("ok");
            setTimeout(() => setFeedback(""), 2000);
            return;
        }
        if (action === "submit-form") {
            const allNodes = query.getSerializedNodes();
            const requiredFields = Object.values(allNodes)
                .filter((n) => n.displayName === "Input Field" && (n.props as Record<string, unknown>)?.required && (n.props as Record<string, unknown>)?.fieldKey)
                .map((n) => ({
                    key:   (n.props as Record<string, unknown>)?.fieldKey as string,
                    label: (n.props as Record<string, unknown>)?.label as string,
                }));
            const missing = requiredFields.filter((f) => {
                const val = formData[f.key];
                return val === undefined || val === null || val === "";
            });
            if (missing.length > 0) {
                setErrorMsg(`กรุณากรอก: ${missing.map((f) => f.label || f.key).join(", ")}`);
                setFeedback("error");
                setTimeout(() => setFeedback(""), 4000);
                return;
            }

            if (!orderId) {
                setErrorMsg("ไม่พบ orderId — กรุณาเปิดหน้านี้ผ่าน ?orderId=...");
                setFeedback("error");
                setTimeout(() => setFeedback(""), 3000);
                return;
            }
            setFeedback("loading");
            setErrorMsg("");
            try {
                const res = await fetchApi<{ success: boolean; message?: string }>(`/orders/${orderId}`, {
                    method: "PATCH",
                    body: JSON.stringify(formData),
                });
                if (res.success === false) {
                    setErrorMsg(toFriendlyError((res as { message?: string }).message ?? ""));
                    setFeedback("error");
                    setTimeout(() => setFeedback(""), 5000);
                    return;
                }
                setFeedback("ok");
                resetForm();
                triggerRefresh();
                setTimeout(() => setFeedback(""), 2500);
            } catch (err: unknown) {
                setErrorMsg(toFriendlyError(err instanceof Error ? err.message : ""));
                setFeedback("error");
                setTimeout(() => setFeedback(""), 5000);
            }
            return;
        }
        if (action === "api-call" && actionEndpoint) {
            // ── Pre-flight: scan canvas for empty linked fields ───────────────
            const AUTO_FIELD_KEY: Record<string, string> = {
                "/customers": "customer", "/materials": "material", "/workers": "assignedTo",
                "/requests": "request",   "/orders": "order",       "/inventories": "inventory",
            };
            const allNodes = query.getSerializedNodes();
            type FormNode = { label: string; fieldKey: string };
            const formNodes: FormNode[] = Object.values(allNodes)
                .filter((n) => n.displayName === "Input Field" || n.displayName === "Select Field")
                .map((n) => {
                    const props = n.props as Record<string, unknown>;
                    const explicitKey = String(props.fieldKey ?? "");
                    const dataSource  = String(props.dataSource ?? "");
                    const autoKey     = AUTO_FIELD_KEY[dataSource] ?? "";
                    return {
                        label:    String(props.label ?? "ช่อง"),
                        fieldKey: explicitKey || autoKey,
                    };
                });

            // Fields that have a fieldKey but are currently empty in formData
            const emptyLinked = formNodes.filter((f) => f.fieldKey && !formData[f.fieldKey]);
            if (emptyLinked.length > 0) {
                setErrorMsg(`กรุณากรอกข้อมูลในช่อง: ${emptyLinked.map((f) => f.label).join(", ")}`);
                setFeedback("error");
                setTimeout(() => setFeedback(""), 6000);
                return;
            }

            // Helper: extract _id from a populated object or plain string
            const extractId = (v: unknown): string | undefined => {
                if (!v) return undefined;
                if (typeof v === "string") return v;
                if (typeof v === "object") return (v as Record<string, unknown>)._id as string | undefined;
                return undefined;
            };

            // Normalise legacy / misnamed field keys so the API gets the right names
            const normalized: Record<string, unknown> = { ...formData };
            const fieldMap: Record<string, string> = {
                customerName: "customer",
                materialId:   "material",
            };
            for (const [wrong, right] of Object.entries(fieldMap)) {
                if (wrong in normalized && !(right in normalized)) {
                    normalized[right] = normalized[wrong];
                }
                delete normalized[wrong];
            }

            // Strip empty / null / undefined values so they don't override auto-fill
            for (const k of Object.keys(normalized)) {
                const v = normalized[k];
                if (v === "" || v === null || v === undefined) delete normalized[k];
            }

            // Ensure ObjectIds — if the form captured a populated object, extract _id
            for (const k of ["customer", "material"]) {
                if (normalized[k]) normalized[k] = extractId(normalized[k]) ?? normalized[k];
            }

            // Auto-derive commonly required fields from context data
            const autoFields: Record<string, unknown> = {};
            const src = requestData ?? orderData ?? selectedRecord;
            if (src) {
                const details = src.details as Record<string, unknown> | undefined;
                if (!normalized.customer) {
                    const cid = extractId(src.customer);
                    if (cid) autoFields.customer = cid;
                }
                if (!normalized.material) {
                    const mid = extractId(src.material);
                    if (mid) autoFields.material = mid;
                }
                if (normalized.quantity == null) {
                    const qty = src.quantity ?? details?.quantity;
                    if (qty != null) autoFields.quantity = qty;
                }
                if (!requestId && !orderId && src._id && details && !autoFields.material) {
                    autoFields.request = src._id;
                }
            }

            // Build body outside try so catch can access it for diagnostics
            const isOrderEndpoint = /\/orders$/.test(actionEndpoint.trim());
            const body: Record<string, unknown> = {
                ...autoFields,
                ...normalized,
                ...(requestId ? { request: requestId } : {}),
                ...(orderId   ? { order:   orderId   } : {}),
            };

            // ── Mismatch check: form values must agree with selected record ────
            // (checked BEFORE override so we can compare what the user typed vs the record)
            if (isOrderEndpoint && src) {
                const formCustomer = extractId(normalized.customer);
                const formMaterial = extractId(normalized.material);
                const srcCustomer  = extractId(src.customer);
                const srcMaterial  = extractId(src.material);
                const mismatches: string[] = [];
                if (formCustomer && srcCustomer && formCustomer !== srcCustomer) {
                    const name = typeof src.customer === "object"
                        ? ((src.customer as Record<string, unknown>).name as string) ?? srcCustomer
                        : srcCustomer;
                    mismatches.push(`ลูกค้า (บิลระบุ "${name}")`);
                }
                if (formMaterial && srcMaterial && formMaterial !== srcMaterial) {
                    const name = typeof src.material === "object"
                        ? ((src.material as Record<string, unknown>).name as string) ?? srcMaterial
                        : srcMaterial;
                    mismatches.push(`วัสดุ (บิลระบุ "${name}")`);
                }
                if (mismatches.length > 0) {
                    setErrorMsg(`ข้อมูลไม่ตรงกับบิลที่เลือก — ${mismatches.join(" | ")}`);
                    setFeedback("error");
                    setTimeout(() => setFeedback(""), 8000);
                    return;
                }
            }

            // When a record is selected, its customer/material always take precedence
            // over whatever the form dropdowns have — prevents mismatched orders
            if (src) {
                const srcCustomer = extractId(src.customer);
                const srcMaterial = extractId(src.material);
                if (srcCustomer) body.customer = srcCustomer;
                if (srcMaterial) body.material = srcMaterial;
            }

            // ── Order-specific validation (after body is fully built) ─────────
            if (isOrderEndpoint) {
                const orderErrors: string[] = [];
                if (!body.customer) orderErrors.push("ลูกค้า");
                if (!body.material) orderErrors.push("วัสดุ/กระจก");
                const qty = Number(body.quantity);
                if (!body.quantity || isNaN(qty) || qty < 1) orderErrors.push("จำนวน (ต้องมากกว่า 0)");
                const srcDetails = src?.details as Record<string, unknown> | undefined;
                const billQty = srcDetails?.quantity != null
                    ? Number(srcDetails.quantity)
                    : src?.quantity != null
                        ? Number(src.quantity)
                        : null;
                if (billQty != null && !isNaN(billQty) && qty !== billQty) {
                    orderErrors.push(`จำนวนไม่ตรงกับบิล (บิลระบุ ${billQty} ชิ้น แต่กรอก ${qty} ชิ้น)`);
                }
                const stations = (body.stations ?? []) as unknown[];
                if (!Array.isArray(stations) || stations.length === 0) orderErrors.push("สถานีผลิต (เลือกอย่างน้อย 1 สถานี)");
                if (orderErrors.length > 0) {
                    setErrorMsg(`ข้อมูลไม่ครบ: ${orderErrors.join(", ")}`);
                    setFeedback("error");
                    setTimeout(() => setFeedback(""), 6000);
                    return;
                }
                // Validations passed — show confirmation summary before submitting
                const cs = src;
                const resolveName = (
                    src: Record<string, unknown> | null,
                    field: string,
                    bodyVal: unknown,
                ) => {
                    if (src && typeof src[field] === "object" && src[field] != null) {
                        const name = (src[field] as Record<string, unknown>).name as string | undefined;
                        if (name) return name;
                    }
                    if (fieldLabels[field]) return fieldLabels[field];
                    return String(bodyVal ?? "—");
                };

                setConfirmSummary({
                    customerName: resolveName(cs, "customer", body.customer),
                    materialName: resolveName(cs, "material", body.material),
                    quantity: String(body.quantity ?? "—"),
                    stationCount: Array.isArray(body.stations) ? (body.stations as string[]).length : 0,
                });
                setPendingBody(body);
                setShowConfirm(true);
                return;
            }

            setFeedback("loading");
            setErrorMsg("");
            if (process.env.NODE_ENV !== "production") {
                console.log("[ButtonBlock] api-call body:", body);
            }

            /** Classify form nodes into user-fillable empties vs unlinked (no fieldKey) */
            const diagnoseFormNodes = () => {
                const emptyLinked  = formNodes.filter((f) => f.fieldKey && !body[f.fieldKey]);
                const unlinked     = formNodes.filter((f) => !f.fieldKey);
                return { emptyLinked, unlinked };
            };

            const buildErrorMsg = (rawMsg: string) => {
                const { emptyLinked, unlinked } = diagnoseFormNodes();
                if (emptyLinked.length > 0)
                    return `กรุณากรอกข้อมูลในช่อง: ${emptyLinked.map((f) => f.label).join(", ")}`;
                if (unlinked.length > 0 && (rawMsg.includes("Validation failed") || rawMsg.includes("Invalid input") || rawMsg.includes("received undefined")))
                    return `ฟอร์มมีช่องที่ยังไม่ได้ตั้งค่า (${unlinked.map((f) => f.label).join(", ")}) — กรุณาติดต่อผู้ดูแลระบบ`;
                return toFriendlyError(rawMsg);
            };

            try {
                const res = await fetchApi<{ success: boolean; message?: string; data?: Record<string, unknown> }>(actionEndpoint, {
                    method: actionMethod || "POST",
                    body: JSON.stringify(body),
                });
                if (res.success === false) {
                    const rawMsg = (res as { message?: string }).message ?? "";
                    setErrorMsg(buildErrorMsg(rawMsg));
                    setFeedback("error");
                    setTimeout(() => setFeedback(""), 8000);
                    return;
                }

                // After creating an order, update panes with routing (station names)
                if (actionEndpoint === "/orders" && body.stations && Array.isArray(body.stations) && (body.stations as string[]).length > 0) {
                    const reqId = body.request as string | undefined;
                    const newOrderId = (res as { data?: Record<string, unknown> }).data?._id as string | undefined;
                    if (reqId) {
                        (async () => {
                            try {
                                const pRes = await panesApi.getAll({ request: reqId, status_ne: "claimed", limit: 100 });
                                const routingIds = (body.stations as string[]);
                                const firstStationId = routingIds[0];
                                const allPanes = pRes.success ? pRes.data as Pane[] : [];
                                const panes = allPanes.filter(p => {
                                    if (!p.order) return true;
                                    const oid = typeof p.order === "string" ? p.order : (p.order as unknown as Record<string, unknown>)?._id as string;
                                    return oid === newOrderId;
                                });
                                if (firstStationId) {
                                    await Promise.all(panes.map(p =>
                                        panesApi.update(p._id, {
                                            routing: routingIds,
                                            currentStation: firstStationId,
                                            currentStatus: "pending",
                                            ...(newOrderId ? { order: newOrderId } : {}),
                                        })
                                    ));
                                }
                                if (newOrderId && panes.length > 0) {
                                    fetchApi(`/orders/${newOrderId}`, {
                                        method: "PATCH",
                                        body: JSON.stringify({ quantity: panes.length }),
                                    }).catch(() => {});
                                }
                            } catch (e) {
                                console.error("[ButtonBlock] Failed to update panes routing:", e);
                            }
                        })();
                    }
                }

                setFeedback("ok");
                triggerRefresh();
                setTimeout(() => setFeedback(""), 2500);
            } catch (err: unknown) {
                const rawMsg = err instanceof Error ? err.message : "";
                console.warn("[ButtonBlock] api-call error:", rawMsg, "body keys:", Object.keys(body));
                setErrorMsg(buildErrorMsg(rawMsg));
                setFeedback("error");
                setTimeout(() => setFeedback(""), 8000);
            }
            return;
        }
        // none or missing config — just show a flash
        setFeedback("ok");
        setTimeout(() => setFeedback(""), 1500);
    };

    // ── Confirm handler: executes the stored pending order API call ──────────
    const handleConfirm = async () => {
        if (!pendingBody) return;
        const body = pendingBody;
        setShowConfirm(false);
        setPendingBody(null);
        setConfirmSummary(null);
        setFeedback("loading");
        setErrorMsg("");

        const AUTO_FK: Record<string, string> = {
            "/customers": "customer", "/materials": "material", "/workers": "assignedTo",
            "/requests": "request",   "/orders": "order",       "/inventories": "inventory",
        };
        const allNodes = query.getSerializedNodes();
        const fNodes = Object.values(allNodes)
            .filter((n) => n.displayName === "Input Field" || n.displayName === "Select Field")
            .map((n) => {
                const p = n.props as Record<string, unknown>;
                const ek = String(p.fieldKey ?? "");
                const ds = String(p.dataSource ?? "");
                return { label: String(p.label ?? "ช่อง"), fieldKey: ek || (AUTO_FK[ds] ?? "") };
            });
        const buildErrMsg = (rawMsg: string) => {
            const emptyLinked = fNodes.filter((f) => f.fieldKey && !body[f.fieldKey]);
            const unlinked    = fNodes.filter((f) => !f.fieldKey);
            if (emptyLinked.length > 0) return `กรุณากรอกข้อมูลในช่อง: ${emptyLinked.map((f) => f.label).join(", ")}`;
            if (unlinked.length > 0 && (rawMsg.includes("Validation failed") || rawMsg.includes("Invalid input") || rawMsg.includes("received undefined")))
                return `ฟอร์มมีช่องที่ยังไม่ได้ตั้งค่า (${unlinked.map((f) => f.label).join(", ")}) — กรุณาติดต่อผู้ดูแลระบบ`;
            return toFriendlyError(rawMsg);
        };

        try {
            const res = await fetchApi<{ success: boolean; message?: string; data?: Record<string, unknown> }>(actionEndpoint, {
                method: actionMethod || "POST",
                body: JSON.stringify(body),
            });
            if (res.success === false) {
                setErrorMsg(buildErrMsg((res as { message?: string }).message ?? ""));
                setFeedback("error");
                setTimeout(() => setFeedback(""), 8000);
                return;
            }
            if (body.stations && Array.isArray(body.stations) && (body.stations as string[]).length > 0) {
                const reqId = body.request as string | undefined;
                const newOrderId = res.data?._id as string | undefined;
                if (reqId) {
                    (async () => {
                        try {
                            const pRes = await panesApi.getAll({ request: reqId, status_ne: "claimed", limit: 100 });
                            const routingIds = (body.stations as string[]);
                            const firstStationId = routingIds[0];
                            const allPanes = pRes.success ? pRes.data as Pane[] : [];
                            const panes = allPanes.filter(p => {
                                if (!p.order) return true;
                                const oid = typeof p.order === "string" ? p.order : (p.order as unknown as Record<string, unknown>)?._id as string;
                                return oid === newOrderId;
                            });
                            if (firstStationId) {
                                await Promise.all(panes.map(p =>
                                    panesApi.update(p._id, {
                                        routing: routingIds,
                                        currentStation: firstStationId,
                                        currentStatus: "pending",
                                        ...(newOrderId ? { order: newOrderId } : {}),
                                    })
                                ));
                            }
                            if (newOrderId && panes.length > 0) {
                                fetchApi(`/orders/${newOrderId}`, {
                                    method: "PATCH",
                                    body: JSON.stringify({ quantity: panes.length }),
                                }).catch(() => {});
                            }
                        } catch (e) {
                            console.error("[ButtonBlock] Failed to update panes routing:", e);
                        }
                    })();
                }
            }
            setFeedback("ok");
            triggerRefresh();
            setTimeout(() => setFeedback(""), 2500);
        } catch (err: unknown) {
            const rawMsg = err instanceof Error ? err.message : "";
            console.warn("[ButtonBlock] confirm api-call error:", rawMsg);
            setErrorMsg(buildErrMsg(rawMsg));
            setFeedback("error");
            setTimeout(() => setFeedback(""), 8000);
        }
    };

    const alignClass = ALIGN_MAP[align] ?? "justify-start";

    const content = (
        <div className={`w-full flex ${alignClass}`}>
            <div className="flex flex-col items-stretch gap-1.5" style={fullWidth ? { width: "100%" } : {}}>
                <button
                    onClick={isPreview ? handlePreviewClick : undefined}
                    disabled={!isPreview || feedback === "loading" || showConfirm}
                    className={`rounded-lg font-semibold transition-all ${VARIANT_MAP[variant] ?? VARIANT_MAP.primary} ${SIZE_MAP[size]} ${fullWidth ? "w-full" : ""} ${feedback === "ok" ? "!bg-green-500 !text-white !border-green-500" : ""} ${feedback === "error" ? "!bg-red-500 !text-white !border-red-500" : ""} disabled:opacity-70 flex items-center justify-center gap-2`}
                >
                    {feedback === "loading" ? (
                        <><Loader2 className="h-5 w-5 animate-spin" /> กำลังส่ง...</>
                    ) : feedback === "ok" ? (
                        <><CheckCircle2 className="h-5 w-5" /> สำเร็จ</>
                    ) : feedback === "error" ? (
                        <><AlertCircle className="h-5 w-5" /> {label}</>
                    ) : (
                        label
                    )}
                </button>
                {feedback === "error" && errorMsg && (
                    <div className={`flex items-start gap-2 text-sm font-semibold text-white bg-red-600 border-2 border-red-700 rounded-xl px-4 py-3 ${fullWidth ? "w-full" : ""}`}>
                        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                        <span>{errorMsg}</span>
                    </div>
                )}
                {feedback === "ok" && (
                    <div className={`flex items-center gap-2 text-sm font-semibold text-white bg-green-700 border-2 border-green-800 rounded-xl px-4 py-3 ${fullWidth ? "w-full" : ""}`}>
                        <CheckCircle2 className="h-5 w-5 shrink-0" />
                        <span>ดำเนินการสำเร็จ</span>
                    </div>
                )}
                {showConfirm && confirmSummary && (
                    <div className={`rounded-xl border-2 border-blue-700 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 p-4 space-y-3 ${fullWidth ? "w-full" : ""}`}>
                        <p className="text-sm font-bold text-blue-900 dark:text-blue-100">ยืนยันการสร้างออเดอร์?</p>
                        <div className="space-y-1.5 text-sm text-gray-800 dark:text-slate-300">
                            <div className="flex gap-2"><span className="font-semibold min-w-[4.5rem]">ลูกค้า:</span><span className="font-medium">{confirmSummary.customerName}</span></div>
                            <div className="flex gap-2"><span className="font-semibold min-w-[4.5rem]">วัสดุ:</span><span className="font-medium">{confirmSummary.materialName}</span></div>
                            <div className="flex gap-2"><span className="font-semibold min-w-[4.5rem]">จำนวน:</span><span className="font-medium">{confirmSummary.quantity}</span></div>
                            <div className="flex gap-2"><span className="font-semibold min-w-[4.5rem]">สถานี:</span><span className="font-medium">{confirmSummary.stationCount} สถานี</span></div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleConfirm}
                                className="flex-1 rounded-lg bg-blue-700 dark:bg-blue-600 text-white font-bold py-2.5 text-sm active:bg-blue-800 dark:active:bg-blue-500 min-h-[44px]"
                            >
                                ยืนยัน
                            </button>
                            <button
                                onClick={() => { setShowConfirm(false); setPendingBody(null); setConfirmSummary(null); }}
                                className="flex-1 rounded-lg border-2 border-gray-900 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 font-bold py-2.5 text-sm active:bg-gray-100 dark:active:bg-slate-700 min-h-[44px]"
                            >
                                ยกเลิก
                            </button>
                        </div>
                    </div>
                )}
                {action !== "none" && actionCfg && feedback === "" && (
                    <p className="text-[10px] text-muted-foreground mt-1 text-center">
                        {action === "navigate" && navigateTo ? `→ ${navigateTo}` : ""}
                        {(action === "submit-form" || action === "api-call") && actionEndpoint ? `${actionMethod} ${actionEndpoint}` : ""}
                        {action === "show-confirm" ? "แสดงการยืนยัน" : ""}
                    </p>
                )}
            </div>
        </div>
    );

    if (isPreview) return content;

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full cursor-grab rounded-xl p-1 transition-all ${selected ? "ring-2 ring-primary/30" : "hover:ring-1 hover:ring-primary/20"}`}
        >
            <div className="pointer-events-none">{content}</div>
        </div>
    );
}

ButtonBlock.craft = {
    displayName: "Button",
    props: {
        label: "ปุ่มกด", variant: "primary", size: "md", fullWidth: false, align: "left",
        action: "none", actionEndpoint: "", actionMethod: "POST",
        navigateTo: "", confirmText: "",
    } as ButtonBlockProps,
};
