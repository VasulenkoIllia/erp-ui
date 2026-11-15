import type { ReactNode } from "react"
import { toast } from "sonner"

import { UserMenu, type MenuUser } from "@/registry/erp/user-menu"
import { LANGUAGE_NAMES } from "@/registry/lib/language-names"
import { useDemoTranslation } from "@/i18n"
import { ukAppearancePage } from "@/i18n/pages"

import { Section } from "@/pages/Section"

/** Окремий користувач, щоб меню розділу не плутались із меню в топбарі. */
const DEMO_USER: MenuUser = {
  name: "Марта Демченко",
  email: "marta@zoriana.example",
}

function MenuVariant({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: ReactNode
}) {
  return (
    <li className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm break-words text-muted-foreground">{hint}</p>
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
  return (
    <Section title={t("title")} description={t("lead")}>
      <ul className="space-y-4">
        <MenuVariant title={t("full")} hint={t("fullHint")}>
          <UserMenu user={DEMO_USER} />
        </MenuVariant>
        <MenuVariant title={t("noAppearance")} hint={t("noAppearanceHint")}>
          <UserMenu user={DEMO_USER} showPalette={false} showDensity={false} />
        </MenuVariant>
        <MenuVariant title={t("language")} hint={t("languageHint")}>
          <UserMenu
            user={DEMO_USER}
            onLanguageChange={(language) => {
              toast(t("languageSaved", { language: LANGUAGE_NAMES[language] }))
            }}
          />
        </MenuVariant>
      </ul>
    </Section>
  )
}
