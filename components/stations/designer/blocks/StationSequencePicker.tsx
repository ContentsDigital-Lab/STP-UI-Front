"use client";

import { useNode } from "@craftjs/core";
import { useRef, useState, useEffect } from "react";
import { X, Plus, Loader2, Workflow, GripVertical, RefreshCw } from "lucide-react";
import { usePreview } from "../PreviewContext";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { useStationContext } from "../StationContext";
import { stationsApi } from "@/lib/api/stations";
import { Station } from "@/lib/api/types";
import { getColorOption } from "@/lib/stations/stations-store";

// ── Station catalog ───────────────────────────────────────────────────────────
interface StationOption { id: string; label: string; desc: string; color: string; }

const STATION_CATALOG: StationOption[] = [
    { id: "cutting",    label: "ตัดกระจก",       desc: "ตัดตามขนาดที่กำหนด",       color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"           },
    { id: "grinding",   label: "เจียร/ลบคม",     desc: "เจียรขอบให้เรียบ",          color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
    { id: "drilling",   label: "เจาะรู",          desc: "เจาะรูตามแบบ",              color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
    { id: "tempering",  label: "เทมเปอร์",        desc: "อบความร้อนเพิ่มความแข็ง",  color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"             },
    { id: "laminating", label: "ลามิเนต",          desc: "เคลือบฟิล์มกันแตก",        color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"     },
    { id: "coating",    label: "เคลือบผิว",       desc: "เคลือบสีหรือกันรังสี UV",  color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
    { id: "framing",    label: "ใส่กรอบ/ประกอบ", desc: "ประกอบชิ้นส่วนและใส่กรอบ", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"         },
    { id: "inspection", label: "ตรวจสอบคุณภาพ",  desc: "QC ก่อนส่งมอบ",            color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"         },
    { id: "packing",    label: "บรรจุ/แพ็ค",      desc: "บรรจุหีบห่อป้องกันแตก",    color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300"         },
    { id: "delivery",   label: "จัดส่ง",          desc: "ส่งมอบให้ลูกค้า",          color: "bg-slate-100 text-slate-700 dark:bg-slate-700/30 dark:text-slate-300"     },
];

const PRESETS = [
    { label: "กระจกเทมเปอร์",  match: ["temper","tempered"],         stations: ["cutting","grinding","tempering","inspection","packing","delivery"]            },
    { label: "กระจกลามิเนต",   match: ["laminat","laminate"],         stations: ["cutting","grinding","laminating","inspection","packing","delivery"]           },
    { label: "กระจกธรรมดา",    match: ["clear","plain","float","ใส"], stations: ["cutting","grinding","inspection","packing","delivery"]                        },
    { label: "กระจกเจาะรู",    match: ["drill","hole","เจาะ"],        stations: ["cutting","grinding","drilling","inspection","packing","delivery"]             },
    { label: "เต็มกระบวนการ",  match: [],                             stations: ["cutting","grinding","drilling","tempering","laminating","coating","framing","inspection","packing","delivery"] },
];

// ── Props ─────────────────────────────────────────────────────────────────────
interface StationSequencePickerProps {
    title?:    string;
    fieldKey?: string;   // key to write stations[] into formData (default: "stations")
}

// ── Drag-and-drop sequence list ───────────────────────────────────────────────
function DraggableSequence({
    sequence,
    allStations,
    onReorder,
    onRemove,
}: {
    sequence:    string[];
    allStations: Station[];
    onReorder:   (from: number, to: number) => void;
    onRemove:    (id: string) => void;
}) {
    const dragIndex  = useRef<number | null>(null);
    const overIndex  = useRef<number | null>(null);
    const [dragging, setDragging] = useState<number | null>(null);
    const [over,     setOver]     = useState<number | null>(null);

    return (
        <div className="space-y-1.5">
            {sequence.map((id, i) => {
                const station    = allStations.find((s) => s._id === id);
                const colorCls   = station ? getColorOption(station.colorId).cls : "bg-muted text-muted-foreground";
                const label      = station?.name ?? id;
                const isDragging = dragging === i;
                const isOver     = over === i && dragging !== null && dragging !== i;
                return (
                    <div
                        key={id}
                        draggable
                        onDragStart={() => { dragIndex.current = i; setDragging(i); }}
                        onDragOver={(e) => { e.preventDefault(); overIndex.current = i; setOver(i); }}
                        onDragLeave={() => { overIndex.current = null; setOver(null); }}
                        onDrop={(e) => {
                            e.preventDefault();
                            if (dragIndex.current !== null && overIndex.current !== null && dragIndex.current !== overIndex.current) {
                                onReorder(dragIndex.current, overIndex.current);
                            }
                            setDragging(null); setOver(null);
                            dragIndex.current = null; overIndex.current = null;
                        }}
                        onDragEnd={() => { setDragging(null); setOver(null); }}
                        className={`flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 select-none transition-all ${
                            isDragging ? "opacity-40 scale-[0.98]" : "opacity-100"
                        } ${isOver ? "border-primary shadow-md translate-y-[-2px]" : "border-border"} cursor-grab active:cursor-grabbing`}
                    >
                        <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                        <span className="text-xs text-muted-foreground/50 w-5 text-center shrink-0 font-mono">{i + 1}</span>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${colorCls}`}>{label}</span>
                        <button
                            type="button"
                            onClick={() => onRemove(id)}
                            className="shrink-0 ml-auto p-1 rounded hover:bg-red-50 text-muted-foreground/30 hover:text-red-500 transition-colors"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function StationSequencePicker({
    title    = "กำหนดเส้นทางการผลิต",
    fieldKey = "stations",
}: StationSequencePickerProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const { setField, stationId } = useStationContext();

    const [allStations,     setAllStations]     = useState<Station[]>([]);
    const [loadingStations, setLoadingStations] = useState(false);
    const [sequence,        setSequence]        = useState<string[]>([]);

    const loadStations = async () => {
        setLoadingStations(true);
        try {
            const res = await stationsApi.getAll();
            if (res.success) setAllStations(res.data);
        } finally {
            setLoadingStations(false);
        }
    };

    useEffect(() => { if (isPreview) loadStations(); }, [isPreview]);

    // Write sequence to formData whenever it changes
    useEffect(() => {
        if (isPreview) setField(fieldKey, sequence);
    }, [sequence, fieldKey, setField, isPreview]);

    // Real-time station list updates via WebSocket
    useWebSocket("station", ["station:updated"], () => {
        if (isPreview) loadStations();
    });

    const addStation    = (id: string) => { if (!sequence.includes(id)) setSequence([...sequence, id]); };
    const removeStation = (id: string) => setSequence(sequence.filter((s) => s !== id));

    const reorder = (from: number, to: number) => {
        const next = [...sequence];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        setSequence(next);
    };

    // ── Preview render ────────────────────────────────────────────────────────
    if (isPreview) {
        if (loadingStations) {
            return (
                <div className="w-full rounded-xl border bg-card px-5 py-10 flex flex-col items-center gap-3 text-center">
                    <Loader2 className="h-8 w-8 text-muted-foreground/40 animate-spin" />
                    <p className="text-sm text-muted-foreground">กำลังโหลดสถานี...</p>
                </div>
            );
        }

        if (allStations.length === 0) {
            return (
                <div className="w-full rounded-xl border bg-card px-5 py-10 flex flex-col items-center gap-3 text-center">
                    <Workflow className="h-10 w-10 text-muted-foreground/30" />
                    <p className="text-sm font-medium text-muted-foreground">ยังไม่มีสถานี</p>
                    <p className="text-xs text-muted-foreground/60">สร้างสถานีในระบบก่อน แล้วกลับมาใช้งาน</p>
                </div>
            );
        }

        const available = allStations.filter((s) => !sequence.includes(s._id) && s._id !== stationId);
        return (
            <div className="w-full rounded-xl border bg-card overflow-hidden">
                {/* Header */}
                <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-semibold">{title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">ลากเพื่อจัดเรียง · คลิก × เพื่อลบ</p>
                    </div>
                    <button onClick={loadStations} disabled={loadingStations} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground" title="รีเฟรช">
                        <RefreshCw className={`h-3.5 w-3.5 ${loadingStations ? "animate-spin" : ""}`} />
                    </button>
                </div>

                {/* Selected sequence — drag to reorder */}
                <div className="px-5 pb-4 pt-4">
                    <div className="flex items-center justify-between mb-2.5">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            เส้นทางที่เลือก ({sequence.length} สถานี)
                        </p>
                        {sequence.length > 1 && (
                            <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                                <GripVertical className="h-3 w-3" /> ลากเพื่อจัดเรียง
                            </p>
                        )}
                    </div>

                    {sequence.length === 0 ? (
                        <div className="border-2 border-dashed border-muted-foreground/20 rounded-xl py-6 text-center">
                            <p className="text-sm text-muted-foreground/50">เพิ่มสถานีจากด้านล่าง</p>
                        </div>
                    ) : (
                        <DraggableSequence
                            sequence={sequence}
                            allStations={allStations}
                            onReorder={reorder}
                            onRemove={removeStation}
                        />
                    )}
                </div>

                {/* Available stations to add */}
                {available.length > 0 && (
                    <div className="px-5 pb-4 border-t pt-3">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2.5">เพิ่มสถานี</p>
                        <div className="flex flex-wrap gap-1.5">
                            {available.map((s) => {
                                const color = getColorOption(s.colorId);
                                return (
                                    <button key={s._id} type="button" onClick={() => addStation(s._id)}
                                        className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium transition-all hover:opacity-80 ${color.cls}`}>
                                        <Plus className="h-3 w-3" />{s.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Status bar — shows how many stations selected */}
                {sequence.length > 0 && (
                    <div className="px-5 pb-4">
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                            ✓ เลือก {sequence.length} สถานี — กดปุ่มสร้างออเดอร์เพื่อยืนยัน
                        </p>
                    </div>
                )}
            </div>
        );
    }

    // ── Design mode ───────────────────────────────────────────────────────────
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-xl border-2 cursor-grab overflow-hidden transition-all
                ${selected ? "border-primary ring-2 ring-primary/20" : "border-slate-200 dark:border-slate-700 hover:border-primary/30"}`}
        >
            <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b">
                <Workflow className="h-3.5 w-3.5 text-muted-foreground/60" />
                <p className="text-xs font-semibold text-foreground/70">{title}</p>
            </div>
            <div className="p-4 space-y-2 opacity-60 pointer-events-none">
                <div className="space-y-1">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/20" />
                            <span className="text-[10px] text-muted-foreground/30 w-4 font-mono">{i}</span>
                            <div className="h-3 w-20 rounded-full bg-muted animate-none" />
                        </div>
                    ))}
                </div>
                <p className="text-[10px] text-muted-foreground/40 text-center italic pt-1">
                    เขียนลง formData[{fieldKey ?? "stations"}] → ใช้ปุ่มกดเพื่อส่ง
                </p>
            </div>
        </div>
    );
}

StationSequencePicker.craft = {
    displayName: "Station Sequence",
    props: { title: "กำหนดเส้นทางการผลิต", fieldKey: "stations" } as StationSequencePickerProps,
};
