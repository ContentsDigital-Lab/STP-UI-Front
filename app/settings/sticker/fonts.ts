export interface FontOption {
    label: string;
    value: string; // CSS font-family name (single word or quoted)
    category: "thai" | "latin" | "display" | "mono";
}

export const FONTS: FontOption[] = [
    // ── Thai ──────────────────────────────────────────────────────────────────
    { label: "Prompt",           value: "Prompt",           category: "thai" },
    { label: "Sarabun",          value: "Sarabun",          category: "thai" },
    { label: "Kanit",            value: "Kanit",            category: "thai" },
    { label: "Noto Sans Thai",   value: "Noto Sans Thai",   category: "thai" },
    { label: "Bai Jamjuree",     value: "Bai Jamjuree",     category: "thai" },
    { label: "Mitr",             value: "Mitr",             category: "thai" },
    { label: "Chakra Petch",     value: "Chakra Petch",     category: "thai" },
    { label: "Pridi",            value: "Pridi",            category: "thai" },
    { label: "Chonburi",         value: "Chonburi",         category: "thai" },
    { label: "Itim",             value: "Itim",             category: "thai" },
    // ── Latin / General ───────────────────────────────────────────────────────
    { label: "Inter",            value: "Inter",            category: "latin" },
    { label: "Roboto",           value: "Roboto",           category: "latin" },
    { label: "Open Sans",        value: "Open Sans",        category: "latin" },
    { label: "Lato",             value: "Lato",             category: "latin" },
    { label: "Poppins",          value: "Poppins",          category: "latin" },
    { label: "Montserrat",       value: "Montserrat",       category: "latin" },
    { label: "Oswald",           value: "Oswald",           category: "display" },
    { label: "Playfair Display", value: "Playfair Display", category: "display" },
    { label: "Raleway",          value: "Raleway",          category: "display" },
    { label: "Courier Prime",    value: "Courier Prime",    category: "mono" },
];

export const FONT_CATEGORIES: Record<FontOption["category"], string> = {
    thai:    "ภาษาไทย",
    latin:   "ทั่วไป",
    display: "Display",
    mono:    "Monospace",
};

/** Build a Google Fonts URL that loads all fonts at 400 and 700 weight */
export function buildGoogleFontsUrl(): string {
    const families = FONTS.map(f => {
        const name = f.value.replace(/ /g, "+");
        return `family=${name}:wght@400;700`;
    }).join("&");
    return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/** CSS font-family string (adds generic fallback) */
export function cssFontFamily(value: string): string {
    const font = FONTS.find(f => f.value === value);
    if (!font) return `'${value}', sans-serif`;
    if (font.category === "mono")    return `'${value}', monospace`;
    if (font.category === "display") return `'${value}', serif`;
    return `'${value}', sans-serif`;
}
