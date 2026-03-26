"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "stp-font-size";
const FONT_SIZES = [
    { label: "S", value: 14 },
    { label: "M", value: 16 },
    { label: "L", value: 18 },
    { label: "XL", value: 20 },
] as const;

const DEFAULT_SIZE = 16;
const MIN_SIZE = FONT_SIZES[0].value;
const MAX_SIZE = FONT_SIZES[FONT_SIZES.length - 1].value;

function getStoredSize(): number {
    if (typeof window === "undefined") return DEFAULT_SIZE;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SIZE;
    const num = parseInt(stored, 10);
    return num >= MIN_SIZE && num <= MAX_SIZE ? num : DEFAULT_SIZE;
}

function applySize(size: number) {
    document.documentElement.style.fontSize = `${size}px`;
}

export function useFontSize() {
    const [fontSize, setFontSizeState] = useState(DEFAULT_SIZE);

    useEffect(() => {
        const stored = getStoredSize();
        setFontSizeState(stored);
        applySize(stored);
    }, []);

    const setFontSize = useCallback((size: number) => {
        const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, size));
        setFontSizeState(clamped);
        applySize(clamped);
        localStorage.setItem(STORAGE_KEY, String(clamped));
    }, []);

    const decrease = useCallback(() => {
        setFontSize(fontSize - 2);
    }, [fontSize, setFontSize]);

    const increase = useCallback(() => {
        setFontSize(fontSize + 2);
    }, [fontSize, setFontSize]);

    const reset = useCallback(() => {
        setFontSize(DEFAULT_SIZE);
    }, [setFontSize]);

    return {
        fontSize,
        setFontSize,
        decrease,
        increase,
        reset,
        canDecrease: fontSize > MIN_SIZE,
        canIncrease: fontSize < MAX_SIZE,
        sizes: FONT_SIZES,
    };
}
