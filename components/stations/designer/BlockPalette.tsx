"use client";

import { useEditor, Element } from "@craftjs/core";
import {
    Columns2, Columns3, Columns4, Type, AlignLeft, Minus, MoveVertical,
    Tag, TextCursorInput, ChevronDown, FileText,
    MousePointerClick, CreditCard, Activity, LayoutPanelLeft, Table2, ClipboardList, Workflow,
    Boxes, PackageSearch,
} from "lucide-react";
import { ReactElement } from "react";

import { Section }           from "./blocks/Section";
import { TwoColumns }        from "./blocks/TwoColumns";
import { Column }            from "./blocks/Column";
import { Heading }           from "./blocks/Heading";
import { Paragraph }         from "./blocks/Paragraph";
import { Divider }           from "./blocks/Divider";
import { Spacer }            from "./blocks/Spacer";
import { Badge }             from "./blocks/Badge";
import { InputField }        from "./blocks/InputField";
import { SelectField }       from "./blocks/SelectField";
import { TextAreaField }     from "./blocks/TextAreaField";
import { ButtonBlock }       from "./blocks/ButtonBlock";
import { InfoCard }          from "./blocks/InfoCard";
import { StatusIndicator }   from "./blocks/StatusIndicator";
import { RecordList }             from "./blocks/RecordList";
import { RecordDetail }           from "./blocks/RecordDetail";
import { StationSequencePicker }  from "./blocks/StationSequencePicker";
import { InventoryStockBlock }    from "./blocks/InventoryStockBlock";
import { OrderReleasePanel }      from "./blocks/OrderReleasePanel";

interface PaletteItem {
    label: string;
    icon: React.ReactNode;
    element: ReactElement;
    bg: string;
}

interface PaletteGroup {
    category: string;
    items: PaletteItem[];
}

const PALETTE: PaletteGroup[] = [
    {
        category: "Layout",
        items: [
            { label: "Section",   icon: <LayoutPanelLeft className="h-4 w-4" />, element: <Section />,     bg: "bg-slate-500" },
            { label: "2 Columns", icon: <Columns2 className="h-4 w-4" />, element: <TwoColumns columns={2}><Element is={Column} canvas /><Element is={Column} canvas /></TwoColumns>, bg: "bg-slate-500" },
            { label: "3 Columns", icon: <Columns3 className="h-4 w-4" />, element: <TwoColumns columns={3}><Element is={Column} canvas /><Element is={Column} canvas /><Element is={Column} canvas /></TwoColumns>, bg: "bg-slate-500" },
            { label: "4 Columns", icon: <Columns4 className="h-4 w-4" />, element: <TwoColumns columns={4}><Element is={Column} canvas /><Element is={Column} canvas /><Element is={Column} canvas /><Element is={Column} canvas /></TwoColumns>, bg: "bg-slate-500" },
        ],
    },
    {
        category: "Content",
        items: [
            { label: "Heading",   icon: <Type className="h-4 w-4" />,         element: <Heading />,    bg: "bg-blue-500"   },
            { label: "Paragraph", icon: <AlignLeft className="h-4 w-4" />,    element: <Paragraph />,  bg: "bg-blue-400"   },
            { label: "Divider",   icon: <Minus className="h-4 w-4" />,        element: <Divider />,    bg: "bg-slate-400"  },
            { label: "Spacer",    icon: <MoveVertical className="h-4 w-4" />, element: <Spacer />,     bg: "bg-slate-400"  },
            { label: "Badge",     icon: <Tag className="h-4 w-4" />,          element: <Badge />,      bg: "bg-green-500"  },
        ],
    },
    {
        category: "Form",
        items: [
            { label: "Input",    icon: <TextCursorInput className="h-4 w-4" />, element: <InputField />,    bg: "bg-purple-500" },
            { label: "Select",   icon: <ChevronDown className="h-4 w-4" />,     element: <SelectField />,   bg: "bg-purple-500" },
            { label: "Textarea", icon: <FileText className="h-4 w-4" />,        element: <TextAreaField />, bg: "bg-purple-500" },
            { label: "Button",   icon: <MousePointerClick className="h-4 w-4" />, element: <ButtonBlock />, bg: "bg-orange-500" },
        ],
    },
    {
        category: "Data",
        items: [
            { label: "Info Card", icon: <CreditCard className="h-4 w-4" />,  element: <InfoCard />,        bg: "bg-teal-500"  },
            { label: "Status",    icon: <Activity className="h-4 w-4" />,    element: <StatusIndicator />, bg: "bg-teal-500"  },
            { label: "รายการข้อมูล",     icon: <Table2 className="h-4 w-4" />,       element: <RecordList />,            bg: "bg-indigo-500"  },
            { label: "รายละเอียด",      icon: <ClipboardList className="h-4 w-4" />, element: <RecordDetail />,          bg: "bg-cyan-600"    },
            { label: "เส้นทางผลิต",     icon: <Workflow className="h-4 w-4" />,      element: <StationSequencePicker />, bg: "bg-emerald-600" },
            { label: "สต็อกวัสดุ",      icon: <Boxes className="h-4 w-4" />,        element: <InventoryStockBlock />,   bg: "bg-emerald-700" },
            { label: "ประเมินออเดอร์",  icon: <PackageSearch className="h-4 w-4" />, element: <OrderReleasePanel />,    bg: "bg-violet-600"  },
        ],
    },
];

export function BlockPalette() {
    const { connectors } = useEditor();

    return (
        <aside className="w-52 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-b shrink-0">
                <h2 className="text-sm font-semibold">Components</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">ลากมาวางบน Canvas</p>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {PALETTE.map((group) => (
                    <div key={group.category}>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">
                            {group.category}
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                            {group.items.map((item) => (
                                <div
                                    key={item.label}
                                    ref={(ref) => { ref && connectors.create(ref, item.element); }}
                                    className="flex flex-col items-center gap-1.5 rounded-xl border bg-background p-2.5 cursor-grab active:cursor-grabbing hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm transition-all select-none"
                                    title={item.label}
                                >
                                    <div className={`${item.bg} text-white rounded-lg p-1.5`}>
                                        {item.icon}
                                    </div>
                                    <span className="text-[10px] font-medium text-center leading-tight text-foreground/70">
                                        {item.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
}
