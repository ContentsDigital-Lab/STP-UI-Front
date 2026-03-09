"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { th, Dictionary } from "./locales/th";
import { en } from "./locales/en";

const dictionaries = { th, en };

type Language = "th" | "en";

interface LanguageContextType {
    lang: Language;
    setLang: (lang: Language) => void;
    t: Dictionary;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [lang, setLang] = useState<Language>("th");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Load language from localStorage if exists
        const storedLang = localStorage.getItem("std-ui-lang") as Language;
        if (storedLang && (storedLang === "th" || storedLang === "en")) {
            setLang(storedLang);
        }
        setMounted(true);
    }, []);

    const handleSetLang = (newLang: Language) => {
        setLang(newLang);
        localStorage.setItem("std-ui-lang", newLang);
    };

    return (
        <LanguageContext.Provider
            value={{
                lang,
                setLang: handleSetLang,
                t: dictionaries[lang],
            }}
        >
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error("useLanguage must be used within a LanguageProvider");
    }
    return context;
}
