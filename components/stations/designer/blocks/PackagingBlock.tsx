"use client";

import { useNode } from "@craftjs/core";
import { Box } from "lucide-react";
import { BaseBlock, BlockField } from "./BaseBlock";
import { PackagingBlockProps } from "@/lib/types/station-designer";

export function PackagingBlock({ label = "บรรจุ/จัดเตรียม", packType = "", quantity }: PackagingBlockProps) {
    useNode();
    return (
        <BaseBlock
            color="bg-pink-500"
            borderColor="border-pink-300 dark:border-pink-700"
            bgLight="bg-pink-50 dark:bg-pink-950/30"
            icon={<Box className="h-3.5 w-3.5" />}
            title={label}
        >
            <BlockField label="ประเภทบรรจุ" value={packType} />
            <BlockField label="จำนวน" value={quantity} />
        </BaseBlock>
    );
}

PackagingBlock.craft = {
    displayName: "Packaging",
    props: { label: "บรรจุ/จัดเตรียม", packType: "", quantity: undefined } as PackagingBlockProps,
    rules: { canDrag: () => true },
};
