"use client";

import { useNode } from "@craftjs/core";
import { Scissors } from "lucide-react";
import { BaseBlock, FieldRow } from "./BaseBlock";
import { CuttingBlockProps } from "@/lib/types/station-designer";

export function CuttingBlock({ label = "ตัดกระจก", cutType = "", estimatedTime }: CuttingBlockProps) {
    useNode();
    return (
        <BaseBlock headerColor="bg-blue-500" icon={<Scissors className="h-4 w-4" />} title={label}>
            <div className="space-y-2">
                <FieldRow label="ประเภทการตัด"    value={cutType}       placeholder="ยังไม่ระบุ" />
                <FieldRow label="เวลาโดยประมาณ"   value={estimatedTime ? `${estimatedTime} นาที` : undefined} placeholder="ยังไม่ระบุ" />
            </div>
        </BaseBlock>
    );
}

CuttingBlock.craft = {
    displayName: "ตัดกระจก",
    props: { label: "ตัดกระจก", cutType: "", estimatedTime: undefined } as CuttingBlockProps,
    rules: { canDrag: () => true },
};
