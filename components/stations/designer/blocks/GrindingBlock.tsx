"use client";

import { useNode } from "@craftjs/core";
import { Wrench } from "lucide-react";
import { BaseBlock, BlockField } from "./BaseBlock";
import { GrindingBlockProps } from "@/lib/types/station-designer";

export function GrindingBlock({ label = "เจียระไนขอบ", grindType = "", edgeFinish = "" }: GrindingBlockProps) {
    useNode();
    return (
        <BaseBlock
            color="bg-orange-500"
            borderColor="border-orange-300 dark:border-orange-700"
            bgLight="bg-orange-50 dark:bg-orange-950/30"
            icon={<Wrench className="h-3.5 w-3.5" />}
            title={label}
        >
            <BlockField label="ประเภทเจีย" value={grindType} />
            <BlockField label="ผิวขอบ" value={edgeFinish} />
        </BaseBlock>
    );
}

GrindingBlock.craft = {
    displayName: "Grinding",
    props: { label: "เจียระไนขอบ", grindType: "", edgeFinish: "" } as GrindingBlockProps,
    rules: { canDrag: () => true },
};
