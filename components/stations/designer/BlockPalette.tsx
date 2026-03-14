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

interface PaletteItem {
    label: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    element: React.ReactElement;
}

const PALETTE_ITEMS: PaletteItem[] = [
    {
        label: "รับวัตถุดิบ",       description: "Input",      icon: <PackageOpen className="h-4 w-4" />,
        color: "bg-green-500",     element: <InputBlock />,
    },
    {
        label: "ตัดกระจก",         description: "Cutting",    icon: <Scissors className="h-4 w-4" />,
        color: "bg-blue-500",      element: <CuttingBlock />,
    },
    {
        label: "เจียระไนขอบ",      description: "Grinding",   icon: <Wrench className="h-4 w-4" />,
        color: "bg-orange-500",    element: <GrindingBlock />,
    },
    {
        label: "แปรรูป",           description: "Processing", icon: <Settings className="h-4 w-4" />,
        color: "bg-purple-500",    element: <ProcessingBlock />,
    },
    {
        label: "ตรวจสอบ",         description: "Inspection", icon: <Search className="h-4 w-4" />,
        color: "bg-yellow-500",    element: <InspectionBlock />,
    },
    {
        label: "บรรจุ",            description: "Packaging",  icon: <Box className="h-4 w-4" />,
        color: "bg-pink-500",      element: <PackagingBlock />,
    },
    {
        label: "ส่งออก",           description: "Output",     icon: <CheckCircle className="h-4 w-4" />,
        color: "bg-red-500",       element: <OutputBlock />,
    },
    {
        label: "หมายเหตุ",         description: "Note",       icon: <FileText className="h-4 w-4" />,
        color: "bg-slate-400",     element: <NoteBlock />,
    },
];

export function BlockPalette() {
    const { connectors } = useEditor();

    return (
        <aside className="w-56 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-b">
                <h2 className="text-sm font-semibold text-foreground">บล็อก</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">ลากมาวางบน Canvas</p>
            </div>
            <div className="p-3 space-y-2 flex-1">
                {PALETTE_ITEMS.map((item) => (
                    <div
                        key={item.description}
                        ref={(ref) => { ref && connectors.create(ref, item.element); }}
                        className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5 cursor-grab active:cursor-grabbing hover:border-primary/50 hover:bg-muted/30 transition-colors select-none"
                    >
                        <span className={`${item.color} text-white rounded-md p-1.5`}>
                            {item.icon}
                        </span>
                        <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{item.label}</p>
                            <p className="text-[10px] text-muted-foreground">{item.description}</p>
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
}
