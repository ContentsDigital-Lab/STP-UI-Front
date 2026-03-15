"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MousePointer2, Circle, Undo2, Redo2, RotateCcw, Pen, Focus, Hand, Square, ChevronDown, Hexagon, RectangleHorizontal, Box, Maximize2, Minimize2 } from 'lucide-react';

export type CutoutType = 'circle' | 'rectangle' | 'slot' | 'custom';

export interface HoleData {
    id: string;
    type: CutoutType;
    x: number;
    y: number;
    diameter: number;
    width?: number;
    height?: number;
    length?: number;
    points?: VertexData[];
    groupId?: string;
}

export interface VertexData {
    x: number;
    y: number;
}

interface GlassDesignerProps {
    width: number;
    height: number;
    holes: HoleData[];
    onHolesChange: (holes: HoleData[]) => void;
    vertices?: VertexData[];
    onVerticesChange?: (vertices: VertexData[]) => void;
    thickness?: number;
}

let holeCounter = 0;

function makeTextSprite(text: string, color = '#555555', vertical = false): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const fontSize = 48;
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    const metrics = ctx.measureText(text);

    if (vertical) {
        canvas.width = fontSize + 20;
        canvas.height = Math.ceil(metrics.width) + 20;
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.fillText(text, 0, 0);
    } else {
        canvas.width = Math.ceil(metrics.width) + 20;
        canvas.height = fontSize + 20;
        ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.userData.screenWidth = canvas.width;
    sprite.userData.screenHeight = canvas.height;
    sprite.scale.set(canvas.width / 3, canvas.height / 3, 1);
    return sprite;
}

function makeDimensionLine(
    group: THREE.Group,
    start: THREE.Vector3,
    end: THREE.Vector3,
    label: string,
    offset: number,
    direction: 'horizontal' | 'vertical',
    color = 0x888888
) {
    const lineMat = new THREE.LineBasicMaterial({ color });
    const arrowLen = 4;

    let p1: THREE.Vector3, p2: THREE.Vector3;
    let extS1: THREE.Vector3, extS2: THREE.Vector3, extE1: THREE.Vector3, extE2: THREE.Vector3;

    if (direction === 'horizontal') {
        p1 = new THREE.Vector3(start.x, start.y + offset, 0);
        p2 = new THREE.Vector3(end.x, end.y + offset, 0);
        extS1 = new THREE.Vector3(start.x, start.y, 0);
        extS2 = new THREE.Vector3(start.x, start.y + offset, 0);
        extE1 = new THREE.Vector3(end.x, end.y, 0);
        extE2 = new THREE.Vector3(end.x, end.y + offset, 0);
    } else {
        p1 = new THREE.Vector3(start.x + offset, start.y, 0);
        p2 = new THREE.Vector3(end.x + offset, end.y, 0);
        extS1 = new THREE.Vector3(start.x, start.y, 0);
        extS2 = new THREE.Vector3(start.x + offset, start.y, 0);
        extE1 = new THREE.Vector3(end.x, end.y, 0);
        extE2 = new THREE.Vector3(end.x + offset, end.y, 0);
    }

    const mid = new THREE.Vector3().lerpVectors(p1, p2, 0.5);

    const gapLine1 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, mid]), lineMat);
    const gapLine2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([mid, p2]), lineMat);
    group.add(gapLine1);
    group.add(gapLine2);

    const ext1Geo = new THREE.BufferGeometry().setFromPoints([extS1, extS2]);
    const ext2Geo = new THREE.BufferGeometry().setFromPoints([extE1, extE2]);
    group.add(new THREE.Line(ext1Geo, lineMat));
    group.add(new THREE.Line(ext2Geo, lineMat));

    const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
    const perp = direction === 'horizontal'
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);

    const arrowPoints1 = [
        p1,
        new THREE.Vector3().copy(p1).add(dir.clone().multiplyScalar(arrowLen)).add(perp.clone().multiplyScalar(arrowLen * 0.4)),
        new THREE.Vector3().copy(p1).add(dir.clone().multiplyScalar(arrowLen)).sub(perp.clone().multiplyScalar(arrowLen * 0.4)),
        p1,
    ];
    const arrowPoints2 = [
        p2,
        new THREE.Vector3().copy(p2).sub(dir.clone().multiplyScalar(arrowLen)).add(perp.clone().multiplyScalar(arrowLen * 0.4)),
        new THREE.Vector3().copy(p2).sub(dir.clone().multiplyScalar(arrowLen)).sub(perp.clone().multiplyScalar(arrowLen * 0.4)),
        p2,
    ];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arrowPoints1), lineMat));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arrowPoints2), lineMat));

    const labelColor = `#${color.toString(16).padStart(6, '0')}`;
    const sprite = makeTextSprite(label, labelColor, direction === 'vertical');
    sprite.position.copy(mid);
    sprite.position.z = 0.5;
    sprite.userData.gapLine1 = gapLine1;
    sprite.userData.gapLine2 = gapLine2;
    sprite.userData.lineP1 = p1.clone();
    sprite.userData.lineP2 = p2.clone();
    sprite.userData.lineDirection = direction;
    group.add(sprite);
}

function getDefaultVertices(w: number, h: number): VertexData[] {
    return [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
    ];
}

function getBoundingBox(verts: VertexData[]) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const v of verts) {
        if (v.x < minX) minX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.x > maxX) maxX = v.x;
        if (v.y > maxY) maxY = v.y;
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return { dist: Math.sqrt((px - ax) ** 2 + (py - ay) ** 2), t: 0 };
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    return { dist: Math.sqrt((px - projX) ** 2 + (py - projY) ** 2), t };
}

function isPointInPolygon(px: number, py: number, verts: VertexData[]): boolean {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
        const xi = verts[i].x, yi = verts[i].y;
        const xj = verts[j].x, yj = verts[j].y;
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

function makeCutoutPath(h: HoleData): THREE.Path {
    const path = new THREE.Path();
    if (h.type === 'rectangle') {
        const w = h.width || 100;
        const ht = h.height || 60;
        path.moveTo(h.x - w / 2, h.y - ht / 2);
        path.lineTo(h.x + w / 2, h.y - ht / 2);
        path.lineTo(h.x + w / 2, h.y + ht / 2);
        path.lineTo(h.x - w / 2, h.y + ht / 2);
        path.closePath();
    } else if (h.type === 'slot') {
        const len = h.length || 80;
        const w = h.width || 20;
        const r = w / 2;
        const halfBody = (len - w) / 2;
        path.moveTo(h.x - halfBody, h.y - r);
        path.lineTo(h.x + halfBody, h.y - r);
        path.absarc(h.x + halfBody, h.y, r, -Math.PI / 2, Math.PI / 2, false);
        path.lineTo(h.x - halfBody, h.y + r);
        path.absarc(h.x - halfBody, h.y, r, Math.PI / 2, -Math.PI / 2, false);
        path.closePath();
    } else if (h.type === 'custom' && h.points && h.points.length >= 3) {
        const pts = h.points;
        path.moveTo(h.x + pts[0].x, h.y + pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            path.lineTo(h.x + pts[i].x, h.y + pts[i].y);
        }
        path.closePath();
    } else {
        path.absarc(h.x, h.y, h.diameter / 2, 0, Math.PI * 2, false);
    }
    return path;
}

function getCutoutOutlinePoints(h: HoleData, z: number): THREE.Vector3[] {
    if (h.type === 'rectangle') {
        const w = h.width || 100;
        const ht = h.height || 60;
        return [
            new THREE.Vector3(h.x - w / 2, h.y - ht / 2, z),
            new THREE.Vector3(h.x + w / 2, h.y - ht / 2, z),
            new THREE.Vector3(h.x + w / 2, h.y + ht / 2, z),
            new THREE.Vector3(h.x - w / 2, h.y + ht / 2, z),
            new THREE.Vector3(h.x - w / 2, h.y - ht / 2, z),
        ];
    } else if (h.type === 'slot') {
        const len = h.length || 80;
        const w = h.width || 20;
        const r = w / 2;
        const halfBody = (len - w) / 2;
        const pts: THREE.Vector3[] = [];
        pts.push(new THREE.Vector3(h.x - halfBody, h.y - r, z));
        pts.push(new THREE.Vector3(h.x + halfBody, h.y - r, z));
        const segments = 16;
        for (let i = 0; i <= segments; i++) {
            const angle = -Math.PI / 2 + (Math.PI * i) / segments;
            pts.push(new THREE.Vector3(h.x + halfBody + Math.cos(angle) * r, h.y + Math.sin(angle) * r, z));
        }
        pts.push(new THREE.Vector3(h.x - halfBody, h.y + r, z));
        for (let i = 0; i <= segments; i++) {
            const angle = Math.PI / 2 + (Math.PI * i) / segments;
            pts.push(new THREE.Vector3(h.x - halfBody + Math.cos(angle) * r, h.y + Math.sin(angle) * r, z));
        }
        return pts;
    } else if (h.type === 'custom' && h.points && h.points.length >= 3) {
        const pts = h.points.map(p => new THREE.Vector3(h.x + p.x, h.y + p.y, z));
        pts.push(pts[0].clone());
        return pts;
    } else {
        const segs = 48;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= segs; i++) {
            const angle = (i / segs) * Math.PI * 2;
            pts.push(new THREE.Vector3(h.x + Math.cos(angle) * h.diameter / 2, h.y + Math.sin(angle) * h.diameter / 2, z));
        }
        return pts;
    }
}

function getCutoutLabel(h: HoleData): string {
    if (h.type === 'rectangle') return `${h.width || 100}×${h.height || 60}`;
    if (h.type === 'slot') return `${h.length || 80}×${h.width || 20}`;
    if (h.type === 'custom') return `${h.points?.length || 0}pts`;
    return `⌀${h.diameter}`;
}

function isPointInCutout(px: number, py: number, h: HoleData): boolean {
    if (h.type === 'rectangle') {
        const w = h.width || 100;
        const ht = h.height || 60;
        return Math.abs(px - h.x) <= w / 2 + 3 && Math.abs(py - h.y) <= ht / 2 + 3;
    } else if (h.type === 'slot') {
        const len = h.length || 80;
        const w = h.width || 20;
        const r = w / 2 + 3;
        const halfBody = (len - w) / 2;
        if (Math.abs(py - h.y) <= r && px >= h.x - halfBody && px <= h.x + halfBody) return true;
        const dl = Math.sqrt((px - (h.x - halfBody)) ** 2 + (py - h.y) ** 2);
        const dr = Math.sqrt((px - (h.x + halfBody)) ** 2 + (py - h.y) ** 2);
        return dl <= r || dr <= r;
    } else if (h.type === 'custom' && h.points && h.points.length >= 3) {
        const absPoints = h.points.map(p => ({ x: h.x + p.x, y: h.y + p.y }));
        return isPointInPolygon(px, py, absPoints);
    } else {
        const dx = px - h.x;
        const dy = py - h.y;
        return Math.sqrt(dx * dx + dy * dy) <= h.diameter / 2 + 3;
    }
}

