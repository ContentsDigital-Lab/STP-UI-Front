"use client";

import { useNode } from "@craftjs/core";
import { Hash } from "lucide-react";
import { usePreview } from "../PreviewContext";

interface InputFieldProps {
    label?:        string;
    placeholder?:  string;
    fieldType?:    "text" | "number" | "date" | "email" | "tel";
    required?:     boolean;
    // data binding
    fieldKey?:     string;
    defaultValue?: string;
}

export function InputField({
    label = "ชื่อฟิลด์",
    placeholder = "กรอกข้อมูล...",
    fieldType = "text",
    required = false,
    fieldKey = "",
    defaultValue = "",
}: InputFieldProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();

    if (isPreview) {
        return (
            <div className="w-full space-y-1.5">
                {label && <label className="block text-xs font-semibold text-foreground/70">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
                <input type={fieldType} placeholder={placeholder} defaultValue={defaultValue} className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
        );
    }

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-xl border-2 p-3 space-y-1.5 cursor-grab transition-all ${selected ? "border-primary bg-primary/5" : "border-slate-200 dark:border-slate-700 hover:border-primary/30 bg-card"}`}
        >
            {/* Binding badge */}
            {fieldKey && (
                <div className="flex items-center gap-1 mb-1">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-mono font-medium">
                        <Hash className="h-2.5 w-2.5" />{fieldKey}
                    </span>
                    {defaultValue && (
                        <span className="text-[10px] text-muted-foreground/60">= {defaultValue}</span>
                    )}
                </div>
            )}

            <label className="block text-xs font-semibold text-foreground/70">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <div className="w-full rounded-lg border border-muted bg-background px-3 py-2 text-sm text-muted-foreground/50 pointer-events-none flex items-center justify-between">
                <span>{placeholder}</span>
                <span className="text-[10px] text-muted-foreground/30 ml-2">{fieldType}</span>
            </div>
        </div>
    );
}

InputField.craft = {
    displayName: "Input Field",
    props: {
        label: "ชื่อฟิลด์", placeholder: "กรอกข้อมูล...", fieldType: "text",
        required: false, fieldKey: "", defaultValue: "",
    } as InputFieldProps,
};
