"use client";

import { useNode } from "@craftjs/core";
import { useEffect, useState } from "react";
import { ChevronDown, Database, Hash, Loader2 } from "lucide-react";
import { fetchApi } from "@/lib/api/config";
import { usePreview } from "../PreviewContext";
import { useStationContext } from "../StationContext";

/** Endpoints that map to context data — selecting a value auto-fetches & stores in context */
const CONTEXT_SOURCE: Record<string, "request" | "order"> = {
    "/requests": "request",
    "/orders":   "order",
};

/** Resolve dot-notation key from an object, unwrapping populated sub-objects to their name/_id */
function resolveField(obj: Record<string, unknown>, key: string): string {
    const val = key.split(".").reduce<unknown>((cur, part) =>
        (cur != null && typeof cur === "object") ? (cur as Record<string, unknown>)[part] : undefined
    , obj);
    if (val == null) return "";
    if (typeof val === "object" && !Array.isArray(val)) {
        const o = val as Record<string, unknown>;
        return String(o.name ?? o.username ?? o.title ?? o._id ?? "");
    }
    return String(val);
}

/**
 * Build a human-readable label from an API record.
 * Tries the configured labelField first, then falls back through common fields
 * so that endpoints without a top-level "name" (e.g. /requests, /orders) still
 * show something meaningful instead of a raw MongoDB ObjectId.
 */
const LABEL_FALLBACKS = [
    "name",
    "customer.name",   // populated customer sub-object (requests, orders)
    "title",
    "code",            // e.g. order code
    "details.type",    // request details
    "username",
    "material.name",   // populated material sub-object
];

function buildLabel(item: Record<string, unknown>, labelField: string): string {
    // Try the user-configured field first
    const primary = resolveField(item, labelField);
    if (primary) return primary;

    // Walk through fallbacks (skip the one we already tried)
    for (const key of LABEL_FALLBACKS) {
        if (key === labelField) continue;
        const val = resolveField(item, key);
        if (val) return val;
    }

    // Last resort: first non-empty string/number value in the object (skip _id)
    for (const [k, v] of Object.entries(item)) {
        if (k === "_id" || k === "__v") continue;
        if (typeof v === "string" && v.length > 0 && v.length < 80) return v;
        if (typeof v === "number") return String(v);
    }

    return String(item._id ?? "—");
}

interface SelectFieldProps {
    label?:           string;
    placeholder?:     string;
    fieldKey?:        string;
    dataSource?:      string;
    labelField?:      string;
    valueField?:      string;
    options?:         string;
    showAllRequests?: boolean;  // opt-out: when true, show all requests including processed ones
    /** Cross-filter: only show items whose _id appears in this source's `linkedField` */
    linkedSource?:    string;   // e.g. "/requests"
    linkedField?:     string;   // e.g. "customer" — field in linkedSource that links to this dataSource
}

const SOURCE_LABEL: Record<string, string> = {
    "/materials":    "รายการวัสดุ",
    "/workers":      "รายการพนักงาน",
    "/customers":    "รายการลูกค้า",
    "/orders":       "รายการออเดอร์/คำสั่งผลิต",
    "/inventories":  "คลังสินค้า",
    "/requests":     "รายการคำขอ (บิล)",
    "/withdrawals":  "รายการเบิกวัสดุ",
    "/claims":       "รายการเคลม",
};

