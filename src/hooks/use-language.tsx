"use client"

import * as React from "react"

type Language = "en" | "sv"

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
}

const LANGUAGE_STORAGE_KEY = "saldo-crm:language"

const LanguageContext = React.createContext<LanguageContextValue | null>(null)

function readStoredLanguage(): Language | null {
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (stored === "en" || stored === "sv") {
    return stored
  }
  return null
}

function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<Language>("en")

  React.useEffect(() => {
    const storedLanguage = readStoredLanguage()
    if (storedLanguage) {
      setLanguageState(storedLanguage)
    }
  }, [])

  React.useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    document.documentElement.lang = language
  }, [language])

  const value = React.useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage: setLanguageState,
    }),
    [language],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

function useLanguage() {
  const context = React.useContext(LanguageContext)
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}

export { LanguageProvider, useLanguage }
export type { Language }
