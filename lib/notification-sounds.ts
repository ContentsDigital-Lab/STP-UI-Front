// Web Audio API — no files needed, all generated in browser

export interface SoundDefinition {
    id: string;
    label: string;
    description: string;
    category: "gentle" | "chat" | "clear" | "urgent";
}

export const SOUND_LIST: SoundDefinition[] = [
    // gentle
    { id: "soft_pop",      label: "Soft Pop",      description: "เสียง pop เบาๆ สั้น",               category: "gentle" },
    { id: "ding",          label: "Ding",           description: "กริ่งเดียว นุ่มๆ",                  category: "gentle" },
    { id: "double_ding",   label: "Double Ding",    description: "กริ่งสองครั้ง",                     category: "gentle" },
    { id: "bell",          label: "Bell",           description: "ระฆังใหญ่ มีก้อง",                  category: "gentle" },
    // chat
    { id: "chat_line",     label: "Chat (LINE)",    description: "เสียงแบบ LINE — สองโน้ตขึ้นเร็ว",   category: "chat"   },
    { id: "chat_pop",      label: "Chat Pop",       description: "เสียงแชทแบบ bubble pop",            category: "chat"   },
    { id: "chat_ping",     label: "Chat Ping",      description: "เสียงข้อความสั้น ชัด",              category: "chat"   },
    { id: "chat_notify",   label: "Chat Notify",    description: "เสียงแจ้งเตือน 3 โน้ต คล้าย app",  category: "chat"   },
    { id: "tap_ding",      label: "Tap & Ding",     description: "ตึ + ดิ้ง~ สั้นแล้วก้องยาว",         category: "chat"   },
    // clear
    { id: "chime",         label: "Chime",          description: "เสียงระฆังสั้น สดใส",               category: "clear"  },
    { id: "ping",          label: "Ping",           description: "เสียงชัดสั้น",                      category: "clear"  },
    { id: "rising",        label: "Rising",         description: "โน้ตขึ้น 3 ตัว บอกข่าวดี",         category: "clear"  },
    { id: "falling",       label: "Falling",        description: "โน้ตลง 3 ตัว ระวัง",                category: "clear"  },
    // urgent
    { id: "alert",         label: "Alert",          description: "เสียงเตือนซ้ำ ต้องสังเกต",          category: "urgent" },
    { id: "buzz",          label: "Buzz (สั่น)",    description: "เสียงสั่นจริง คล้ายมือถือสั่นบนโต๊ะ",  category: "urgent" },
    { id: "zap",           label: "Zap (Garena)",   description: "เสียง bop bop แบบ Garena/เกม",          category: "urgent" },
    { id: "urgent",        label: "Urgent",         description: "เสียงเร่งด่วน หลายพัลส์",           category: "urgent" },
];

export const SOUND_CATEGORIES = {
    gentle: "เบา / นุ่มนวล",
    chat:   "แชท / ข้อความ",
    clear:  "ชัดเจน / ปกติ",
    urgent: "เร่งด่วน / สั่น",
};

export const DEFAULT_SOUND_SETTINGS: NotificationSoundSettings = {
    enabled: true,
    volume: 0.6,
    sounds: {
        low:    "soft_pop",
        medium: "ding",
        high:   "alert",
    },
};

export interface NotificationSoundSettings {
    enabled: boolean;
    volume: number; // 0.0 – 1.0
    sounds: {
        low:    string;
        medium: string;
        high:   string;
    };
}

const STORAGE_KEY = "std_notification_sounds";

export function loadSoundSettings(): NotificationSoundSettings {
    if (typeof window === "undefined") return DEFAULT_SOUND_SETTINGS;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_SOUND_SETTINGS;
        const stored = JSON.parse(raw) as Partial<NotificationSoundSettings>;
        // Deep merge — missing nested keys fall back to defaults
        return {
            ...DEFAULT_SOUND_SETTINGS,
            ...stored,
            sounds: {
                ...DEFAULT_SOUND_SETTINGS.sounds,
                ...(stored.sounds ?? {}),
            },
        };
    } catch {
        return DEFAULT_SOUND_SETTINGS;
    }
}

export function saveSoundSettings(settings: NotificationSoundSettings) {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// ─── Sound generators ──────────────────────────────────────────────────────

function getCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    return new (window.AudioContext || (window as any).webkitAudioContext)();
}

function tone(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
    attackTime = 0.01,
    releaseTime = 0.1,
) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + attackTime);
    gain.gain.setValueAtTime(volume, startTime + duration - releaseTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
}

