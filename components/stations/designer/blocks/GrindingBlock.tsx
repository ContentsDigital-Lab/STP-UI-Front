"use client";

import { useNode } from "@craftjs/core";
import { Wrench } from "lucide-react";
import { BaseBlock, FieldRow } from "./BaseBlock";
import { GrindingBlockProps } from "@/lib/types/station-designer";

export function GrindingBlock({ label = "เจียระไนขอบ", grindType = "", edgeFinish = "" }: GrindingBlockProps) {
    useNode();
    return (
        <BaseBlock headerColor="bg-orange-500" icon={<Wrench className="h-4 w-4" />} title={label}>
            <div className="space-y-2">
                <FieldRow label="ประเภทการเจีย"  value={grindType}   placeholder="ยังไม่ระบุ" />
                <FieldRow label="ผิวขอบ"           value={edgeFinish}  placeholder="ยังไม่ระบุ" />
            </div>
        </BaseBlock>
    );
}

GrindingBlock.craft = {
    displayName: "เจียระไนขอบ",
    props: { label: "เจียระไนขอบ", grindType: "", edgeFinish: "" } as GrindingBlockProps,
    rules: { canDrag: () => true },
};
