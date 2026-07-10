"use client";

import React from 'react';
import { useUnit } from '@/lib/unit/unit-context';

interface UnitToggleProps {
    className?: string;
}

export function UnitToggle({ className = "" }: UnitToggleProps) {
    const { unit, setUnit } = useUnit();

    return (
        <div className={`inline-flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700 ${className}`}>
            <button
                type="button"
                onClick={() => setUnit('inch')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    unit === 'inch' 
                        ? 'bg-white dark:bg-slate-700 text-[#E8601C] shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
            >
                inch
            </button>
            <button
                type="button"
                onClick={() => setUnit('mm')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    unit === 'mm' 
                        ? 'bg-white dark:bg-slate-700 text-[#E8601C] shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
            >
                mm
            </button>
        </div>
    );
}