export async function playSound(soundId: string, volume = 0.6): Promise<void> {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume();

    const v = Math.max(0, Math.min(1, volume));
    const t = ctx.currentTime;

    switch (soundId) {
        case "soft_pop":
            tone(ctx, 600, t, 0.12, v * 0.4, "sine", 0.005, 0.08);
            break;

        case "ding":
            tone(ctx, 880, t, 0.5, v * 0.6, "sine", 0.005, 0.35);
            break;

        case "double_ding":
            tone(ctx, 880, t,        0.3, v * 0.6, "sine", 0.005, 0.2);
            tone(ctx, 880, t + 0.35, 0.3, v * 0.6, "sine", 0.005, 0.2);
            break;

        case "chime": {
            // C5 + E5 + G5 chord
            const freqs = [523.25, 659.25, 783.99];
            freqs.forEach((f, i) => tone(ctx, f, t + i * 0.06, 0.6, v * 0.4, "sine", 0.01, 0.3));
            break;
        }

        case "ping":
            tone(ctx, 1200, t, 0.2, v * 0.5, "sine", 0.002, 0.12);
            break;

        case "bell": {
            // fundamental + harmonics for bell-like tone
            tone(ctx, 440, t, 1.2, v * 0.5,  "sine",     0.002, 0.8);
            tone(ctx, 880, t, 0.8, v * 0.2,  "sine",     0.002, 0.5);
            tone(ctx, 1320, t, 0.5, v * 0.1, "triangle", 0.002, 0.3);
            break;
        }

        case "rising":
            tone(ctx, 523.25, t,        0.22, v * 0.55, "sine", 0.01, 0.1); // C5
            tone(ctx, 659.25, t + 0.2,  0.22, v * 0.55, "sine", 0.01, 0.1); // E5
            tone(ctx, 783.99, t + 0.4,  0.35, v * 0.55, "sine", 0.01, 0.2); // G5
            break;

        case "falling":
            tone(ctx, 783.99, t,        0.22, v * 0.55, "sine", 0.01, 0.1); // G5
            tone(ctx, 659.25, t + 0.2,  0.22, v * 0.55, "sine", 0.01, 0.1); // E5
            tone(ctx, 523.25, t + 0.4,  0.35, v * 0.55, "sine", 0.01, 0.2); // C5
            break;

        case "alert":
            tone(ctx, 1000, t,        0.15, v * 0.7, "square", 0.005, 0.05);
            tone(ctx, 1200, t + 0.18, 0.15, v * 0.7, "square", 0.005, 0.05);
            tone(ctx, 1000, t + 0.36, 0.15, v * 0.7, "square", 0.005, 0.05);
            break;

        case "urgent":
            for (let i = 0; i < 4; i++) {
                tone(ctx, 880 + (i % 2) * 220, t + i * 0.12, 0.1, v * 0.8, "sawtooth", 0.005, 0.05);
            }
            break;

        // ─── Chat sounds ────────────────────────────────────────────────────
        case "chat_line":
            // LINE-style: two quick ascending tones
            tone(ctx, 620, t,        0.12, v * 0.55, "sine", 0.005, 0.07);
            tone(ctx, 820, t + 0.13, 0.18, v * 0.55, "sine", 0.005, 0.12);
            break;

        case "chat_pop":
            // bubble pop + tiny echo
            tone(ctx, 900, t,        0.08, v * 0.5,  "sine", 0.003, 0.05);
            tone(ctx, 700, t + 0.09, 0.12, v * 0.25, "sine", 0.003, 0.09);
            break;

        case "chat_ping":
            // short clear message sound
            tone(ctx, 1050, t,       0.15, v * 0.5, "sine", 0.003, 0.10);
            break;

        case "chat_notify":
            // 3-note app notification (do-mi-sol)
            tone(ctx, 523,  t,        0.14, v * 0.5, "sine", 0.005, 0.08);
            tone(ctx, 659,  t + 0.14, 0.14, v * 0.5, "sine", 0.005, 0.08);
            tone(ctx, 784,  t + 0.28, 0.22, v * 0.5, "sine", 0.005, 0.15);
            break;

        case "tap_ding":
            // Quick tap at 700 Hz + clear bell ring at 1400 Hz (reverse-engineered from reference)
            tone(ctx, 700,  t,        0.09, v * 0.75, "sine", 0.003, 0.06);  // short tap
            tone(ctx, 1400, t + 0.09, 0.72, v * 0.55, "sine", 0.005, 0.65);  // long bell ring
            break;

        // ─── Urgent / vibration-style ───────────────────────────────────────
        case "buzz": {
            // ตึ ตึ ดึ้ง — 3 rapid percussive taps, triangle wave with slight pitch drop
            const makeTap = (startTime: number, freq: number, dur: number) => {
                const osc  = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "triangle";
                osc.frequency.setValueAtTime(freq * 1.5, startTime);
                osc.frequency.exponentialRampToValueAtTime(freq, startTime + 0.012);
                gain.gain.setValueAtTime(v * 0.72, startTime);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(startTime);
                osc.stop(startTime + dur + 0.01);
            };
            makeTap(t,         420, 0.05);  // ตึ
            makeTap(t + 0.075, 420, 0.05);  // ตึ
            makeTap(t + 0.15,  370, 0.13);  // ดึ้ง (lower, longer resonance)
            break;
        }

        case "zap": {
            // ตึ้ง ตึ้ง — two quick punchy impacts, slight pitch drop (Garena-like)
            const makeHit = (startTime: number) => {
                const osc  = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "triangle";
                osc.frequency.setValueAtTime(540, startTime);
                osc.frequency.exponentialRampToValueAtTime(280, startTime + 0.02);
                gain.gain.setValueAtTime(v * 0.75, startTime);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(startTime);
                osc.stop(startTime + 0.09);
            };
            makeHit(t);
            makeHit(t + 0.11);
            break;
        }

        default:
            tone(ctx, 880, t, 0.4, v * 0.5, "sine", 0.005, 0.25);
    }
}

export async function playNotificationSound(
    priority: "low" | "medium" | "high",
    settings?: NotificationSoundSettings,
): Promise<void> {
    const s = settings ?? loadSoundSettings();
    if (!s.enabled) return;
    const soundId = s.sounds[priority] ?? "ding";
    await playSound(soundId, s.volume);
}
