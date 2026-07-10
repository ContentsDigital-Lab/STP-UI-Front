"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

export type UnitType = 'mm' | 'inch';

interface UnitContextType {
    unit: UnitType;
    setUnit: (unit: UnitType) => void;
    toMm: (value: number | string) => number;
    toCurrentUnit: (mmValue: number | string) => number;
    formatCurrentUnit: (mmValue: number | string) => string;
}

const UnitContext = createContext<UnitContextType | undefined>(undefined);

export function UnitProvider({ children }: { children: React.ReactNode }) {
    const [unit, setUnitState] = useState<UnitType>('inch');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const setUnit = (newUnit: UnitType) => {
        setUnitState(newUnit);
    };

    // 1 inch = 25.4 mm
    const toMm = (value: number | string): number => {
        const num = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(num)) return 0;
        if (unit === 'inch') {
            return num * 25.4;
        }
        return num; // already mm
    };

    const toCurrentUnit = (mmValue: number | string): number => {
        const num = typeof mmValue === 'string' ? parseFloat(mmValue) : mmValue;
        if (isNaN(num)) return 0;
        if (unit === 'inch') {
            return num / 25.4;
        }
        return num;
    };

    const formatCurrentUnit = (mmValue: number | string): string => {
        const converted = toCurrentUnit(mmValue);
        if (unit === 'inch') {
            // Drop decimals if not needed, or keep 2 decimals max
            return Number.isInteger(converted) ? converted.toString() : converted.toFixed(2).replace(/\.00$/, '');
        }
        return converted.toString();
    };

    // Prevent hydration mismatch by not rendering context children until mounted
    // Or we can render, but the first render will always assume 'mm'.
    // Since this might cause a UI flash, it's generally safe to just let it render 'mm' on server.

    return (
        <UnitContext.Provider value={{ unit: mounted ? unit : 'mm', setUnit, toMm, toCurrentUnit, formatCurrentUnit }}>
            {children}
        </UnitContext.Provider>
    );
}

export function useUnit() {
    const context = useContext(UnitContext);
    if (context === undefined) {
        throw new Error('useUnit must be used within a UnitProvider');
    }
    return context;
}
