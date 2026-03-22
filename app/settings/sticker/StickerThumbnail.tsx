"use client";

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Line, Image as KonvaImage, Group } from "react-konva";
import type { StickerElement, ImageElement, GroupElement } from "./types";

const MM_TO_PX = 3.7795275591;

// ── Static QR placeholder ─────────────────────────────────────────────────────
function ThumbQr({ el }: { el: Extract<StickerElement, { type: "qr" }> }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    if (!canvasRef.current) {
        const c = document.createElement("canvas");
        c.width = 80; c.height = 80;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 80, 80);
        ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
        ctx.strokeRect(4, 4, 72, 72);
        [[6, 6], [52, 6], [6, 52]].forEach(([px, py]) => {
            ctx.fillStyle = "#000"; ctx.fillRect(px!, py!, 22, 22);
            ctx.fillStyle = "#fff"; ctx.fillRect(px! + 4, py! + 4, 14, 14);
            ctx.fillStyle = "#000"; ctx.fillRect(px! + 7, py! + 7, 8, 8);
        });
        const seed = el.value.length;
        for (let r = 0; r < 5; r++)
            for (let c2 = 0; c2 < 5; c2++)
                if ((r * 7 + c2 * 3 + seed) % 2 === 0)
                    ctx.fillRect(32 + c2 * 8, 32 + r * 8, 6, 6);
        canvasRef.current = c;
    }
    return (
        <KonvaImage
            x={el.x} y={el.y} width={el.width} height={el.height}
            rotation={el.rotation ?? 0}
            image={canvasRef.current ?? undefined}
        />
    );
}

// ── Static image ──────────────────────────────────────────────────────────────
function ThumbImage({ el }: { el: ImageElement }) {
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    useEffect(() => {
        const i = new window.Image();
        i.src = el.src;
        i.onload = () => setImg(i);
    }, [el.src]);
    if (!img) return null;
    return (
        <KonvaImage
            x={el.x} y={el.y} width={el.width} height={el.height}
            rotation={el.rotation ?? 0} image={img}
            crop={el.imageCrop ? { x: el.imageCrop.x, y: el.imageCrop.y, width: el.imageCrop.w, height: el.imageCrop.h } : undefined}
        />
    );
}

// ── Static element dispatcher ─────────────────────────────────────────────────
function ThumbEl({ el }: { el: Exclude<StickerElement, GroupElement> }) {
    if (el.type === "text" || el.type === "dynamic") {
        const fontStyle = [el.italic ? "italic" : "", el.bold ? "bold" : ""].filter(Boolean).join(" ") || "normal";
        return <Text x={el.x} y={el.y} rotation={el.rotation ?? 0} text={el.text} fontSize={el.fontSize} fill={el.fill} fontStyle={fontStyle} fontFamily="'Prompt', sans-serif" />;
    }
    if (el.type === "rect")
        return <Rect x={el.x} y={el.y} rotation={el.rotation ?? 0} width={el.width} height={el.height} fill={el.fill === "transparent" ? "" : el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} />;
    if (el.type === "line")
        return <Line x={el.x} y={el.y} rotation={el.rotation ?? 0} points={el.points} stroke={el.stroke} strokeWidth={el.strokeWidth} />;
    if (el.type === "image")
        return <ThumbImage el={el} />;
    if (el.type === "qr")
        return <ThumbQr el={el} />;
    return null;
}

// ── Main Thumbnail ────────────────────────────────────────────────────────────
interface StickerThumbnailProps {
    widthMm: number;
    heightMm: number;
    elements: StickerElement[];
    /** Max display width in px (default 220) */
    maxW?: number;
    /** Max display height in px (default 140) */
    maxH?: number;
}

export default function StickerThumbnail({ widthMm, heightMm, elements, maxW = 220, maxH = 140 }: StickerThumbnailProps) {
    const pxW = Math.round(widthMm  * MM_TO_PX);
    const pxH = Math.round(heightMm * MM_TO_PX);

    const scale = Math.min(maxW / pxW, maxH / pxH, 1);
    const dispW = Math.round(pxW * scale);
    const dispH = Math.round(pxH * scale);

    return (
        <div
            className="flex items-center justify-center bg-muted/40 rounded-lg overflow-hidden"
            style={{ width: "100%", height: maxH }}
        >
            <div style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.12)", background: "white", lineHeight: 0 }}>
                <Stage width={dispW} height={dispH} scaleX={scale} scaleY={scale} listening={false}>
                    <Layer>
                        <Rect x={0} y={0} width={pxW} height={pxH} fill="white" />
                        {elements.map((el) =>
                            el.type === "group" ? (
                                <Group key={el.id} x={el.x} y={el.y} rotation={el.rotation ?? 0}>
                                    {(el as GroupElement).children.map((child) => (
                                        <ThumbEl key={child.id} el={child} />
                                    ))}
                                </Group>
                            ) : (
                                <ThumbEl key={el.id} el={el as Exclude<StickerElement, GroupElement>} />
                            )
                        )}
                    </Layer>
                </Stage>
            </div>
        </div>
    );
}
