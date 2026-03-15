"use client";

import { useNode } from "@craftjs/core";
import { useRef, useState, useEffect } from "react";
import { X, Plus, Send, CheckCircle2, Loader2, Workflow, GripVertical, Search, ChevronRight, AlertCircle } from "lucide-react";
import { fetchApi } from "@/lib/api/config";
import { usePreview } from "../PreviewContext";
import { STATION_CATALOG } from "@/lib/stations/catalog";

const PRESETS = [
    { label: "กระจกเทมเปอร์",  stations: ["cutting","grinding","tempering","inspection","packing","delivery"]            },
    { label: "กระจกลามิเนต",   stations: ["cutting","grinding","laminating","inspection","packing","delivery"]           },
    { label: "กระจกธรรมดา",    stations: ["cutting","grinding","inspection","packing","delivery"]                        },
    { label: "กระจกเจาะรู",    stations: ["cutting","grinding","drilling","inspection","packing","delivery"]             },
    { label: "เต็มกระบวนการ",  stations: ["cutting","grinding","drilling","tempering","laminating","coating","framing","inspection","packing","delivery"] },
];

// ── OrderRequest shape (minimal) ──────────────────────────────────────────────
interface RequestRecord {
    _id:              string;
    details:          { type: string; estimatedPrice: number; quantity: number };
    customer:         string | { _id: string; name: string };
    deadline:         string;
    deliveryLocation: string;
    createdAt:        string;
}

function customerName(r: RequestRecord): string {
    if (typeof r.customer === "object" && r.customer !== null) return r.customer.name;
    return String(r.customer ?? "—");
}
function shortId(id: string): string {
    return id.slice(-6).toUpperCase();
}
function fmtDate(iso: string): string {
    try { return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }); }
    catch { return iso; }
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface StationSequencePickerProps {
    title?:          string;
    submitEndpoint?: string;
    requestIdParam?: string;
}

