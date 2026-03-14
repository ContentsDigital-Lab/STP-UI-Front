"use client";

import { useNode } from "@craftjs/core";
import { Search } from "lucide-react";
import { BaseBlock, BlockField } from "./BaseBlock";
import { InspectionBlockProps } from "@/lib/types/station-designer";

export function InspectionBlock({ label = "ตรวจสอบคุณภาพ", checkPoints = "", passCriteria = "" }: InspectionBlockProps) {
    useNode();
    return (
        <BaseBlock
            color="bg-yellow-500"
            borderColor="border-yellow-300 dark:border-yellow-700"
            bgLight="bg-yellow-50 dark:bg-yellow-950/30"
            icon={<Search className="h-3.5 w-3.5" />}
            title={label}
        >
            <BlockField label="จุดตรวจ" value={checkPoints} />
            <BlockField label="เกณฑ์ผ่าน" value={passCriteria} />
        </BaseBlock>
    );
}

InspectionBlock.craft = {
    displayName: "Inspection",
    props: { label: "ตรวจสอบคุณภาพ", checkPoints: "", passCriteria: "" } as InspectionBlockProps,
    rules: { canDrag: () => true },
};
