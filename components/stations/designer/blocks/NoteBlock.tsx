"use client";

import { useNode } from "@craftjs/core";
import { FileText } from "lucide-react";
import { NoteBlockProps } from "@/lib/types/station-designer";

export function NoteBlock({ content = "บันทึกหมายเหตุ..." }: NoteBlockProps) {
    const { connectors: { connect, drag }, selected } = useNode((state) => ({
        selected: state.events.selected,
    }));

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`
                relative rounded-xl border-2 border-slate-300 dark:border-slate-600
                bg-slate-50 dark:bg-slate-800/50 min-w-[180px] max-w-[240px]
                cursor-grab active:cursor-grabbing shadow-sm transition-all select-none
                ${selected ? "ring-2 ring-primary ring-offset-2 shadow-md" : "hover:shadow-md"}
            `}
        >
            <div className="flex items-center gap-2 bg-slate-400 dark:bg-slate-600 rounded-t-[10px] px-3 py-2">
                <FileText className="h-3.5 w-3.5 text-white" />
                <span className="text-white text-xs font-semibold">หมายเหตุ</span>
            </div>
            <div className="px-3 py-2.5 text-xs text-foreground/80 italic whitespace-pre-wrap">
                {content}
            </div>
        </div>
    );
}

NoteBlock.craft = {
    displayName: "Note",
    props: { content: "บันทึกหมายเหตุ..." } as NoteBlockProps,
    rules: { canDrag: () => true },
};
