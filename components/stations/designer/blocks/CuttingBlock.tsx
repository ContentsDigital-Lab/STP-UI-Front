"use client";

import { useNode } from "@craftjs/core";
import { Scissors } from "lucide-react";
import { BaseBlock, BlockField } from "./BaseBlock";
import { CuttingBlockProps } from "@/lib/types/station-designer";

export function CuttingBlock({ label = "ตัดกระจก", cutType = "", estimatedTime }: CuttingBlockProps) {
    useNode();
    return (
        <BaseBlock
            color="bg-blue-500"
            borderColor="border-blue-300 dark:border-blue-700"
            bgLight="bg-blue-50 dark:bg-blue-950/30"
            icon={<Scissors className="h-3.5 w-3.5" />}
            title={label}
        >
            <BlockField label="ประเภทตัด" value={cutType} />
            <BlockField label="เวลาโดยประมาณ" value={estimatedTime ? `${estimatedTime} นาที` : undefined} />
        </BaseBlock>
    );
}

CuttingBlock.craft = {
    displayName: "Cutting",
    props: { label: "ตัดกระจก", cutType: "", estimatedTime: undefined } as CuttingBlockProps,
    rules: { canDrag: () => true },
};
