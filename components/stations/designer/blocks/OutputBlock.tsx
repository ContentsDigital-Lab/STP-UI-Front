"use client";

import { useNode } from "@craftjs/core";
import { CheckCircle } from "lucide-react";
import { BaseBlock, BlockField } from "./BaseBlock";
import { OutputBlockProps } from "@/lib/types/station-designer";

export function OutputBlock({ label = "ส่งออก/ส่งมอบ", destination = "" }: OutputBlockProps) {
    useNode();
    return (
        <BaseBlock
            color="bg-red-500"
            borderColor="border-red-300 dark:border-red-700"
            bgLight="bg-red-50 dark:bg-red-950/30"
            icon={<CheckCircle className="h-3.5 w-3.5" />}
            title={label}
        >
            <BlockField label="ปลายทาง" value={destination} />
        </BaseBlock>
    );
}

OutputBlock.craft = {
    displayName: "Output",
    props: { label: "ส่งออก/ส่งมอบ", destination: "" } as OutputBlockProps,
    rules: { canDrag: () => true },
};
