"use client";

import { useNode, useEditor } from "@craftjs/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Zap, Send, Navigation, Globe, MessageSquare, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { fetchApi } from "@/lib/api/config";
import { panesApi } from "@/lib/api/panes";
import { stationsApi } from "@/lib/api/stations";
import { Station, Pane } from "@/lib/api/types";
import { usePreview } from "../PreviewContext";
import { useStationContext } from "../StationContext";

const VARIANT_MAP: Record<string, string> = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border-2 border-primary text-primary bg-transparent hover:bg-primary/10",
    danger:  "bg-red-600 text-white hover:bg-red-700",
    success: "bg-green-600 text-white hover:bg-green-700",
};
const SIZE_MAP = { sm: "px-3 py-1.5 text-xs", md: "px-5 py-2 text-sm", lg: "px-7 py-3 text-base" };

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
    const actionCfg  = action && action !== "none" ? ACTION_CONFIG[action] : null;
    const { formData, resetForm, orderId, requestId, requestData, orderData, selectedRecord, triggerRefresh } = useStationContext();
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
            const body: Record<string, unknown> = {
                ...autoFields,
                ...normalized,
                ...(requestId ? { request: requestId } : {}),
                ...(orderId   ? { order:   orderId   } : {}),
            };

            // When a record is selected, its customer/material always take precedence
            // over whatever the form dropdowns have — prevents mismatched orders
            if (src) {
                const srcCustomer = extractId(src.customer);
                const srcMaterial = extractId(src.material);
                if (srcCustomer) body.customer = srcCustomer;
                if (srcMaterial) body.material = srcMaterial;
            }

            // ── Order-specific validation (after body is fully built) ─────────
            const isOrderEndpoint = /\/orders$/.test(actionEndpoint.trim());
            if (isOrderEndpoint) {
                const orderErrors: string[] = [];
                if (!body.customer) orderErrors.push("ลูกค้า");
                if (!body.material) orderErrors.push("วัสดุ/กระจก");
                const qty = Number(body.quantity);
                if (!body.quantity || isNaN(qty) || qty < 1) orderErrors.push("จำนวน (ต้องมากกว่า 0)");
                const stations = (body.stations ?? []) as unknown[];
                if (!Array.isArray(stations) || stations.length === 0) orderErrors.push("สถานีผลิต (เลือกอย่างน้อย 1 สถานี)");
                if (orderErrors.length > 0) {
                    setErrorMsg(`ข้อมูลไม่ครบ: ${orderErrors.join(", ")}`);
                    setFeedback("error");
                    setTimeout(() => setFeedback(""), 6000);
                    return;
                }
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
                    if (reqId) {
                        (async () => {
                            try {
                                const [stRes, pRes] = await Promise.all([
                                    stationsApi.getAll(),
                                    panesApi.getAll({ request: reqId, limit: 100 }),
                                ]);
                                const stationMap = new Map((stRes.success ? stRes.data as unknown as Station[] : []).map(s => [s._id, s.name]));
                                const routingNames = (body.stations as string[]).map(id => stationMap.get(id) ?? id);
                                const firstStation = routingNames[0];
                                const panes = pRes.success ? pRes.data as Pane[] : [];
                                await Promise.all(panes.map(p =>
                                    panesApi.update(p._id, { routing: routingNames, currentStation: firstStation, currentStatus: "pending" })
                                ));
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

    const alignClass = ALIGN_MAP[align] ?? "justify-start";

    const content = (
        <div className={`w-full flex ${alignClass}`}>
            <div className="flex flex-col items-stretch gap-1.5" style={fullWidth ? { width: "100%" } : {}}>
                <button
                    onClick={isPreview ? handlePreviewClick : undefined}
                    disabled={!isPreview || feedback === "loading"}
                    className={`rounded-lg font-semibold transition-all ${VARIANT_MAP[variant] ?? VARIANT_MAP.primary} ${SIZE_MAP[size]} ${fullWidth ? "w-full" : ""} ${feedback === "ok" ? "!bg-green-500 !text-white !border-green-500" : ""} ${feedback === "error" ? "!bg-red-500 !text-white !border-red-500" : ""} disabled:opacity-70 flex items-center justify-center gap-2`}
                >
                    {feedback === "loading" ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> กำลังส่ง...</>
                    ) : feedback === "ok" ? (
                        <><CheckCircle2 className="h-4 w-4" /> สำเร็จ</>
                    ) : feedback === "error" ? (
                        <><AlertCircle className="h-4 w-4" /> {label}</>
                    ) : (
                        label
                    )}
                </button>
                {feedback === "error" && errorMsg && (
                    <div className={`flex items-start gap-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 ${fullWidth ? "w-full" : ""}`}>
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{errorMsg}</span>
                    </div>
                )}
                {feedback === "ok" && (
                    <div className={`flex items-center gap-2 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 ${fullWidth ? "w-full" : ""}`}>
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span>ดำเนินการสำเร็จ</span>
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
