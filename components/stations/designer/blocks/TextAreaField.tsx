"use client";

import { useNode } from "@craftjs/core";
import { Hash } from "lucide-react";

interface TextAreaFieldProps {
    label?:       string;
    placeholder?: string;
    rows?:        number;
    // data binding
    fieldKey?:    string;
}

export function TextAreaField({
    label = "หมายเหตุ",
    placeholder = "กรอกข้อความ...",
    rows = 3,
    fieldKey = "",
}: TextAreaFieldProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-xl border-2 p-3 space-y-1.5 cursor-grab transition-all ${selected ? "border-primary bg-primary/5" : "border-slate-200 dark:border-slate-700 hover:border-primary/30 bg-card"}`}
        >
            {/* Binding badge */}
            {fieldKey && (
                <div className="mb-1">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-mono font-medium">
                        <Hash className="h-2.5 w-2.5" />{fieldKey}
                    </span>
                </div>
            )}
            <label className="block text-xs font-semibold text-foreground/70">{label}</label>
            <div
                className="w-full rounded-lg border border-muted bg-background px-3 py-2 text-sm text-muted-foreground/50 pointer-events-none"
                style={{ minHeight: `${rows * 1.75}rem` }}
            >
                {placeholder}
            </div>
        </div>
    );
}

TextAreaField.craft = {
    displayName: "Text Area",
    props: { label: "หมายเหตุ", placeholder: "กรอกข้อความ...", rows: 3, fieldKey: "" } as TextAreaFieldProps,
};
