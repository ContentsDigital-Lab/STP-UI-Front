"use client";

import { useNode } from "@craftjs/core";
import { PackageOpen } from "lucide-react";
import { BaseBlock, FieldRow } from "./BaseBlock";
import { InputBlockProps } from "@/lib/types/station-designer";

export function InputBlock({ label = "รับวัตถุดิบ", materialType = "", quantity }: InputBlockProps) {
    useNode();
    return (
        <BaseBlock headerColor="bg-green-500" icon={<PackageOpen className="h-4 w-4" />} title={label}>
            <div className="space-y-2">
                <FieldRow label="ประเภทวัสดุ"  value={materialType} placeholder="ยังไม่ระบุ" />
                <FieldRow label="จำนวน"          value={quantity}     placeholder="ยังไม่ระบุ" />
            </div>
        </BaseBlock>
    );
}

InputBlock.craft = {
    displayName: "รับวัตถุดิบ",
    props: { label: "รับวัตถุดิบ", materialType: "", quantity: undefined } as InputBlockProps,
    rules: { canDrag: () => true },
};
