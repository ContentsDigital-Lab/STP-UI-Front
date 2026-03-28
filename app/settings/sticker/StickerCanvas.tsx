"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Stage, Layer, Group, Rect, Text, Transformer, Line, Image as KonvaImage, Circle, Ellipse, RegularPolygon, Star as KonvaStar, Arrow } from "react-konva";
import type Konva from "konva";
import type { StickerElement, ImageElement, GroupElement, ShapeElement } from "./types";
import { cssFontFamily } from "./fonts";

// ─── Snap threshold (canvas pixels, before zoom) ─────────────────────────────
const SNAP = 6;
// ─── Stage padding so transformer handles are never clipped at edges ──────────
const PAD = 56;
const ROT_SNAPS = [0, 90, 180, 270];
const ROT_SNAP_TOLERANCE = 8; // degrees
const SNAP_ANGLES = new Set(ROT_SNAPS);

// ─── Rotation label (shown during rotate, like Canva) ────────────────────────
interface RotLabel { angle: number; cx: number; cy: number; snapped: boolean; }

// ─── Bounding-box helper (for multi-select highlight) ────────────────────────
function getElBounds(el: StickerElement): { x: number; y: number; w: number; h: number } {
    if (el.type === "text" || el.type === "dynamic") {
        return {
            x: el.x,
            y: el.y,
            w: Math.max(el.text.length * el.fontSize * 0.58, 20),
            h: el.fontSize * 1.4,
        };
    }
    if (el.type === "line") {
        const pts = el.points;
        const xs = pts.filter((_, i) => i % 2 === 0);
        const ys = pts.filter((_, i) => i % 2 === 1);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const padV = Math.max(el.strokeWidth, 4) + 4;
        return {
            x: el.x + minX,
            y: el.y + minY - padV / 2,
            w: Math.max(maxX - minX, 10),
            h: Math.max(maxY - minY + padV, 10),
        };
    }
    return {
        x: el.x,
        y: el.y,
        w: "width"  in el ? (el as { width:  number }).width  : 40,
        h: "height" in el ? (el as { height: number }).height : 20,
    };
}

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
function QrPlaceholderImage({ id, x, y, width, height, rotation, value, isSelected, onSelect, onChange, onRotating, onRotateEnd, onContextMenu }: {
    id: string; x: number; y: number; width: number; height: number; rotation?: number; value: string;
    isSelected: boolean;
    onSelect: (shift?: boolean) => void;
    onChange: (patch: { x?: number; y?: number; width?: number; height?: number; rotation?: number }) => void;
    onRotating: (label: RotLabel) => void;
    onRotateEnd: () => void;
    onContextMenu?: (clientX: number, clientY: number) => void;
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
                onClick={e => onSelect(e.evt.shiftKey)} onTap={() => onSelect()}
                onContextMenu={e => { e.evt.preventDefault(); onContextMenu?.(e.evt.clientX, e.evt.clientY); }}
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
function ImageNode({ el, isSelected, onSelect, onChange, onRotating, onRotateEnd, onContextMenu }: {
    el: ImageElement;
    isSelected: boolean;
    onSelect: (shift?: boolean) => void;
    onChange: (updated: StickerElement) => void;
    onRotating: (label: RotLabel) => void;
    onRotateEnd: () => void;
    onContextMenu?: (clientX: number, clientY: number) => void;
}) {
    const [htmlImg, setHtmlImg] = useState<HTMLImageElement | null>(null);
    const imgRef = useRef<Konva.Image>(null);
    const trRef  = useRef<Konva.Transformer>(null);

    useEffect(() => {
        const img = new window.Image();
        img.src = el.src;
        img.onload = () => setHtmlImg(img);
    }, [el.src]);

    // Re-attach transformer whenever selection state OR image load state changes
    useEffect(() => {
        if (isSelected && trRef.current && imgRef.current) {
            trRef.current.nodes([imgRef.current]);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [isSelected, htmlImg]);

    if (!htmlImg) return null;

    return (
        <>
            <KonvaImage
                ref={imgRef}
                id={el.id}
                image={htmlImg}
                x={el.x} y={el.y} width={el.width} height={el.height}
                rotation={el.rotation ?? 0}
                crop={el.imageCrop ? { x: el.imageCrop.x, y: el.imageCrop.y, width: el.imageCrop.w, height: el.imageCrop.h } : undefined}
                draggable
                onClick={e => onSelect(e.evt.shiftKey)} onTap={() => onSelect()}
                onContextMenu={e => { e.evt.preventDefault(); onContextMenu?.(e.evt.clientX, e.evt.clientY); }}
                onDragEnd={e => onChange({ ...el, x: e.target.x(), y: e.target.y() } as StickerElement)}
                onTransformEnd={() => {
                    const node = imgRef.current!;
                    // Use node.width()/height() to avoid stale closure
                    const newW = Math.round(node.width() * node.scaleX());
                    const newH = Math.round(node.height() * node.scaleY());
                    node.scaleX(1); node.scaleY(1);
                    onChange({ ...el, x: node.x(), y: node.y(), rotation: node.rotation(), width: newW, height: newH } as StickerElement);
                    onRotateEnd();
                }}
            />
            {isSelected && (
                <Transformer
                    ref={trRef}
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
function ElementNode({ el, isSelected, onSelect, onChange, onRotating, onRotateEnd, onContextMenu, onEditLabel }: {
    el: StickerElement;
    isSelected: boolean;
    onSelect: (shift?: boolean) => void;
    onChange: (updated: StickerElement) => void;
    onRotating: (label: RotLabel) => void;
    onRotateEnd: () => void;
    onContextMenu?: (clientX: number, clientY: number) => void;
    onEditLabel?: (id: string, node: Konva.Node) => void;
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
        if (el.type === "rect" || el.type === "shape") {
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

    const ctxMenu = (e: Konva.KonvaEventObject<MouseEvent>) => { e.evt.preventDefault(); onContextMenu?.(e.evt.clientX, e.evt.clientY); };
    const common = { id: el.id, draggable: true, onClick: (e: Konva.KonvaEventObject<MouseEvent>) => onSelect(e.evt.shiftKey), onTap: () => onSelect(), onContextMenu: ctxMenu, onDragEnd: handleDragEnd, onTransformEnd: handleTransformEnd, onDblClick: () => { if (shapeRef.current) onEditLabel?.(el.id, shapeRef.current); } };

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
                <Text ref={shapeRef as React.RefObject<Konva.Text>} {...common} x={el.x} y={el.y} rotation={el.rotation ?? 0} text={el.text} fontSize={el.fontSize} fill={el.fill} fontStyle={fontStyle} fontFamily={cssFontFamily(el.fontFamily ?? "Prompt")} />
                {isSelected && <Transformer {...trProps} enabledAnchors={["middle-left", "middle-right"]} />}
            </>
        );
    }
    if (el.type === "rect") {
        const rectGroupRef = shapeRef as React.RefObject<Konva.Group>;
        return (
            <>
                <Group ref={rectGroupRef} id={el.id} x={el.x} y={el.y} rotation={el.rotation ?? 0} draggable
                    onClick={(e: Konva.KonvaEventObject<MouseEvent>) => onSelect(e.evt.shiftKey)} onTap={() => onSelect()} onContextMenu={ctxMenu}
                    onDragEnd={handleDragEnd} onTransformEnd={handleTransformEnd}
                    onDblClick={() => { if (rectGroupRef.current) onEditLabel?.(el.id, rectGroupRef.current); }}
                >
                    <Rect x={0} y={0} width={el.width} height={el.height} fill={el.fill === "transparent" ? "" : el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} />
                    {el.label && <Text x={0} y={0} width={el.width} height={el.height} text={el.label} align="center" verticalAlign="middle" fontSize={el.labelFontSize ?? 12} fill={el.labelColor ?? "#000000"} listening={false} fontFamily="'Prompt', sans-serif" />}
                </Group>
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
    if (el.type === "shape") {
        const s = el as ShapeElement;
        const cx = s.width / 2;
        const cy = s.height / 2;
        const r  = Math.min(s.width, s.height) / 2;
        const fill = s.fill === "transparent" ? "" : s.fill;
        let shapeNode: React.ReactNode;
        switch (s.kind) {
            case "circle":
                shapeNode = <Circle x={cx} y={cy} radius={r} fill={fill} stroke={s.stroke} strokeWidth={s.strokeWidth} listening={false} />;
                break;
            case "ellipse":
                shapeNode = <Ellipse x={cx} y={cy} radiusX={s.width / 2} radiusY={s.height / 2} fill={fill} stroke={s.stroke} strokeWidth={s.strokeWidth} listening={false} />;
                break;
            case "triangle":
                shapeNode = <RegularPolygon x={cx} y={cy} sides={3} radius={r} fill={fill} stroke={s.stroke} strokeWidth={s.strokeWidth} listening={false} />;
                break;
            case "star":
                shapeNode = <KonvaStar x={cx} y={cy} numPoints={5} innerRadius={r * 0.4} outerRadius={r} fill={fill} stroke={s.stroke} strokeWidth={s.strokeWidth} listening={false} />;
                break;
            case "pentagon":
                shapeNode = <RegularPolygon x={cx} y={cy} sides={5} radius={r} fill={fill} stroke={s.stroke} strokeWidth={s.strokeWidth} listening={false} />;
                break;
            case "hexagon":
                shapeNode = <RegularPolygon x={cx} y={cy} sides={6} radius={r} fill={fill} stroke={s.stroke} strokeWidth={s.strokeWidth} listening={false} />;
                break;
            case "diamond":
                shapeNode = <Line x={0} y={0} points={[cx, 0, s.width, cy, cx, s.height, 0, cy]} closed fill={fill} stroke={s.stroke} strokeWidth={s.strokeWidth} listening={false} />;
                break;
            case "arrow":
                shapeNode = <Arrow x={0} y={cy} points={[0, 0, s.width, 0]} fill={fill} stroke={s.stroke} strokeWidth={Math.max(s.strokeWidth, 2)} pointerLength={12} pointerWidth={10} listening={false} />;
                break;
            default:
                shapeNode = null;
        }
        const groupRef2 = shapeRef as React.RefObject<Konva.Group>;
        return (
            <>
                <Group ref={groupRef2} id={s.id} x={s.x} y={s.y} rotation={s.rotation ?? 0} width={s.width} height={s.height} draggable
                    onClick={e => onSelect(e.evt.shiftKey)} onTap={() => onSelect()} onContextMenu={ctxMenu}
                    onDragEnd={handleDragEnd} onTransformEnd={handleTransformEnd}
                    onDblClick={() => { if (groupRef2.current) onEditLabel?.(s.id, groupRef2.current); }}
                >
                    {/* Transparent hit-area rect so the Group is always draggable */}
                    <Rect x={0} y={0} width={s.width} height={s.height} opacity={0} />
                    {shapeNode}
                    {s.label && (
                        <Text
                            x={0} y={0} width={s.width} height={s.height}
                            text={s.label} align="center" verticalAlign="middle"
                            fontSize={s.labelFontSize ?? 12} fill={s.labelColor ?? "#000000"}
                            listening={false}
                            fontFamily="'Prompt', sans-serif"
                        />
                    )}
                </Group>
                {isSelected && <Transformer {...trProps} />}
            </>
        );
    }
    return null;
}

// ─── Static (non-interactive) renderers for group children ────────────────────
function StaticImageEl({ el }: { el: ImageElement }) {
    const [htmlImg, setHtmlImg] = useState<HTMLImageElement | null>(null);
    useEffect(() => {
        const img = new window.Image(); img.src = el.src;
        img.onload = () => setHtmlImg(img);
    }, [el.src]);
    if (!htmlImg) return null;
    return <KonvaImage x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation ?? 0} image={htmlImg}
        crop={el.imageCrop ? { x: el.imageCrop.x, y: el.imageCrop.y, width: el.imageCrop.w, height: el.imageCrop.h } : undefined} />;
}

function StaticQrEl({ el }: { el: Extract<StickerElement, { type: "qr" }> }) {
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
        ctx.fillStyle = "#000";
        const seed = el.value.length;
        for (let r = 0; r < 5; r++) {
            for (let c2 = 0; c2 < 5; c2++) {
                if ((r * 7 + c2 * 3 + seed) % 2 === 0) ctx.fillRect(32 + c2 * 8, 32 + r * 8, 6, 6);
            }
        }
        canvasRef.current = c;
    }
    return <KonvaImage x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation ?? 0} image={canvasRef.current ?? undefined} />;
}

function StaticElement({ el }: { el: Exclude<StickerElement, GroupElement> }) {
    if (el.type === "text" || el.type === "dynamic") {
        const fontStyle = [el.italic ? "italic" : "", el.bold ? "bold" : ""].filter(Boolean).join(" ") || "normal";
        return <Text x={el.x} y={el.y} rotation={el.rotation ?? 0} text={el.text} fontSize={el.fontSize} fill={el.fill} fontStyle={fontStyle} fontFamily={cssFontFamily(el.fontFamily ?? "Prompt")} />;
    }
    if (el.type === "rect") return (
        <Group x={el.x} y={el.y} rotation={el.rotation ?? 0}>
            <Rect x={0} y={0} width={el.width} height={el.height} fill={el.fill === "transparent" ? "" : el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} />
            {el.label && <Text x={0} y={0} width={el.width} height={el.height} text={el.label} align="center" verticalAlign="middle" fontSize={el.labelFontSize ?? 12} fill={el.labelColor ?? "#000000"} listening={false} fontFamily="'Prompt', sans-serif" />}
        </Group>
    );
    if (el.type === "line")  return <Line x={el.x} y={el.y} rotation={el.rotation ?? 0} points={el.points} stroke={el.stroke} strokeWidth={el.strokeWidth} />;
    if (el.type === "image") return <StaticImageEl el={el} />;
    if (el.type === "qr")    return <StaticQrEl el={el} />;
    if (el.type === "shape") {
        const s = el as ShapeElement;
        const cx = s.width / 2, cy = s.height / 2;
        const r = Math.min(s.width, s.height) / 2;
        const fill = s.fill === "transparent" ? "" : s.fill;
        let shapeNode: React.ReactNode;
        switch (s.kind) {
            case "circle":    shapeNode = <Circle x={cx} y={cy} radius={r} fill={fill} stroke={s.stroke} strokeWidth={s.strokeWidth} />; break;
            case "ellipse":   shapeNode = <Ellipse x={cx} y={cy} radiusX={s.width/2} radiusY={s.height/2} fill={fill} stroke={s.stroke} strokeWidth={s.strokeWidth} />; break;
            case "triangle":  shapeNode = <RegularPolygon x={cx} y={cy} sides={3} radius={r} fill={fill} stroke={s.stroke} strokeWidth={s.strokeWidth} />; break;
            case "star":      shapeNode = <KonvaStar x={cx} y={cy} numPoints={5} innerRadius={r*0.4} outerRadius={r} fill={fill} stroke={s.stroke} strokeWidth={s.strokeWidth} />; break;
            case "pentagon":  shapeNode = <RegularPolygon x={cx} y={cy} sides={5} radius={r} fill={fill} stroke={s.stroke} strokeWidth={s.strokeWidth} />; break;
            case "hexagon":   shapeNode = <RegularPolygon x={cx} y={cy} sides={6} radius={r} fill={fill} stroke={s.stroke} strokeWidth={s.strokeWidth} />; break;
            case "diamond":   shapeNode = <Line x={0} y={0} points={[cx, 0, s.width, cy, cx, s.height, 0, cy]} closed fill={fill} stroke={s.stroke} strokeWidth={s.strokeWidth} />; break;
            case "arrow":     shapeNode = <Arrow x={0} y={cy} points={[0, 0, s.width, 0]} fill={fill} stroke={s.stroke} strokeWidth={Math.max(s.strokeWidth, 2)} pointerLength={12} pointerWidth={10} />; break;
            default:          shapeNode = null;
        }
        return (
            <Group x={s.x} y={s.y} rotation={s.rotation ?? 0}>
                {shapeNode}
                {s.label && <Text x={0} y={0} width={s.width} height={s.height} text={s.label} align="center" verticalAlign="middle" fontSize={s.labelFontSize ?? 12} fill={s.labelColor ?? "#000000"} listening={false} fontFamily="'Prompt', sans-serif" />}
            </Group>
        );
    }
    return null;
}

// ─── Group node ───────────────────────────────────────────────────────────────
function GroupNode({ el, isSelected, onSelect, onChange, onRotating, onRotateEnd, onContextMenu }: {
    el: GroupElement;
    isSelected: boolean;
    onSelect: (shift?: boolean) => void;
    onChange: (updated: StickerElement) => void;
    onRotating: (label: RotLabel) => void;
    onRotateEnd: () => void;
    onContextMenu?: (clientX: number, clientY: number) => void;
}) {
    const groupRef = useRef<Konva.Group>(null);
    const trRef    = useRef<Konva.Transformer>(null);

    useEffect(() => {
        if (isSelected && trRef.current && groupRef.current) {
            trRef.current.nodes([groupRef.current]);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [isSelected]);

    const handleTransformEnd = () => {
        const node = groupRef.current!;
        const sx = node.scaleX(), sy = node.scaleY();
        node.scaleX(1); node.scaleY(1);
        const scaledChildren = el.children.map(child => {
            const base = { ...child, x: child.x * sx, y: child.y * sy };
            if ("width"    in child) (base as Record<string, unknown>).width  = Math.round((child as { width: number }).width  * sx);
            if ("height"   in child) (base as Record<string, unknown>).height = Math.round((child as { height: number }).height * sy);
            if ("fontSize" in child) (base as Record<string, unknown>).fontSize = Math.round((child as { fontSize: number }).fontSize * Math.min(sx, sy));
            if ("points"   in child) (base as Record<string, unknown>).points = (child as { points: number[] }).points.map((p, i) => p * (i % 2 === 0 ? sx : sy));
            return base;
        }) as GroupElement["children"];
        onChange({ ...el, x: node.x(), y: node.y(), rotation: node.rotation(), width: Math.round(el.width * sx), height: Math.round(el.height * sy), children: scaledChildren } as StickerElement);
        onRotateEnd();
    };

    return (
        <>
            <Group ref={groupRef} id={el.id} x={el.x} y={el.y} rotation={el.rotation ?? 0} draggable
                onClick={e => onSelect(e.evt.shiftKey)} onTap={() => onSelect()}
                onContextMenu={e => { e.evt.preventDefault(); onContextMenu?.(e.evt.clientX, e.evt.clientY); }}
                onDragEnd={e => onChange({ ...el, x: e.target.x(), y: e.target.y() } as StickerElement)}
                onTransformEnd={handleTransformEnd}
            >
                {el.children.map(child => <StaticElement key={child.id} el={child} />)}
            </Group>
            {isSelected && (
                <Transformer ref={trRef}
                    rotationSnaps={ROT_SNAPS} rotationSnapTolerance={ROT_SNAP_TOLERANCE}
                    boundBoxFunc={(_, nb) => nb}
                    onTransform={() => {
                        const node = groupRef.current!;
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

// ─── Main Canvas ──────────────────────────────────────────────────────────────
interface StickerCanvasProps {
    width: number;
    height: number;
    zoom?: number;
    elements: StickerElement[];
    selectedId: string | null;
    multiSelected?: string[];
    onSelect: (id: string | null, shift?: boolean) => void;
    onChange: (updated: StickerElement) => void;
    onElementsChange: (els: StickerElement[]) => void;
    onContextMenu?: (id: string | null, clientX: number, clientY: number) => void;
}

export default function StickerCanvas({
    width, height, zoom = 1, elements, selectedId, multiSelected = [], onSelect, onChange, onContextMenu,
}: StickerCanvasProps) {
    const [guides,   setGuides]   = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
    const [rotLabel, setRotLabel] = useState<RotLabel | null>(null);
    const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const elsRef = useRef(elements);
    useEffect(() => { elsRef.current = elements; }, [elements]);

    const stageRef = useRef<Konva.Stage>(null);
    const [labelEdit, setLabelEdit] = useState<{ id: string; value: string; left: number; top: number; width: number; height: number } | null>(null);

    const onChangeRef = useRef(onChange);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

    const handleEditLabel = useCallback((id: string, node: Konva.Node) => {
        const stage = stageRef.current;
        if (!stage) return;
        const el = elsRef.current.find(e => e.id === id);
        // Dynamic (variable) elements should not be inline-edited — value is a template variable
        if (el?.type === "dynamic") return;
        const stageBox = stage.container().getBoundingClientRect();
        // getClientRect() without relativeTo returns coords in stage-container pixel space
        // (already accounting for zoom/scale), so just add the container's screen offset.
        const rect = node.getClientRect();
        // text elements use .text; shapes/rects use .label
        const value = (el?.type === "text")
            ? (el as { text?: string })?.text ?? ""
            : (el as { label?: string })?.label ?? "";
        // Use a small compact input centered on the shape, not the full bounding box
        const inputW = Math.min(Math.max(rect.width * 0.8, 100), 200);
        const inputH = 32;
        setLabelEdit({
            id, value,
            left: stageBox.left + rect.x + (rect.width - inputW) / 2,
            top: stageBox.top + rect.y + (rect.height - inputH) / 2,
            width: inputW,
            height: inputH,
        });
    }, []);

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
                ref={stageRef}
                width={Math.round((width + PAD * 2) * zoom)}
                height={Math.round((height + PAD * 2) * zoom)}
                scaleX={zoom}
                scaleY={zoom}
                onMouseDown={e => { if (e.target === e.target.getStage()) onSelect(null); }}
                onTouchStart={e => { if (e.target === e.target.getStage()) onSelect(null); }}
                onContextMenu={e => { e.evt.preventDefault(); if (e.target === e.target.getStage()) onContextMenu?.(null, e.evt.clientX, e.evt.clientY); }}
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
                                onSelect={shift => onSelect(el.id, shift)}
                                onChange={patch => onChange({ ...el, ...patch } as StickerElement)}
                                onRotating={handleRotating}
                                onRotateEnd={handleRotateEnd}
                                onContextMenu={(cx, cy) => onContextMenu?.(el.id, cx, cy)}
                            />
                        ) : el.type === "image" ? (
                            <ImageNode
                                key={el.id} el={el}
                                isSelected={selectedId === el.id}
                                onSelect={shift => onSelect(el.id, shift)}
                                onChange={onChange}
                                onRotating={handleRotating}
                                onRotateEnd={handleRotateEnd}
                                onContextMenu={(cx, cy) => onContextMenu?.(el.id, cx, cy)}
                            />
                        ) : el.type === "group" ? (
                            <GroupNode
                                key={el.id} el={el}
                                isSelected={selectedId === el.id}
                                onSelect={shift => onSelect(el.id, shift)}
                                onChange={onChange}
                                onRotating={handleRotating}
                                onRotateEnd={handleRotateEnd}
                                onContextMenu={(cx, cy) => onContextMenu?.(el.id, cx, cy)}
                            />
                        ) : (
                            <ElementNode
                                key={el.id} el={el}
                                isSelected={selectedId === el.id}
                                onSelect={shift => onSelect(el.id, shift)}
                                onChange={onChange}
                                onRotating={handleRotating}
                                onRotateEnd={handleRotateEnd}
                                onContextMenu={(cx, cy) => onContextMenu?.(el.id, cx, cy)}
                                onEditLabel={handleEditLabel}
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

                {/* Multi-select highlight overlay */}
                {multiSelected.length > 0 && (
                    <Layer x={PAD} y={PAD} listening={false}>
                        {multiSelected.map(id => {
                            const el = elements.find(e => e.id === id);
                            if (!el) return null;
                            const { x, y, w, h } = getElBounds(el);
                            return (
                                <Rect
                                    key={id}
                                    x={x} y={y}
                                    width={w} height={h}
                                    rotation={el.rotation ?? 0}
                                    stroke="#7c3aed" strokeWidth={1.5} dash={[4, 3]}
                                    fill="rgba(124,58,237,0.06)"
                                    cornerRadius={2}
                                />
                            );
                        })}
                    </Layer>
                )}
            </Stage>

            {/* ── Inline label editor ── */}
            {labelEdit && (
                <input
                    type="text"
                    style={{
                        position: "fixed",
                        left: labelEdit.left,
                        top: labelEdit.top,
                        width: labelEdit.width,
                        height: labelEdit.height,
                        background: "rgba(255,255,255,0.97)",
                        border: "2px solid #6366f1",
                        borderRadius: 6,
                        padding: "0 8px",
                        fontSize: 13,
                        zIndex: 200,
                        outline: "none",
                        textAlign: "center",
                        fontFamily: "'Prompt', sans-serif",
                        boxShadow: "0 4px 16px rgba(99,102,241,0.25)",
                    }}
                    value={labelEdit.value}
                    autoFocus
                    onChange={e => setLabelEdit(prev => prev ? { ...prev, value: e.target.value } : null)}
                    onBlur={() => {
                        if (labelEdit) {
                            const el = elsRef.current.find(e => e.id === labelEdit.id);
                            if (el) {
                                if (el.type === "text") {
                                    onChangeRef.current({ ...el, text: labelEdit.value } as StickerElement);
                                } else if (el.type === "shape" || el.type === "rect") {
                                    onChangeRef.current({ ...el, label: labelEdit.value } as StickerElement);
                                }
                            }
                            setLabelEdit(null);
                        }
                    }}
                    onKeyDown={e => {
                        if (e.key === "Escape") { setLabelEdit(null); }
                        if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
                    }}
                />
            )}

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
