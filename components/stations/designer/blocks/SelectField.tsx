"use client";

import { useNode } from "@craftjs/core";
import { ChevronDown } from "lucide-react";

interface SelectFieldProps {
    label?: string;
    options?: string;
    placeholder?: string;
}

export function SelectField({ label = "เลือกตัวเลือก", options = "ตัวเลือก 1, ตัวเลือก 2", placeholder = "-- เลือก --" }: SelectFieldProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-xl border-2 p-3 space-y-1.5 cursor-grab transition-all ${selected ? "border-primary bg-primary/5" : "border-slate-200 dark:border-slate-700 hover:border-primary/30 bg-card"}`}
        >
            <label className="block text-xs font-semibold text-foreground/70">{label}</label>
            <div className="w-full rounded-lg border border-muted bg-background px-3 py-2 text-sm text-muted-foreground/50 flex items-center justify-between pointer-events-none">
                <span>{placeholder}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            </div>
            {options && (
                <p className="text-[10px] text-muted-foreground/50">ตัวเลือก: {options}</p>
            )}
        </div>
    );
}

SelectField.craft = {
    displayName: "Select Field",
    props: { label: "เลือกตัวเลือก", options: "ตัวเลือก 1, ตัวเลือก 2", placeholder: "-- เลือก --" } as SelectFieldProps,
};