// ── Drag-and-drop sequence list ───────────────────────────────────────────────
function DraggableSequence({
    sequence, onReorder, onRemove,
}: {
    sequence: string[]; onReorder: (from: number, to: number) => void; onRemove: (id: string) => void;
}) {
    const dragIndex  = useRef<number | null>(null);
    const overIndex  = useRef<number | null>(null);
    const [dragging, setDragging] = useState<number | null>(null);
    const [over,     setOver]     = useState<number | null>(null);

    return (
        <div className="space-y-1.5">
            {sequence.map((id, i) => {
                const s = STATION_CATALOG.find((c) => c.id === id)!;
                const isDragging = dragging === i;
                const isOver     = over === i && dragging !== null && dragging !== i;
                return (
                    <div
                        key={`seq-${id}-${i}`}
                        draggable
                        onDragStart={() => { dragIndex.current = i; setDragging(i); }}
                        onDragOver={(e) => { e.preventDefault(); overIndex.current = i; setOver(i); }}
                        onDragLeave={() => { overIndex.current = null; setOver(null); }}
                        onDrop={(e) => {
                            e.preventDefault();
                            if (dragIndex.current !== null && overIndex.current !== null && dragIndex.current !== overIndex.current)
                                onReorder(dragIndex.current, overIndex.current);
                            setDragging(null); setOver(null);
                            dragIndex.current = null; overIndex.current = null;
                        }}
                        onDragEnd={() => { setDragging(null); setOver(null); }}
                        className={`flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 select-none transition-all ${
                            isDragging ? "opacity-40 scale-[0.98]" : "opacity-100"
                        } ${isOver ? "border-primary shadow-md translate-y-[-2px]" : "border-border"} cursor-grab active:cursor-grabbing`}
                    >
                        <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                        <span className="text-xs text-muted-foreground/50 w-5 text-center shrink-0 font-mono">{i + 1}</span>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${s.color}`}>{s.label}</span>
                        <span className="text-xs text-muted-foreground flex-1 truncate">{s.desc}</span>
                        <button type="button" onClick={() => onRemove(id)}
                            className="shrink-0 p-1 rounded hover:bg-red-50 text-muted-foreground/30 hover:text-red-500 transition-colors">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

// ── Step 1: Request picker ────────────────────────────────────────────────────
function RequestPicker({ onSelect }: { onSelect: (r: RequestRecord) => void }) {
    const [requests,  setRequests]  = useState<RequestRecord[]>([]);
    const [loading,   setLoading]   = useState(true);
    const [error,     setError]     = useState("");
    const [search,    setSearch]    = useState("");

    useEffect(() => {
        fetchApi<{ success: boolean; data: RequestRecord[] }>("/requests")
            .then((res) => {
                if (res.success) setRequests(res.data ?? []);
                else setError("โหลดข้อมูลไม่สำเร็จ");
            })
            .catch(() => setError("เชื่อมต่อ API ไม่ได้"))
            .finally(() => setLoading(false));
    }, []);

    const filtered = search.trim()
        ? requests.filter((r) => {
            const q = search.toLowerCase();
            return (
                customerName(r).toLowerCase().includes(q) ||
                r.details.type.toLowerCase().includes(q) ||
                shortId(r._id).toLowerCase().includes(q)
            );
        })
        : requests;

    if (loading) return (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">กำลังโหลดบิล...</span>
        </div>
    );

    if (error) return (
        <div className="flex items-center justify-center py-10 gap-2 text-amber-600">
            <AlertCircle className="h-5 w-5" /><span className="text-sm">{error}</span>
        </div>
    );

    return (
        <div className="flex flex-col gap-3">
            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ค้นหาลูกค้า, ประเภทกระจก, รหัสบิล..."
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">ไม่พบบิล</p>
            ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {filtered.map((r) => (
                        <button key={r._id} type="button" onClick={() => onSelect(r)}
                            className="w-full text-left rounded-xl border bg-card hover:border-primary/50 hover:bg-primary/5 px-4 py-3 transition-all group">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                            #{shortId(r._id)}
                                        </span>
                                        <span className="text-sm font-semibold text-foreground truncate">{customerName(r)}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">{r.details.type}</p>
                                    <div className="flex items-center gap-3 mt-1.5">
                                        <span className="text-[10px] text-muted-foreground/60">จำนวน {r.details.quantity} ชิ้น</span>
                                        <span className="text-[10px] text-muted-foreground/60">กำหนดส่ง {fmtDate(r.deadline)}</span>
                                        <span className="text-[10px] font-medium text-emerald-600">{r.details.estimatedPrice.toLocaleString("th-TH")} ฿</span>
                                    </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary shrink-0 mt-1 transition-colors" />
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Selected request summary card ─────────────────────────────────────────────
function RequestSummaryCard({ request, onClear }: { request: RequestRecord; onClear: () => void }) {
    return (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-mono bg-emerald-200/60 dark:bg-emerald-800/40 px-1.5 py-0.5 rounded text-emerald-700 dark:text-emerald-300">
                        #{shortId(request._id)}
                    </span>
                    <span className="text-sm font-semibold text-foreground truncate">{customerName(request)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{request.details.type} · {request.details.quantity} ชิ้น · {fmtDate(request.deadline)}</p>
            </div>
            <button type="button" onClick={onClear}
                className="p-1 rounded text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                title="เปลี่ยนบิล">
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function StationSequencePicker({
    title          = "กำหนดเส้นทางการผลิต",
    submitEndpoint = "/orders",
    requestIdParam = "id",
}: StationSequencePickerProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();

    const [sequence,         setSequence]         = useState<string[]>(["cutting","grinding","inspection","packing","delivery"]);
    const [feedback,         setFeedback]         = useState<"" | "loading" | "ok" | "error">("");
    const [presetUsed,       setPresetUsed]       = useState("");
    const [selectedRequest,  setSelectedRequest]  = useState<RequestRecord | null>(null);
    const [step,             setStep]             = useState<1 | 2>(1);   // 1=pick request, 2=sequence

    // If request ID already in URL, skip step 1
    useEffect(() => {
        if (!isPreview) return;
        const urlId = new URLSearchParams(window.location.search).get(requestIdParam)
            ?? null;
        if (urlId) {
            // Pre-fill from API so we can show the summary card
            fetchApi<{ success: boolean; data: RequestRecord }>(`/requests/${urlId}`)
                .then((res) => {
                    if (res.success && res.data) {
                        setSelectedRequest(res.data);
                        setStep(2);
                    }
                })
                .catch(() => {
                    // ID in URL but can't fetch — still jump to step 2 with a minimal placeholder
                    setSelectedRequest({ _id: urlId, details: { type: "—", estimatedPrice: 0, quantity: 0 }, customer: "—", deadline: "", deliveryLocation: "", createdAt: "" });
                    setStep(2);
                });
        }
    }, [isPreview, requestIdParam]);

    const addStation    = (id: string) => { if (!sequence.includes(id)) setSequence([...sequence, id]); };
    const removeStation = (id: string) => setSequence(sequence.filter((s) => s !== id));
    const reorder = (from: number, to: number) => {
        const next = [...sequence];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        setSequence(next);
    };
    const applyPreset = (stations: string[], label: string) => { setSequence(stations); setPresetUsed(label); };

    const handleSubmit = async () => {
        if (!selectedRequest) return;
        setFeedback("loading");
        try {
            await fetchApi(submitEndpoint, {
                method: "POST",
                body: JSON.stringify({ request: selectedRequest._id, stations: sequence }),
            });
            setFeedback("ok");
        } catch {
            setFeedback("error");
            setTimeout(() => setFeedback(""), 3000);
        }
    };

    // ── Preview render ────────────────────────────────────────────────────────
    if (isPreview) {
        if (feedback === "ok") {
            return (
                <div className="w-full rounded-xl border bg-card p-10 flex flex-col items-center gap-3 text-center">
                    <CheckCircle2 className="h-14 w-14 text-green-500" />
                    <p className="text-base font-semibold">เปิดออเดอร์สำเร็จ!</p>
                    <p className="text-sm text-muted-foreground">ออเดอร์ถูกสร้างพร้อมเส้นทางผลิตที่กำหนดแล้ว</p>
                </div>
            );
        }

        const available = STATION_CATALOG.filter((s) => !sequence.includes(s.id));

        return (
            <div className="w-full rounded-xl border bg-card overflow-hidden">
                {/* Header */}
                <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-semibold">{title}</p>
                        {step === 1
                            ? <p className="text-xs text-muted-foreground mt-0.5">ขั้นตอนที่ 1/2 — เลือกบิลที่ต้องการเปิดออเดอร์</p>
                            : <p className="text-xs text-muted-foreground mt-0.5">ขั้นตอนที่ 2/2 — กำหนดเส้นทางการผลิต</p>
                        }
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className={`h-2 w-2 rounded-full ${step >= 1 ? "bg-primary" : "bg-muted"}`} />
                        <div className={`h-1 w-4 rounded-full ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
                        <div className={`h-2 w-2 rounded-full ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
                    </div>
                </div>

                {/* Step 1: Pick request */}
                {step === 1 && (
                    <div className="p-5">
                        <RequestPicker onSelect={(r) => { setSelectedRequest(r); setStep(2); }} />
                    </div>
                )}

                {/* Step 2: Sequence */}
                {step === 2 && (
                    <>
                        {/* Selected request summary */}
                        {selectedRequest && (
                            <div className="px-5 pt-4">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">บิลที่เลือก</p>
                                <RequestSummaryCard request={selectedRequest} onClear={() => { setSelectedRequest(null); setStep(1); }} />
                            </div>
                        )}

                        {/* Presets */}
                        <div className="px-5 pt-4 pb-3">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">เส้นทางแนะนำ</p>
                            <div className="flex flex-wrap gap-1.5">
                                {PRESETS.map((p) => (
                                    <button key={p.label} type="button" onClick={() => applyPreset(p.stations, p.label)}
                                        className={`text-xs px-3 py-1 rounded-full border font-medium transition-all ${
                                            presetUsed === p.label
                                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                                : "bg-background border-muted-foreground/25 text-muted-foreground hover:border-primary/50 hover:text-primary"
                                        }`}>
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Selected sequence — drag to reorder */}
                        <div className="px-5 pb-4 border-t pt-4">
                            <div className="flex items-center justify-between mb-2.5">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                    เส้นทางที่เลือก ({sequence.length} สถานี)
                                </p>
                                {sequence.length > 1 && (
                                    <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                                        <GripVertical className="h-3 w-3" /> ลากเพื่อจัดเรียง
                                    </p>
                                )}
                            </div>
                            {sequence.length === 0 ? (
                                <div className="border-2 border-dashed border-muted-foreground/20 rounded-xl py-6 text-center">
                                    <p className="text-sm text-muted-foreground/50">เพิ่มสถานีจากด้านล่าง</p>
                                </div>
                            ) : (
                                <DraggableSequence sequence={sequence} onReorder={reorder} onRemove={removeStation} />
                            )}
                        </div>

                        {/* Available stations to add */}
                        {available.length > 0 && (
                            <div className="px-5 pb-4 border-t pt-3">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2.5">เพิ่มสถานี</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {available.map((s) => (
                                        <button key={s.id} type="button" onClick={() => addStation(s.id)}
                                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-muted-foreground/25 text-muted-foreground hover:border-primary/60 hover:text-primary hover:bg-primary/5 transition-all">
                                            <Plus className="h-3 w-3" />{s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Submit */}
                        <div className="px-5 pb-5">
                            {feedback === "error" && <p className="text-xs text-red-500 mb-2">เกิดข้อผิดพลาด กรุณาลองใหม่</p>}
                            <button type="button" onClick={handleSubmit}
                                disabled={sequence.length === 0 || feedback === "loading" || !selectedRequest}
                                className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                                {feedback === "loading"
                                    ? <><Loader2 className="h-4 w-4 animate-spin" /> กำลังสร้างออเดอร์...</>
                                    : <><Send className="h-4 w-4" /> เปิดออเดอร์ ({sequence.length} สถานี)</>
                                }
                            </button>
                        </div>
                    </>
                )}
            </div>
        );
    }

    // ── Design mode ───────────────────────────────────────────────────────────
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-xl border-2 cursor-grab overflow-hidden transition-all
                ${selected ? "border-primary ring-2 ring-primary/20" : "border-slate-200 dark:border-slate-700 hover:border-primary/30"}`}
        >
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
                <div className="flex items-center gap-2">
                    <Workflow className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <p className="text-xs font-semibold text-foreground/70">{title}</p>
                </div>
                <span className="text-[10px] text-muted-foreground/50">POST {submitEndpoint}</span>
            </div>
            <div className="p-4 space-y-2 opacity-60 pointer-events-none">
                {/* Step 1 preview */}
                <div className="rounded-lg border border-dashed border-muted-foreground/30 px-3 py-2 flex items-center gap-2">
                    <Search className="h-3 w-3 text-muted-foreground/40" />
                    <span className="text-[10px] text-muted-foreground/50">เลือกบิล / คำขอ...</span>
                </div>
                <div className="flex flex-wrap gap-1">
                    {PRESETS.slice(0, 4).map((p) => (
                        <span key={p.label} className="text-[10px] px-2 py-0.5 rounded-full border border-muted-foreground/20 text-muted-foreground">{p.label}</span>
                    ))}
                </div>
                <div className="space-y-1">
                    {["cutting","grinding","inspection","delivery"].map((id, i) => {
                        const s = STATION_CATALOG.find((c) => c.id === id)!;
                        return (
                            <div key={id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
                                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/20" />
                                <span className="text-[10px] text-muted-foreground/30 w-4 font-mono">{i + 1}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
                            </div>
                        );
                    })}
                </div>
                <div className="h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                    <span className="text-xs text-primary/60 font-medium">เปิดออเดอร์</span>
                </div>
            </div>
        </div>
    );
}

StationSequencePicker.craft = {
    displayName: "Station Sequence",
    props: { title: "กำหนดเส้นทางการผลิต", submitEndpoint: "/orders", requestIdParam: "id" } as StationSequencePickerProps,
};
