"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
    Trash2, Type, Variable, QrCode, Square, Minus, Save, Tag,
    Undo2, Redo2, ZoomIn, ZoomOut, Copy, Clipboard, ImageIcon, Eye,
} from "lucide-react";
import StickerPreviewModal from "./StickerPreviewModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const StickerCanvas = dynamic(() => import("./StickerCanvas"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

export type ElementType = "text" | "dynamic" | "qr" | "rect" | "line" | "image";

interface BaseElement { id: string; type: ElementType; x: number; y: number; }
interface TextElement extends BaseElement {
    type: "text" | "dynamic";
    text: string; fontSize: number; fill: string; bold: boolean; italic: boolean;
}
interface QrElement extends BaseElement {
    type: "qr"; width: number; height: number; value: string;
}
interface RectElement extends BaseElement {
    type: "rect"; width: number; height: number; fill: string; stroke: string; strokeWidth: number;
}
interface LineElement extends BaseElement {
    type: "line"; points: number[]; stroke: string; strokeWidth: number;
}
export interface ImageElement extends BaseElement {
    type: "image"; width: number; height: number; src: string; // base64 data URL
}
export type StickerElement = TextElement | QrElement | RectElement | LineElement | ImageElement;

export interface StickerTemplate {
    width: number; height: number; elements: StickerElement[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MM_TO_PX = 3.7795275591;
const STORAGE_KEY = "sticker_template";
const MAX_HISTORY = 50;

const DYNAMIC_VARIABLES = [
    { value: "{{orderCode}}",    label: "รหัสออเดอร์" },
    { value: "{{customerName}}", label: "ชื่อลูกค้า" },
    { value: "{{materialName}}", label: "ชื่อวัสดุ" },
    { value: "{{quantity}}",     label: "จำนวน" },
    { value: "{{status}}",       label: "สถานะ" },
    { value: "{{assignedTo}}",   label: "ผู้รับผิดชอบ" },
    { value: "{{date}}",         label: "วันที่" },
    { value: "{{time}}",         label: "เวลา" },
];

function genId() { return Math.random().toString(36).slice(2, 9); }

// ─── Properties Panel ─────────────────────────────────────────────────────────

function PropsPanel({ element, onChange, onDelete }: {
    element: StickerElement | null;
    onChange: (u: StickerElement) => void;
    onDelete: () => void;
}) {
    if (!element) {
        return (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
                <Square className="h-8 w-8 opacity-20" />
                <p className="text-xs text-center">คลิกที่ element<br />เพื่อแก้ไขคุณสมบัติ</p>
            </div>
        );
    }

    const update = (patch: Partial<StickerElement>) =>
        onChange({ ...element, ...patch } as StickerElement);

    const typeLabel =
        element.type === "text" ? "ข้อความ" :
        element.type === "dynamic" ? "ตัวแปร" :
        element.type === "qr" ? "QR Code" :
        element.type === "image" ? "รูปภาพ" :
        element.type === "rect" ? "สี่เหลี่ยม" : "เส้น";

    return (
        <div className="p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">{typeLabel}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={onDelete}>
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Position */}
            <div className="grid grid-cols-2 gap-1.5">
                <div>
                    <Label className="text-[10px]">X</Label>
                    <Input type="number" className="h-7 text-xs" value={Math.round(element.x)}
                        onChange={e => update({ x: Number(e.target.value) })} />
                </div>
                <div>
                    <Label className="text-[10px]">Y</Label>
                    <Input type="number" className="h-7 text-xs" value={Math.round(element.y)}
                        onChange={e => update({ y: Number(e.target.value) })} />
                </div>
            </div>

            {/* Text / Dynamic */}
            {(element.type === "text" || element.type === "dynamic") && (() => {
                const el = element as TextElement;
                return (
                    <>
                        {element.type === "dynamic" ? (
                            <div>
                                <Label className="text-[10px]">ตัวแปร</Label>
                                <Select value={el.text} onValueChange={v => update({ text: v } as Partial<TextElement>)}>
                                    <SelectTrigger className="h-7 text-xs">
                                        <span className="truncate">{DYNAMIC_VARIABLES.find(v => v.value === el.text)?.label ?? el.text}</span>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DYNAMIC_VARIABLES.map(v => (
                                            <SelectItem key={v.value} value={v.value} className="text-xs">{v.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : (
                            <div>
                                <Label className="text-[10px]">ข้อความ</Label>
                                <Input className="h-7 text-xs" value={el.text}
                                    onChange={e => update({ text: e.target.value } as Partial<TextElement>)} />
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-1.5">
                            <div>
                                <Label className="text-[10px]">ขนาดตัวอักษร</Label>
                                <Input type="number" className="h-7 text-xs" value={el.fontSize}
                                    onChange={e => update({ fontSize: Number(e.target.value) } as Partial<TextElement>)} />
                            </div>
                            <div>
                                <Label className="text-[10px]">สี</Label>
                                <input type="color" className="h-7 w-full rounded border border-input cursor-pointer" value={el.fill}
                                    onChange={e => update({ fill: e.target.value } as Partial<TextElement>)} />
                            </div>
                        </div>
                        <div className="flex gap-1.5">
                            <Button variant={el.bold ? "default" : "outline"} size="sm" className="flex-1 h-7 text-xs font-bold"
                                onClick={() => update({ bold: !el.bold } as Partial<TextElement>)}>B</Button>
                            <Button variant={el.italic ? "default" : "outline"} size="sm" className="flex-1 h-7 text-xs italic"
                                onClick={() => update({ italic: !el.italic } as Partial<TextElement>)}>I</Button>
                        </div>
                    </>
                );
            })()}

            {/* QR */}
            {element.type === "qr" && (() => {
                const el = element as QrElement;
                return (
                    <>
                        <div className="grid grid-cols-2 gap-1.5">
                            <div>
                                <Label className="text-[10px]">กว้าง (px)</Label>
                                <Input type="number" className="h-7 text-xs" value={el.width}
                                    onChange={e => update({ width: Number(e.target.value) } as Partial<QrElement>)} />
                            </div>
                            <div>
                                <Label className="text-[10px]">สูง (px)</Label>
                                <Input type="number" className="h-7 text-xs" value={el.height}
                                    onChange={e => update({ height: Number(e.target.value) } as Partial<QrElement>)} />
                            </div>
                        </div>
                        <div>
                            <Label className="text-[10px]">ค่าตัวแปร QR</Label>
                            <Select value={el.value} onValueChange={v => update({ value: v } as Partial<QrElement>)}>
                                <SelectTrigger className="h-7 text-xs">
                                    <span className="truncate">{DYNAMIC_VARIABLES.find(v => v.value === el.value)?.label ?? el.value}</span>
                                </SelectTrigger>
                                <SelectContent>
                                    {DYNAMIC_VARIABLES.map(v => (
                                        <SelectItem key={v.value} value={v.value} className="text-xs">{v.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </>
                );
            })()}

            {/* Rect */}
            {element.type === "rect" && (() => {
                const el = element as RectElement;
                return (
                    <>
                        <div className="grid grid-cols-2 gap-1.5">
                            <div>
                                <Label className="text-[10px]">กว้าง</Label>
                                <Input type="number" className="h-7 text-xs" value={el.width}
                                    onChange={e => update({ width: Number(e.target.value) } as Partial<RectElement>)} />
                            </div>
                            <div>
                                <Label className="text-[10px]">สูง</Label>
                                <Input type="number" className="h-7 text-xs" value={el.height}
                                    onChange={e => update({ height: Number(e.target.value) } as Partial<RectElement>)} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            <div>
                                <Label className="text-[10px]">สีพื้น</Label>
                                <input type="color" className="h-7 w-full rounded border border-input cursor-pointer" value={el.fill === "transparent" ? "#ffffff" : el.fill}
                                    onChange={e => update({ fill: e.target.value } as Partial<RectElement>)} />
                            </div>
                            <div>
                                <Label className="text-[10px]">สีขอบ</Label>
                                <input type="color" className="h-7 w-full rounded border border-input cursor-pointer" value={el.stroke}
                                    onChange={e => update({ stroke: e.target.value } as Partial<RectElement>)} />
                            </div>
                        </div>
                        <div>
                            <Label className="text-[10px]">ความหนาขอบ</Label>
                            <Input type="number" className="h-7 text-xs" value={el.strokeWidth}
                                onChange={e => update({ strokeWidth: Number(e.target.value) } as Partial<RectElement>)} />
                        </div>
                    </>
                );
            })()}

            {/* Line */}
            {element.type === "line" && (() => {
                const el = element as LineElement;
                return (
                    <>
                        <div>
                            <Label className="text-[10px]">สีเส้น</Label>
                            <input type="color" className="h-7 w-full rounded border border-input cursor-pointer" value={el.stroke}
                                onChange={e => update({ stroke: e.target.value } as Partial<LineElement>)} />
                        </div>
                        <div>
                            <Label className="text-[10px]">ความหนา</Label>
                            <Input type="number" className="h-7 text-xs" value={el.strokeWidth}
                                onChange={e => update({ strokeWidth: Number(e.target.value) } as Partial<LineElement>)} />
                        </div>
                    </>
                );
            })()}

            {/* Image */}
            {element.type === "image" && (() => {
                const el = element as ImageElement;
                return (
                    <>
                        <div className="grid grid-cols-2 gap-1.5">
                            <div>
                                <Label className="text-[10px]">กว้าง (px)</Label>
                                <Input type="number" className="h-7 text-xs" value={el.width}
                                    onChange={e => update({ width: Number(e.target.value) } as Partial<ImageElement>)} />
                            </div>
                            <div>
                                <Label className="text-[10px]">สูง (px)</Label>
                                <Input type="number" className="h-7 text-xs" value={el.height}
                                    onChange={e => update({ height: Number(e.target.value) } as Partial<ImageElement>)} />
                            </div>
                        </div>
                        <div className="rounded-lg overflow-hidden border border-border bg-muted/40" style={{ maxHeight: 80 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={el.src} alt="preview" className="w-full h-full object-contain" style={{ maxHeight: 80 }} />
                        </div>
                    </>
                );
            })()}

            {/* Keyboard hint */}
            <div className="mt-1 rounded-lg bg-muted/50 p-2 space-y-0.5">
                <p className="text-[10px] text-muted-foreground font-medium">คีย์ลัด</p>
                <p className="text-[10px] text-muted-foreground">↑↓←→ เลื่อน 1px</p>
                <p className="text-[10px] text-muted-foreground">⇧+↑↓←→ เลื่อน 10px</p>
                <p className="text-[10px] text-muted-foreground">Del/⌫ ลบ</p>
                <p className="text-[10px] text-muted-foreground">⌘C / ⌘V คัดลอก/วาง</p>
                <p className="text-[10px] text-muted-foreground">⌘Z / ⌘⇧Z ย้อน/ทำซ้ำ</p>
                <p className="text-[10px] text-muted-foreground">Esc ยกเลิกการเลือก</p>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StickerDesignerPage() {
    const [canvasW, setCanvasW] = useState(80);
    const [canvasH, setCanvasH] = useState(50);
    const [elements, setElements] = useState<StickerElement[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [zoom, setZoom] = useState(2.5);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── History (undo/redo) ──
    const historyRef = useRef<{ past: StickerElement[][], future: StickerElement[][] }>({ past: [], future: [] });
    const elementsRef = useRef(elements);
    useEffect(() => { elementsRef.current = elements; }, [elements]);

    function commit(next: StickerElement[]) {
        const past = historyRef.current.past;
        past.push([...elementsRef.current]);
        if (past.length > MAX_HISTORY) past.shift();
        historyRef.current.future = [];
        setElements(next);
    }

    const undo = useCallback(() => {
        const { past, future } = historyRef.current;
        if (!past.length) return;
        future.push([...elementsRef.current]);
        setElements(past.pop()!);
    }, []);

    const redo = useCallback(() => {
        const { past, future } = historyRef.current;
        if (!future.length) return;
        past.push([...elementsRef.current]);
        setElements(future.pop()!);
    }, []);

    const canUndo = historyRef.current.past.length > 0;
    const canRedo = historyRef.current.future.length > 0;

    // ── Clipboard ──
    const clipboardRef = useRef<StickerElement | null>(null);

    const copy = useCallback(() => {
        const el = elementsRef.current.find(e => e.id === selectedId);
        if (el) clipboardRef.current = { ...el };
    }, [selectedId]);

    const paste = useCallback(() => {
        if (!clipboardRef.current) return;
        const newEl = { ...clipboardRef.current, id: genId(), x: clipboardRef.current.x + 12, y: clipboardRef.current.y + 12 };
        commit([...elementsRef.current, newEl]);
        setSelectedId(newEl.id);
    }, []);

    // ── Image from file / clipboard ──
    const handleImageFile = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const src = ev.target?.result as string;
            const img = new window.Image();
            img.onload = () => {
                const maxW = pxWRef.current;
                const ratio = img.naturalHeight / img.naturalWidth;
                const w = Math.min(img.naturalWidth, maxW);
                const h = Math.round(w * ratio);
                const id = genId();
                const el: StickerElement = {
                    id, type: "image",
                    x: Math.round((pxWRef.current - w) / 2),
                    y: Math.round((pxHRef.current - h) / 2),
                    width: w, height: h, src,
                };
                commit([...elementsRef.current, el]);
                setSelectedId(id);
            };
            img.src = src;
        };
        reader.readAsDataURL(file);
    }, []);

    // Keep stable refs for image sizing
    const pxWRef = useRef(0);
    const pxHRef = useRef(0);

    // Paste image from clipboard
    useEffect(() => {
        const handler = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of Array.from(items)) {
                if (item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) { handleImageFile(file); e.preventDefault(); }
                    return;
                }
            }
        };
        window.addEventListener("paste", handler);
        return () => window.removeEventListener("paste", handler);
    }, [handleImageFile]);

    // ── Load from localStorage ──
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const tmpl: StickerTemplate = JSON.parse(raw);
                setCanvasW(tmpl.width);
                setCanvasH(tmpl.height);
                setElements(tmpl.elements);
            }
        } catch { /* ignore */ }
    }, []);

    // ── Keyboard shortcuts ──
    const selectedIdRef = useRef(selectedId);
    useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
            const mod = e.metaKey || e.ctrlKey;
            const sid = selectedIdRef.current;

            // Undo / Redo
            if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
            if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }

            // Copy / Paste
            if (mod && e.key === "c") { copy(); return; }
            if (mod && e.key === "v") { paste(); return; }
            if (mod && e.key === "d") { e.preventDefault(); copy(); paste(); return; }

            // Zoom
            if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); setZoom(z => Math.min(z + 0.25, 6)); return; }
            if (mod && e.key === "-") { e.preventDefault(); setZoom(z => Math.max(z - 0.25, 0.5)); return; }

            if (inInput) return;

            // Delete
            if ((e.key === "Delete" || e.key === "Backspace") && sid) {
                commit(elementsRef.current.filter(el => el.id !== sid));
                setSelectedId(null);
                return;
            }

            // Escape
            if (e.key === "Escape") { setSelectedId(null); return; }

            // Arrow nudge
            if (sid && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1;
                const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
                const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
                commit(elementsRef.current.map(el =>
                    el.id === sid ? { ...el, x: el.x + dx, y: el.y + dy } as StickerElement : el
                ));
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [undo, redo, copy, paste]);

    // ── Canvas dimensions ──
    const pxW = Math.round(canvasW * MM_TO_PX);
    const pxH = Math.round(canvasH * MM_TO_PX);
    pxWRef.current = pxW;
    pxHRef.current = pxH;

    // ── Add element ──
    const addElement = useCallback((type: ElementType) => {
        const cx = pxW / 2;
        const cy = pxH / 2;
        const id = genId();
        let el: StickerElement;
        switch (type) {
            case "text":
                el = { id, type: "text", x: cx - 50, y: cy - 10, text: "ข้อความ", fontSize: 14, fill: "#000000", bold: false, italic: false };
                break;
            case "dynamic":
                el = { id, type: "dynamic", x: cx - 60, y: cy - 10, text: "{{orderCode}}", fontSize: 14, fill: "#000000", bold: false, italic: false };
                break;
            case "qr":
                el = { id, type: "qr", x: cx - 40, y: cy - 40, width: 80, height: 80, value: "{{orderCode}}" };
                break;
            case "rect":
                el = { id, type: "rect", x: cx - 40, y: cy - 25, width: 80, height: 50, fill: "transparent", stroke: "#000000", strokeWidth: 1 };
                break;
            case "line":
                el = { id, type: "line", x: cx - 50, y: cy, points: [0, 0, 100, 0], stroke: "#000000", strokeWidth: 1 };
                break;
            default:
                return; // "image" is added via file picker
        }
        commit([...elementsRef.current, el]);
        setSelectedId(id);
    }, [pxW, pxH]);

    const handleSave = () => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: canvasW, height: canvasH, elements }));
            setToast({ msg: "บันทึกสำเร็จ!", ok: true });
        } catch {
            setToast({ msg: "บันทึกไม่สำเร็จ", ok: false });
        }
        setTimeout(() => setToast(null), 2500);
    };

    const selectedElement = elements.find(e => e.id === selectedId) ?? null;

    const handleElementChange = (updated: StickerElement) => {
        commit(elements.map(e => e.id === updated.id ? updated : e));
    };

    return (
        <>
        {/* fill the remaining page height (layout already has padding) */}
        <div className="flex flex-col gap-3" style={{ height: "calc(100vh - 7rem)" }}>
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-violet-500/10 rounded-lg text-violet-500">
                        <Tag className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-foreground">ออกแบบสติ๊กเกอร์</h1>
                        <p className="text-xs text-muted-foreground">ออกแบบ template สติ๊กเกอร์ QR สำหรับพิมพ์ติดออเดอร์</p>
                    </div>
                </div>

                {/* Action bar */}
                <div className="flex items-center gap-2">
                    {/* Undo / Redo */}
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">
                        <Undo2 className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)">
                        <Redo2 className="h-4 w-4" />
                    </Button>

                    <div className="w-px h-6 bg-border mx-1" />

                    {/* Copy / Paste */}
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={copy} disabled={!selectedId} title="Copy (⌘C)">
                        <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={paste} disabled={!clipboardRef.current} title="Paste (⌘V)">
                        <Clipboard className="h-4 w-4" />
                    </Button>

                    <div className="w-px h-6 bg-border mx-1" />

                    {/* Zoom */}
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))} title="Zoom Out (⌘-)">
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-xs font-mono w-10 text-center text-muted-foreground">{Math.round(zoom * 100)}%</span>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(z + 0.25, 6))} title="Zoom In (⌘+)">
                        <ZoomIn className="h-4 w-4" />
                    </Button>

                    <div className="w-px h-6 bg-border mx-1" />

                    <Button variant="outline" onClick={() => setShowPreview(true)} className="gap-2 h-8">
                        <Eye className="h-4 w-4" />
                        ตัวอย่าง
                    </Button>
                    <Button onClick={handleSave} className="gap-2 h-8">
                        <Save className="h-4 w-4" />
                        บันทึก
                    </Button>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium text-white animate-in fade-in slide-in-from-top-2 ${toast.ok ? "bg-emerald-500" : "bg-red-500"}`}>
                    {toast.msg}
                </div>
            )}

            {/* Main 3-column layout */}
            <div className="flex gap-3 flex-1 min-h-0">

                {/* Left Toolbar */}
                <div className="w-40 shrink-0 flex flex-col gap-2 bg-card border rounded-xl p-3 overflow-y-auto">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">ขนาดสติ๊กเกอร์</p>
                    <div>
                        <Label className="text-[10px]">กว้าง (mm)</Label>
                        <Input type="number" className="h-7 text-xs" value={canvasW}
                            onChange={e => setCanvasW(Number(e.target.value))} min={10} max={300} />
                    </div>
                    <div>
                        <Label className="text-[10px]">สูง (mm)</Label>
                        <Input type="number" className="h-7 text-xs" value={canvasH}
                            onChange={e => setCanvasH(Number(e.target.value))} min={10} max={300} />
                    </div>

                    <hr className="border-border" />
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">เพิ่ม Element</p>

                    {[
                        { type: "text" as ElementType,    icon: <Type className="h-3.5 w-3.5" />,     label: "ข้อความ" },
                        { type: "dynamic" as ElementType, icon: <Variable className="h-3.5 w-3.5" />, label: "ตัวแปร" },
                        { type: "qr" as ElementType,      icon: <QrCode className="h-3.5 w-3.5" />,   label: "QR Code" },
                        { type: "rect" as ElementType,    icon: <Square className="h-3.5 w-3.5" />,   label: "สี่เหลี่ยม" },
                        { type: "line" as ElementType,    icon: <Minus className="h-3.5 w-3.5" />,    label: "เส้น" },
                    ].map(({ type, icon, label }) => (
                        <Button key={type} variant="outline" size="sm"
                            className="justify-start gap-2 h-8 text-xs w-full"
                            onClick={() => addElement(type)}>
                            {icon} {label}
                        </Button>
                    ))}
                    {/* Image upload */}
                    <Button variant="outline" size="sm"
                        className="justify-start gap-2 h-8 text-xs w-full"
                        onClick={() => fileInputRef.current?.click()}>
                        <ImageIcon className="h-3.5 w-3.5" /> รูปภาพ
                    </Button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleImageFile(file);
                            e.target.value = "";
                        }}
                    />

                    <hr className="border-border" />
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                        {pxW} × {pxH} px<br />
                        ({canvasW} × {canvasH} mm)
                    </p>
                </div>

                {/* Canvas Area */}
                <div className="flex-1 bg-muted/40 rounded-xl border overflow-auto flex items-center justify-center p-8">
                    <StickerCanvas
                        width={pxW}
                        height={pxH}
                        zoom={zoom}
                        elements={elements}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        onChange={handleElementChange}
                        onElementsChange={next => commit(next)}
                    />
                </div>

                {/* Right Properties Panel */}
                <div className="w-48 shrink-0 bg-card border rounded-xl overflow-y-auto">
                    <div className="p-3 border-b">
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">คุณสมบัติ</p>
                    </div>
                    <PropsPanel
                        element={selectedElement}
                        onChange={handleElementChange}
                        onDelete={() => {
                            if (selectedId) {
                                commit(elements.filter(e => e.id !== selectedId));
                                setSelectedId(null);
                            }
                        }}
                    />
                </div>
            </div>
        </div>

        {showPreview && (
            <StickerPreviewModal
                template={{ width: canvasW, height: canvasH, elements }}
                onClose={() => setShowPreview(false)}
            />
        )}
        </>
    );
}