export function SelectField({
    label = "เลือกตัวเลือก",
    placeholder = "-- เลือก --",
    fieldKey = "",
    dataSource = "static",
    labelField = "name",
    valueField = "_id",
    options = "ตัวเลือก 1, ตัวเลือก 2",
    showAllRequests = false,
    linkedSource = "",
    linkedField = "",
}: SelectFieldProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const isApi     = dataSource && dataSource !== "static";
    const { formData, setField, setRequestData, setOrderData } = useStationContext();
    const contextType = CONTEXT_SOURCE[dataSource] ?? null;

    // ── Preview: fetch real API data ──────────────────────────────────────────
    const [apiItems, setApiItems] = useState<{ label: string; value: string }[]>([]);
    const [fetching, setFetching] = useState(false);

    useEffect(() => {
        if (!isApi) return;
        setFetching(true);

        const shouldHideProcessed = dataSource === "/requests" && !showAllRequests;
        const hasLinked = !!linkedSource && !!linkedField;

        // Fetch linked source (e.g. /requests) to get allowed IDs for cross-filtering
        const fetchLinked = hasLinked
            ? fetchApi<{ success: boolean; data: Record<string, unknown>[] }>(linkedSource)
            : Promise.resolve(null);

        // If main source is /requests, also fetch /orders to filter processed ones
        const fetchOrders = shouldHideProcessed
            ? fetchApi<{ success: boolean; data: Record<string, unknown>[] }>("/orders")
            : Promise.resolve(null);

        // Also fetch /orders if linkedSource is /requests (to filter processed from linked set)
        const fetchOrdersForLinked = (hasLinked && linkedSource === "/requests" && !showAllRequests)
            ? fetchApi<{ success: boolean; data: Record<string, unknown>[] }>("/orders")
            : Promise.resolve(null);

        Promise.all([
            fetchApi<{ success: boolean; data: Record<string, unknown>[] }>(dataSource),
            fetchOrders,
            fetchLinked,
            fetchOrdersForLinked,
        ])
            .then(([mainRes, ordersRes, linkedRes, ordersForLinkedRes]) => {
                if (!mainRes.success || !Array.isArray(mainRes.data)) return;
                let data = mainRes.data;

                // Filter processed requests from main source
                if (shouldHideProcessed && ordersRes?.success) {
                    const processedIds = new Set<string>(
                        (ordersRes.data ?? []).map((o) => {
                            const req = o.request;
                            if (!req) return null;
                            return typeof req === "string" ? req : (req as Record<string, unknown>)._id as string;
                        }).filter(Boolean) as string[]
                    );
                    data = data.filter((r) => !processedIds.has(r._id as string));
                }

                // Cross-filter: only keep items whose _id appears in linkedSource.linkedField
                if (hasLinked && linkedRes?.success) {
                    let linkedItems = linkedRes.data ?? [];

                    // If linkedSource is /requests, also remove processed ones from the linked set
                    if (linkedSource === "/requests" && !showAllRequests && ordersForLinkedRes?.success) {
                        const processedIds = new Set<string>(
                            (ordersForLinkedRes.data ?? []).map((o) => {
                                const req = o.request;
                                if (!req) return null;
                                return typeof req === "string" ? req : (req as Record<string, unknown>)._id as string;
                            }).filter(Boolean) as string[]
                        );
                        linkedItems = linkedItems.filter((r) => !processedIds.has(r._id as string));
                    }

                    // Extract allowed IDs from linkedField (handles populated objects)
                    const allowedIds = new Set<string>(
                        linkedItems.map((item) => {
                            const val = item[linkedField];
                            if (!val) return null;
                            return typeof val === "string" ? val : (val as Record<string, unknown>)._id as string;
                        }).filter(Boolean) as string[]
                    );

                    data = data.filter((item) => allowedIds.has(item._id as string));
                }

                setApiItems(data.map((item) => ({
                    label: buildLabel(item, labelField || "name"),
                    value: resolveField(item, valueField || "_id") || String(item._id ?? ""),
                })));
            })
            .catch(() => setApiItems([]))
            .finally(() => setFetching(false));
    }, [dataSource, labelField, valueField, isApi, showAllRequests, linkedSource, linkedField]);

    const staticOpts = (options ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const controlled = !!fieldKey;
    const currentValue = controlled ? String(formData[fieldKey] ?? "") : undefined;

    const content = (
        <div className="w-full space-y-1.5">
            {label && <label className="block text-xs font-semibold text-foreground/70">{label}</label>}
            <div className="relative">
                <select
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    value={controlled ? currentValue : undefined}
                    disabled={!isPreview}
                    onChange={controlled && isPreview ? (e) => {
                        const val = e.target.value;
                        setField(fieldKey, val);
                        if (contextType && val) {
                            fetchApi<{ success: boolean; data: Record<string, unknown> }>(`${dataSource}/${val}`)
                                .then((res) => {
                                    if (!res.success || !res.data) return;
                                    if (contextType === "request") setRequestData(res.data);
                                    if (contextType === "order")   setOrderData(res.data);
                                })
                                .catch(() => {});
                        }
                    } : undefined}
                >
                    <option value="">{fetching ? "กำลังโหลด..." : placeholder}</option>
                    {isApi
                        ? apiItems.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
                        : staticOpts.map((o) => <option key={o} value={o}>{o}</option>)
                    }
                </select>
                {fetching
                    ? <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
                    : <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                }
            </div>
            {isApi && <p className="text-[10px] text-emerald-600">{apiItems.length} รายการจาก {SOURCE_LABEL[dataSource] ?? dataSource}</p>}
        </div>
    );

    if (isPreview) return content;

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full cursor-grab transition-all rounded-xl p-1 ${selected ? "ring-2 ring-primary/30" : "hover:ring-1 hover:ring-primary/20"}`}
        >
            <div className="pointer-events-none">{content}</div>
        </div>
    );
}

SelectField.craft = {
    displayName: "Select Field",
    props: {
        label: "เลือกตัวเลือก", placeholder: "-- เลือก --",
        fieldKey: "", dataSource: "static", labelField: "name", valueField: "_id",
        options: "ตัวเลือก 1, ตัวเลือก 2", showAllRequests: false,
        linkedSource: "", linkedField: "",
    } as SelectFieldProps,
};
