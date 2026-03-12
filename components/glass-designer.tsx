"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MousePointer2, Circle, Undo2, Redo2, RotateCcw, Pen, Focus } from 'lucide-react';

export interface HoleData {
    id: string;
    x: number;
    y: number;
    diameter: number;
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

export function GlassDesigner({ width, height, holes, onHolesChange, vertices: externalVertices, onVerticesChange }: GlassDesignerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const glassGroupRef = useRef(new THREE.Group());
    const glassMeshRef = useRef<THREE.Mesh | null>(null);

    const [activeTool, setActiveTool] = useState<'select' | 'addHole' | 'editVertex'>('select');
    const [selectedHoleId, setSelectedHoleId] = useState<string | null>(null);
    const [holeDiameter, setHoleDiameter] = useState(20);
    const [selectedVertexIdx, setSelectedVertexIdx] = useState<number | null>(null);

    const internalVertices = externalVertices ?? getDefaultVertices(width, height);

    const undoStackRef = useRef<{ holes: HoleData[]; vertices: VertexData[] }[]>([]);
    const redoStackRef = useRef<{ holes: HoleData[]; vertices: VertexData[] }[]>([]);

    const isDraggingRef = useRef(false);
    const isPanningRef = useRef(false);
    const dragHoleIdRef = useRef<string | null>(null);
    const dragVertexIdxRef = useRef<number | null>(null);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const panStartRef = useRef({ x: 0, y: 0 });
    const camStartRef = useRef({ cx: 0, cy: 0 });

    const gridObjRef = useRef<THREE.LineSegments | null>(null);

    const holesRef = useRef(holes);
    holesRef.current = holes;

    const activeToolRef = useRef(activeTool);
    activeToolRef.current = activeTool;

    const selectedHoleIdRef = useRef(selectedHoleId);
    selectedHoleIdRef.current = selectedHoleId;

    const holeDiameterRef = useRef(holeDiameter);
    holeDiameterRef.current = holeDiameter;

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
            const dx = wx - h.x;
            const dy = wy - h.y;
            if (Math.sqrt(dx * dx + dy * dy) <= h.diameter / 2 + 3) {
                return h.id;
            }
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

    const buildGlassScene = useCallback(() => {
        const group = glassGroupRef.current;
        while (group.children.length) group.remove(group.children[0]);

        const verts = verticesRef.current;
        const bb = getBoundingBox(verts);

        // Glass panel shape from vertices
        const glassShape = new THREE.Shape();
        glassShape.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) {
            glassShape.lineTo(verts[i].x, verts[i].y);
        }
        glassShape.closePath();

        holesRef.current.forEach(h => {
            const holePath = new THREE.Path();
            holePath.absarc(h.x, h.y, h.diameter / 2, 0, Math.PI * 2, false);
            glassShape.holes.push(holePath);
        });

        const extrudeSettings = { depth: 3, bevelEnabled: false };
        const glassGeo = new THREE.ExtrudeGeometry(glassShape, extrudeSettings);
        const glassMat = new THREE.MeshPhongMaterial({
            color: 0xadd8e6,
            transparent: true,
            opacity: 0.45,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(glassGeo, glassMat);
        glassMeshRef.current = mesh;
        group.add(mesh);

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

        // Holes visual markers
        holesRef.current.forEach(h => {
            const isSelected = h.id === selectedHoleIdRef.current;
            const ringColor = isSelected ? 0xE8601C : 0xd44800;
            const segments = 48;
            const ringPoints: THREE.Vector3[] = [];
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                ringPoints.push(new THREE.Vector3(
                    h.x + Math.cos(angle) * h.diameter / 2,
                    h.y + Math.sin(angle) * h.diameter / 2,
                    3.2
                ));
            }
            const ringMat = new THREE.LineBasicMaterial({ color: ringColor, linewidth: 2 });
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPoints), ringMat));

            const chLen = h.diameter / 2 + 4;
            const crossPoints = [
                new THREE.Vector3(h.x - chLen, h.y, 3.2), new THREE.Vector3(h.x + chLen, h.y, 3.2),
                new THREE.Vector3(h.x, h.y - chLen, 3.2), new THREE.Vector3(h.x, h.y + chLen, 3.2),
            ];
            const crossMat = new THREE.LineBasicMaterial({ color: isSelected ? 0xE8601C : 0xcc6644, linewidth: 1 });
            group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(crossPoints), crossMat));

            const hLabel = makeTextSprite(`⌀${h.diameter}`, isSelected ? '#E8601C' : '#aa5533');
            hLabel.position.set(h.x, h.y - h.diameter / 2 - 18, 3.3);
            group.add(hLabel);

