import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "en" | "ta";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (english: string, tamil: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    return window.localStorage.getItem("cheetu-language") === "ta" ? "ta" : "en";
  });

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    window.localStorage.setItem("cheetu-language", next);
    document.documentElement.lang = next === "ta" ? "ta" : "en";
  };

  useEffect(() => { document.documentElement.lang = language === "ta" ? "ta" : "en"; }, [language]);

  const value = useMemo(() => ({ language, setLanguage, toggleLanguage: () => setLanguage(language === "en" ? "ta" : "en"), t: (english: string, tamil: string) => language === "ta" ? tamil : english }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

export function LanguageToggle() {
  const { language, toggleLanguage } = useLanguage();
  return <button type="button" onClick={toggleLanguage} aria-label={language === "en" ? "தமிழுக்கு மாற்று" : "Switch to English"} className="inline-flex h-9 items-center gap-2 rounded-full border border-[#e4a8bd] bg-[#ffffff] px-3 text-xs font-semibold tracking-wide text-[#6b2142] transition hover:bg-[#fde4ee]">
    <span className={language === "en" ? "text-[#c83d73]" : "text-[#b997a6]"}>EN</span><span className="text-[#e4a8bd]">/</span><span className={language === "ta" ? "text-[#c83d73]" : "text-[#b997a6]"}>தமிழ்</span>
  </button>;
}
