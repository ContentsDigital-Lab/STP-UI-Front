"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { ordersApi } from "@/lib/api/orders";
import type { Order, Customer, Material, Worker } from "@/lib/api/types";
import type { StickerTemplate, StickerElement } from "./types";

const MM_TO_PX = 3.7795275591;

interface SampleData {
    orderCode: string; customerName: string; materialName: string;
    quantity: string; status: string; assignedTo: string; date: string; time: string;
}

const DEFAULT_DATA: SampleData = {
    orderCode: "ORD-001",
    customerName: "บริษัท กระจกไทย จำกัด",
    materialName: "กระจก Clear 10mm",
    quantity: "50",
    status: "กำลังดำเนินการ",
    assignedTo: "สมชาย ใจดี",
    date: new Date().toLocaleDateString("th-TH"),
    time: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
};

const STATUS_LABEL: Record<string, string> = {
    pending: "รอดำเนินการ", in_progress: "กำลังดำเนินการ",
    completed: "เสร็จสิ้น", cancelled: "ยกเลิก",
};

function resolveText(text: string, d: SampleData): string {
    return text
        .replace(/\{\{orderCode\}\}/g, d.orderCode)
        .replace(/\{\{customerName\}\}/g, d.customerName)
        .replace(/\{\{materialName\}\}/g, d.materialName)
        .replace(/\{\{quantity\}\}/g, d.quantity)
        .replace(/\{\{status\}\}/g, d.status)
        .replace(/\{\{assignedTo\}\}/g, d.assignedTo)
        .replace(/\{\{date\}\}/g, d.date)
        .replace(/\{\{time\}\}/g, d.time);
}

function renderEl(el: StickerElement, scale: number, data: SampleData): React.ReactNode {
    const left = el.x * scale, top = el.y * scale;

    if (el.type === "text" || el.type === "dynamic") {
        return (
            <span key={el.id} style={{
                position: "absolute", left, top,
                fontSize: el.fontSize * scale, color: el.fill,
                fontWeight: el.bold ? "bold" : "normal",
                fontStyle: el.italic ? "italic" : "normal",
                fontFamily: "'Prompt', sans-serif",
                whiteSpace: "nowrap", lineHeight: 1, userSelect: "none",
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                transformOrigin: "0 0",
            }}>
                {resolveText(el.text, data)}
            </span>
        );
    }
    if (el.type === "qr") {
        const qrSize = Math.round(Math.min(el.width, el.height) * scale);
        return (
            <div key={el.id} style={{
                position: "absolute", left, top,
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                transformOrigin: "0 0",
            }}>
                <QRCodeCanvas value={resolveText(el.value, data) || " "} size={qrSize} />
            </div>
        );
    }
    if (el.type === "rect") {
        return (
            <div key={el.id} style={{
                position: "absolute", left, top,
                width: el.width * scale, height: el.height * scale,
                background: el.fill === "transparent" ? "transparent" : el.fill,
                border: `${Math.max(0.5, el.strokeWidth * scale)}px solid ${el.stroke}`,
                boxSizing: "border-box",
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                transformOrigin: "0 0",
            }} />
        );
    }
    if (el.type === "line") {
        const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = el.points;
        const dx = (x2 - x1) * scale, dy = (y2 - y1) * scale;
        return (
            <div key={el.id} style={{
                position: "absolute", left: left + x1 * scale, top: top + y1 * scale,
                width: Math.sqrt(dx * dx + dy * dy), height: Math.max(1, el.strokeWidth * scale),
                background: el.stroke, transformOrigin: "0 50%",
                transform: `rotate(${Math.atan2(dy, dx) * 180 / Math.PI + (el.rotation ?? 0)}deg)`,
            }} />
        );
    }
    if (el.type === "image") {
        // eslint-disable-next-line @next/next/no-img-element
        return <img key={el.id} src={el.src} alt="" style={{
            position: "absolute", left, top,
            width: el.width * scale, height: el.height * scale, objectFit: "contain",
            transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
            transformOrigin: "0 0",
        }} />;
    }
    if (el.type === "group") {
        return (
            <div key={el.id} style={{
                position: "absolute", left, top,
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                transformOrigin: "0 0",
            }}>
                {el.children.map(child => renderEl(child, scale, data))}
            </div>
        );
    }
    return null;
}

function PreviewCanvas({ template, data, scale }: { template: StickerTemplate; data: SampleData; scale: number }) {
    const pxW = Math.round(template.width * MM_TO_PX);
    const pxH = Math.round(template.height * MM_TO_PX);

    return (
        <div style={{ position: "relative", width: pxW * scale, height: pxH * scale, background: "white", overflow: "hidden", flexShrink: 0 }}>
            {template.elements.map(el => renderEl(el, scale, data))}
        </div>
    );
}

export default function StickerPreviewModal({ template, onClose }: {
    template: StickerTemplate;
    onClose: () => void;
}) {
    const [data] = useState<SampleData>(DEFAULT_DATA);
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(3);

    // Fit sticker to 80% of viewport
    useEffect(() => {
        const calc = () => {
            const vw = window.innerWidth * 0.80;
            const vh = window.innerHeight * 0.80;
            const pxW = Math.round(template.width * MM_TO_PX);
            const pxH = Math.round(template.height * MM_TO_PX);
            setScale(Math.min(8, Math.max(1, Math.min(vw / pxW, vh / pxH))));
        };
        calc();
        window.addEventListener("resize", calc);
        return () => window.removeEventListener("resize", calc);
    }, [template.width, template.height]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", background: "rgba(0,0,0,0.45)" }}
            onClick={onClose}
        >
            {/* Stop click-through on the sticker itself */}
            <div onClick={e => e.stopPropagation()}>
                <PreviewCanvas template={template} data={data} scale={scale} />
            </div>
        </div>
    );
}
