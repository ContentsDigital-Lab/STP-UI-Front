"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, RotateCcw } from "lucide-react";

export interface CropArea { x: number; y: number; w: number; h: number; }

const HANDLE = 9;

export default function CropModal({ src, initialCrop, onConfirm, onClose }: {
    src: string;
    initialCrop?: CropArea;
    onConfirm: (crop: CropArea) => void;
    onClose: () => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef    = useRef<HTMLImageElement | null>(null);
    const dragRef   = useRef<{ h: string; sx: number; sy: number; oc: CropArea } | null>(null);

    const [ready, setReady] = useState(false);
    const [scale, setScale] = useState(1);   // displayPx / srcPx
    const [disp,  setDisp]  = useState({ w: 0, h: 0 });
    const [crop,  setCrop]  = useState<CropArea>({ x: 0, y: 0, w: 1, h: 1 });

    // ── Load image ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const img = new Image();
        img.onload = () => {
            imgRef.current = img;
            const MAX = Math.min(640, typeof window !== "undefined" ? window.innerWidth * 0.78 : 640);
            const s   = Math.min(MAX / img.naturalWidth, (typeof window !== "undefined" ? window.innerHeight * 0.55 : 400) / img.naturalHeight, 1);
            const dw  = Math.round(img.naturalWidth * s);
            const dh  = Math.round(img.naturalHeight * s);
            setScale(s);
            setDisp({ w: dw, h: dh });
            setCrop(initialCrop
                ? { x: initialCrop.x * s, y: initialCrop.y * s, w: initialCrop.w * s, h: initialCrop.h * s }
                : { x: 0, y: 0, w: dw, h: dh });
            setReady(true);
        };
        img.src = src;
    }, [src, initialCrop]);

    // ── Draw ───────────────────────────────────────────────────────────────────
    const draw = useCallback(() => {
        const cvs = canvasRef.current;
        const img = imgRef.current;
        if (!cvs || !img || !ready) return;
        const ctx = cvs.getContext("2d")!;
        cvs.width  = disp.w;
        cvs.height = disp.h;

        // 1) dimmed full image
        ctx.drawImage(img, 0, 0, disp.w, disp.h);
        ctx.fillStyle = "rgba(0,0,0,0.52)";
        ctx.fillRect(0, 0, disp.w, disp.h);

        // 2) bright crop area
        ctx.save();
        ctx.beginPath();
        ctx.rect(crop.x, crop.y, crop.w, crop.h);
        ctx.clip();
        ctx.drawImage(img, 0, 0, disp.w, disp.h);
        ctx.restore();

        // 3) border
        ctx.strokeStyle = "#fff";
        ctx.lineWidth   = 1.5;
        ctx.strokeRect(crop.x + 0.75, crop.y + 0.75, crop.w - 1.5, crop.h - 1.5);

        // 4) rule-of-thirds
        ctx.strokeStyle = "rgba(255,255,255,0.28)";
        ctx.lineWidth   = 0.75;
        for (let i = 1; i < 3; i++) {
            ctx.beginPath(); ctx.moveTo(crop.x + crop.w * i / 3, crop.y); ctx.lineTo(crop.x + crop.w * i / 3, crop.y + crop.h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(crop.x, crop.y + crop.h * i / 3); ctx.lineTo(crop.x + crop.w, crop.y + crop.h * i / 3); ctx.stroke();
        }

        // 5) corner handles
        const corners: [number, number][] = [
            [crop.x, crop.y], [crop.x + crop.w, crop.y],
            [crop.x, crop.y + crop.h], [crop.x + crop.w, crop.y + crop.h],
        ];
        corners.forEach(([hx, hy]) => {
            ctx.fillStyle   = "#fff";
            ctx.strokeStyle = "rgba(0,0,0,0.25)";
            ctx.lineWidth   = 0.75;
            ctx.fillRect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE);
            ctx.strokeRect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE);
        });
    }, [crop, disp, ready]);

    useEffect(() => { draw(); }, [draw]);

    // ── Mouse helpers ──────────────────────────────────────────────────────────
    const getPos = (e: React.MouseEvent) => {
        const cvs = canvasRef.current!;
        const r   = cvs.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (cvs.width  / r.width),
            y: (e.clientY - r.top)  * (cvs.height / r.height),
        };
    };

    const hitTest = (mx: number, my: number): string => {
        const H = HANDLE + 5, c = crop;
        if (Math.abs(mx - c.x) < H         && Math.abs(my - c.y) < H)          return "tl";
        if (Math.abs(mx - (c.x + c.w)) < H && Math.abs(my - c.y) < H)          return "tr";
        if (Math.abs(mx - c.x) < H         && Math.abs(my - (c.y + c.h)) < H)  return "bl";
        if (Math.abs(mx - (c.x + c.w)) < H && Math.abs(my - (c.y + c.h)) < H) return "br";
        if (mx > c.x && mx < c.x + c.w && my > c.y && my < c.y + c.h)         return "move";
        return "";
    };

    const onMouseDown = (e: React.MouseEvent) => {
        const p = getPos(e);
        const h = hitTest(p.x, p.y);
        if (h) dragRef.current = { h, sx: p.x, sy: p.y, oc: { ...crop } };
    };

    const onMouseMove = (e: React.MouseEvent) => {
        const p = getPos(e);
        if (!dragRef.current && canvasRef.current) {
            const cursors: Record<string, string> = { tl: "nwse-resize", tr: "nesw-resize", bl: "nesw-resize", br: "nwse-resize", move: "move" };
            canvasRef.current.style.cursor = cursors[hitTest(p.x, p.y)] || "default";
        }
        if (!dragRef.current) return;
        const dx = p.x - dragRef.current.sx, dy = p.y - dragRef.current.sy;
        const o  = dragRef.current.oc;
        const MIN = 20;
        let c = { ...o };
        switch (dragRef.current.h) {
            case "move": c.x = Math.max(0, Math.min(disp.w - o.w, o.x + dx)); c.y = Math.max(0, Math.min(disp.h - o.h, o.y + dy)); break;
            case "tl":   c.x = Math.max(0, Math.min(o.x + o.w - MIN, o.x + dx)); c.y = Math.max(0, Math.min(o.y + o.h - MIN, o.y + dy)); c.w = o.w - (c.x - o.x); c.h = o.h - (c.y - o.y); break;
            case "tr":   c.y = Math.max(0, Math.min(o.y + o.h - MIN, o.y + dy)); c.w = Math.max(MIN, Math.min(disp.w - o.x, o.w + dx)); c.h = o.h - (c.y - o.y); break;
            case "bl":   c.x = Math.max(0, Math.min(o.x + o.w - MIN, o.x + dx)); c.w = o.w - (c.x - o.x); c.h = Math.max(MIN, Math.min(disp.h - o.y, o.h + dy)); break;
            case "br":   c.w = Math.max(MIN, Math.min(disp.w - o.x, o.w + dx)); c.h = Math.max(MIN, Math.min(disp.h - o.y, o.h + dy)); break;
        }
        setCrop(c);
    };

    const onMouseUp = () => { dragRef.current = null; };

    const reset = () => { if (ready) setCrop({ x: 0, y: 0, w: disp.w, h: disp.h }); };

    const confirm = () => {
        if (!ready) return;
        onConfirm({
            x: Math.round(crop.x / scale),
            y: Math.round(crop.y / scale),
            w: Math.round(crop.w / scale),
            h: Math.round(crop.h / scale),
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div className="bg-card rounded-2xl shadow-2xl flex flex-col overflow-hidden max-w-full" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b">
                    <span className="font-bold text-sm">ตัดรูปภาพ</span>
                    <span className="text-[11px] text-muted-foreground">ลากขอบหรือมุมเพื่อปรับพื้นที่ตัด</span>
                </div>

                {/* Canvas */}
                <div className="flex items-center justify-center bg-zinc-900 p-4 min-h-[120px]">
                    {ready ? (
                        <canvas
                            ref={canvasRef}
                            style={{ display: "block", maxWidth: "100%", maxHeight: "60vh" }}
                            onMouseDown={onMouseDown}
                            onMouseMove={onMouseMove}
                            onMouseUp={onMouseUp}
                            onMouseLeave={onMouseUp}
                        />
                    ) : (
                        <span className="text-zinc-400 text-sm">กำลังโหลด...</span>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t gap-4">
                    <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-muted-foreground" onClick={reset}>
                        <RotateCcw className="h-3.5 w-3.5" /> รีเซ็ต
                    </Button>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={onClose}>
                            <X className="h-3.5 w-3.5" /> ยกเลิก
                        </Button>
                        <Button size="sm" className="gap-1.5 h-8" disabled={!ready} onClick={confirm}>
                            <Check className="h-3.5 w-3.5" /> ใช้งาน
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