function getCutoutResizeHandles(h: HoleData): { x: number; y: number; axis?: string }[] {
    if (h.type === 'rectangle') {
        const w = h.width || 100;
        const ht = h.height || 60;
        return [
            { x: h.x + w / 2, y: h.y, axis: 'right' },
            { x: h.x - w / 2, y: h.y, axis: 'left' },
            { x: h.x, y: h.y + ht / 2, axis: 'top' },
            { x: h.x, y: h.y - ht / 2, axis: 'bottom' },
            { x: h.x + w / 2, y: h.y + ht / 2, axis: 'tr' },
            { x: h.x - w / 2, y: h.y + ht / 2, axis: 'tl' },
            { x: h.x + w / 2, y: h.y - ht / 2, axis: 'br' },
            { x: h.x - w / 2, y: h.y - ht / 2, axis: 'bl' },
        ];
    } else if (h.type === 'slot') {
        const len = h.length || 80;
        const w = h.width || 20;
        const halfBody = (len - w) / 2;
        return [
            { x: h.x + halfBody + w / 2, y: h.y, axis: 'length-right' },
            { x: h.x - halfBody - w / 2, y: h.y, axis: 'length-left' },
            { x: h.x, y: h.y + w / 2, axis: 'width-top' },
            { x: h.x, y: h.y - w / 2, axis: 'width-bottom' },
        ];
    } else if (h.type === 'custom' && h.points && h.points.length >= 3) {
        return h.points.map((p, i) => ({ x: h.x + p.x, y: h.y + p.y, axis: `pt-${i}` }));
    } else {
        const r = h.diameter / 2;
        return [
            { x: h.x + r, y: h.y },
            { x: h.x - r, y: h.y },
            { x: h.x, y: h.y + r },
            { x: h.x, y: h.y - r },
        ];
    }
}

function getCutoutBounds(h: HoleData): { minX: number; minY: number; maxX: number; maxY: number } {
    if (h.type === 'rectangle') {
        const w = h.width || 100, ht = h.height || 60;
        return { minX: h.x - w / 2, minY: h.y - ht / 2, maxX: h.x + w / 2, maxY: h.y + ht / 2 };
    } else if (h.type === 'slot') {
        const len = h.length || 80, w = h.width || 20;
        return { minX: h.x - len / 2, minY: h.y - w / 2, maxX: h.x + len / 2, maxY: h.y + w / 2 };
    } else if (h.type === 'custom' && h.points && h.points.length >= 3) {
        let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
        for (const p of h.points) {
            mnX = Math.min(mnX, h.x + p.x); mnY = Math.min(mnY, h.y + p.y);
            mxX = Math.max(mxX, h.x + p.x); mxY = Math.max(mxY, h.y + p.y);
        }
        return { minX: mnX, minY: mnY, maxX: mxX, maxY: mxY };
    } else {
        const r = h.diameter / 2;
        return { minX: h.x - r, minY: h.y - r, maxX: h.x + r, maxY: h.y + r };
    }
}

function makeClippedCutoutPath(h: HoleData, glassBB: { minX: number; minY: number; maxX: number; maxY: number }, eps = 0.01): THREE.Path {
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const lo = { x: glassBB.minX + eps, y: glassBB.minY + eps };
    const hi = { x: glassBB.maxX - eps, y: glassBB.maxY - eps };

    const clipPts = (pts: { x: number; y: number }[]): { x: number; y: number }[] => {
        const clipped = pts.map(p => ({ x: clamp(p.x, lo.x, hi.x), y: clamp(p.y, lo.y, hi.y) }));
        const deduped: { x: number; y: number }[] = [clipped[0]];
        for (let i = 1; i < clipped.length; i++) {
            const prev = deduped[deduped.length - 1];
            if (Math.abs(clipped[i].x - prev.x) > 0.01 || Math.abs(clipped[i].y - prev.y) > 0.01) {
                deduped.push(clipped[i]);
            }
        }
        return deduped.length >= 3 ? deduped : clipped;
    };

    const path = new THREE.Path();

    if (h.type === 'rectangle') {
        const w = h.width || 100, ht = h.height || 60;
        const pts = [
            { x: h.x - w / 2, y: h.y - ht / 2 },
            { x: h.x + w / 2, y: h.y - ht / 2 },
            { x: h.x + w / 2, y: h.y + ht / 2 },
            { x: h.x - w / 2, y: h.y + ht / 2 },
        ];
        const c = clipPts(pts);
        path.moveTo(c[0].x, c[0].y);
        for (let i = 1; i < c.length; i++) path.lineTo(c[i].x, c[i].y);
        path.closePath();
    } else if (h.type === 'slot') {
        const len = h.length || 80, w = h.width || 20;
        const r = w / 2, halfBody = (len - w) / 2;
        const segs = 12;
        const pts: { x: number; y: number }[] = [];
        pts.push({ x: h.x - halfBody, y: h.y - r });
        pts.push({ x: h.x + halfBody, y: h.y - r });
        for (let i = 0; i <= segs; i++) {
            const a = -Math.PI / 2 + (Math.PI * i) / segs;
            pts.push({ x: h.x + halfBody + Math.cos(a) * r, y: h.y + Math.sin(a) * r });
        }
        pts.push({ x: h.x - halfBody, y: h.y + r });
        for (let i = 0; i <= segs; i++) {
            const a = Math.PI / 2 + (Math.PI * i) / segs;
            pts.push({ x: h.x - halfBody + Math.cos(a) * r, y: h.y + Math.sin(a) * r });
        }
        const c = clipPts(pts);
        path.moveTo(c[0].x, c[0].y);
        for (let i = 1; i < c.length; i++) path.lineTo(c[i].x, c[i].y);
        path.closePath();
    } else if (h.type === 'custom' && h.points && h.points.length >= 3) {
        const pts = h.points.map(p => ({ x: h.x + p.x, y: h.y + p.y }));
        const c = clipPts(pts);
        path.moveTo(c[0].x, c[0].y);
        for (let i = 1; i < c.length; i++) path.lineTo(c[i].x, c[i].y);
        path.closePath();
    } else {
        const r = h.diameter / 2;
        const needsClip = h.x - r < glassBB.minX || h.x + r > glassBB.maxX ||
                          h.y - r < glassBB.minY || h.y + r > glassBB.maxY;
        if (!needsClip) {
            path.absarc(h.x, h.y, r, 0, Math.PI * 2, false);
            return path;
        }
        const segs = 48;
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            pts.push({ x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r });
        }
        const c = clipPts(pts);
        path.moveTo(c[0].x, c[0].y);
        for (let i = 1; i < c.length; i++) path.lineTo(c[i].x, c[i].y);
        path.closePath();
    }
    return path;
}

