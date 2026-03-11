"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MousePointer2, Circle, Trash2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export interface HoleData {
    id: string;
    x: number;
    y: number;
    diameter: number;
}

interface GlassDesignerProps {
    width: number;
    height: number;
    holes: HoleData[];
    onHolesChange: (holes: HoleData[]) => void;
}

let holeCounter = 0;

function makeTextSprite(text: string, color = '#555555'): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const fontSize = 28;
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    const metrics = ctx.measureText(text);
    canvas.width = Math.ceil(metrics.width) + 16;
    canvas.height = fontSize + 16;
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(canvas.width / 4, canvas.height / 4, 1);
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

    // Main dimension line
    const mainGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    group.add(new THREE.Line(mainGeo, lineMat));

    // Extension lines
    const ext1Geo = new THREE.BufferGeometry().setFromPoints([extS1, extS2]);
    const ext2Geo = new THREE.BufferGeometry().setFromPoints([extE1, extE2]);
    group.add(new THREE.Line(ext1Geo, lineMat));
    group.add(new THREE.Line(ext2Geo, lineMat));

    // Arrow heads
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

    // Label
    const mid = new THREE.Vector3().lerpVectors(p1, p2, 0.5);
    const sprite = makeTextSprite(label);
    sprite.position.copy(mid);
    sprite.position.z = 0.5;
    group.add(sprite);
}

