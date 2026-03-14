"use client";

import { useNode } from "@craftjs/core";
import { FileText, GripVertical } from "lucide-react";
import { NoteBlockProps } from "@/lib/types/station-designer";

export function NoteBlock({ content = "บันทึกหมายเหตุ..." }: NoteBlockProps) {
    const { connectors: { connect, drag }, selected } = useNode((state) => ({
        selected: state.events.selected,
    }));

    return (
        <div
            ref={(ref) => { ref && connect(ref); }}
            className={`
                w-full rounded-xl border-2 overflow-hidden transition-all shadow-sm
                ${selected
                    ? "border-primary shadow-md ring-2 ring-primary/30"
                    : "border-transparent hover:border-muted-foreground/20 hover:shadow-md"
                }
            `}
        >
            <div
                ref={(ref) => { ref && drag(ref); }}
                className="flex items-center gap-2.5 bg-slate-400 dark:bg-slate-600 px-4 py-2.5 cursor-grab active:cursor-grabbing"
            >
                <FileText className="h-4 w-4 text-white shrink-0" />
                <span className="text-white font-semibold text-sm flex-1">หมายเหตุ</span>
                <GripVertical className="h-4 w-4 text-white/60 shrink-0" />
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/20 px-4 py-4">
                <p className="text-sm text-foreground/80 italic whitespace-pre-wrap leading-relaxed">
                    {content || "ยังไม่มีหมายเหตุ"}
                </p>
            </div>
        </div>
    );
}

NoteBlock.craft = {
    displayName: "หมายเหตุ",
    props: { content: "บันทึกหมายเหตุ..." } as NoteBlockProps,
    rules: { canDrag: () => true },
};
