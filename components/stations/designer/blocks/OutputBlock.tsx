"use client";

import { useNode } from "@craftjs/core";
import { CheckCircle } from "lucide-react";
import { BaseBlock, FieldRow } from "./BaseBlock";
import { OutputBlockProps } from "@/lib/types/station-designer";

export function OutputBlock({ label = "ส่งออก/ส่งมอบ", destination = "" }: OutputBlockProps) {
    useNode();
    return (
        <BaseBlock headerColor="bg-red-500" icon={<CheckCircle className="h-4 w-4" />} title={label}>
            <div className="space-y-2">
                <FieldRow label="ปลายทาง"   value={destination}   placeholder="ยังไม่ระบุ" />
            </div>
        </BaseBlock>
    );
}

OutputBlock.craft = {
    displayName: "ส่งออก/ส่งมอบ",
    props: { label: "ส่งออก/ส่งมอบ", destination: "" } as OutputBlockProps,
    rules: { canDrag: () => true },
};
