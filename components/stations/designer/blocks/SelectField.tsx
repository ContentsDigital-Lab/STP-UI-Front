"use client";

import { useNode } from "@craftjs/core";
import { useEffect, useState, useRef } from "react";
import { ChevronDown, Database, Hash, Loader2, Check, Search } from "lucide-react";
import { fetchApi } from "@/lib/api/config";
import { usePreview } from "../PreviewContext";
import { useStationContext } from "../StationContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

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
    searchable?:      string | boolean;  // string dropdown to bypass boolean stripping
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

/**
 * Auto-map dataSource → fieldKey so admins don't need to manually configure it.
 * Explicit fieldKey prop still overrides this.
 */
const AUTO_FIELD_KEY: Record<string, string> = {
    "/customers":   "customer",
    "/materials":   "material",
    "/workers":     "assignedTo",
    "/requests":    "request",
    "/orders":      "order",
    "/inventories": "inventory",
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
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ 
        selected: s.events.selected
    }));
    
    const isSearchable = true;
        
    const isPreview = usePreview();
    const isApi     = dataSource && dataSource !== "static";
    const { formData, setField, setFieldLabel, setRequestData, setOrderData } = useStationContext();
    const contextType = CONTEXT_SOURCE[dataSource] ?? null;

    // Auto-derive fieldKey from dataSource if not explicitly set — no manual config needed
    const effectiveKey = fieldKey || AUTO_FIELD_KEY[dataSource] || "";

    // ── Fetch real API data ────────────────────────────────────────────────────
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

        // We fetch up to 10000 items to ensure all data is available for client-side search.
        const limitParam = dataSource.includes("?") ? "&limit=10000" : "?limit=10000";

        Promise.all([
            fetchApi<{ success: boolean; data: Record<string, unknown>[] }>(`${dataSource}${limitParam}`),
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

    // ── Preview render ────────────────────────────────────────────────────────
    if (isPreview) {
        const staticOpts = (options ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        const controlled = !!effectiveKey;
        const currentValue = controlled ? String(formData[effectiveKey] ?? "") : undefined;
        
        const [open, setOpen] = useState(false);

        const handleSelectValue = (val: string) => {
            if (controlled) {
                setField(effectiveKey, val);
                const chosen = apiItems.find((o) => o.value === val);
                if (chosen) setFieldLabel(effectiveKey, chosen.label);
                if (contextType && val) {
                    fetchApi<{ success: boolean; data: Record<string, unknown> }>(`${dataSource}/${val}`)
                        .then((res) => {
                            if (!res.success || !res.data) return;
                            if (contextType === "request") setRequestData(res.data);
                            if (contextType === "order")   setOrderData(res.data);
                        })
                        .catch(() => {});
                }
            }
        };

        const renderItems = isApi 
            ? apiItems 
            : staticOpts.map((o) => ({ label: o, value: o }));

        const currentLabel = renderItems.find((o) => o.value === currentValue)?.label || placeholder;

        return (
            <div className="w-full space-y-2">
                {label && <label className="block text-sm font-bold text-gray-900 dark:text-slate-100">{label}</label>}
                <div className="relative">
                    {isSearchable ? (
                        <Popover open={open} onOpenChange={setOpen}>
                            <PopoverTrigger
                                className="flex w-full items-center justify-between rounded-xl border-2 border-gray-900 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-base font-medium text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-700 dark:focus:ring-blue-500 focus:border-blue-700 dark:focus:border-blue-500 min-h-[52px]"
                            >
                                <span className="truncate">{fetching ? "กำลังโหลด..." : currentLabel}</span>
                                {fetching
                                    ? <Loader2 className="h-5 w-5 shrink-0 text-gray-500 dark:text-slate-400 animate-spin ml-2" />
                                    : <ChevronDown className="h-5 w-5 shrink-0 text-gray-700 dark:text-slate-300 ml-2" />
                                }
                            </PopoverTrigger>
                            <PopoverContent className="w-[var(--anchor-width,var(--radix-popover-trigger-width,300px))] min-w-[200px] p-0" align="start">
                                <Command>
                                    <CommandInput placeholder="ค้นหา..." className="h-11" />
                                    <CommandList>
                                        <CommandEmpty>ไม่พบข้อมูล</CommandEmpty>
                                        <CommandGroup>
                                            {renderItems.map((o) => (
                                                <CommandItem
                                                    key={o.value}
                                                    value={o.label}
                                                    onSelect={() => {
                                                        handleSelectValue(o.value);
                                                        setOpen(false);
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4",
                                                            currentValue === o.value ? "opacity-100" : "opacity-0"
                                                        )}
                                                    />
                                                    {o.label}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    ) : (
                        <select
                            className="w-full rounded-xl border-2 border-gray-900 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-base font-medium text-gray-900 dark:text-slate-100 appearance-none pr-10 focus:outline-none focus:ring-2 focus:ring-blue-700 dark:focus:ring-blue-500 focus:border-blue-700 dark:focus:border-blue-500 min-h-[52px]"
                            value={controlled ? currentValue : undefined}
                            onChange={controlled ? (e) => handleSelectValue(e.target.value) : undefined}
                        >
                            <option value="" className="dark:bg-slate-900">{fetching ? "กำลังโหลด..." : placeholder}</option>
                            {renderItems.map((o) => (
                                <option key={o.value} value={o.value} className="dark:bg-slate-900">{o.label}</option>
                            ))}
                        </select>
                    )}
                    {!isSearchable && (
                        fetching
                            ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 dark:text-slate-400 animate-spin pointer-events-none" />
                            : <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-700 dark:text-slate-300 pointer-events-none" />
                    )}
                </div>
                {isApi && <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{apiItems.length} รายการจาก {SOURCE_LABEL[dataSource] ?? dataSource}</p>}
            </div>
        );
    }

    // FAKE DESIGN PLACEHOLDER
    return (
        <div
            ref={(ref) => { if (ref) connect(drag(ref)); }}
            className={`w-full rounded-xl border border-dashed border-blue-400 bg-blue-50/30 dark:bg-blue-900/10 p-3 space-y-1.5 opacity-90 transition-all ${selected ? "ring-2 ring-blue-500 shadow-sm" : "hover:border-blue-500/50"}`}
        >
            <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-foreground/70">{label}</label>
            </div>
            <div className="w-full rounded-lg border border-muted bg-background px-3 py-2 text-sm text-muted-foreground/50 flex items-center justify-between shadow-sm">
                <span>{placeholder}</span>
                <Search className="h-3.5 w-3.5 shrink-0" />
            </div>

            {isApi ? (
                <p className="text-[10px] text-teal-600 dark:text-teal-400">
                    📡 ดึงข้อมูลจาก {SOURCE_LABEL[dataSource] ?? dataSource} → แสดง {labelField || "name"}
                </p>
            ) : options ? (
                <p className="text-[10px] text-muted-foreground/50 truncate">ตัวเลือก: {options}</p>
            ) : null}
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
