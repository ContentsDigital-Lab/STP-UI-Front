"use client";

import { useNode } from "@craftjs/core";
import { PackageOpen } from "lucide-react";
import { BaseBlock, BlockField } from "./BaseBlock";
import { InputBlockProps } from "@/lib/types/station-designer";

export function InputBlock({ label = "รับวัตถุดิบ", materialType = "", quantity }: InputBlockProps) {
    useNode();
    return (
        <BaseBlock
            color="bg-green-500"
            borderColor="border-green-300 dark:border-green-700"
            bgLight="bg-green-50 dark:bg-green-950/30"
            icon={<PackageOpen className="h-3.5 w-3.5" />}
            title={label}
        >
            <BlockField label="วัสดุ" value={materialType} />
            <BlockField label="จำนวน" value={quantity} />
        </BaseBlock>
    );
}

InputBlock.craft = {
    displayName: "Input",
    props: { label: "รับวัตถุดิบ", materialType: "", quantity: undefined } as InputBlockProps,
    rules: { canDrag: () => true },
};
