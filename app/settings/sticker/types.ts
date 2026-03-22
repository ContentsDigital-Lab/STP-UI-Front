export type ElementType = "text" | "dynamic" | "qr" | "rect" | "line" | "image" | "group";

interface BaseElement { id: string; type: ElementType; x: number; y: number; rotation?: number; }

export interface TextElement extends BaseElement {
    type: "text" | "dynamic";
    text: string; fontSize: number; fill: string; bold: boolean; italic: boolean;
}
export interface QrElement extends BaseElement {
    type: "qr"; width: number; height: number; value: string;
}
export interface RectElement extends BaseElement {
    type: "rect"; width: number; height: number; fill: string; stroke: string; strokeWidth: number;
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
export type StickerElement = TextElement | QrElement | RectElement | LineElement | ImageElement | GroupElement;

export interface StickerTemplate {
    width: number; height: number; elements: StickerElement[];
}
