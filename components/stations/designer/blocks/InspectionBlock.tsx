"use client";

import { useNode } from "@craftjs/core";
import { Search } from "lucide-react";
import { BaseBlock, FieldRow } from "./BaseBlock";
import { InspectionBlockProps } from "@/lib/types/station-designer";

export function InspectionBlock({ label = "ตรวจสอบคุณภาพ", checkPoints = "", passCriteria = "" }: InspectionBlockProps) {
    useNode();
    return (
        <BaseBlock headerColor="bg-yellow-500" icon={<Search className="h-4 w-4" />} title={label}>
            <div className="space-y-2">
                <FieldRow label="จุดตรวจสอบ"     value={checkPoints}   placeholder="ยังไม่ระบุ" />
                <FieldRow label="เกณฑ์ผ่าน"       value={passCriteria}  placeholder="ยังไม่ระบุ" />
            </div>
        </BaseBlock>
    );
}

InspectionBlock.craft = {
    displayName: "ตรวจสอบคุณภาพ",
    props: { label: "ตรวจสอบคุณภาพ", checkPoints: "", passCriteria: "" } as InspectionBlockProps,
    rules: { canDrag: () => true },
};