            // Horizontal line from right edge to hole at hole's Y level (two segments with gap)
            const holeDimMatH = new THREE.LineBasicMaterial({ color: 0xcc8855 });
            const dimEdgeXH = bb.maxX + 30;
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
            const dimEdgeX = bb.maxX + 30;
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
    }, [width, height, holes, selectedHoleId, internalVertices, activeTool, selectedVertexIdx, buildGlassScene]);

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
                const vertIdx = findVertexAtPos(pos.x, pos.y);
                if (vertIdx !== null) {
                    pushUndo();
                    setSelectedVertexIdx(vertIdx);
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
                    isDraggingRef.current = true;
                    dragVertexIdxRef.current = j;
                    canvas.style.cursor = 'move';
                    return;
                }

                setSelectedVertexIdx(null);
                return;
            }

            if (activeToolRef.current === 'addHole') {
                if (isPointInPolygon(pos.x, pos.y, verticesRef.current)) {
                    pushUndo();
                    const newHole: HoleData = {
                        id: `h_${Date.now()}_${holeCounter++}`,
                        x: Math.round(pos.x),
                        y: Math.round(pos.y),
                        diameter: holeDiameterRef.current,
                    };
                    onHolesChange([...holesRef.current, newHole]);
                    setSelectedHoleId(newHole.id);
                }
                return;
            }

            // Select mode
            const hitId = findHoleAtPos(pos.x, pos.y);
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

            if (isDraggingRef.current && dragHoleIdRef.current) {
                const pos = getWorldPos(e.clientX, e.clientY);
                if (!pos) return;
                const bb = getBoundingBox(verticesRef.current);
                const clampedX = Math.max(bb.minX, Math.min(bb.maxX, Math.round(pos.x)));
                const clampedY = Math.max(bb.minY, Math.min(bb.maxY, Math.round(pos.y)));
                const updated = holesRef.current.map(h =>
                    h.id === dragHoleIdRef.current ? { ...h, x: clampedX, y: clampedY } : h
                );
                onHolesChange(updated);
            }

            // Cursor hint in editVertex mode
            if (activeToolRef.current === 'editVertex' && !isDraggingRef.current) {
                const pos2 = getWorldPos(e.clientX, e.clientY);
                if (pos2) {
                    if (findVertexAtPos(pos2.x, pos2.y) !== null) {
                        canvas.style.cursor = 'move';
                    } else if (findEdgeAtPos(pos2.x, pos2.y)) {
                        canvas.style.cursor = 'copy';
                    } else {
                        canvas.style.cursor = 'crosshair';
                    }
                }
            }
        };

        const onMouseUp = () => {
            isPanningRef.current = false;
            isDraggingRef.current = false;
            dragHoleIdRef.current = null;
            dragVertexIdxRef.current = null;
            if (activeToolRef.current === 'editVertex') {
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
    }, [width, height, getWorldPos, findHoleAtPos, findVertexAtPos, findEdgeAtPos, onHolesChange, setVertices, pushUndo, renderScene]);

    // Update cursor when tool changes
    useEffect(() => {
        const canvas = rendererRef.current?.domElement;
        if (canvas) {
            if (activeTool === 'addHole' || activeTool === 'editVertex') {
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
        setSelectedVertexIdx(null);
    };

    const handleResetAll = () => {
        pushUndo();
        onHolesChange([]);
        setVertices(getDefaultVertices(width, height));
        setSelectedHoleId(null);
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
                    onClick={() => { setActiveTool('select'); setSelectedVertexIdx(null); }}
                    className={`gap-1.5 rounded-xl text-xs font-bold h-9 ${activeTool === 'select' ? 'bg-[#1B4B9A] text-white' : ''}`}
                >
                    <MousePointer2 className="h-3.5 w-3.5" />
                    Select
                </Button>
                <Button
                    variant={activeTool === 'addHole' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setActiveTool('addHole'); setSelectedVertexIdx(null); }}
                    className={`gap-1.5 rounded-xl text-xs font-bold h-9 ${activeTool === 'addHole' ? 'bg-[#E8601C] text-white' : ''}`}
                >
                    <Circle className="h-3.5 w-3.5" />
                    Add Hole
                </Button>
                <Button
                    variant={activeTool === 'editVertex' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setActiveTool('editVertex'); setSelectedHoleId(null); }}
                    className={`gap-1.5 rounded-xl text-xs font-bold h-9 ${activeTool === 'editVertex' ? 'bg-[#22aa44] text-white' : ''}`}
                >
                    <Pen className="h-3.5 w-3.5" />
                    Edit Shape
                </Button>

                <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

                <div className="flex items-center gap-1.5">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">⌀</Label>
                    <Input
                        type="number"
                        min={5}
                        max={200}
                        value={holeDiameter}
                        onChange={(e) => setHoleDiameter(parseInt(e.target.value) || 20)}
                        className="w-16 h-9 text-xs font-bold rounded-xl border-slate-200 dark:border-slate-800 text-center"
                    />
                    <span className="text-[10px] font-bold text-slate-400">mm</span>
                </div>

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
                    <Button variant="ghost" size="icon" onClick={handleResetView} className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-600" title="Fit to view">
                        <Focus className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* Canvas Container */}
            <div
                ref={containerRef}
                className="flex-1 relative bg-slate-50 dark:bg-slate-950"
                style={{ minHeight: 400 }}
            />

            {/* Status bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                <span>{Math.round(bb.width)} × {Math.round(bb.height)} mm</span>
                <span>{holes.length} hole{holes.length !== 1 ? 's' : ''}</span>
                <span>Scroll to zoom • Alt+Drag to pan</span>
            </div>
        </div>
    );
}
