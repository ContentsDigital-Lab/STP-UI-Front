export type ShapeKind = "circle" | "ellipse" | "triangle" | "star" | "pentagon" | "hexagon" | "diamond" | "arrow";
export type ElementType = "text" | "dynamic" | "qr" | "rect" | "line" | "image" | "group" | "shape";

interface BaseElement { id: string; type: ElementType; x: number; y: number; rotation?: number; }

export interface TextElement extends BaseElement {
    type: "text" | "dynamic";
    text: string; fontSize: number; fill: string; bold: boolean; italic: boolean;
    fontFamily?: string; // Google Font name e.g. "Kanit" — defaults to "Prompt"
}
export interface QrElement extends BaseElement {
    type: "qr"; width: number; height: number; value: string;
}
export interface RectElement extends BaseElement {
    type: "rect"; width: number; height: number; fill: string; stroke: string; strokeWidth: number;
    label?: string; labelColor?: string; labelFontSize?: number;
}
export interface LineElement extends BaseElement {
    type: "line"; points: number[]; stroke: string; strokeWidth: number;
}
export interface ImageElement extends BaseElement {
    type: "image"; width: number; height: number; src: string;
    imageCrop?: { x: number; y: number; w: number; h: number };
}
export interface GroupElement extends BaseElement {
    type: "group"; width: number; height: number;
    children: Exclude<StickerElement, GroupElement>[];
}
export interface ShapeElement extends BaseElement {
    type: "shape"; kind: ShapeKind; width: number; height: number;
    fill: string; stroke: string; strokeWidth: number;
    label?: string; labelColor?: string; labelFontSize?: number;
}
export type StickerElement = TextElement | QrElement | RectElement | LineElement | ImageElement | GroupElement | ShapeElement;

export interface StickerTemplate {
    width: number; height: number; elements: StickerElement[];
}
