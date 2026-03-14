"use client";

import { useNode } from "@craftjs/core";
import { Box } from "lucide-react";
import { BaseBlock, FieldRow } from "./BaseBlock";
import { PackagingBlockProps } from "@/lib/types/station-designer";

export function PackagingBlock({ label = "บรรจุ/จัดเตรียม", packType = "", quantity }: PackagingBlockProps) {
    useNode();
    return (
        <BaseBlock headerColor="bg-pink-500" icon={<Box className="h-4 w-4" />} title={label}>
            <div className="space-y-2">
                <FieldRow label="ประเภทบรรจุ"   value={packType}   placeholder="ยังไม่ระบุ" />
                <FieldRow label="จำนวน"           value={quantity}   placeholder="ยังไม่ระบุ" />
            </div>
        </BaseBlock>
    );
}

PackagingBlock.craft = {
    displayName: "บรรจุ/จัดเตรียม",
    props: { label: "บรรจุ/จัดเตรียม", packType: "", quantity: undefined } as PackagingBlockProps,
    rules: { canDrag: () => true },
};
