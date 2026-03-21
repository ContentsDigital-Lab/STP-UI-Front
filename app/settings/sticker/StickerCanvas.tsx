"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Stage, Layer, Rect, Text, Transformer, Line, Image as KonvaImage } from "react-konva";
import type Konva from "konva";
import type { StickerElement, ImageElement } from "./page";

// ─── Snap threshold (canvas pixels, before zoom) ─────────────────────────────
const SNAP = 6;
// ─── Stage padding so transformer handles are never clipped at edges ──────────
const PAD = 56;
const ROT_SNAPS = [0, 90, 180, 270];
const ROT_SNAP_TOLERANCE = 8; // degrees
const SNAP_ANGLES = new Set(ROT_SNAPS);

// ─── Rotation label (shown during rotate, like Canva) ────────────────────────
interface RotLabel { angle: number; cx: number; cy: number; snapped: boolean; }

function isRotating(node: Konva.Node) {
    return Math.abs(node.scaleX() - 1) < 0.005 && Math.abs(node.scaleY() - 1) < 0.005;
}
function normaliseAngle(a: number) { return Math.round(((a % 360) + 360) % 360); }
function isSnapped(a: number) {
    return ROT_SNAPS.some(s => {
        const d = Math.abs(((a - s + 360) % 360));
        return d < 3 || d > 357;
    });
}