export function GlassDesigner({ width, height, holes, onHolesChange }: GlassDesignerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const glassGroupRef = useRef(new THREE.Group());
    const glassMeshRef = useRef<THREE.Mesh | null>(null);

    const [activeTool, setActiveTool] = useState<'select' | 'addHole'>('select');
    const [selectedHoleId, setSelectedHoleId] = useState<string | null>(null);
    const [holeDiameter, setHoleDiameter] = useState(20);

    const isDraggingRef = useRef(false);
    const isPanningRef = useRef(false);
    const dragHoleIdRef = useRef<string | null>(null);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const panStartRef = useRef({ x: 0, y: 0 });
    const camStartRef = useRef({ cx: 0, cy: 0 });

    const holesRef = useRef(holes);
    holesRef.current = holes;

    const activeToolRef = useRef(activeTool);
    activeToolRef.current = activeTool;

    const selectedHoleIdRef = useRef(selectedHoleId);
    selectedHoleIdRef.current = selectedHoleId;

    const holeDiameterRef = useRef(holeDiameter);
    holeDiameterRef.current = holeDiameter;

    const renderScene = useCallback(() => {
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
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

    // Build the glass scene objects
    const buildGlassScene = useCallback(() => {
        const group = glassGroupRef.current;
        while (group.children.length) group.remove(group.children[0]);

        // Grid
        const gridSize = Math.max(width, height) * 2;
        const gridStep = 50;
        const gridLines: THREE.Vector3[] = [];
        const gridMat = new THREE.LineBasicMaterial({ color: 0xeeeeee });
        for (let i = -gridSize; i <= gridSize; i += gridStep) {
            gridLines.push(new THREE.Vector3(i, -gridSize, -0.2), new THREE.Vector3(i, gridSize, -0.2));
            gridLines.push(new THREE.Vector3(-gridSize, i, -0.2), new THREE.Vector3(gridSize, i, -0.2));
        }
        group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridLines), gridMat));

        // Glass panel shape with holes (THREE.Shape)
        const glassShape = new THREE.Shape();
        glassShape.moveTo(0, 0);
        glassShape.lineTo(width, 0);
        glassShape.lineTo(width, height);
        glassShape.lineTo(0, height);
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
        const borderPoints = [
            new THREE.Vector3(0, 0, 3.1),
            new THREE.Vector3(width, 0, 3.1),
            new THREE.Vector3(width, height, 3.1),
            new THREE.Vector3(0, height, 3.1),
            new THREE.Vector3(0, 0, 3.1),
        ];
        const borderMat = new THREE.LineBasicMaterial({ color: 0x1B4B9A, linewidth: 2 });
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(borderPoints), borderMat));

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

            // Crosshairs
            const chLen = h.diameter / 2 + 4;
            const crossPoints = [
                new THREE.Vector3(h.x - chLen, h.y, 3.2), new THREE.Vector3(h.x + chLen, h.y, 3.2),
                new THREE.Vector3(h.x, h.y - chLen, 3.2), new THREE.Vector3(h.x, h.y + chLen, 3.2),
            ];
            const crossMat = new THREE.LineBasicMaterial({ color: isSelected ? 0xE8601C : 0xcc6644, linewidth: 1 });
            group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(crossPoints), crossMat));

            // Hole label
            const hLabel = makeTextSprite(`⌀${h.diameter}`, isSelected ? '#E8601C' : '#aa5533');
            hLabel.position.set(h.x, h.y - h.diameter / 2 - 8, 3.3);
            group.add(hLabel);
        });

        // Dimension lines
        const dimOffset = -25;
        makeDimensionLine(group,
            new THREE.Vector3(0, 0, 0), new THREE.Vector3(width, 0, 0),
            `${width} mm`, dimOffset, 'horizontal', 0x1B4B9A
        );
        makeDimensionLine(group,
            new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, height, 0),
            `${height} mm`, dimOffset, 'vertical', 0x1B4B9A
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

        const padding = Math.max(width, height) * 0.3;
        const totalW = width + padding * 2;
        const totalH = height + padding * 2;
        const aspect = w / h;
        let camW: number, camH: number;
        if (aspect > totalW / totalH) {
            camH = totalH;
            camW = camH * aspect;
        } else {
            camW = totalW;
            camH = camW / aspect;
        }

        const camera = new THREE.OrthographicCamera(
            -camW / 2 + width / 2, camW / 2 + width / 2,
            camH / 2 + height / 2, -camH / 2 + height / 2,
            0.1, 1000
        );
        camera.position.set(width / 2, height / 2, 100);
        camera.lookAt(width / 2, height / 2, 0);
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
            let nW: number, nH: number;
            if (newAspect > totalW / totalH) {
                nH = totalH;
                nW = nH * newAspect;
            } else {
                nW = totalW;
                nH = nW / newAspect;
            }
            camera.left = -nW / 2 + width / 2;
            camera.right = nW / 2 + width / 2;
            camera.top = nH / 2 + height / 2;
            camera.bottom = -nH / 2 + height / 2;
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
    }, [width, height, holes, selectedHoleId, buildGlassScene]);

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

            if (activeToolRef.current === 'addHole') {
                if (pos.x >= 0 && pos.x <= width && pos.y >= 0 && pos.y <= height) {
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

            if (isDraggingRef.current && dragHoleIdRef.current) {
                const pos = getWorldPos(e.clientX, e.clientY);
                if (!pos) return;
                const clampedX = Math.max(0, Math.min(width, Math.round(pos.x)));
                const clampedY = Math.max(0, Math.min(height, Math.round(pos.y)));
                const updated = holesRef.current.map(h =>
                    h.id === dragHoleIdRef.current ? { ...h, x: clampedX, y: clampedY } : h
                );
                onHolesChange(updated);
            }
        };

        const onMouseUp = () => {
            isPanningRef.current = false;
            isDraggingRef.current = false;
            dragHoleIdRef.current = null;
            canvas.style.cursor = activeToolRef.current === 'addHole' ? 'crosshair' : 'default';
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
    }, [width, height, getWorldPos, findHoleAtPos, onHolesChange, renderScene]);

    // Update cursor when tool changes
    useEffect(() => {
        const canvas = rendererRef.current?.domElement;
        if (canvas) {
            canvas.style.cursor = activeTool === 'addHole' ? 'crosshair' : 'default';
        }
    }, [activeTool]);

    const handleDeleteSelected = () => {
        if (!selectedHoleId) return;
        onHolesChange(holes.filter(h => h.id !== selectedHoleId));
        setSelectedHoleId(null);
    };

    const handleResetView = () => {
        const cam = cameraRef.current;
        const container = containerRef.current;
        if (!cam || !container) return;
        const padding = Math.max(width, height) * 0.3;
        const totalW = width + padding * 2;
        const totalH = height + padding * 2;
        const aspect = container.clientWidth / container.clientHeight;
        let camW: number, camH: number;
        if (aspect > totalW / totalH) {
            camH = totalH;
            camW = camH * aspect;
        } else {
            camW = totalW;
            camH = camW / aspect;
        }
        cam.left = -camW / 2 + width / 2;
        cam.right = camW / 2 + width / 2;
        cam.top = camH / 2 + height / 2;
        cam.bottom = -camH / 2 + height / 2;
        cam.position.set(width / 2, height / 2, 100);
        cam.updateProjectionMatrix();
        renderScene();
    };

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                <Button
                    variant={activeTool === 'select' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTool('select')}
                    className={`gap-1.5 rounded-xl text-xs font-bold h-9 ${activeTool === 'select' ? 'bg-[#1B4B9A] text-white' : ''}`}
                >
                    <MousePointer2 className="h-3.5 w-3.5" />
                    Select
                </Button>
                <Button
                    variant={activeTool === 'addHole' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTool('addHole')}
                    className={`gap-1.5 rounded-xl text-xs font-bold h-9 ${activeTool === 'addHole' ? 'bg-[#E8601C] text-white' : ''}`}
                >
                    <Circle className="h-3.5 w-3.5" />
                    Add Hole
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
                    onClick={handleDeleteSelected}
                    disabled={!selectedHoleId}
                    className="gap-1.5 rounded-xl text-xs font-bold h-9 text-red-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>

                <div className="ml-auto flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={handleResetView} className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-600">
                        <RotateCcw className="h-3.5 w-3.5" />
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
                <span>{width} × {height} mm</span>
                <span>{holes.length} hole{holes.length !== 1 ? 's' : ''}</span>
                <span>Scroll to zoom • Alt+Drag to pan</span>
            </div>
        </div>
    );
}
