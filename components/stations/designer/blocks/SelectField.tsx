"use client";

import { useNode } from "@craftjs/core";
import { useEffect, useState } from "react";
import { ChevronDown, Database, Hash, Loader2 } from "lucide-react";
import { fetchApi } from "@/lib/api/config";
import { usePreview } from "../PreviewContext";

interface SelectFieldProps {
    label?:       string;
    placeholder?: string;
    fieldKey?:    string;
    dataSource?:  string;
    labelField?:  string;
    valueField?:  string;
    options?:     string;
}

const SOURCE_LABEL: Record<string, string> = {
    "/materials":  "รายการวัสดุ",
    "/workers":    "รายการพนักงาน",
    "/customers":  "รายการลูกค้า",
    "/orders":     "รายการออเดอร์",
    "/inventory":  "คลังสินค้า",
};

export function SelectField({
    label = "เลือกตัวเลือก",
    placeholder = "-- เลือก --",
    fieldKey = "",
    dataSource = "static",
    labelField = "name",
    valueField = "_id",
    options = "ตัวเลือก 1, ตัวเลือก 2",
}: SelectFieldProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const isApi     = dataSource && dataSource !== "static";

    // ── Preview: fetch real API data ──────────────────────────────────────────
    const [apiItems, setApiItems] = useState<{ label: string; value: string }[]>([]);
    const [fetching, setFetching] = useState(false);

    useEffect(() => {
        if (!isPreview || !isApi) return;
        setFetching(true);
        fetchApi<{ success: boolean; data: Record<string, string>[] }>(dataSource)
            .then((res) => {
                if (res.success && Array.isArray(res.data)) {
                    setApiItems(res.data.map((item) => ({
                        label: item[labelField || "name"] || item.name || item._id || "—",
                        value: item[valueField || "_id"]  || item._id  || "",
                    })));
                }
            })
            .catch(() => setApiItems([]))
            .finally(() => setFetching(false));
    }, [isPreview, dataSource, labelField, valueField, isApi]);

    // ── Preview render ────────────────────────────────────────────────────────
    if (isPreview) {
        const staticOpts = (options ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        return (
            <div className="w-full space-y-1.5">
                {label && <label className="block text-xs font-semibold text-foreground/70">{label}</label>}
                <div className="relative">
                    <select className="w-full rounded-lg border bg-background px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-primary/40">
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
    }

    // ── Design mode render ────────────────────────────────────────────────────
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-xl border-2 p-3 space-y-1.5 cursor-grab transition-all ${selected ? "border-primary bg-primary/5" : "border-slate-200 dark:border-slate-700 hover:border-primary/30 bg-card"}`}
        >
            {(fieldKey || isApi) && (
                <div className="flex flex-wrap items-center gap-1 mb-1">
                    {fieldKey && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-mono font-medium">
                            <Hash className="h-2.5 w-2.5" />{fieldKey}
                        </span>
                    )}
                    {isApi && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-[10px] font-medium">
                            <Database className="h-2.5 w-2.5" />
                            {SOURCE_LABEL[dataSource] ?? dataSource}
                            {labelField ? ` · ${labelField}` : ""}
                        </span>
                    )}
                </div>
            )}

            <label className="block text-xs font-semibold text-foreground/70">{label}</label>
            <div className="w-full rounded-lg border border-muted bg-background px-3 py-2 text-sm text-muted-foreground/50 flex items-center justify-between pointer-events-none">
                <span>{placeholder}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
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
        options: "ตัวเลือก 1, ตัวเลือก 2",
    } as SelectFieldProps,
};
