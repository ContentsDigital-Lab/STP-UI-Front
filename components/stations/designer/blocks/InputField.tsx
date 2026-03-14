"use client";

import { useNode } from "@craftjs/core";

interface InputFieldProps {
    label?: string;
    placeholder?: string;
    fieldType?: "text" | "number" | "date";
    required?: boolean;
}

export function InputField({ label = "ชื่อฟิลด์", placeholder = "กรอกข้อมูล...", fieldType = "text", required = false }: InputFieldProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-xl border-2 p-3 space-y-1.5 cursor-grab transition-all ${selected ? "border-primary bg-primary/5" : "border-slate-200 dark:border-slate-700 hover:border-primary/30 bg-card"}`}
        >
            <label className="block text-xs font-semibold text-foreground/70">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <div className="w-full rounded-lg border border-muted bg-background px-3 py-2 text-sm text-muted-foreground/50 pointer-events-none">
                {placeholder}
            </div>
        </div>
    );
}

InputField.craft = {
    displayName: "Input Field",
    props: { label: "ชื่อฟิลด์", placeholder: "กรอกข้อมูล...", fieldType: "text", required: false } as InputFieldProps,
};