export function GlassDesigner({ width, height, holes, onHolesChange, vertices: externalVertices, onVerticesChange, thickness: glassMmThickness }: GlassDesignerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const glassGroupRef = useRef(new THREE.Group());
    const glassMeshRef = useRef<THREE.Mesh | null>(null);

    const [activeTool, setActiveTool] = useState<'select' | 'addHole' | 'editVertex' | 'move'>('select');
    const [selectedHoleId, setSelectedHoleId] = useState<string | null>(null);
    const [selectedHoleIds, setSelectedHoleIds] = useState<Set<string>>(new Set());
    const [holeDiameter, setHoleDiameter] = useState(20);
    const [selectedVertexIdx, setSelectedVertexIdx] = useState<number | null>(null);
    const [cutoutShape, setCutoutShape] = useState<CutoutType>('circle');
    const [cutoutWidth, setCutoutWidth] = useState(100);
    const [cutoutHeight, setCutoutHeight] = useState(60);
    const [cutoutLength, setCutoutLength] = useState(80);
    const [cutoutSlotWidth, setCutoutSlotWidth] = useState(20);
    const [isDrawingCustom, setIsDrawingCustom] = useState(false);
    const [customDrawPoints, setCustomDrawPoints] = useState<VertexData[]>([]);
    const [show3DPreview, setShow3DPreview] = useState(true);
    const [cutoutMenuOpen, setCutoutMenuOpen] = useState(false);
    const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null);
    const [previewExpanded, setPreviewExpanded] = useState(false);
    const previewDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

    const preview3DRef = useRef<HTMLDivElement>(null);
    const previewRendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const previewSceneRef = useRef<THREE.Scene | null>(null);
    const previewCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const previewControlsRef = useRef<OrbitControls | null>(null);
    const previewAnimFrameRef = useRef<number>(0);
    const preview3DInitRef = useRef(false);
    const build3DSceneRef = useRef<() => void>(() => {});

    const internalVertices = externalVertices ?? getDefaultVertices(width, height);

    const undoStackRef = useRef<{ holes: HoleData[]; vertices: VertexData[] }[]>([]);
    const redoStackRef = useRef<{ holes: HoleData[]; vertices: VertexData[] }[]>([]);

    const isDraggingRef = useRef(false);
    const isPanningRef = useRef(false);
    const dragHoleIdRef = useRef<string | null>(null);
    const dragVertexIdxRef = useRef<number | null>(null);
    const isResizingHoleRef = useRef(false);
    const resizeHoleIdRef = useRef<string | null>(null);
    const resizeAxisRef = useRef<string | undefined>(undefined);
    const isMovingGlassRef = useRef(false);
    const moveStartRef = useRef<{ x: number; y: number } | null>(null);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const panStartRef = useRef({ x: 0, y: 0 });
    const camStartRef = useRef({ cx: 0, cy: 0 });

    const gridObjRef = useRef<THREE.LineSegments | null>(null);

    const normalizedHoles = holes.map(h => ({ ...h, type: h.type || 'circle' as CutoutType }));
    const holesRef = useRef(normalizedHoles);
    holesRef.current = normalizedHoles;

    const activeToolRef = useRef(activeTool);
    activeToolRef.current = activeTool;

    const selectedHoleIdRef = useRef(selectedHoleId);
    selectedHoleIdRef.current = selectedHoleId;

    const selectedHoleIdsRef = useRef(selectedHoleIds);
    selectedHoleIdsRef.current = selectedHoleIds;

    const holeDiameterRef = useRef(holeDiameter);
    holeDiameterRef.current = holeDiameter;

    const cutoutShapeRef = useRef(cutoutShape);
    cutoutShapeRef.current = cutoutShape;
    const cutoutWidthRef = useRef(cutoutWidth);
    cutoutWidthRef.current = cutoutWidth;
    const cutoutHeightRef = useRef(cutoutHeight);
    cutoutHeightRef.current = cutoutHeight;
    const cutoutLengthRef = useRef(cutoutLength);
    cutoutLengthRef.current = cutoutLength;
    const cutoutSlotWidthRef = useRef(cutoutSlotWidth);
    cutoutSlotWidthRef.current = cutoutSlotWidth;
    const isDrawingCustomRef = useRef(isDrawingCustom);
    isDrawingCustomRef.current = isDrawingCustom;
    const customDrawPointsRef = useRef(customDrawPoints);
    customDrawPointsRef.current = customDrawPoints;

    const verticesRef = useRef(internalVertices);
    verticesRef.current = internalVertices;

    const selectedVertexIdxRef = useRef(selectedVertexIdx);
    selectedVertexIdxRef.current = selectedVertexIdx;

    const pushUndo = useCallback(() => {
        undoStackRef.current.push({
            holes: JSON.parse(JSON.stringify(holesRef.current)),
            vertices: JSON.parse(JSON.stringify(verticesRef.current)),
        });
        if (undoStackRef.current.length > 50) undoStackRef.current.shift();
        redoStackRef.current = [];
    }, []);

    const setVertices = useCallback((verts: VertexData[]) => {
        if (onVerticesChange) {
            onVerticesChange(verts);
        }
    }, [onVerticesChange]);

    const renderScene = useCallback(() => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (!renderer || !scene || !camera) return;

        // Dynamic infinite grid based on visible world area
        if (gridObjRef.current) {
            scene.remove(gridObjRef.current);
            gridObjRef.current.geometry.dispose();
        }
        const topLeftWorld = new THREE.Vector3(-1, 1, 0).unproject(camera);
        const bottomRightWorld = new THREE.Vector3(1, -1, 0).unproject(camera);
        const gridStep = 50;
        const pad = gridStep * 2;
        const gLeft = Math.floor((Math.min(topLeftWorld.x, bottomRightWorld.x) - pad) / gridStep) * gridStep;
        const gRight = Math.ceil((Math.max(topLeftWorld.x, bottomRightWorld.x) + pad) / gridStep) * gridStep;
        const gBottom = Math.floor((Math.min(topLeftWorld.y, bottomRightWorld.y) - pad) / gridStep) * gridStep;
        const gTop = Math.ceil((Math.max(topLeftWorld.y, bottomRightWorld.y) + pad) / gridStep) * gridStep;
        const gridLines: THREE.Vector3[] = [];
        for (let x = gLeft; x <= gRight; x += gridStep) {
            gridLines.push(new THREE.Vector3(x, gBottom, -0.2), new THREE.Vector3(x, gTop, -0.2));
        }
        for (let y = gBottom; y <= gTop; y += gridStep) {
            gridLines.push(new THREE.Vector3(gLeft, y, -0.2), new THREE.Vector3(gRight, y, -0.2));
        }
        const gridGeo = new THREE.BufferGeometry().setFromPoints(gridLines);
        const gridMat = new THREE.LineBasicMaterial({ color: 0xeeeeee });
        const gridObj = new THREE.LineSegments(gridGeo, gridMat);
        gridObjRef.current = gridObj;
        scene.add(gridObj);

        const frustumWidth = camera.right - camera.left;
        const canvasWidth = renderer.domElement.clientWidth;
        const worldPerPixel = frustumWidth / canvasWidth;
        const scaleFactor = worldPerPixel * 0.45;

        glassGroupRef.current.traverse((obj) => {
            if (obj instanceof THREE.Sprite && obj.userData.screenWidth) {
                const sw = obj.userData.screenWidth * scaleFactor;
                const sh = obj.userData.screenHeight * scaleFactor;
                obj.scale.set(sw, sh, 1);

                if (obj.userData.gapLine1 && obj.userData.gapLine2) {
                    const p1 = obj.userData.lineP1 as THREE.Vector3;
                    const p2 = obj.userData.lineP2 as THREE.Vector3;
                    const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
                    const halfGap = ((obj.userData.lineDirection === 'horizontal' ? sw : sh) / 2) + 3 * scaleFactor;
                    const spritePos = new THREE.Vector3(obj.position.x, obj.position.y, p1.z);

                    const gapStart = spritePos.clone().sub(dir.clone().multiplyScalar(halfGap));
                    const gapEnd = spritePos.clone().add(dir.clone().multiplyScalar(halfGap));

                    const pos1 = obj.userData.gapLine1.geometry.attributes.position;
                    pos1.setXYZ(0, p1.x, p1.y, p1.z);
                    pos1.setXYZ(1, gapStart.x, gapStart.y, gapStart.z);
                    pos1.needsUpdate = true;

                    const pos2 = obj.userData.gapLine2.geometry.attributes.position;
                    pos2.setXYZ(0, gapEnd.x, gapEnd.y, gapEnd.z);
                    pos2.setXYZ(1, p2.x, p2.y, p2.z);
                    pos2.needsUpdate = true;
                }
            }
        });

        renderer.render(scene, camera);
    }, []);

    const getWorldPos = useCallback((clientX: number, clientY: number): THREE.Vector3 | null => {
        const renderer = rendererRef.current;
        const camera = cameraRef.current;
        if (!renderer || !camera) return null;

        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const point = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, point);
        return point;
    }, []);

    const findHoleAtPos = useCallback((wx: number, wy: number): string | null => {
        for (const h of holesRef.current) {
            if (isPointInCutout(wx, wy, h)) return h.id;
        }
        return null;
    }, []);

    const findVertexAtPos = useCallback((wx: number, wy: number): number | null => {
        const camera = cameraRef.current;
        const renderer = rendererRef.current;
        if (!camera || !renderer) return null;
        const frustumWidth = camera.right - camera.left;
        const canvasWidth = renderer.domElement.clientWidth;
        const worldPerPixel = frustumWidth / canvasWidth;
        const hitRadius = 8 * worldPerPixel;

        for (let i = 0; i < verticesRef.current.length; i++) {
            const v = verticesRef.current[i];
            const dx = wx - v.x;
            const dy = wy - v.y;
            if (Math.sqrt(dx * dx + dy * dy) <= hitRadius) {
                return i;
            }
        }
        return null;
    }, []);

    const findEdgeAtPos = useCallback((wx: number, wy: number): { edgeIdx: number; t: number } | null => {
        const camera = cameraRef.current;
        const renderer = rendererRef.current;
        if (!camera || !renderer) return null;
        const frustumWidth = camera.right - camera.left;
        const canvasWidth = renderer.domElement.clientWidth;
        const worldPerPixel = frustumWidth / canvasWidth;
        const hitDist = 6 * worldPerPixel;

        const verts = verticesRef.current;
        let bestDist = Infinity;
        let bestEdge: { edgeIdx: number; t: number } | null = null;

        for (let i = 0; i < verts.length; i++) {
            const j = (i + 1) % verts.length;
            const { dist, t } = pointToSegmentDist(wx, wy, verts[i].x, verts[i].y, verts[j].x, verts[j].y);
            if (dist < hitDist && dist < bestDist && t > 0.05 && t < 0.95) {
                bestDist = dist;
                bestEdge = { edgeIdx: i, t };
            }
        }
        return bestEdge;
    }, []);

    const findHoleHandleAtPos = useCallback((wx: number, wy: number): { id: string; axis?: string } | null => {
        const camera = cameraRef.current;
        const renderer = rendererRef.current;
        if (!camera || !renderer) return null;
        const frustumWidth = camera.right - camera.left;
        const canvasWidth = renderer.domElement.clientWidth;
        const worldPerPixel = frustumWidth / canvasWidth;
        const hitRadius = 8 * worldPerPixel;

        for (const h of holesRef.current) {
            if (activeToolRef.current !== 'editVertex' && h.id !== selectedHoleIdRef.current) continue;
            const handles = getCutoutResizeHandles(h);
            for (const handle of handles) {
                const dx = wx - handle.x;
                const dy = wy - handle.y;
                if (Math.sqrt(dx * dx + dy * dy) <= hitRadius) {
                    return { id: h.id, axis: handle.axis };
                }
            }
        }
        return null;
    }, []);

    const buildGlassScene = useCallback(() => {
        const group = glassGroupRef.current;
        while (group.children.length) group.remove(group.children[0]);

        const verts = verticesRef.current;
        const bb = getBoundingBox(verts);

        // Glass panel shape from vertices — use CSG to avoid triangulation artifacts with overlapping holes
        const glassShape = new THREE.Shape();
        glassShape.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) {
            glassShape.lineTo(verts[i].x, verts[i].y);
        }
        glassShape.closePath();

        const extrudeSettings = { depth: 3, bevelEnabled: false };
        const glassMat = new THREE.MeshPhongMaterial({
            color: 0xadd8e6,
            transparent: true,
            opacity: 0.45,
            side: THREE.DoubleSide,
        });

        let glassMesh: THREE.Mesh;
        if (holesRef.current.length > 0) {
            const csgEvaluator = new Evaluator();
            const glassGeo = new THREE.ExtrudeGeometry(glassShape, extrudeSettings);
            let currentBrush: Brush = new Brush(glassGeo, glassMat);
            currentBrush.updateMatrixWorld(true);

            for (const h of holesRef.current) {
                const cutPath = makeCutoutPath(h);
                const cutShape = new THREE.Shape();
                const pts = cutPath.getPoints(48);
                cutShape.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) cutShape.lineTo(pts[i].x, pts[i].y);
                cutShape.closePath();

                const cutGeo = new THREE.ExtrudeGeometry(cutShape, { depth: 7, bevelEnabled: false });
                const cutBrush = new Brush(cutGeo, glassMat);
                cutBrush.position.set(0, 0, -2);
                cutBrush.updateMatrixWorld(true);

                try {
                    currentBrush = csgEvaluator.evaluate(currentBrush, cutBrush, SUBTRACTION);
                } catch { /* fallback: skip failed cutout */ }
                cutGeo.dispose();
            }
            currentBrush.material = glassMat;
            glassMesh = currentBrush;
        } else {
            const glassGeo = new THREE.ExtrudeGeometry(glassShape, extrudeSettings);
            glassMesh = new THREE.Mesh(glassGeo, glassMat);
        }
        glassMeshRef.current = glassMesh;
        group.add(glassMesh);

        // Glass border
        const borderPoints = verts.map(v => new THREE.Vector3(v.x, v.y, 3.1));
        borderPoints.push(new THREE.Vector3(verts[0].x, verts[0].y, 3.1));
        const borderMat = new THREE.LineBasicMaterial({ color: 0x1B4B9A, linewidth: 2 });
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(borderPoints), borderMat));

        // Vertex handles (only in editVertex mode)
        if (activeToolRef.current === 'editVertex') {
            const camera = cameraRef.current;
            const renderer = rendererRef.current;
            const handleSize = camera && renderer
                ? ((camera.right - camera.left) / renderer.domElement.clientWidth) * 6
                : 5;

            verts.forEach((v, idx) => {
                const isSelected = idx === selectedVertexIdxRef.current;
                const handleColor = isSelected ? 0xE8601C : 0x1B4B9A;
                const handleMat = new THREE.LineBasicMaterial({ color: handleColor, linewidth: 2 });

                const s = handleSize;
                const squarePoints = [
                    new THREE.Vector3(v.x - s, v.y - s, 4),
                    new THREE.Vector3(v.x + s, v.y - s, 4),
                    new THREE.Vector3(v.x + s, v.y + s, 4),
                    new THREE.Vector3(v.x - s, v.y + s, 4),
                    new THREE.Vector3(v.x - s, v.y - s, 4),
                ];
                group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(squarePoints), handleMat));

                if (isSelected) {
                    const fillGeo = new THREE.PlaneGeometry(s * 2, s * 2);
                    const fillMat = new THREE.MeshBasicMaterial({ color: 0xE8601C, transparent: true, opacity: 0.3, depthTest: false });
                    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
                    fillMesh.position.set(v.x, v.y, 3.9);
                    group.add(fillMesh);
                }
            });

            // Edge midpoint indicators (small diamonds showing where you can add vertices)
            for (let i = 0; i < verts.length; i++) {
                const j = (i + 1) % verts.length;
                const mx = (verts[i].x + verts[j].x) / 2;
                const my = (verts[i].y + verts[j].y) / 2;
                const ds = handleSize * 0.6;
                const diamondPoints = [
                    new THREE.Vector3(mx, my - ds, 4),
                    new THREE.Vector3(mx + ds, my, 4),
                    new THREE.Vector3(mx, my + ds, 4),
                    new THREE.Vector3(mx - ds, my, 4),
                    new THREE.Vector3(mx, my - ds, 4),
                ];
                const diamondMat = new THREE.LineBasicMaterial({ color: 0x22aa44 });
                group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(diamondPoints), diamondMat));
            }
        }

        // Cutout visual markers
        holesRef.current.forEach(h => {
            const isSelected = h.id === selectedHoleIdRef.current || selectedHoleIdsRef.current.has(h.id);
            const isGrouped = !!h.groupId;
            const ringColor = isSelected ? 0xE8601C : isGrouped ? 0x6366f1 : 0xd44800;

            const outlinePoints = getCutoutOutlinePoints(h, 3.2);
            const ringMat = new THREE.LineBasicMaterial({ color: ringColor, linewidth: 2 });
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outlinePoints), ringMat));

            const crossMat = new THREE.LineBasicMaterial({ color: isSelected ? 0xE8601C : 0xcc6644, linewidth: 1 });
            let chLen = 4;
            if (h.type === 'circle') chLen = h.diameter / 2 + 4;
            else if (h.type === 'rectangle') chLen = Math.max(h.width || 100, h.height || 60) / 2 + 4;
            else if (h.type === 'slot') chLen = (h.length || 80) / 2 + 4;
            else if (h.type === 'custom' && h.points?.length) {
                const maxR = Math.max(...h.points.map(p => Math.sqrt(p.x * p.x + p.y * p.y)));
                chLen = maxR + 4;
            }
            const crossPoints = [
                new THREE.Vector3(h.x - chLen, h.y, 3.2), new THREE.Vector3(h.x + chLen, h.y, 3.2),
                new THREE.Vector3(h.x, h.y - chLen, 3.2), new THREE.Vector3(h.x, h.y + chLen, 3.2),
            ];
            group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(crossPoints), crossMat));

            const labelText = getCutoutLabel(h);
            const hLabel = makeTextSprite(labelText, isSelected ? '#E8601C' : '#aa5533');
            let labelOffsetY = 28;
            if (h.type === 'circle') labelOffsetY = h.diameter / 2 + 28;
            else if (h.type === 'rectangle') labelOffsetY = (h.height || 60) / 2 + 28;
            else if (h.type === 'slot') labelOffsetY = (h.width || 20) / 2 + 28;
            else if (h.type === 'custom' && h.points?.length) {
                labelOffsetY = Math.max(...h.points.map(p => Math.abs(p.y))) + 28;
            }
            hLabel.position.set(h.x, h.y - labelOffsetY, 3.3);
            group.add(hLabel);

            const showHandles = activeToolRef.current === 'editVertex' || (isSelected && activeToolRef.current === 'select');
            if (showHandles) {
                const camera = cameraRef.current;
                const renderer = rendererRef.current;
                const handleSize = camera && renderer
                    ? ((camera.right - camera.left) / renderer.domElement.clientWidth) * 6
                    : 5;
                const handles = getCutoutResizeHandles(h);
                handles.forEach(hp => {
                    const s = handleSize;
                    const squarePoints = [
                        new THREE.Vector3(hp.x - s, hp.y - s, 4),
                        new THREE.Vector3(hp.x + s, hp.y - s, 4),
                        new THREE.Vector3(hp.x + s, hp.y + s, 4),
                        new THREE.Vector3(hp.x - s, hp.y + s, 4),
                        new THREE.Vector3(hp.x - s, hp.y - s, 4),
                    ];
                    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(squarePoints), new THREE.LineBasicMaterial({ color: 0xE8601C })));
                    const fillGeo = new THREE.PlaneGeometry(s * 2, s * 2);
                    const fillMat = new THREE.MeshBasicMaterial({ color: 0xE8601C, transparent: true, opacity: 0.35, depthTest: false });
                    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
                    fillMesh.position.set(hp.x, hp.y, 3.9);
                    group.add(fillMesh);
                });
            }

            // Horizontal line from right edge to hole at hole's Y level (two segments with gap)
            const holeDimMatH = new THREE.LineBasicMaterial({ color: 0xcc8855 });
            const dimEdgeXH = bb.maxX + 50;
            const hLineP1 = new THREE.Vector3(h.x, h.y, 3.2);
            const hLineP2 = new THREE.Vector3(dimEdgeXH, h.y, 3.2);
            const hLineMid = new THREE.Vector3((h.x + bb.maxX) / 2, h.y, 3.2);
            const hGapLine1 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([hLineP1, hLineMid]), holeDimMatH);
            const hGapLine2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([hLineMid, hLineP2]), holeDimMatH);
            group.add(hGapLine1);
            group.add(hGapLine2);
            const hDimLabel = makeTextSprite(`${Math.round(bb.maxX - h.x)}`, '#cc8855');
            hDimLabel.position.set((h.x + bb.maxX) / 2, h.y, 3.3);
            hDimLabel.userData.gapLine1 = hGapLine1;
            hDimLabel.userData.gapLine2 = hGapLine2;
            hDimLabel.userData.lineP1 = hLineP1.clone();
            hDimLabel.userData.lineP2 = hLineP2.clone();
            hDimLabel.userData.lineDirection = 'horizontal';
            group.add(hDimLabel);
        });

        // Chained vertical dimensions on right side (between consecutive holes)
        if (holesRef.current.length > 0) {
            const holeDimMat = new THREE.LineBasicMaterial({ color: 0xcc8855 });
            const dimEdgeX = bb.maxX + 50;
            const tick = 4;
            const sortedHoles = [...holesRef.current].sort((a, b) => a.y - b.y);
            const yPoints = [bb.minY, ...sortedHoles.map(h => h.y)];

            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(bb.maxX, bb.minY, 0.3),
                new THREE.Vector3(dimEdgeX, bb.minY, 0.3),
            ]), holeDimMat));

            yPoints.forEach(y => {
                group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(dimEdgeX - tick, y, 0.3),
                    new THREE.Vector3(dimEdgeX + tick, y, 0.3),
                ]), holeDimMat));
            });

            for (let i = 0; i < yPoints.length - 1; i++) {
                const from = yPoints[i];
                const to = yPoints[i + 1];
                const dist = Math.round(to - from);
                if (dist <= 0) continue;

                const vLineP1 = new THREE.Vector3(dimEdgeX, from, 0.3);
                const vLineP2 = new THREE.Vector3(dimEdgeX, to, 0.3);
                const vLineMid = new THREE.Vector3(dimEdgeX, (from + to) / 2, 0.3);
                const vGapLine1 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([vLineP1, vLineMid]), holeDimMat);
                const vGapLine2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([vLineMid, vLineP2]), holeDimMat);
                group.add(vGapLine1);
                group.add(vGapLine2);

                const vDimLabel = makeTextSprite(`${dist}`, '#cc8855', true);
                vDimLabel.position.set(dimEdgeX, (from + to) / 2, 0.5);
                vDimLabel.userData.gapLine1 = vGapLine1;
                vDimLabel.userData.gapLine2 = vGapLine2;
                vDimLabel.userData.lineP1 = vLineP1.clone();
                vDimLabel.userData.lineP2 = vLineP2.clone();
                vDimLabel.userData.lineDirection = 'vertical';
                group.add(vDimLabel);
            }
        }

        // Custom polygon drawing preview
        if (isDrawingCustomRef.current && customDrawPointsRef.current.length > 0) {
            const pts = customDrawPointsRef.current;
            const previewPoints = pts.map(p => new THREE.Vector3(p.x, p.y, 4));
            if (previewPoints.length > 1) {
                group.add(new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints(previewPoints),
                    new THREE.LineBasicMaterial({ color: 0x22aa44 })
                ));
            }
            const camera = cameraRef.current;
            const renderer = rendererRef.current;
            const dotSize = camera && renderer
                ? ((camera.right - camera.left) / renderer.domElement.clientWidth) * 4
                : 3;
            pts.forEach((p, i) => {
                const color = i === 0 && pts.length >= 3 ? 0x22aa44 : 0xE8601C;
                const geo = new THREE.PlaneGeometry(dotSize * 2, dotSize * 2);
                const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthTest: false });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(p.x, p.y, 4);
                group.add(mesh);
            });
        }

        // Overall glass dimension lines (bounding box)
        const dimOffset = -50;
        makeDimensionLine(group,
            new THREE.Vector3(bb.minX, bb.minY, 0), new THREE.Vector3(bb.maxX, bb.minY, 0),
            `${Math.round(bb.width)}`, dimOffset, 'horizontal', 0x1B4B9A
        );
        makeDimensionLine(group,
            new THREE.Vector3(bb.minX, bb.minY, 0), new THREE.Vector3(bb.minX, bb.maxY, 0),
            `${Math.round(bb.height)}`, dimOffset, 'vertical', 0x1B4B9A
        );

        renderScene();
    }, [width, height, renderScene]);

    // Initialize Three.js
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const w = container.clientWidth;
        const h = container.clientHeight;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf9fafb);
        sceneRef.current = scene;

        const bb = getBoundingBox(verticesRef.current);
        const padding = Math.max(bb.width, bb.height) * 0.3;
        const totalW = bb.width + padding * 2;
        const totalH = bb.height + padding * 2;
        const aspect = w / h;
        let camW: number, camH: number;
        if (aspect > totalW / totalH) {
            camH = totalH;
            camW = camH * aspect;
        } else {
            camW = totalW;
            camH = camW / aspect;
        }

        const cx = (bb.minX + bb.maxX) / 2;
        const cy = (bb.minY + bb.maxY) / 2;

        const camera = new THREE.OrthographicCamera(
            -camW / 2 + cx, camW / 2 + cx,
            camH / 2 + cy, -camH / 2 + cy,
            0.1, 1000
        );
        camera.position.set(cx, cy, 100);
        camera.lookAt(cx, cy, 0);
        cameraRef.current = camera;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(0, 0, 100);
        scene.add(dirLight);

        scene.add(glassGroupRef.current);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        buildGlassScene();

        const onResize = () => {
            const rw = container.clientWidth;
            const rh = container.clientHeight;
            renderer.setSize(rw, rh);
            const newAspect = rw / rh;
            const rbb = getBoundingBox(verticesRef.current);
            const rPad = Math.max(rbb.width, rbb.height) * 0.3;
            const rTotalW = rbb.width + rPad * 2;
            const rTotalH = rbb.height + rPad * 2;
            let nW: number, nH: number;
            if (newAspect > rTotalW / rTotalH) {
                nH = rTotalH;
                nW = nH * newAspect;
            } else {
                nW = rTotalW;
                nH = nW / newAspect;
            }
            const rcx = (rbb.minX + rbb.maxX) / 2;
            const rcy = (rbb.minY + rbb.maxY) / 2;
            camera.left = -nW / 2 + rcx;
            camera.right = nW / 2 + rcx;
            camera.top = nH / 2 + rcy;
            camera.bottom = -nH / 2 + rcy;
            camera.updateProjectionMatrix();
            renderScene();
        };

        const resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(container);

        return () => {
            resizeObserver.disconnect();
            renderer.dispose();
            container.removeChild(renderer.domElement);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-render when glass props change
    useEffect(() => {
        buildGlassScene();
    }, [width, height, holes, selectedHoleId, selectedHoleIds, internalVertices, activeTool, selectedVertexIdx, customDrawPoints, isDrawingCustom, buildGlassScene]);

    // Keyboard shortcuts: Cmd+G to group, Cmd+Shift+G to ungroup, Escape to deselect, Delete to remove
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectedHoleId(null);
                setSelectedHoleIds(new Set());
                return;
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && !e.metaKey && !e.ctrlKey) {
                handleDeleteSelected();
                return;
            }
            // Cmd+G: group selected holes
            if ((e.metaKey || e.ctrlKey) && e.key === 'g' && !e.shiftKey) {
                e.preventDefault();
                const sel = selectedHoleIdsRef.current;
                if (sel.size < 2) return;
                const groupId = `grp-${Date.now()}`;
                pushUndo();
                const updated = holesRef.current.map(h =>
                    sel.has(h.id) ? { ...h, groupId } : h
                );
                onHolesChange(updated);
                return;
            }
            // Cmd+Shift+G: ungroup selected holes
            if ((e.metaKey || e.ctrlKey) && e.key === 'g' && e.shiftKey) {
                e.preventDefault();
                const sel = selectedHoleIdsRef.current;
                const singleSel = selectedHoleIdRef.current;
                if (sel.size === 0 && !singleSel) return;
                pushUndo();
                // Find which groupId(s) to ungroup
                const idsToUngroup = sel.size > 0 ? sel : new Set(singleSel ? [singleSel] : []);
                const groupIds = new Set(holesRef.current.filter(h => idsToUngroup.has(h.id) && h.groupId).map(h => h.groupId!));
                const updated = holesRef.current.map(h =>
                    h.groupId && groupIds.has(h.groupId) ? { ...h, groupId: undefined } : h
                );
                onHolesChange(updated);
                setSelectedHoleIds(new Set());
                return;
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [holes, selectedHoleId, selectedHoleIds, activeTool, internalVertices]);

    // Mouse handlers
    useEffect(() => {
        const renderer = rendererRef.current;
        if (!renderer) return;
        const canvas = renderer.domElement;

        const onMouseDown = (e: MouseEvent) => {
            const pos = getWorldPos(e.clientX, e.clientY);
            if (!pos) return;

            if (e.button === 1 || (e.button === 0 && e.altKey)) {
                isPanningRef.current = true;
                panStartRef.current = { x: e.clientX, y: e.clientY };
                const cam = cameraRef.current!;
                camStartRef.current = {
                    cx: (cam.left + cam.right) / 2,
                    cy: (cam.top + cam.bottom) / 2,
                };
                canvas.style.cursor = 'grabbing';
                return;
            }

            if (e.button !== 0) return;

            if (activeToolRef.current === 'editVertex') {
                // Check hole resize handles first
                const resizeHit = findHoleHandleAtPos(pos.x, pos.y);
                if (resizeHit) {
                    pushUndo();
                    isResizingHoleRef.current = true;
                    resizeHoleIdRef.current = resizeHit.id;
                    resizeAxisRef.current = resizeHit.axis;
                    canvas.style.cursor = 'nwse-resize';
                    return;
                }

                const vertIdx = findVertexAtPos(pos.x, pos.y);
                if (vertIdx !== null) {
                    pushUndo();
                    setSelectedVertexIdx(vertIdx);
                    setSelectedHoleId(null);
                    isDraggingRef.current = true;
                    dragVertexIdxRef.current = vertIdx;
                    canvas.style.cursor = 'move';
                    return;
                }

                const edge = findEdgeAtPos(pos.x, pos.y);
                if (edge) {
                    pushUndo();
                    const verts = verticesRef.current;
                    const i = edge.edgeIdx;
                    const j = (i + 1) % verts.length;
                    const newX = Math.round(verts[i].x + (verts[j].x - verts[i].x) * edge.t);
                    const newY = Math.round(verts[i].y + (verts[j].y - verts[i].y) * edge.t);
                    const newVerts = [...verts];
                    newVerts.splice(j, 0, { x: newX, y: newY });
                    setVertices(newVerts);
                    setSelectedVertexIdx(j);
                    setSelectedHoleId(null);
                    isDraggingRef.current = true;
                    dragVertexIdxRef.current = j;
                    canvas.style.cursor = 'move';
                    return;
                }

                // Check if clicking a hole to select it
                const holeHit = findHoleAtPos(pos.x, pos.y);
                if (holeHit) {
                    setSelectedHoleId(holeHit);
                    setSelectedVertexIdx(null);
                    return;
                }

                setSelectedVertexIdx(null);
                setSelectedHoleId(null);
                return;
            }

            if (activeToolRef.current === 'move') {
                pushUndo();
                isMovingGlassRef.current = true;
                moveStartRef.current = { x: pos.x, y: pos.y };
                canvas.style.cursor = 'grabbing';
                return;
            }

            if (activeToolRef.current === 'addHole') {
                const placeBB = getBoundingBox(verticesRef.current);
                const margin = Math.max(placeBB.width, placeBB.height) * 0.15;
                const inRange = pos.x >= placeBB.minX - margin && pos.x <= placeBB.maxX + margin &&
                                pos.y >= placeBB.minY - margin && pos.y <= placeBB.maxY + margin;
                if (!inRange) return;

                if (cutoutShapeRef.current === 'custom') {
                    if (isDrawingCustomRef.current) {
                        const lastPt = customDrawPointsRef.current[0];
                        const dx = pos.x - (lastPt ? lastPt.x : 0);
                        const dy = pos.y - (lastPt ? lastPt.y : 0);
                        if (customDrawPointsRef.current.length >= 3 && Math.sqrt(dx * dx + dy * dy) < 15) {
                            pushUndo();
                            const cx = customDrawPointsRef.current.reduce((s, p) => s + p.x, 0) / customDrawPointsRef.current.length;
                            const cy = customDrawPointsRef.current.reduce((s, p) => s + p.y, 0) / customDrawPointsRef.current.length;
                            const relPoints = customDrawPointsRef.current.map(p => ({
                                x: Math.round(p.x - cx),
                                y: Math.round(p.y - cy),
                            }));
                            const newHole: HoleData = {
                                id: `h_${Date.now()}_${holeCounter++}`,
                                type: 'custom',
                                x: Math.round(cx),
                                y: Math.round(cy),
                                diameter: 0,
                                points: relPoints,
                            };
                            onHolesChange([...holesRef.current, newHole]);
                            setSelectedHoleId(newHole.id);
                            setIsDrawingCustom(false);
                            setCustomDrawPoints([]);
                        } else {
                            setCustomDrawPoints([...customDrawPointsRef.current, { x: Math.round(pos.x), y: Math.round(pos.y) }]);
                        }
                    } else {
                        setIsDrawingCustom(true);
                        setCustomDrawPoints([{ x: Math.round(pos.x), y: Math.round(pos.y) }]);
                    }
                    return;
                }

                pushUndo();
                const shape = cutoutShapeRef.current;
                const newHole: HoleData = {
                    id: `h_${Date.now()}_${holeCounter++}`,
                    type: shape,
                    x: Math.round(pos.x),
                    y: Math.round(pos.y),
                    diameter: shape === 'circle' ? holeDiameterRef.current : 0,
                    ...(shape === 'rectangle' ? { width: cutoutWidthRef.current, height: cutoutHeightRef.current } : {}),
                    ...(shape === 'slot' ? { width: cutoutSlotWidthRef.current, length: cutoutLengthRef.current } : {}),
                };
                onHolesChange([...holesRef.current, newHole]);
                setSelectedHoleId(newHole.id);
                return;
            }

            // Select mode — check resize handles first
            const resizeHitId = findHoleHandleAtPos(pos.x, pos.y);
            if (resizeHitId) {
                pushUndo();
                isResizingHoleRef.current = true;
                resizeHoleIdRef.current = resizeHitId.id;
                resizeAxisRef.current = resizeHitId.axis;
                canvas.style.cursor = 'nwse-resize';
                return;
            }

            const hitId = findHoleAtPos(pos.x, pos.y);
            const isMetaClick = e.metaKey || e.ctrlKey;

            if (hitId && isMetaClick) {
                // Cmd+Click: toggle multi-select
                setSelectedHoleIds(prev => {
                    const next = new Set(prev);
                    // Also include current single-selected hole in multi-select
                    if (selectedHoleIdRef.current && !next.has(selectedHoleIdRef.current)) {
                        next.add(selectedHoleIdRef.current);
                    }
                    if (next.has(hitId)) next.delete(hitId);
                    else next.add(hitId);
                    return next;
                });
                setSelectedHoleId(hitId);
                return;
            }

            if (hitId) {
                // Check if this hole is part of a group — auto-select all group members
                const hitHole = holesRef.current.find(h => h.id === hitId);
                if (hitHole?.groupId) {
                    const groupMembers = holesRef.current.filter(h => h.groupId === hitHole.groupId).map(h => h.id);
                    setSelectedHoleIds(new Set(groupMembers));
                } else {
                    setSelectedHoleIds(new Set());
                }
            } else {
                setSelectedHoleIds(new Set());
            }

            setSelectedHoleId(hitId);
            if (hitId) {
                pushUndo();
                isDraggingRef.current = true;
                dragHoleIdRef.current = hitId;
                canvas.style.cursor = 'move';
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            if (isPanningRef.current) {
                const cam = cameraRef.current!;
                const rect = canvas.getBoundingClientRect();
                const scaleX = (cam.right - cam.left) / rect.width;
                const scaleY = (cam.top - cam.bottom) / rect.height;
                const dx = (e.clientX - panStartRef.current.x) * scaleX;
                const dy = (e.clientY - panStartRef.current.y) * scaleY;
                const halfW = (cam.right - cam.left) / 2;
                const halfH = (cam.top - cam.bottom) / 2;
                cam.left = camStartRef.current.cx - dx - halfW;
                cam.right = camStartRef.current.cx - dx + halfW;
                cam.top = camStartRef.current.cy + dy + halfH;
                cam.bottom = camStartRef.current.cy + dy - halfH;
                cam.position.set(
                    (cam.left + cam.right) / 2,
                    (cam.top + cam.bottom) / 2,
                    100
                );
                cam.updateProjectionMatrix();
                renderScene();
                return;
            }

            if (isMovingGlassRef.current && moveStartRef.current) {
                const pos = getWorldPos(e.clientX, e.clientY);
                if (!pos) return;
                const dx = Math.round(pos.x - moveStartRef.current.x);
                const dy = Math.round(pos.y - moveStartRef.current.y);
                if (dx === 0 && dy === 0) return;
                const newVerts = verticesRef.current.map(v => ({ x: v.x + dx, y: v.y + dy }));
                const newHoles = holesRef.current.map(h => ({ ...h, x: h.x + dx, y: h.y + dy }));
                setVertices(newVerts);
                onHolesChange(newHoles);
                moveStartRef.current = { x: pos.x, y: pos.y };
                return;
            }

            if (isDraggingRef.current && dragVertexIdxRef.current !== null) {
                const pos = getWorldPos(e.clientX, e.clientY);
                if (!pos) return;
                const newVerts = [...verticesRef.current];
                newVerts[dragVertexIdxRef.current] = {
                    x: Math.round(pos.x),
                    y: Math.round(pos.y),
                };
                setVertices(newVerts);
                return;
            }

            if (isResizingHoleRef.current && resizeHoleIdRef.current) {
                const pos = getWorldPos(e.clientX, e.clientY);
                if (!pos) return;
                const hole = holesRef.current.find(h => h.id === resizeHoleIdRef.current);
                if (!hole) return;
                const axis = resizeAxisRef.current;

                const updated = holesRef.current.map(h => {
                    if (h.id !== resizeHoleIdRef.current) return h;
                    if (h.type === 'rectangle') {
                        const w = h.width || 100;
                        const ht = h.height || 60;
                        if (axis === 'right') return { ...h, width: Math.max(10, Math.round((pos.x - h.x) * 2)) };
                        if (axis === 'left') return { ...h, width: Math.max(10, Math.round((h.x - pos.x) * 2)) };
                        if (axis === 'top') return { ...h, height: Math.max(10, Math.round((pos.y - h.y) * 2)) };
                        if (axis === 'bottom') return { ...h, height: Math.max(10, Math.round((h.y - pos.y) * 2)) };
                        if (axis?.startsWith('t') || axis?.startsWith('b')) {
                            const newW = Math.max(10, Math.round(Math.abs(pos.x - h.x) * 2));
                            const newH = Math.max(10, Math.round(Math.abs(pos.y - h.y) * 2));
                            return { ...h, width: newW, height: newH };
                        }
                        return h;
                    } else if (h.type === 'slot') {
                        if (axis?.startsWith('length')) {
                            const newLen = Math.max(h.width || 20, Math.round(Math.abs(pos.x - h.x) * 2 + (h.width || 20)));
                            return { ...h, length: newLen };
                        }
                        if (axis?.startsWith('width')) {
                            const newW = Math.max(5, Math.round(Math.abs(pos.y - h.y) * 2));
                            return { ...h, width: newW, length: Math.max(newW, h.length || 80) };
                        }
                        return h;
                    } else if (h.type === 'custom' && axis?.startsWith('pt-')) {
                        const ptIdx = parseInt(axis.split('-')[1]);
                        if (h.points && ptIdx < h.points.length) {
                            const newPoints = [...h.points];
                            newPoints[ptIdx] = { x: Math.round(pos.x - h.x), y: Math.round(pos.y - h.y) };
                            return { ...h, points: newPoints };
                        }
                        return h;
                    } else {
                        const dx = pos.x - h.x;
                        const dy = pos.y - h.y;
                        return { ...h, diameter: Math.max(5, Math.round(Math.sqrt(dx * dx + dy * dy) * 2)) };
                    }
                });
                onHolesChange(updated);
                return;
            }

            if (isDraggingRef.current && dragHoleIdRef.current) {
                const pos = getWorldPos(e.clientX, e.clientY);
                if (!pos) return;
                const bb = getBoundingBox(verticesRef.current);
                const dragMargin = Math.max(bb.width, bb.height) * 0.15;

                const draggedHole = holesRef.current.find(h => h.id === dragHoleIdRef.current);
                if (!draggedHole) return;

                const dx = Math.round(pos.x) - draggedHole.x;
                const dy = Math.round(pos.y) - draggedHole.y;

                // Determine which holes to move: multi-selected, or grouped, or just the one
                const multiSel = selectedHoleIdsRef.current;
                const draggedGroup = draggedHole.groupId;
                const shouldMove = (h: HoleData) =>
                    h.id === dragHoleIdRef.current ||
                    multiSel.has(h.id) ||
                    (draggedGroup && h.groupId === draggedGroup);

                const updated = holesRef.current.map(h => {
                    if (!shouldMove(h)) return h;
                    const newX = Math.max(bb.minX - dragMargin, Math.min(bb.maxX + dragMargin, h.x + dx));
                    const newY = Math.max(bb.minY - dragMargin, Math.min(bb.maxY + dragMargin, h.y + dy));
                    return { ...h, x: newX, y: newY };
                });
                onHolesChange(updated);
            }

            // Cursor hints
            if (!isDraggingRef.current && !isResizingHoleRef.current) {
                const pos2 = getWorldPos(e.clientX, e.clientY);
                if (pos2) {
                    if (activeToolRef.current === 'select') {
                        if (findHoleHandleAtPos(pos2.x, pos2.y)) {
                            canvas.style.cursor = 'nwse-resize';
                        } else if (findHoleAtPos(pos2.x, pos2.y)) {
                            canvas.style.cursor = 'move';
                        } else {
                            canvas.style.cursor = 'default';
                        }
                    } else if (activeToolRef.current === 'editVertex') {
                        if (findHoleHandleAtPos(pos2.x, pos2.y)) {
                            canvas.style.cursor = 'nwse-resize';
                        } else if (findVertexAtPos(pos2.x, pos2.y) !== null) {
                            canvas.style.cursor = 'move';
                        } else if (findEdgeAtPos(pos2.x, pos2.y)) {
                            canvas.style.cursor = 'copy';
                        } else if (findHoleAtPos(pos2.x, pos2.y)) {
                            canvas.style.cursor = 'pointer';
                        } else {
                            canvas.style.cursor = 'crosshair';
                        }
                    }
                }
            }
        };

        const onMouseUp = () => {
            isPanningRef.current = false;
            isDraggingRef.current = false;
            isResizingHoleRef.current = false;
            resizeHoleIdRef.current = null;
            resizeAxisRef.current = undefined;
            isMovingGlassRef.current = false;
            moveStartRef.current = null;
            dragHoleIdRef.current = null;
            dragVertexIdxRef.current = null;
            if (activeToolRef.current === 'move') {
                canvas.style.cursor = 'grab';
            } else if (activeToolRef.current === 'editVertex') {
                canvas.style.cursor = 'crosshair';
            } else {
                canvas.style.cursor = activeToolRef.current === 'addHole' ? 'crosshair' : 'default';
            }
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const cam = cameraRef.current!;
            const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
            const cx = (cam.left + cam.right) / 2;
            const cy = (cam.top + cam.bottom) / 2;
            const halfW = ((cam.right - cam.left) / 2) * zoomFactor;
            const halfH = ((cam.top - cam.bottom) / 2) * zoomFactor;
            cam.left = cx - halfW;
            cam.right = cx + halfW;
            cam.top = cy + halfH;
            cam.bottom = cy - halfH;
            cam.updateProjectionMatrix();
            renderScene();
        };

        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mouseleave', onMouseUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });

        return () => {
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('mouseleave', onMouseUp);
            canvas.removeEventListener('wheel', onWheel);
        };
    }, [width, height, getWorldPos, findHoleAtPos, findHoleHandleAtPos, findVertexAtPos, findEdgeAtPos, onHolesChange, setVertices, pushUndo, renderScene]);

    // Update cursor when tool changes
    useEffect(() => {
        const canvas = rendererRef.current?.domElement;
        if (canvas) {
            if (activeTool === 'move') {
                canvas.style.cursor = 'grab';
            } else if (activeTool === 'addHole' || activeTool === 'editVertex') {
                canvas.style.cursor = 'crosshair';
            } else {
                canvas.style.cursor = 'default';
            }
        }
    }, [activeTool]);

    const handleDeleteSelected = () => {
        if (activeTool === 'editVertex' && selectedVertexIdx !== null) {
            if (internalVertices.length <= 3) return;
            pushUndo();
            const newVerts = internalVertices.filter((_, i) => i !== selectedVertexIdx);
            setVertices(newVerts);
            setSelectedVertexIdx(null);
            return;
        }
        if (selectedHoleIds.size > 0) {
            pushUndo();
            onHolesChange(holes.filter(h => !selectedHoleIds.has(h.id)));
            setSelectedHoleId(null);
            setSelectedHoleIds(new Set());
            return;
        }
        if (!selectedHoleId) return;
        pushUndo();
        onHolesChange(holes.filter(h => h.id !== selectedHoleId));
        setSelectedHoleId(null);
    };

    const handleUndo = () => {
        const prev = undoStackRef.current.pop();
        if (!prev) return;
        redoStackRef.current.push({
            holes: JSON.parse(JSON.stringify(holesRef.current)),
            vertices: JSON.parse(JSON.stringify(verticesRef.current)),
        });
        onHolesChange(prev.holes);
        setVertices(prev.vertices);
        setSelectedHoleId(null);
        setSelectedHoleIds(new Set());
        setSelectedVertexIdx(null);
    };

    const handleRedo = () => {
        const next = redoStackRef.current.pop();
        if (!next) return;
        undoStackRef.current.push({
            holes: JSON.parse(JSON.stringify(holesRef.current)),
            vertices: JSON.parse(JSON.stringify(verticesRef.current)),
        });
        onHolesChange(next.holes);
        setVertices(next.vertices);
        setSelectedHoleId(null);
        setSelectedHoleIds(new Set());
        setSelectedVertexIdx(null);
    };

    const handleResetAll = () => {
        pushUndo();
        onHolesChange([]);
        setVertices(getDefaultVertices(width, height));
        setSelectedHoleId(null);
        setSelectedHoleIds(new Set());
        setSelectedVertexIdx(null);
    };

    const handleResetView = () => {
        const cam = cameraRef.current;
        const container = containerRef.current;
        if (!cam || !container) return;
        const bb = getBoundingBox(verticesRef.current);
        const padding = Math.max(bb.width, bb.height) * 0.3;
        const totalW = bb.width + padding * 2;
        const totalH = bb.height + padding * 2;
        const aspect = container.clientWidth / container.clientHeight;
        let camW: number, camH: number;
        if (aspect > totalW / totalH) {
            camH = totalH;
            camW = camH * aspect;
        } else {
            camW = totalW;
            camH = camW / aspect;
        }
        const cx = (bb.minX + bb.maxX) / 2;
        const cy = (bb.minY + bb.maxY) / 2;
        cam.left = -camW / 2 + cx;
        cam.right = camW / 2 + cx;
        cam.top = camH / 2 + cy;
        cam.bottom = -camH / 2 + cy;
        cam.position.set(cx, cy, 100);
        cam.updateProjectionMatrix();
        renderScene();
    };

    const build3DScene = useCallback(() => {
        const scene = previewSceneRef.current;
        if (!scene) return;

        while (scene.children.length > 0) scene.remove(scene.children[0]);

        // Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(200, 300, 400);
        scene.add(dirLight);
        const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
        backLight.position.set(-200, -100, -200);
        scene.add(backLight);

        const verts = verticesRef.current;
        if (verts.length < 3) return;

        const bb3 = getBoundingBox(verts);
        const thicknessMm = glassMmThickness || 6;
        const depthScale = thicknessMm * 0.8;

        // Build glass solid (no holes) then subtract cutouts with CSG
        const glassShape = new THREE.Shape();
        glassShape.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) glassShape.lineTo(verts[i].x, verts[i].y);
        glassShape.closePath();

        const extrudeSettings = { depth: depthScale, bevelEnabled: false };
        const glassGeo = new THREE.ExtrudeGeometry(glassShape, extrudeSettings);

        const offsetPos = new THREE.Vector3(-bb3.minX - bb3.width / 2, -bb3.minY - bb3.height / 2, -depthScale / 2);

        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xc8e8f8,
            transparent: true,
            opacity: 0.55,
            roughness: 0.05,
            metalness: 0.0,
            transmission: 0.6,
            thickness: 2,
            clearcoat: 1.0,
            clearcoatRoughness: 0.05,
            side: THREE.DoubleSide,
            envMapIntensity: 1.0,
        });

        let resultBrush: Brush | null = null;

        if (holesRef.current.length > 0) {
            const csgEvaluator = new Evaluator();
            const glassBrush = new Brush(glassGeo, glassMat);
            glassBrush.position.copy(offsetPos);
            glassBrush.updateMatrixWorld(true);

            let currentBrush = glassBrush;

            for (const h of holesRef.current) {
                const cutPath = makeCutoutPath(h);
                const cutShape = new THREE.Shape();
                const pts = cutPath.getPoints(48);
                cutShape.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) cutShape.lineTo(pts[i].x, pts[i].y);
                cutShape.closePath();

                const cutGeo = new THREE.ExtrudeGeometry(cutShape, { depth: depthScale + 4, bevelEnabled: false });
                const cutBrush = new Brush(cutGeo, glassMat);
                cutBrush.position.set(offsetPos.x, offsetPos.y, offsetPos.z - 2);
                cutBrush.updateMatrixWorld(true);

                try {
                    currentBrush = csgEvaluator.evaluate(currentBrush, cutBrush, SUBTRACTION);
                } catch {
                    // Fallback if CSG fails for a cutout
                }
                cutGeo.dispose();
            }
            resultBrush = currentBrush;
        }

        if (resultBrush) {
            resultBrush.material = glassMat;
            scene.add(resultBrush);
        } else {
            const mesh = new THREE.Mesh(glassGeo, glassMat);
            mesh.position.copy(offsetPos);
            scene.add(mesh);
        }

        // Ground shadow plane
        const groundGeo = new THREE.PlaneGeometry(bb3.width * 2, bb3.height * 2);
        const groundMat = new THREE.MeshBasicMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.3 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.set(0, 0, -depthScale / 2 - 1);
        scene.add(ground);

        // Camera framing — only on first build so user's orbit position is preserved
        if (!preview3DInitRef.current) {
            const cam = previewCameraRef.current;
            if (cam) {
                const maxDim = Math.max(bb3.width, bb3.height);
                const dist = maxDim * 1.2;
                cam.position.set(dist * 0.6, -dist * 0.4, dist * 0.5);
                cam.lookAt(0, 0, 0);
                cam.updateProjectionMatrix();
            }
            if (previewControlsRef.current) {
                previewControlsRef.current.target.set(0, 0, 0);
                previewControlsRef.current.update();
            }
            preview3DInitRef.current = true;
        }
    }, [glassMmThickness]);

    // Keep ref in sync so lifecycle effect doesn't re-run on every build3DScene change
    useEffect(() => { build3DSceneRef.current = build3DScene; }, [build3DScene]);

    // 3D preview lifecycle
    useEffect(() => {
        if (!show3DPreview || !preview3DRef.current) return;

        const container = preview3DRef.current;
        const w = container.clientWidth;
        const h = container.clientHeight;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        container.appendChild(renderer.domElement);
        previewRendererRef.current = renderer;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf8fafc);
        previewSceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000);
        previewCameraRef.current = camera;

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controls.minDistance = 50;
        controls.maxDistance = 5000;
        previewControlsRef.current = controls;

        build3DSceneRef.current();

        const animate = () => {
            previewAnimFrameRef.current = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        const onResize = () => {
            const cw = container.clientWidth;
            const ch = container.clientHeight;
            camera.aspect = cw / ch;
            camera.updateProjectionMatrix();
            renderer.setSize(cw, ch);
        };
        const resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(container);

        return () => {
            cancelAnimationFrame(previewAnimFrameRef.current);
            resizeObserver.disconnect();
            controls.dispose();
            renderer.dispose();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
            previewRendererRef.current = null;
            previewSceneRef.current = null;
            previewCameraRef.current = null;
            previewControlsRef.current = null;
            preview3DInitRef.current = false;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show3DPreview]);

    // Re-build 3D scene when design changes
    useEffect(() => {
        if (show3DPreview && previewSceneRef.current) {
            build3DScene();
        }
    }, [show3DPreview, width, height, holes, internalVertices, build3DScene]);

    const bb = getBoundingBox(internalVertices);
    const isCustomShape = !externalVertices || externalVertices.length !== 4 ||
        !(externalVertices[0].x === 0 && externalVertices[0].y === 0 &&
          externalVertices[1].x === width && externalVertices[1].y === 0 &&
          externalVertices[2].x === width && externalVertices[2].y === height &&
          externalVertices[3].x === 0 && externalVertices[3].y === height);

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                <Button
                    variant={activeTool === 'select' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setActiveTool('select'); setSelectedVertexIdx(null); setCutoutMenuOpen(false); }}
                    className={`gap-1.5 rounded-xl text-xs font-bold h-9 ${activeTool === 'select' ? 'bg-[#1B4B9A] text-white' : ''}`}
                >
                    <MousePointer2 className="h-3.5 w-3.5" />
                    Select
                </Button>
                <div className="relative group">
                    <div className="flex">
                        <Button
                            variant={activeTool === 'addHole' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => { setActiveTool('addHole'); setSelectedVertexIdx(null); setIsDrawingCustom(false); setCustomDrawPoints([]); }}
                            className={`gap-1.5 rounded-xl rounded-r-none text-xs font-bold h-9 ${activeTool === 'addHole' ? 'bg-[#E8601C] text-white' : ''}`}
                        >
                            {cutoutShape === 'circle' && <Circle className="h-3.5 w-3.5" />}
                            {cutoutShape === 'rectangle' && <Square className="h-3.5 w-3.5" />}
                            {cutoutShape === 'slot' && <RectangleHorizontal className="h-3.5 w-3.5" />}
                            {cutoutShape === 'custom' && <Hexagon className="h-3.5 w-3.5" />}
                            Add Cutout
                        </Button>
                        <div className="relative">
                            <Button
                                variant={activeTool === 'addHole' ? 'default' : 'outline'}
                                size="sm"
                                className={`rounded-xl rounded-l-none border-l-0 h-9 px-1.5 ${activeTool === 'addHole' ? 'bg-[#E8601C] text-white' : ''}`}
                                onClick={() => {
                                    setCutoutMenuOpen(v => !v);
                                    if (activeTool !== 'addHole') {
                                        setActiveTool('addHole');
                                        setSelectedVertexIdx(null);
                                        setIsDrawingCustom(false);
                                        setCustomDrawPoints([]);
                                    }
                                }}
                            >
                                <ChevronDown className="h-3 w-3" />
                            </Button>
                            {cutoutMenuOpen && <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 py-1 min-w-[140px]">
                                {([
                                    { type: 'circle' as CutoutType, icon: Circle, label: 'Circle' },
                                    { type: 'rectangle' as CutoutType, icon: Square, label: 'Rectangle' },
                                    { type: 'slot' as CutoutType, icon: RectangleHorizontal, label: 'Slot / Oblong' },
                                    { type: 'custom' as CutoutType, icon: Hexagon, label: 'Custom' },
                                ]).map(opt => (
                                    <button
                                        key={opt.type}
                                        className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 ${cutoutShape === opt.type ? 'text-[#E8601C]' : 'text-slate-700 dark:text-slate-300'}`}
                                        onClick={() => {
                                            setCutoutShape(opt.type);
                                            setActiveTool('addHole');
                                            setSelectedVertexIdx(null);
                                            setIsDrawingCustom(false);
                                            setCustomDrawPoints([]);
                                            setCutoutMenuOpen(false);
                                        }}
                                    >
                                        <opt.icon className="h-3.5 w-3.5" />
                                        {opt.label}
                                    </button>
                                ))}
                            </div>}
                        </div>
                    </div>
                </div>
                <Button
                    variant={activeTool === 'move' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setActiveTool('move'); setSelectedHoleId(null); setSelectedHoleIds(new Set()); setSelectedVertexIdx(null); setCutoutMenuOpen(false); }}
                    className={`gap-1.5 rounded-xl text-xs font-bold h-9 ${activeTool === 'move' ? 'bg-[#6366f1] text-white' : ''}`}
                >
                    <Hand className="h-3.5 w-3.5" />
                    Move
                </Button>
                <Button
                    variant={activeTool === 'editVertex' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setActiveTool('editVertex'); setSelectedHoleId(null); setSelectedHoleIds(new Set()); setCutoutMenuOpen(false); }}
                    className={`gap-1.5 rounded-xl text-xs font-bold h-9 ${activeTool === 'editVertex' ? 'bg-[#22aa44] text-white' : ''}`}
                >
                    <Pen className="h-3.5 w-3.5" />
                    Edit Shape
                </Button>

                <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

                {cutoutShape === 'circle' && (
                    <div className="flex items-center gap-1">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">⌀</Label>
                        <Input
                            type="number"
                            min={5}
                            max={200}
                            value={holeDiameter}
                            onChange={(e) => setHoleDiameter(parseInt(e.target.value) || 20)}
                            className="w-14 h-8 text-xs font-bold rounded-lg border-slate-200 dark:border-slate-800 text-center px-1"
                        />
                        <span className="text-[10px] font-bold text-slate-400">mm</span>
                    </div>
                )}
                {cutoutShape === 'rectangle' && (
                    <div className="flex items-center gap-1">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">W</Label>
                        <Input type="number" min={10} max={500} value={cutoutWidth}
                            onChange={(e) => setCutoutWidth(parseInt(e.target.value) || 100)}
                            className="w-12 h-8 text-xs font-bold rounded-lg border-slate-200 dark:border-slate-800 text-center px-1" />
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">H</Label>
                        <Input type="number" min={10} max={500} value={cutoutHeight}
                            onChange={(e) => setCutoutHeight(parseInt(e.target.value) || 60)}
                            className="w-12 h-8 text-xs font-bold rounded-lg border-slate-200 dark:border-slate-800 text-center px-1" />
                        <span className="text-[10px] font-bold text-slate-400">mm</span>
                    </div>
                )}
                {cutoutShape === 'slot' && (
                    <div className="flex items-center gap-1">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">W</Label>
                        <Input type="number" min={5} max={200} value={cutoutSlotWidth}
                            onChange={(e) => setCutoutSlotWidth(parseInt(e.target.value) || 20)}
                            className="w-12 h-8 text-xs font-bold rounded-lg border-slate-200 dark:border-slate-800 text-center px-1" />
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">L</Label>
                        <Input type="number" min={10} max={500} value={cutoutLength}
                            onChange={(e) => setCutoutLength(parseInt(e.target.value) || 80)}
                            className="w-12 h-8 text-xs font-bold rounded-lg border-slate-200 dark:border-slate-800 text-center px-1" />
                        <span className="text-[10px] font-bold text-slate-400">mm</span>
                    </div>
                )}
                {cutoutShape === 'custom' && (
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold text-slate-400">Click to place, click start to close</span>
                    </div>
                )}

                <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUndo}
                    disabled={undoStackRef.current.length === 0}
                    className="gap-1.5 rounded-xl text-xs font-bold h-9 text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                    title="Undo"
                >
                    <Undo2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRedo}
                    disabled={redoStackRef.current.length === 0}
                    className="gap-1.5 rounded-xl text-xs font-bold h-9 text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                    title="Redo"
                >
                    <Redo2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetAll}
                    className="gap-1.5 rounded-xl text-xs font-bold h-9 text-red-500 hover:text-red-600 hover:bg-red-50"
                    title="Reset all (clear holes & shape)"
                >
                    <RotateCcw className="h-3.5 w-3.5" />
                </Button>

                <div className="ml-auto flex items-center gap-1">
                    <Button
                        variant={show3DPreview ? 'default' : 'ghost'}
                        size="icon"
                        onClick={() => setShow3DPreview(v => !v)}
                        className={`h-8 w-8 rounded-lg ${show3DPreview ? 'bg-[#1B4B9A] text-white' : 'text-slate-400 hover:text-slate-600'}`}
                        title="Toggle 3D Preview"
                    >
                        <Box className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleResetView} className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-600" title="Fit to view">
                        <Focus className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* Canvas Container */}
            <div className="flex-1 relative bg-slate-50 dark:bg-slate-950" style={{ minHeight: 400 }}>
                <div ref={containerRef} className="absolute inset-0" />

                {/* 3D Preview Panel */}
                {show3DPreview && (
                    <div
                        onMouseDown={(e) => { e.stopPropagation(); if (e.button === 1) e.preventDefault(); }}
                        onMouseMove={(e) => e.stopPropagation()}
                        onMouseUp={(e) => e.stopPropagation()}
                        onWheel={(e) => e.stopPropagation()}
                        onPointerDown={(e) => { e.stopPropagation(); if (e.button === 1) e.preventDefault(); }}
                        onPointerMove={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        className="absolute z-10 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden transition-all duration-200"
                        style={previewExpanded
                            ? { inset: 12 }
                            : {
                                width: 320,
                                height: 240,
                                ...(previewPos
                                    ? { left: previewPos.x, top: previewPos.y }
                                    : { top: 12, right: 12 }),
                            }
                        }
                    >
                        <div
                            className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 select-none"
                            style={{ cursor: previewExpanded ? 'default' : 'grab' }}
                            onMouseDown={(e) => {
                                if (previewExpanded) return;
                                e.preventDefault();
                                const panel = e.currentTarget.parentElement!;
                                const rect = panel.getBoundingClientRect();
                                const parentRect = panel.parentElement!.getBoundingClientRect();
                                previewDragRef.current = {
                                    startX: e.clientX,
                                    startY: e.clientY,
                                    origX: rect.left - parentRect.left,
                                    origY: rect.top - parentRect.top,
                                };
                                const onMove = (ev: MouseEvent) => {
                                    if (!previewDragRef.current) return;
                                    const dx = ev.clientX - previewDragRef.current.startX;
                                    const dy = ev.clientY - previewDragRef.current.startY;
                                    const newX = Math.max(0, Math.min(parentRect.width - 320, previewDragRef.current.origX + dx));
                                    const newY = Math.max(0, Math.min(parentRect.height - 240, previewDragRef.current.origY + dy));
                                    setPreviewPos({ x: newX, y: newY });
                                };
                                const onUp = () => {
                                    previewDragRef.current = null;
                                    document.removeEventListener('mousemove', onMove);
                                    document.removeEventListener('mouseup', onUp);
                                };
                                document.addEventListener('mousemove', onMove);
                                document.addEventListener('mouseup', onUp);
                            }}
                        >
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Box className="h-3 w-3" />
                                3D Preview
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setPreviewExpanded(v => !v)}
                                    className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
                                    title={previewExpanded ? 'Minimize' : 'Maximize'}
                                >
                                    {previewExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                                </button>
                                <button
                                    onClick={() => { setShow3DPreview(false); setPreviewExpanded(false); }}
                                    className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                        <div ref={preview3DRef} className="w-full" style={{ height: 'calc(100% - 28px)' }} />
                    </div>
                )}
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-400 tracking-wider shrink-0">
                <span>{holes.length} cutout{holes.length !== 1 ? 's' : ''}</span>
                <span className="flex items-center gap-6">
                    <span>Ctrl+Click multi-select</span>
                    <span>Ctrl+G group</span>
                    <span>Ctrl+Shift+G ungroup</span>
                    <span>Esc deselect</span>
                    <span>Del remove</span>
                </span>
            </div>
        </div>
    );
}
