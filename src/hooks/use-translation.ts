"use client"

import * as React from "react"

import { translate } from "@/config/i18n"
import { useLanguage } from "@/hooks/use-language"

function useTranslation() {
  const { language } = useLanguage()

  const t = React.useCallback(
    (key: string, fallback?: string) => translate(language, key, fallback),
    [language],
  )

  return { t, language }
}

export { useTranslation }
