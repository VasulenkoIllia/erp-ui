import { useState, type ReactNode } from "react"

import { UserMenu, type MenuUser } from "@/registry/erp/user-menu"
import type { Language } from "@/registry/lib/i18n"
import { LANGUAGE_NAMES } from "@/registry/lib/language-names"
import { useDemoTranslation } from "@/i18n"
import { ukAppearancePage } from "@/i18n/pages"

import { Section } from "@/pages/Section"

/** Свої люди в кожного зразка: кнопки меню розрізняються назвою й не плутаються з меню в топбарі. */
const FULL: MenuUser = {
  name: "Марта Демченко",
  email: "marta@zoriana.example",
}
const NO_APPEARANCE: MenuUser = {
  name: "Ігор Савчук",
  email: "ihor@zoriana.example",
}
const LANGUAGE: MenuUser = {
  name: "Ніна Левченко",
  email: "nina@zoriana.example",
}

function MenuVariant({
  title,
  hint,
  children,
}: {
  title: string
  hint: ReactNode
  children: ReactNode
}) {
  return (
    <li className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <div className="text-sm break-words text-muted-foreground">{hint}</div>
      </div>
      {children}
    </li>
  )
}

/** Варіанти `erp/user-menu`: усі пункти, без палітри й щільності, мова на сервер проекту. */
export function UserMenuVariants() {
  const { t } = useDemoTranslation([ukAppearancePage], {
    keyPrefix: "appearancePage.userMenu",
  })
  // Напис, а не сповіщення: рендериться вже новою мовою, коли її рядки довантажились.
  const [savedLanguage, setSavedLanguage] = useState<Language | null>(null)
  return (
    <Section title={t("title")} description={t("lead")}>
      <ul className="space-y-4">
        <MenuVariant title={t("full")} hint={t("fullHint")}>
          <UserMenu user={FULL} />
        </MenuVariant>
        <MenuVariant title={t("noAppearance")} hint={t("noAppearanceHint")}>
          <UserMenu
            user={NO_APPEARANCE}
            showPalette={false}
            showDensity={false}
          />
        </MenuVariant>
        <MenuVariant
          title={t("language")}
          hint={
            <>
              <p>{t("languageHint")}</p>
              <p role="status" className="font-medium text-foreground">
                {savedLanguage
                  ? t("languageSaved", {
                      language: LANGUAGE_NAMES[savedLanguage],
                    })
                  : null}
              </p>
            </>
          }
        >
          <UserMenu user={LANGUAGE} onLanguageChange={setSavedLanguage} />
        </MenuVariant>
      </ul>
    </Section>
  )
}
