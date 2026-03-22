"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import {
    Trash2, Type, Variable, QrCode, Square, Minus, Save, Tag,
    Undo2, Redo2, ZoomIn, ZoomOut, Copy, Clipboard, ImageIcon, Eye,
    Eraser, Loader2, Crop, Layers2, Ungroup, CopyPlus,
    AlignStartVertical, AlignCenterVertical, AlignEndVertical,
    AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
    AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
    ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, ArrowLeft,
    Circle, Triangle, Star, Hexagon, Diamond, Pentagon, ArrowRight,
    ChevronRight,
} from "lucide-react";
import StickerPreviewModal from "../StickerPreviewModal";
import CropModal from "../CropModal";
import type { CropArea } from "../CropModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    getStickerTemplate,
    updateStickerTemplate,
} from "@/lib/api/sticker-templates";

const StickerCanvas = dynamic(() => import("../StickerCanvas"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

export type { ElementType, TextElement, QrElement, RectElement, LineElement, ImageElement, GroupElement, ShapeElement, StickerElement, StickerTemplate } from "../types";
import type { ElementType, TextElement, QrElement, RectElement, LineElement, ImageElement, GroupElement, ShapeElement, StickerElement, StickerTemplate } from "../types";
import type { ShapeKind } from "../types";
import { FONTS, FONT_CATEGORIES, buildGoogleFontsUrl, cssFontFamily } from "../fonts";

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

// ─── Font Picker ──────────────────────────────────────────────────────────────

function FontPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open) return;
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [open]);

    const current = FONTS.find(f => f.value === value) ?? FONTS[0];
    const grouped = (Object.keys(FONT_CATEGORIES) as Array<keyof typeof FONT_CATEGORIES>).map(cat => ({
        cat, label: FONT_CATEGORIES[cat], fonts: FONTS.filter(f => f.category === cat),
    }));

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                className="w-full h-7 text-xs border border-input rounded-md px-2 flex items-center justify-between bg-background hover:bg-accent/50 transition-colors"
                style={{ fontFamily: cssFontFamily(current.value) }}
                onClick={() => setOpen(v => !v)}
            >
                <span className="truncate">{current.label}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 bg-card border shadow-xl rounded-xl z-[9999] w-52 max-h-64 overflow-y-auto py-1">
                    {grouped.map(({ cat, label, fonts }) => (
                        <React.Fragment key={cat}>
                            <p className="text-[9px] font-semibold uppercase text-muted-foreground tracking-wider px-3 pt-2 pb-0.5">{label}</p>
                            {fonts.map(f => (
                                <button
                                    key={f.value}
                                    type="button"
                                    className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-accent/70 transition-colors ${f.value === value ? "text-primary font-semibold bg-accent/40" : ""}`}
                                    style={{ fontFamily: cssFontFamily(f.value) }}
                                    onClick={() => { onChange(f.value); setOpen(false); }}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </React.Fragment>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

type ZOrderDir = "front" | "forward" | "backward" | "back";
type AlignDir   = "left" | "centerH" | "right" | "top" | "centerV" | "bottom";

function ContextMenu({ pos, el, multiSelected, hasClipboard, onClose, onCopy, onPaste, onDuplicate, onDelete, onZOrder, onGroup, onUngroup, onCrop, onAlign }: {
    pos: { x: number; y: number };
    el: StickerElement | null;
    multiSelected: string[];
    hasClipboard: boolean;
    onClose: () => void;
    onCopy: () => void;
    onPaste: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onZOrder: (d: ZOrderDir) => void;
    onGroup: () => void;
    onUngroup: () => void;
    onCrop: () => void;
    onAlign: (d: AlignDir) => void;
}) {
    const menuRef = React.useRef<HTMLDivElement>(null);
    const [adj, setAdj] = React.useState(pos);

    // Adjust so menu stays within viewport
    React.useEffect(() => {
        if (!menuRef.current) return;
        const { width, height } = menuRef.current.getBoundingClientRect();
        setAdj({
            x: Math.min(pos.x, window.innerWidth  - width  - 8),
            y: Math.min(pos.y, window.innerHeight - height - 8),
        });
    }, [pos.x, pos.y]);

    // Close on outside click
    React.useEffect(() => {
        const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose(); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [onClose]);

    const isGroup  = el?.type === "group";
    const isImage  = el?.type === "image";
    const hasEl    = !!el;
    const canGroup = multiSelected.length >= 2;

    const act = (fn: () => void) => () => { fn(); onClose(); };

    type MenuItem = { icon: React.ReactNode; label: string; shortcut?: string; action: () => void; danger?: boolean };
    const sections: MenuItem[][] = [];

    // Section: Copy / Duplicate / Paste
    const clipSection: MenuItem[] = [];
    if (hasEl) {
        clipSection.push({ icon: <Copy className="h-3.5 w-3.5" />, label: "คัดลอก", shortcut: "⌘C", action: act(onCopy) });
        clipSection.push({ icon: <CopyPlus className="h-3.5 w-3.5" />, label: "ทำสำเนา", shortcut: "⌘D", action: act(onDuplicate) });
    }
    if (hasClipboard) clipSection.push({ icon: <Clipboard className="h-3.5 w-3.5" />, label: "วาง", shortcut: "⌘V", action: act(onPaste) });
    if (clipSection.length) sections.push(clipSection);

    // Section: Z-order (single element only)
    if (hasEl && !canGroup) {
        sections.push([
            { icon: <ChevronsUp className="h-3.5 w-3.5" />, label: "ขึ้นสุด (Bring to Front)", action: act(() => onZOrder("front")) },
            { icon: <ChevronUp className="h-3.5 w-3.5" />, label: "ขึ้นหนึ่งชั้น", shortcut: "⌘]", action: act(() => onZOrder("forward")) },
            { icon: <ChevronDown className="h-3.5 w-3.5" />, label: "ลงหนึ่งชั้น", shortcut: "⌘[", action: act(() => onZOrder("backward")) },
            { icon: <ChevronsDown className="h-3.5 w-3.5" />, label: "ลงสุด (Send to Back)", action: act(() => onZOrder("back")) },
        ]);
    }

    // Section: Alignment (multi-select)
    if (canGroup) {
        sections.push([
            { icon: <AlignStartVertical className="h-3.5 w-3.5" />, label: "ชิดซ้าย",   action: act(() => onAlign("left")) },
            { icon: <AlignCenterVertical className="h-3.5 w-3.5" />, label: "กึ่งกลางแนวนอน", action: act(() => onAlign("centerH")) },
            { icon: <AlignEndVertical className="h-3.5 w-3.5" />, label: "ชิดขวา",   action: act(() => onAlign("right")) },
            { icon: <AlignStartHorizontal className="h-3.5 w-3.5" />, label: "ชิดบน",     action: act(() => onAlign("top")) },
            { icon: <AlignCenterHorizontal className="h-3.5 w-3.5" />, label: "กึ่งกลางแนวตั้ง", action: act(() => onAlign("centerV")) },
            { icon: <AlignEndHorizontal className="h-3.5 w-3.5" />, label: "ชิดล่าง",   action: act(() => onAlign("bottom")) },
        ]);
    }

    // Section: Group / Ungroup
    const groupSection: MenuItem[] = [];
    if (canGroup)  groupSection.push({ icon: <Layers2 className="h-3.5 w-3.5" />, label: "จัดกลุ่ม", shortcut: "⌘G", action: act(onGroup) });
    if (isGroup)   groupSection.push({ icon: <Ungroup className="h-3.5 w-3.5" />, label: "ยกเลิกกลุ่ม", shortcut: "⌘⇧G", action: act(onUngroup) });
    if (groupSection.length) sections.push(groupSection);

    // Section: Image tools
    if (isImage) {
        sections.push([
            { icon: <Crop className="h-3.5 w-3.5" />, label: "ตัดรูป (Crop)", action: act(onCrop) },
            { icon: <Eraser className="h-3.5 w-3.5" />, label: "ลบพื้นหลัง", action: act(() => {}) },
        ]);
    }

    // Section: Delete
    if (hasEl) {
        sections.push([{ icon: <Trash2 className="h-3.5 w-3.5" />, label: "ลบ", shortcut: "⌫", action: act(onDelete), danger: true }]);
    }

    if (sections.length === 0) return null;

    return (
        <div
            ref={menuRef}
            style={{ position: "fixed", left: adj.x, top: adj.y, zIndex: 9999 }}
            className="bg-card border shadow-2xl rounded-xl py-1.5 min-w-[220px] text-sm select-none"
            onContextMenu={e => e.preventDefault()}
        >
            {sections.map((items, si) => (
                <React.Fragment key={si}>
                    {si > 0 && <div className="my-1 border-t border-border mx-2" />}
                    {items.map((item, i) => (
                        <button
                            key={i}
                            onClick={item.action}
                            className={`w-full flex items-center gap-2.5 px-3 py-[7px] hover:bg-accent/70 transition-colors text-left ${item.danger ? "text-destructive hover:bg-destructive/10" : ""}`}
                        >
                            <span className="w-4 h-4 flex items-center justify-center shrink-0 opacity-60">{item.icon}</span>
                            <span className="flex-1 text-[13px]">{item.label}</span>
                            {item.shortcut && <span className="text-[11px] text-muted-foreground font-mono shrink-0">{item.shortcut}</span>}
                        </button>
                    ))}
                </React.Fragment>
            ))}
        </div>
    );
}

// ─── Alignment Panel (shown when 2+ elements are multi-selected) ──────────────

function AlignPanel({ count, onAlign, onDistribute, onGroup }: {
    count: number;
    onAlign: (dir: "left" | "centerH" | "right" | "top" | "centerV" | "bottom") => void;
    onDistribute: (axis: "h" | "v") => void;
    onGroup: () => void;
}) {
    return (
        <div className="p-3 flex flex-col gap-3">
            <p className="text-[11px] text-muted-foreground">{count} ชิ้นที่เลือก · ⇧+คลิกเพื่อเพิ่ม</p>

            <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider mb-1.5">จัดแนวนอน</p>
                <div className="grid grid-cols-3 gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-full" title="ชิดซ้าย" onClick={() => onAlign("left")}>
                        <AlignStartVertical className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-full" title="กึ่งกลาง" onClick={() => onAlign("centerH")}>
                        <AlignCenterVertical className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-full" title="ชิดขวา" onClick={() => onAlign("right")}>
                        <AlignEndVertical className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider mb-1.5">จัดแนวตั้ง</p>
                <div className="grid grid-cols-3 gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-full" title="ชิดบน" onClick={() => onAlign("top")}>
                        <AlignStartHorizontal className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-full" title="กึ่งกลาง" onClick={() => onAlign("centerV")}>
                        <AlignCenterHorizontal className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-full" title="ชิดล่าง" onClick={() => onAlign("bottom")}>
                        <AlignEndHorizontal className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {count >= 3 && (
                <div>
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider mb-1.5">กระจายระยะ</p>
                    <div className="grid grid-cols-2 gap-1">
                        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => onDistribute("h")}>
                            <AlignHorizontalDistributeCenter className="h-3.5 w-3.5" /> แนวนอน
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => onDistribute("v")}>
                            <AlignVerticalDistributeCenter className="h-3.5 w-3.5" /> แนวตั้ง
                        </Button>
                    </div>
                </div>
            )}

            <Button size="sm" className="gap-1.5 h-8 bg-violet-600 hover:bg-violet-700 text-white" onClick={onGroup}>
                <Layers2 className="h-3.5 w-3.5" /> จัดกลุ่ม (⌘G)
            </Button>
        </div>
    );
}

// ─── Properties Panel ─────────────────────────────────────────────────────────

function PropsPanel({ element, onChange, onDelete, onCrop, onUngroup, onZOrder }: {
    element: StickerElement | null;
    onChange: (u: StickerElement) => void;
    onDelete: () => void;
    onCrop?: () => void;
    onUngroup?: () => void;
    onZOrder?: (dir: "front" | "forward" | "backward" | "back") => void;
}) {
    const [removingBg, setRemovingBg] = useState(false);

    const handleRemoveBg = async () => {
        if (element?.type !== "image") return;
        setRemovingBg(true);
        try {
            const { removeBackground } = await import("@imgly/background-removal");
            const blob = await removeBackground(element.src);
            const reader = new FileReader();
            reader.onload = (ev) => {
                const newSrc = ev.target?.result as string;
                onChange({ ...element, src: newSrc } as StickerElement);
            };
            reader.readAsDataURL(blob);
        } catch (err) {
            console.error("Remove background failed:", err);
        } finally {
            setRemovingBg(false);
        }
    };

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
        element.type === "rect" ? "สี่เหลี่ยม" :
        element.type === "shape" ? "รูปทรง" :
        element.type === "group" ? "กลุ่ม" : "เส้น";

    // ── Group shortcut ──────────────────────────────────────────────────────────
    if (element.type === "group") {
        const grp = element as GroupElement;
        return (
            <div className="p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
                        <Layers2 className="h-3.5 w-3.5" /> กลุ่ม ({grp.children.length} ชิ้น)
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={onDelete}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
                <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5" onClick={onUngroup}>
                    <Ungroup className="h-3.5 w-3.5" /> ยกเลิกกลุ่ม
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">⌘⇧G ยกเลิกกลุ่ม</p>
            </div>
        );
    }

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
                        <div>
                            <Label className="text-[10px]">ฟอนต์</Label>
                            <FontPicker value={el.fontFamily ?? "Prompt"} onChange={v => update({ fontFamily: v } as Partial<TextElement>)} />
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
                        <div>
                            <Label className="text-[10px]">ข้อความในกล่อง (ดับเบิ้ลคลิกบน Canvas)</Label>
                            <Input className="h-7 text-xs" value={el.label ?? ""}
                                onChange={e => update({ label: e.target.value } as Partial<RectElement>)} />
                        </div>
                        {el.label && (
                            <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                    <Label className="text-[10px]">สีข้อความ</Label>
                                    <input type="color" className="h-7 w-full rounded border border-input cursor-pointer" value={el.labelColor ?? "#000000"}
                                        onChange={e => update({ labelColor: e.target.value } as Partial<RectElement>)} />
                                </div>
                                <div>
                                    <Label className="text-[10px]">ขนาดตัวอักษร</Label>
                                    <Input type="number" className="h-7 text-xs" value={el.labelFontSize ?? 12}
                                        onChange={e => update({ labelFontSize: Number(e.target.value) } as Partial<RectElement>)} />
                                </div>
                            </div>
                        )}
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
                        <div className="rounded-lg overflow-hidden border border-border bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2216%22%20height%3D%2216%22%3E%3Crect%20width%3D%228%22%20height%3D%228%22%20fill%3D%22%23e5e7eb%22/%3E%3Crect%20x%3D%228%22%20y%3D%228%22%20width%3D%228%22%20height%3D%228%22%20fill%3D%22%23e5e7eb%22/%3E%3C/svg%3E')]" style={{ maxHeight: 80 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={el.src} alt="preview" className="w-full h-full object-contain" style={{ maxHeight: 80 }} />
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-8 text-xs gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-800"
                            onClick={handleRemoveBg}
                            disabled={removingBg}
                        >
                            {removingBg
                                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังลบพื้นหลัง...</>
                                : <><Eraser className="h-3.5 w-3.5" /> ลบพื้นหลัง</>
                            }
                        </Button>
                        {removingBg && (
                            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                                AI กำลังประมวลผล<br />อาจใช้เวลา 5–15 วินาที
                            </p>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-8 text-xs gap-1.5"
                            onClick={onCrop}
                        >
                            <Crop className="h-3.5 w-3.5" /> ตัดรูป (Crop)
                        </Button>
                    </>
                );
            })()}

            {/* Shape */}
            {element.type === "shape" && (() => {
                const el = element as ShapeElement;
                return (
                    <>
                        <div className="grid grid-cols-2 gap-1.5">
                            <div>
                                <Label className="text-[10px]">กว้าง</Label>
                                <Input type="number" className="h-7 text-xs" value={el.width}
                                    onChange={e => update({ width: Number(e.target.value) } as Partial<ShapeElement>)} />
                            </div>
                            <div>
                                <Label className="text-[10px]">สูง</Label>
                                <Input type="number" className="h-7 text-xs" value={el.height}
                                    onChange={e => update({ height: Number(e.target.value) } as Partial<ShapeElement>)} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            <div>
                                <Label className="text-[10px]">สีพื้น</Label>
                                <input type="color" className="h-7 w-full rounded border border-input cursor-pointer" value={el.fill === "transparent" ? "#ffffff" : el.fill}
                                    onChange={e => update({ fill: e.target.value } as Partial<ShapeElement>)} />
                            </div>
                            <div>
                                <Label className="text-[10px]">สีขอบ</Label>
                                <input type="color" className="h-7 w-full rounded border border-input cursor-pointer" value={el.stroke}
                                    onChange={e => update({ stroke: e.target.value } as Partial<ShapeElement>)} />
                            </div>
                        </div>
                        <div>
                            <Label className="text-[10px]">ความหนาขอบ</Label>
                            <Input type="number" className="h-7 text-xs" value={el.strokeWidth}
                                onChange={e => update({ strokeWidth: Number(e.target.value) } as Partial<ShapeElement>)} />
                        </div>
                        <div>
                            <Label className="text-[10px]">ข้อความในรูปทรง (ดับเบิ้ลคลิกบน Canvas)</Label>
                            <Input className="h-7 text-xs" value={el.label ?? ""}
                                onChange={e => update({ label: e.target.value } as Partial<ShapeElement>)} />
                        </div>
                        {el.label && (
                            <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                    <Label className="text-[10px]">สีข้อความ</Label>
                                    <input type="color" className="h-7 w-full rounded border border-input cursor-pointer" value={el.labelColor ?? "#000000"}
                                        onChange={e => update({ labelColor: e.target.value } as Partial<ShapeElement>)} />
                                </div>
                                <div>
                                    <Label className="text-[10px]">ขนาดตัวอักษร</Label>
                                    <Input type="number" className="h-7 text-xs" value={el.labelFontSize ?? 12}
                                        onChange={e => update({ labelFontSize: Number(e.target.value) } as Partial<ShapeElement>)} />
                                </div>
                            </div>
                        )}
                    </>
                );
            })()}

            {/* Z-order */}
            {onZOrder && (
                <div>
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider mb-1.5">ลำดับชั้น</p>
                    <div className="grid grid-cols-4 gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-full" title="ขึ้นสุด" onClick={() => onZOrder("front")}><ChevronsUp className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-full" title="ขึ้นหนึ่งชั้น" onClick={() => onZOrder("forward")}><ChevronUp className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-full" title="ลงหนึ่งชั้น" onClick={() => onZOrder("backward")}><ChevronDown className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-full" title="ลงสุด" onClick={() => onZOrder("back")}><ChevronsDown className="h-3.5 w-3.5" /></Button>
                    </div>
                    <div className="grid grid-cols-4 gap-1 mt-0.5">
                        <p className="text-[9px] text-muted-foreground text-center col-span-2">ขึ้นสุด · ขึ้น</p>
                        <p className="text-[9px] text-muted-foreground text-center col-span-2">ลง · ลงสุด</p>
                    </div>
                </div>
            )}

            {/* Keyboard hint */}
            <div className="mt-1 rounded-lg bg-muted/50 p-2 space-y-0.5">
                <p className="text-[10px] text-muted-foreground font-medium">คีย์ลัด</p>
                <p className="text-[10px] text-muted-foreground">↑↓←→ เลื่อน 1px</p>
                <p className="text-[10px] text-muted-foreground">⇧+↑↓←→ เลื่อน 10px</p>
                <p className="text-[10px] text-muted-foreground">Del/⌫ ลบ</p>
                <p className="text-[10px] text-muted-foreground">⌘C / ⌘V คัดลอก/วาง</p>
                <p className="text-[10px] text-muted-foreground">⌘Z / ⌘⇧Z ย้อน/ทำซ้ำ</p>
                <p className="text-[10px] text-muted-foreground">⇧+คลิก เลือกหลายชิ้น</p>
                <p className="text-[10px] text-muted-foreground">⌘G จัดกลุ่ม / ⌘⇧G ยกเลิกกลุ่ม</p>
                <p className="text-[10px] text-muted-foreground">Esc ยกเลิกการเลือก</p>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StickerDesignerPage() {
    const { id } = useParams<{ id: string }>();
    const router  = useRouter();

    const [canvasW, setCanvasW] = useState(80);
    const [canvasH, setCanvasH] = useState(50);
    const [elements, setElements] = useState<StickerElement[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [multiSelected, setMultiSelected] = useState<string[]>([]);
    const [cropModal, setCropModal] = useState<{ id: string; src: string; current?: CropArea } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ id: string | null; x: number; y: number } | null>(null);
    const [zoom, setZoom] = useState(2.5);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [shapesOpen, setShapesOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── API state ──
    const [templateName, setTemplateName] = useState("");
    const [saving,       setSaving]       = useState(false);
    const [loadError,    setLoadError]    = useState(false);

    // ── Load Google Fonts ──
    useEffect(() => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = buildGoogleFontsUrl();
        document.head.appendChild(link);
        return () => { document.head.removeChild(link); };
    }, []);

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

    // ── Select (with optional shift for multi-select) ──────────────────────────
    const selectedIdRef = useRef(selectedId);
    useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
    const multiSelectedRef = useRef(multiSelected);
    useEffect(() => { multiSelectedRef.current = multiSelected; }, [multiSelected]);

    const handleSelect = useCallback((id: string | null, shift?: boolean) => {
        if (shift && id) {
            setMultiSelected(prev => {
                const withCurrent = selectedIdRef.current && !prev.includes(selectedIdRef.current)
                    ? [...prev, selectedIdRef.current] : prev;
                return withCurrent.includes(id) ? withCurrent.filter(x => x !== id) : [...withCurrent, id];
            });
            setSelectedId(null);
        } else {
            setSelectedId(id);
            setMultiSelected([]);
        }
    }, []);

    // ── Group / Ungroup ─────────────────────────────────────────────────────────
    const handleGroup = useCallback(() => {
        const ids = multiSelectedRef.current.length >= 2 ? multiSelectedRef.current : [];
        if (ids.length < 2) return;
        const sel = elementsRef.current.filter(e => ids.includes(e.id));
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        sel.forEach(el => {
            minX = Math.min(minX, el.x);
            minY = Math.min(minY, el.y);
            maxX = Math.max(maxX, el.x + ('width'  in el ? (el as { width: number }).width   : 0));
            maxY = Math.max(maxY, el.y + ('height' in el ? (el as { height: number }).height : 0));
        });
        const gx = minX, gy = minY;
        const group: GroupElement = {
            id: genId(), type: "group",
            x: gx, y: gy,
            width: maxX - minX, height: maxY - minY,
            children: sel.map(el => ({ ...el, x: el.x - gx, y: el.y - gy })) as GroupElement["children"],
        };
        commit(elementsRef.current.filter(e => !ids.includes(e.id)).concat([group]));
        setSelectedId(group.id);
        setMultiSelected([]);
    }, []);

    const handleUngroup = useCallback(() => {
        const group = elementsRef.current.find(e => e.id === selectedIdRef.current) as GroupElement | undefined;
        if (!group || group.type !== "group") return;
        const ungrouped = group.children.map(child => ({
            ...child, id: genId(), x: group.x + child.x, y: group.y + child.y,
        }));
        commit(elementsRef.current.filter(e => e.id !== group.id).concat(ungrouped));
        setSelectedId(null);
        setMultiSelected(ungrouped.map(e => e.id));
    }, []);

    // ── Align / Distribute ──────────────────────────────────────────────────────
    const getElBounds = (el: StickerElement): { x: number; y: number; w: number; h: number } => {
        if (el.type === "text" || el.type === "dynamic") {
            return { x: el.x, y: el.y, w: Math.max(el.text.length * el.fontSize * 0.58, 20), h: el.fontSize * 1.4 };
        }
        if (el.type === "line") {
            const xs = el.points.filter((_, i) => i % 2 === 0);
            const ys = el.points.filter((_, i) => i % 2 === 1);
            return { x: el.x + Math.min(...xs), y: el.y + Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) + el.strokeWidth };
        }
        return { x: el.x, y: el.y, w: "width" in el ? (el as { width: number }).width : 40, h: "height" in el ? (el as { height: number }).height : 20 };
    };
    const getW = (el: StickerElement) => getElBounds(el).w;
    const getH = (el: StickerElement) => getElBounds(el).h;

    const handleAlign = useCallback((dir: "left" | "centerH" | "right" | "top" | "centerV" | "bottom") => {
        const ids = multiSelectedRef.current;
        if (ids.length < 2) return;
        const sel = elementsRef.current.filter(e => ids.includes(e.id));
        const minX    = Math.min(...sel.map(e => e.x));
        const maxX    = Math.max(...sel.map(e => e.x + getW(e)));
        const minY    = Math.min(...sel.map(e => e.y));
        const maxY    = Math.max(...sel.map(e => e.y + getH(e)));
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        commit(elementsRef.current.map(el => {
            if (!ids.includes(el.id)) return el;
            const w = getW(el), h = getH(el);
            switch (dir) {
                case "left":    return { ...el, x: minX };
                case "centerH": return { ...el, x: centerX - w / 2 };
                case "right":   return { ...el, x: maxX - w };
                case "top":     return { ...el, y: minY };
                case "centerV": return { ...el, y: centerY - h / 2 };
                case "bottom":  return { ...el, y: maxY - h };
                default: return el;
            }
        }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleDistribute = useCallback((axis: "h" | "v") => {
        const ids = multiSelectedRef.current;
        if (ids.length < 3) return;
        const sel = elementsRef.current.filter(e => ids.includes(e.id));
        if (axis === "h") {
            const sorted = [...sel].sort((a, b) => a.x - b.x);
            const totalW = sorted.reduce((s, e) => s + getW(e), 0);
            const span   = (sorted[sorted.length - 1].x + getW(sorted[sorted.length - 1])) - sorted[0].x;
            const gap    = (span - totalW) / (sorted.length - 1);
            const xMap: Record<string, number> = {};
            let cursor = sorted[0].x + getW(sorted[0]);
            xMap[sorted[0].id] = sorted[0].x;
            for (let i = 1; i < sorted.length; i++) {
                xMap[sorted[i].id] = cursor + gap;
                cursor = xMap[sorted[i].id] + getW(sorted[i]);
            }
            commit(elementsRef.current.map(el => ids.includes(el.id) ? { ...el, x: xMap[el.id] } : el));
        } else {
            const sorted = [...sel].sort((a, b) => a.y - b.y);
            const totalH = sorted.reduce((s, e) => s + getH(e), 0);
            const span   = (sorted[sorted.length - 1].y + getH(sorted[sorted.length - 1])) - sorted[0].y;
            const gap    = (span - totalH) / (sorted.length - 1);
            const yMap: Record<string, number> = {};
            let cursor = sorted[0].y + getH(sorted[0]);
            yMap[sorted[0].id] = sorted[0].y;
            for (let i = 1; i < sorted.length; i++) {
                yMap[sorted[i].id] = cursor + gap;
                cursor = yMap[sorted[i].id] + getH(sorted[i]);
            }
            commit(elementsRef.current.map(el => ids.includes(el.id) ? { ...el, y: yMap[el.id] } : el));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Z-order ─────────────────────────────────────────────────────────────────
    const handleZOrder = useCallback((dir: "front" | "forward" | "backward" | "back") => {
        const id = selectedIdRef.current;
        if (!id) return;
        const els = [...elementsRef.current];
        const idx = els.findIndex(e => e.id === id);
        if (idx < 0) return;
        if (dir === "front") {
            const [el] = els.splice(idx, 1);
            commit([...els, el]);
        } else if (dir === "back") {
            const [el] = els.splice(idx, 1);
            commit([el, ...els]);
        } else if (dir === "forward" && idx < els.length - 1) {
            [els[idx], els[idx + 1]] = [els[idx + 1], els[idx]];
            commit(els);
        } else if (dir === "backward" && idx > 0) {
            [els[idx], els[idx - 1]] = [els[idx - 1], els[idx]];
            commit(els);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Context menu ────────────────────────────────────────────────────────────
    const handleContextMenu = useCallback((id: string | null, x: number, y: number) => {
        if (id && id !== selectedIdRef.current && !multiSelectedRef.current.includes(id)) {
            setSelectedId(id);
            setMultiSelected([]);
        }
        setContextMenu({ id, x, y });
    }, []);

    // ── Duplicate ────────────────────────────────────────────────────────────────
    const handleDuplicate = useCallback(() => {
        const el = elementsRef.current.find(e => e.id === selectedIdRef.current);
        if (!el) return;
        const newEl = { ...el, id: genId(), x: el.x + 12, y: el.y + 12 };
        commit([...elementsRef.current, newEl]);
        setSelectedId(newEl.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Crop ───────────────────────────────────────────────────────────────────
    const handleCropConfirm = useCallback((crop: CropArea) => {
        if (!cropModal) return;
        commit(elementsRef.current.map(e =>
            e.id === cropModal.id ? { ...e, imageCrop: crop } as StickerElement : e
        ));
        setCropModal(null);
    }, [cropModal]);

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

    // ── Load by ID ──
    useEffect(() => {
        if (!id) return;
        getStickerTemplate(id).then((tmpl) => {
            if (!tmpl) { setLoadError(true); return; }
            setTemplateName(tmpl.name);
            setCanvasW(tmpl.width);
            setCanvasH(tmpl.height);
            setElements((tmpl.elements ?? []) as StickerElement[]);
        }).catch(() => setLoadError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // ── Keyboard shortcuts ──
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
            const mod = e.metaKey || e.ctrlKey;
            const sid = selectedIdRef.current;

            // Undo / Redo
            if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
            if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }

            // Group / Ungroup
            if (mod && e.key === "g") { e.preventDefault(); e.shiftKey ? handleUngroup() : handleGroup(); return; }

            // Z-order
            if (mod && e.key === "]") { e.preventDefault(); handleZOrder("forward"); return; }
            if (mod && e.key === "[") { e.preventDefault(); handleZOrder("backward"); return; }

            // Copy / Paste / Duplicate
            if (mod && e.key === "c") { copy(); return; }
            if (mod && e.key === "v") { paste(); return; }
            if (mod && e.key === "d") { e.preventDefault(); handleDuplicate(); return; }

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
            if (e.key === "Escape") { setContextMenu(null); setSelectedId(null); return; }

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
    }, [undo, redo, copy, paste, handleGroup, handleUngroup, handleZOrder, handleDuplicate]);

    // ── Canvas dimensions ──
    const pxW = Math.round(canvasW * MM_TO_PX);
    const pxH = Math.round(canvasH * MM_TO_PX);
    pxWRef.current = pxW;
    pxHRef.current = pxH;

    // ── Add element ──
    const addElement = useCallback((type: ElementType, shapeKind?: ShapeKind) => {
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
            case "shape": {
                const kind = shapeKind ?? "circle";
                const isFlat = kind === "arrow";
                el = { id, type: "shape", kind, x: cx - 40, y: isFlat ? cy - 10 : cy - 40, width: 80, height: isFlat ? 20 : 80, fill: "transparent", stroke: "#000000", strokeWidth: 1 };
                break;
            }
            default:
                return; // "image" is added via file picker
        }
        commit([...elementsRef.current, el]);
        setSelectedId(id);
    }, [pxW, pxH]);

    // ── Compress a single base64 image (canvas resize → JPEG quality 0.75) ──
    const compressDataUrl = (src: string, maxPx = 1200): Promise<string> =>
        new Promise((resolve) => {
            // non-data-URL (remote URL) — skip
            if (!src.startsWith("data:")) { resolve(src); return; }
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
                const w = Math.round(img.width  * scale);
                const h = Math.round(img.height * scale);
                const canvas = document.createElement("canvas");
                canvas.width  = w;
                canvas.height = h;
                canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", 0.75));
            };
            img.onerror = () => resolve(src); // fallback: keep original
            img.src = src;
        });

    // ── Recursively compress all image elements ──
    const compressElements = async (els: StickerElement[]): Promise<StickerElement[]> => {
        return Promise.all(els.map(async (el) => {
            if (el.type === "image") {
                return { ...el, src: await compressDataUrl((el as ImageElement).src) };
            }
            if (el.type === "group") {
                const grp = el as GroupElement;
                const children = await Promise.all(
                    grp.children.map(async (child) =>
                        child.type === "image"
                            ? { ...child, src: await compressDataUrl((child as ImageElement).src) }
                            : child
                    )
                );
                return { ...grp, children } as StickerElement;
            }
            return el;
        }));
    };

    const handleSave = async () => {
        if (!id) return;
        setSaving(true);
        try {
            const compressed = await compressElements(elements);
            await updateStickerTemplate(id, {
                name: templateName,
                width: canvasW,
                height: canvasH,
                elements: compressed as unknown[],
            });
            setToast({ msg: "บันทึกสำเร็จ!", ok: true });
        } catch (err) {
            const msg = err instanceof Error ? err.message : "";
            setToast({
                msg: msg.includes("413") || msg.includes("large")
                    ? "ไฟล์รูปใหญ่เกินไป กรุณาใช้รูปขนาดเล็กลง"
                    : "บันทึกไม่สำเร็จ",
                ok: false,
            });
        } finally {
            setSaving(false);
        }
        setTimeout(() => setToast(null), 3000);
    };

    const selectedElement = elements.find(e => e.id === selectedId) ?? null;

    const handleElementChange = (updated: StickerElement) => {
        commit(elements.map(e => e.id === updated.id ? updated : e));
    };

    if (loadError) return (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
            <p className="text-sm text-muted-foreground">ไม่พบ template</p>
            <Button variant="outline" onClick={() => router.push("/settings/sticker")}>กลับ</Button>
        </div>
    );

    return (
        <>
        {/* fill the remaining page height (layout already has padding) */}
        <div className="flex flex-col gap-3" style={{ height: "calc(100vh - 7rem)" }}>
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.push("/settings/sticker")}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="p-2 bg-violet-500/10 rounded-lg text-violet-500">
                        <Tag className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-foreground">
                            {templateName || "ออกแบบสติ๊กเกอร์"}
                        </h1>
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
                    <Button onClick={handleSave} disabled={saving} className="gap-2 h-8">
                        {saving
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Save className="h-4 w-4" />
                        }
                        {saving ? "กำลังบันทึก..." : "บันทึก"}
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

                    {/* Non-shape tools */}
                    {[
                        { type: "text" as ElementType,    icon: <Type className="h-3.5 w-3.5" />,     label: "ข้อความ" },
                        { type: "dynamic" as ElementType, icon: <Variable className="h-3.5 w-3.5" />, label: "ตัวแปร" },
                        { type: "qr" as ElementType,      icon: <QrCode className="h-3.5 w-3.5" />,   label: "QR Code" },
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

                    {/* Shapes collapsible */}
                    <button
                        className="flex items-center justify-between w-full text-[10px] font-semibold uppercase text-muted-foreground tracking-wider py-1 hover:text-foreground transition-colors"
                        onClick={() => setShapesOpen(v => !v)}
                    >
                        รูปทรง
                        <ChevronRight className={`h-3 w-3 transition-transform ${shapesOpen ? "rotate-90" : ""}`} />
                    </button>
                    {shapesOpen && (
                        <div className="grid grid-cols-2 gap-1">
                            {([
                                { kind: "rect" as const,     icon: <Square className="h-3.5 w-3.5" />,      label: "สี่เหลี่ยม",  isRect: true },
                                { kind: "circle" as const,   icon: <Circle className="h-3.5 w-3.5" />,      label: "วงกลม",      isRect: false },
                                { kind: "ellipse" as const,  icon: <Circle className="h-3 w-4" />,          label: "วงรี",       isRect: false },
                                { kind: "triangle" as const, icon: <Triangle className="h-3.5 w-3.5" />,    label: "สามเหลี่ยม", isRect: false },
                                { kind: "star" as const,     icon: <Star className="h-3.5 w-3.5" />,        label: "ดาว",        isRect: false },
                                { kind: "pentagon" as const, icon: <Pentagon className="h-3.5 w-3.5" />,    label: "ห้าเหลี่ยม", isRect: false },
                                { kind: "hexagon" as const,  icon: <Hexagon className="h-3.5 w-3.5" />,     label: "หกเหลี่ยม",  isRect: false },
                                { kind: "diamond" as const,  icon: <Diamond className="h-3.5 w-3.5" />,     label: "เพชร",       isRect: false },
                                { kind: "arrow" as const,    icon: <ArrowRight className="h-3.5 w-3.5" />,  label: "ลูกศร",      isRect: false },
                                { kind: "line" as const,     icon: <Minus className="h-3.5 w-3.5" />,       label: "เส้น",       isLine: true },
                            ] as Array<{ kind: string; icon: React.ReactNode; label: string; isRect?: boolean; isLine?: boolean }>).map(({ kind, icon, label, isRect, isLine }) => (
                                <Button key={kind} variant="outline" size="sm"
                                    className="justify-start gap-1.5 h-8 text-[11px] w-full px-2"
                                    onClick={() => {
                                        if (isRect) addElement("rect");
                                        else if (isLine) addElement("line");
                                        else addElement("shape", kind as ShapeKind);
                                    }}>
                                    {icon} {label}
                                </Button>
                            ))}
                        </div>
                    )}

                    <hr className="border-border" />
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                        {pxW} × {pxH} px<br />
                        ({canvasW} × {canvasH} mm)
                    </p>
                </div>

                {/* Canvas Area */}
                <div className="flex-1 bg-muted/40 rounded-xl border overflow-auto flex items-center justify-center p-8 relative">
                    {multiSelected.length >= 2 && (
                        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-violet-600 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-1.5 pointer-events-none">
                            <Layers2 className="h-3.5 w-3.5" />
                            {multiSelected.length} ชิ้น · ⌘G เพื่อจัดกลุ่ม
                        </div>
                    )}
                    <StickerCanvas
                        width={pxW}
                        height={pxH}
                        zoom={zoom}
                        elements={elements}
                        selectedId={selectedId}
                        multiSelected={multiSelected}
                        onSelect={handleSelect}
                        onChange={handleElementChange}
                        onElementsChange={next => commit(next)}
                        onContextMenu={handleContextMenu}
                    />
                </div>

                {/* Right Properties Panel */}
                <div className="w-48 shrink-0 bg-card border rounded-xl overflow-y-auto">
                    <div className="p-3 border-b">
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
                            {multiSelected.length >= 2 ? "จัด Layout" : "คุณสมบัติ"}
                        </p>
                    </div>
                    {multiSelected.length >= 2 ? (
                        <AlignPanel
                            count={multiSelected.length}
                            onAlign={handleAlign}
                            onDistribute={handleDistribute}
                            onGroup={handleGroup}
                        />
                    ) : (
                        <PropsPanel
                            element={selectedElement}
                            onChange={handleElementChange}
                            onDelete={() => {
                                if (selectedId) {
                                    commit(elements.filter(e => e.id !== selectedId));
                                    setSelectedId(null);
                                }
                            }}
                            onCrop={() => {
                                if (selectedElement?.type === "image") {
                                    setCropModal({ id: selectedElement.id, src: (selectedElement as ImageElement).src, current: (selectedElement as ImageElement).imageCrop });
                                }
                            }}
                            onUngroup={handleUngroup}
                            onZOrder={handleZOrder}
                        />
                    )}
                </div>
            </div>
        </div>

        {showPreview && (
            <StickerPreviewModal
                template={{ width: canvasW, height: canvasH, elements }}
                onClose={() => setShowPreview(false)}
            />
        )}
        {cropModal && (
            <CropModal
                src={cropModal.src}
                initialCrop={cropModal.current}
                onConfirm={handleCropConfirm}
                onClose={() => setCropModal(null)}
            />
        )}

        {contextMenu && (
            <ContextMenu
                pos={{ x: contextMenu.x, y: contextMenu.y }}
                el={elements.find(e => e.id === contextMenu.id) ?? null}
                multiSelected={multiSelected}
                hasClipboard={!!clipboardRef.current}
                onClose={() => setContextMenu(null)}
                onCopy={() => { copy(); }}
                onPaste={() => { paste(); }}
                onDuplicate={handleDuplicate}
                onDelete={() => {
                    const id = contextMenu.id ?? selectedId;
                    if (id) { commit(elements.filter(e => e.id !== id)); setSelectedId(null); setMultiSelected([]); }
                }}
                onZOrder={handleZOrder}
                onGroup={handleGroup}
                onUngroup={handleUngroup}
                onCrop={() => {
                    const el = elements.find(e => e.id === contextMenu.id);
                    if (el?.type === "image") setCropModal({ id: el.id, src: (el as ImageElement).src, current: (el as ImageElement).imageCrop });
                }}
                onAlign={handleAlign}
            />
        )}

        </>
    );
}
