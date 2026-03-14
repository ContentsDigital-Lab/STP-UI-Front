"use client";

import { useEditor } from "@craftjs/core";
import {
    PackageOpen, Scissors, Wrench, Settings,
    Search, Box, CheckCircle, FileText,
} from "lucide-react";
import { InputBlock }      from "./blocks/InputBlock";
import { CuttingBlock }    from "./blocks/CuttingBlock";
import { GrindingBlock }   from "./blocks/GrindingBlock";
import { ProcessingBlock } from "./blocks/ProcessingBlock";
import { InspectionBlock } from "./blocks/InspectionBlock";
import { PackagingBlock }  from "./blocks/PackagingBlock";
import { OutputBlock }     from "./blocks/OutputBlock";
import { NoteBlock }       from "./blocks/NoteBlock";
import { ReactElement } from "react";

interface PaletteItem {
    label: string;
    type: string;
    icon: React.ReactNode;
    bg: string;
    element: ReactElement;
}

const PALETTE_ITEMS: PaletteItem[] = [
    { label: "รับวัตถุดิบ",    type: "Input",      bg: "bg-green-500",   icon: <PackageOpen className="h-5 w-5" />,  element: <InputBlock /> },
    { label: "ตัดกระจก",      type: "Cutting",    bg: "bg-blue-500",    icon: <Scissors className="h-5 w-5" />,     element: <CuttingBlock /> },
    { label: "เจียระไนขอบ",   type: "Grinding",   bg: "bg-orange-500",  icon: <Wrench className="h-5 w-5" />,       element: <GrindingBlock /> },
    { label: "แปรรูป",        type: "Processing", bg: "bg-purple-500",  icon: <Settings className="h-5 w-5" />,     element: <ProcessingBlock /> },
    { label: "ตรวจสอบ",      type: "Inspection", bg: "bg-yellow-500",  icon: <Search className="h-5 w-5" />,       element: <InspectionBlock /> },
    { label: "บรรจุ",         type: "Packaging",  bg: "bg-pink-500",    icon: <Box className="h-5 w-5" />,          element: <PackagingBlock /> },
    { label: "ส่งออก",        type: "Output",     bg: "bg-red-500",     icon: <CheckCircle className="h-5 w-5" />,  element: <OutputBlock /> },
    { label: "หมายเหตุ",      type: "Note",       bg: "bg-slate-400",   icon: <FileText className="h-5 w-5" />,     element: <NoteBlock /> },
];

export function BlockPalette() {
    const { connectors } = useEditor();

    return (
        <aside className="w-52 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-b">
                <h2 className="text-sm font-semibold text-foreground">บล็อก</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">ลากมาวางบน Canvas</p>
            </div>

            <div className="p-3 grid grid-cols-2 gap-2">
                {PALETTE_ITEMS.map((item) => (
                    <div
                        key={item.type}
                        ref={(ref) => { ref && connectors.create(ref, item.element); }}
                        className="flex flex-col items-center gap-2 rounded-xl border bg-background p-3 cursor-grab active:cursor-grabbing hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm transition-all select-none"
                        title={`ลาก ${item.label} มาวางบน canvas`}
                    >
                        <div className={`${item.bg} text-white rounded-lg p-2`}>
                            {item.icon}
                        </div>
                        <span className="text-[11px] font-medium text-center leading-tight text-foreground/80">
                            {item.label}
                        </span>
                    </div>
                ))}
            </div>
        </aside>
    );
}