// ─── QR placeholder ───────────────────────────────────────────────────────────
function QrPlaceholderImage({ id, x, y, width, height, rotation, value, isSelected, onSelect, onChange, onRotating, onRotateEnd }: {
    id: string; x: number; y: number; width: number; height: number; rotation?: number; value: string;
    isSelected: boolean;
    onSelect: () => void;
    onChange: (patch: { x?: number; y?: number; width?: number; height?: number; rotation?: number }) => void;
    onRotating: (label: RotLabel) => void;
    onRotateEnd: () => void;
}) {
    const imgRef = useRef<Konva.Image>(null);
    const trRef  = useRef<Konva.Transformer>(null);

    const imgEl = useRef<HTMLCanvasElement | null>(null);
    if (!imgEl.current) {
        const c = document.createElement("canvas");
        c.width = 80; c.height = 80;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 80, 80);
        ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
        ctx.strokeRect(4, 4, 72, 72);
        [[6, 6], [52, 6], [6, 52]].forEach(([px, py]) => {
            ctx.fillStyle = "#000"; ctx.fillRect(px, py, 22, 22);
            ctx.fillStyle = "#fff"; ctx.fillRect(px + 4, py + 4, 14, 14);
            ctx.fillStyle = "#000"; ctx.fillRect(px + 7, py + 7, 8, 8);
        });
        ctx.fillStyle = "#000";
        const seed = value.length;
        for (let r = 0; r < 5; r++) {
            for (let c2 = 0; c2 < 5; c2++) {
                if ((r * 7 + c2 * 3 + seed) % 2 === 0) ctx.fillRect(32 + c2 * 8, 32 + r * 8, 6, 6);
            }
        }
        ctx.fillStyle = "#6366f1"; ctx.font = "7px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("QR", 40, 78);
        imgEl.current = c;
    }

    useEffect(() => {
        if (isSelected && trRef.current && imgRef.current) {
            trRef.current.nodes([imgRef.current]);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [isSelected]);

    return (
        <>
            <KonvaImage
                ref={imgRef}
                id={id}
                image={imgEl.current!}
                x={x} y={y} width={width} height={height}
                rotation={rotation ?? 0}
                draggable
                onClick={onSelect} onTap={onSelect}
                onDragEnd={e => onChange({ x: e.target.x(), y: e.target.y() })}
                onTransformEnd={() => {
                    const node = imgRef.current!;
                    onChange({
                        x: node.x(), y: node.y(),
                        rotation: node.rotation(),
                        width: Math.round(node.width() * node.scaleX()),
                        height: Math.round(node.height() * node.scaleY()),
                    });
                    node.scaleX(1); node.scaleY(1);
                    onRotateEnd();
                }}
            />
            {isSelected && (
                <Transformer
                    ref={trRef}
                    keepRatio
                    rotationSnaps={ROT_SNAPS}
                    rotationSnapTolerance={ROT_SNAP_TOLERANCE}
                    boundBoxFunc={(_, nb) => nb}
                    onTransform={() => {
                        const node = imgRef.current!;
                        if (!isRotating(node)) return;
                        const a = normaliseAngle(node.rotation());
                        const rect = node.getClientRect();
                        onRotating({ angle: a, cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, snapped: isSnapped(a) });
                    }}
                    onTransformEnd={onRotateEnd}
                />
            )}
        </>
    );
}

// ─── Image element ────────────────────────────────────────────────────────────
function ImageNode({ el, isSelected, onSelect, onChange, onRotating, onRotateEnd }: {
    el: ImageElement;
    isSelected: boolean;
    onSelect: () => void;
    onChange: (updated: StickerElement) => void;
    onRotating: (label: RotLabel) => void;
    onRotateEnd: () => void;
}) {
    const [htmlImg, setHtmlImg] = useState<HTMLImageElement | null>(null);
    const imgRef = useRef<Konva.Image>(null);
    const trRef  = useRef<Konva.Transformer>(null);

    useEffect(() => {
        const img = new window.Image();
        img.src = el.src;
        img.onload = () => setHtmlImg(img);
    }, [el.src]);

    useEffect(() => {
        if (isSelected && trRef.current && imgRef.current) {
            trRef.current.nodes([imgRef.current]);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [isSelected]);

    if (!htmlImg) return null;

    return (
        <>
            <KonvaImage
                ref={imgRef}
                id={el.id}
                image={htmlImg}
                x={el.x} y={el.y} width={el.width} height={el.height}
                rotation={el.rotation ?? 0}
                draggable
                onClick={onSelect} onTap={onSelect}
                onDragEnd={e => onChange({ ...el, x: e.target.x(), y: e.target.y() } as StickerElement)}
                onTransformEnd={() => {
                    const node = imgRef.current!;
                    onChange({
                        ...el, x: node.x(), y: node.y(),
                        rotation: node.rotation(),
                        width: Math.round(el.width * node.scaleX()),
                        height: Math.round(el.height * node.scaleY()),
                    } as StickerElement);
                    node.scaleX(1); node.scaleY(1);
                    onRotateEnd();
                }}
            />
            {isSelected && (
                <Transformer
                    ref={trRef}
                    keepRatio
                    rotationSnaps={ROT_SNAPS}
                    rotationSnapTolerance={ROT_SNAP_TOLERANCE}
                    boundBoxFunc={(_, nb) => nb}
                    onTransform={() => {
                        const node = imgRef.current!;
                        if (!isRotating(node)) return;
                        const a = normaliseAngle(node.rotation());
                        const rect = node.getClientRect();
                        onRotating({ angle: a, cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, snapped: isSnapped(a) });
                    }}
                    onTransformEnd={onRotateEnd}
                />
            )}
        </>
    );
}

// ─── Generic draggable element ────────────────────────────────────────────────
function ElementNode({ el, isSelected, onSelect, onChange, onRotating, onRotateEnd }: {
    el: StickerElement;
    isSelected: boolean;
    onSelect: () => void;
    onChange: (updated: StickerElement) => void;
    onRotating: (label: RotLabel) => void;
    onRotateEnd: () => void;
}) {
    const shapeRef = useRef<Konva.Node>(null);
    const trRef    = useRef<Konva.Transformer>(null);

    useEffect(() => {
        if (isSelected && trRef.current && shapeRef.current) {
            trRef.current.nodes([shapeRef.current]);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [isSelected]);

    const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) =>
        onChange({ ...el, x: e.target.x(), y: e.target.y() } as StickerElement);

    const handleTransformEnd = () => {
        const node = shapeRef.current!;
        const sx = node.scaleX(), sy = node.scaleY();
        const rot = node.rotation();
        node.scaleX(1); node.scaleY(1);
        if (el.type === "rect") {
            onChange({ ...el, x: node.x(), y: node.y(), rotation: rot, width: Math.round((el as { width: number }).width * sx), height: Math.round((el as { height: number }).height * sy) } as StickerElement);
        } else {
            onChange({ ...el, x: node.x(), y: node.y(), rotation: rot } as StickerElement);
        }
        onRotateEnd();
    };

    const handleTransform = () => {
        const node = shapeRef.current!;
        if (!isRotating(node)) return;
        const a = normaliseAngle(node.rotation());
        const rect = node.getClientRect();
        onRotating({ angle: a, cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, snapped: isSnapped(a) });
    };

    const common = { id: el.id, draggable: true, onClick: onSelect, onTap: onSelect, onDragEnd: handleDragEnd, onTransformEnd: handleTransformEnd };

    // Transformer props shared
    const trProps = {
        ref: trRef,
        rotationSnaps: ROT_SNAPS,
        rotationSnapTolerance: ROT_SNAP_TOLERANCE,
        boundBoxFunc: (_: unknown, nb: { x: number; y: number; width: number; height: number; rotation: number }) => nb,
        onTransform: handleTransform,
        onTransformEnd: onRotateEnd,
    };

    if (el.type === "text" || el.type === "dynamic") {
        const fontStyle = [el.italic ? "italic" : "", el.bold ? "bold" : ""].filter(Boolean).join(" ") || "normal";
        return (
            <>
                <Text ref={shapeRef as React.RefObject<Konva.Text>} {...common} x={el.x} y={el.y} rotation={el.rotation ?? 0} text={el.text} fontSize={el.fontSize} fill={el.fill} fontStyle={fontStyle} fontFamily="'Prompt', sans-serif" />
                {isSelected && <Transformer {...trProps} enabledAnchors={["middle-left", "middle-right"]} />}
            </>
        );
    }
    if (el.type === "rect") {
        return (
            <>
                <Rect ref={shapeRef as React.RefObject<Konva.Rect>} {...common} x={el.x} y={el.y} rotation={el.rotation ?? 0} width={el.width} height={el.height} fill={el.fill === "transparent" ? "" : el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} />
                {isSelected && <Transformer {...trProps} />}
            </>
        );
    }
    if (el.type === "line") {
        return (
            <>
                <Line ref={shapeRef as React.RefObject<Konva.Line>} {...common} x={el.x} y={el.y} rotation={el.rotation ?? 0} points={el.points} stroke={el.stroke} strokeWidth={el.strokeWidth} hitStrokeWidth={10} />
                {isSelected && <Transformer {...trProps} enabledAnchors={["middle-left", "middle-right"]} />}
            </>
        );
    }
    return null;
}

// ─── Main Canvas ──────────────────────────────────────────────────────────────
interface StickerCanvasProps {
    width: number;
    height: number;
    zoom?: number;
    elements: StickerElement[];
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onChange: (updated: StickerElement) => void;
    onElementsChange: (els: StickerElement[]) => void;
}

export default function StickerCanvas({
    width, height, zoom = 1, elements, selectedId, onSelect, onChange,
}: StickerCanvasProps) {
    const [guides,   setGuides]   = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
    const [rotLabel, setRotLabel] = useState<RotLabel | null>(null);
    const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const elsRef = useRef(elements);
    useEffect(() => { elsRef.current = elements; }, [elements]);

    const handleRotating = useCallback((label: RotLabel) => setRotLabel(label), []);
    const handleRotateEnd = useCallback(() => setRotLabel(null), []);

    // ── Compute snap position + active guide lines ──────────────────────────
    const computeSnap = useCallback((node: Konva.Node) => {
        const dragId = node.id();
        const dragEl = elsRef.current.find(e => e.id === dragId);
        const nx = node.x(), ny = node.y();

        const elW = dragEl && "width" in dragEl ? (dragEl as { width: number }).width : 0;
        const elH = dragEl && "height" in dragEl ? (dragEl as { height: number }).height : 0;
        const xOff = elW > 0 ? [0, elW / 2, elW] : [0];
        const yOff = elH > 0 ? [0, elH / 2, elH] : [0];

        const gxSet = new Set([0, width / 2, width]);
        const gySet = new Set([0, height / 2, height]);
        for (const el of elsRef.current) {
            if (el.id === dragId) continue;
            const w = "width" in el ? (el as { width: number }).width : 0;
            const h = "height" in el ? (el as { height: number }).height : 0;
            gxSet.add(el.x); gxSet.add(el.x + w / 2); gxSet.add(el.x + w);
            gySet.add(el.y); gySet.add(el.y + h / 2); gySet.add(el.y + h);
        }

        let snapX = nx, bestDX = SNAP + 1;
        const activeV: number[] = [];
        for (const gx of gxSet) {
            for (const dx of xOff) {
                const d = Math.abs((nx + dx) - gx);
                if (d < bestDX) { bestDX = d; snapX = gx - dx; activeV.length = 0; if (d <= SNAP) activeV.push(gx); }
                else if (d <= SNAP && d === bestDX && !activeV.includes(gx)) activeV.push(gx);
            }
        }

        let snapY = ny, bestDY = SNAP + 1;
        const activeH: number[] = [];
        for (const gy of gySet) {
            for (const dy of yOff) {
                const d = Math.abs((ny + dy) - gy);
                if (d < bestDY) { bestDY = d; snapY = gy - dy; activeH.length = 0; if (d <= SNAP) activeH.push(gy); }
                else if (d <= SNAP && d === bestDY && !activeH.includes(gy)) activeH.push(gy);
            }
        }

        return {
            x: bestDX <= SNAP ? snapX : nx,
            y: bestDY <= SNAP ? snapY : ny,
            v: bestDX <= SNAP ? activeV : [],
            h: bestDY <= SNAP ? activeH : [],
        };
    }, [width, height]);

    const handleStageDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
        const node = e.target;
        if (!elsRef.current.find(el => el.id === node.id())) return;
        const snap = computeSnap(node);
        node.position({ x: snap.x, y: snap.y });
        setGuides({ v: snap.v, h: snap.h });
    }, [computeSnap]);

    const handleStageDragEnd = useCallback(() => {
        setGuides({ v: [], h: [] });
    }, []);

    const gStroke = "#6366f1";
    const gW = 1 / zoom;
    const gDash = [4 / zoom, 4 / zoom];

    const badgeLeft = mousePos.x + 14;
    const badgeTop  = mousePos.y + 14;

    return (
        <div
            style={{ position: "relative", display: "inline-block" }}
            onMouseMove={e => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }}
        >
            <Stage
                width={Math.round((width + PAD * 2) * zoom)}
                height={Math.round((height + PAD * 2) * zoom)}
                scaleX={zoom}
                scaleY={zoom}
                onMouseDown={e => { if (e.target === e.target.getStage()) onSelect(null); }}
                onTouchStart={e => { if (e.target === e.target.getStage()) onSelect(null); }}
                onDragMove={handleStageDragMove}
                onDragEnd={handleStageDragEnd}
            >
                <Layer x={PAD} y={PAD}>
                    {/* White sticker area with shadow */}
                    <Rect x={0} y={0} width={width} height={height} fill="white"
                        shadowColor="rgba(0,0,0,0.18)" shadowBlur={24} shadowOffsetX={0} shadowOffsetY={4} />
                    {elements.map(el =>
                        el.type === "qr" ? (
                            <QrPlaceholderImage
                                key={el.id} id={el.id}
                                x={el.x} y={el.y} width={el.width} height={el.height}
                                rotation={el.rotation ?? 0} value={el.value}
                                isSelected={selectedId === el.id}
                                onSelect={() => onSelect(el.id)}
                                onChange={patch => onChange({ ...el, ...patch } as StickerElement)}
                                onRotating={handleRotating}
                                onRotateEnd={handleRotateEnd}
                            />
                        ) : el.type === "image" ? (
                            <ImageNode
                                key={el.id} el={el}
                                isSelected={selectedId === el.id}
                                onSelect={() => onSelect(el.id)}
                                onChange={onChange}
                                onRotating={handleRotating}
                                onRotateEnd={handleRotateEnd}
                            />
                        ) : (
                            <ElementNode
                                key={el.id} el={el}
                                isSelected={selectedId === el.id}
                                onSelect={() => onSelect(el.id)}
                                onChange={onChange}
                                onRotating={handleRotating}
                                onRotateEnd={handleRotateEnd}
                            />
                        )
                    )}
                </Layer>

                {/* Alignment guide lines */}
                {(guides.v.length > 0 || guides.h.length > 0) && (
                    <Layer x={PAD} y={PAD} listening={false}>
                        {guides.v.map((x, i) => (
                            <Line key={`v${i}`} points={[x, -10, x, height + 10]} stroke={gStroke} strokeWidth={gW} dash={gDash} />
                        ))}
                        {guides.h.map((y, i) => (
                            <Line key={`h${i}`} points={[-10, y, width + 10, y]} stroke={gStroke} strokeWidth={gW} dash={gDash} />
                        ))}
                    </Layer>
                )}
            </Stage>

            {/* ── Rotation angle badge (shown while rotating, like Canva) ── */}
            {rotLabel && (
                <div
                    style={{
                        position: "absolute",
                        left: badgeLeft,
                        top: badgeTop,
                        pointerEvents: "none",
                        zIndex: 20,
                        transition: "background-color 0.1s",
                    }}
                    className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full shadow-lg text-xs font-mono font-semibold select-none ${
                        rotLabel.snapped
                            ? "bg-violet-600 text-white"
                            : "bg-slate-800/90 text-white"
                    }`}
                >
                    {rotLabel.angle}°
                    {rotLabel.snapped && (
                        <span className="ml-0.5 text-violet-200 text-[10px]">✦</span>
                    )}
                </div>
            )}
        </div>
    );
}
