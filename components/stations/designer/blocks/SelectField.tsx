"use client";

import { useNode } from "@craftjs/core";
import { ChevronDown, Database, Hash } from "lucide-react";

interface SelectFieldProps {
    label?:       string;
    placeholder?: string;
    // data binding
    fieldKey?:    string;
    dataSource?:  string;   // "static" | "/materials" | "/workers" | "/customers" | "/orders" | "/inventory"
    labelField?:  string;   // which field to display as option label
    valueField?:  string;   // which field to use as option value
    options?:     string;   // comma-separated for static source
}

// Source display label
const SOURCE_LABEL: Record<string, string> = {
    "/materials":  "Materials",
    "/workers":    "Workers",
    "/customers":  "Customers",
    "/orders":     "Orders",
    "/inventory":  "Inventory",
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
    const isApi = dataSource && dataSource !== "static";

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-xl border-2 p-3 space-y-1.5 cursor-grab transition-all ${selected ? "border-primary bg-primary/5" : "border-slate-200 dark:border-slate-700 hover:border-primary/30 bg-card"}`}
        >
            {/* Binding badges */}
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

            {/* Preview of options */}
            {isApi ? (
                <p className="text-[10px] text-teal-600 dark:text-teal-400">
                    📡 ดึงข้อมูลจาก {dataSource} → แสดง {labelField || "name"}
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
