"use client";

import { useNode } from "@craftjs/core";
import { Settings } from "lucide-react";
import { BaseBlock, BlockField } from "./BaseBlock";
import { ProcessingBlockProps } from "@/lib/types/station-designer";

export function ProcessingBlock({ label = "แปรรูป", processName = "", estimatedTime }: ProcessingBlockProps) {
    useNode();
    return (
        <BaseBlock
            color="bg-purple-500"
            borderColor="border-purple-300 dark:border-purple-700"
            bgLight="bg-purple-50 dark:bg-purple-950/30"
            icon={<Settings className="h-3.5 w-3.5" />}
            title={label}
        >
            <BlockField label="ขั้นตอน" value={processName} />
            <BlockField label="เวลาโดยประมาณ" value={estimatedTime ? `${estimatedTime} นาที` : undefined} />
        </BaseBlock>
    );
}

ProcessingBlock.craft = {
    displayName: "Processing",
    props: { label: "แปรรูป", processName: "", estimatedTime: undefined } as ProcessingBlockProps,
    rules: { canDrag: () => true },
};
