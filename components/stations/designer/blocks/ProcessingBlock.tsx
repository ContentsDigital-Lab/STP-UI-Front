"use client";

import { useNode } from "@craftjs/core";
import { Settings } from "lucide-react";
import { BaseBlock, FieldRow } from "./BaseBlock";
import { ProcessingBlockProps } from "@/lib/types/station-designer";

export function ProcessingBlock({ label = "แปรรูป", processName = "", estimatedTime }: ProcessingBlockProps) {
    useNode();
    return (
        <BaseBlock headerColor="bg-purple-500" icon={<Settings className="h-4 w-4" />} title={label}>
            <div className="space-y-2">
                <FieldRow label="ชื่อขั้นตอน"       value={processName}   placeholder="ยังไม่ระบุ" />
                <FieldRow label="เวลาโดยประมาณ"   value={estimatedTime ? `${estimatedTime} นาที` : undefined} placeholder="ยังไม่ระบุ" />
            </div>
        </BaseBlock>
    );
}

ProcessingBlock.craft = {
    displayName: "แปรรูป",
    props: { label: "แปรรูป", processName: "", estimatedTime: undefined } as ProcessingBlockProps,
    rules: { canDrag: () => true },
};
