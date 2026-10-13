import { lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"

import { LANGUAGES, type Language } from "@/registry/lib/i18n"
import { Toaster } from "@/registry/ui/sonner"
import { Spinner } from "@/registry/ui/spinner"
import { TooltipProvider } from "@/registry/ui/tooltip"

import { useAppearance } from "@/appearance/store"
import { AppearancePage } from "@/pages/AppearancePage"
import { PrimitivesPage } from "@/pages/PrimitivesPage"
import { ROUTES, useRoute, type Route } from "@/router"

// Сторінка з полем телефону тягне дані libphonenumber (~120 КБ gzip) — вантажимо її окремим чанком.
const FormatsPage = lazy(() =>
  import("@/pages/FormatsPage").then((m) => ({ default: m.FormatsPage })),
)

const PAGES: Record<Route, React.ComponentType> = {
  appearance: AppearancePage,
  primitives: PrimitivesPage,
  formats: FormatsPage,
}

/** Назва мови її ж мовою — так її знайде людина, що не читає поточною мовою інтерфейсу. */
const LANGUAGE_NAMES: Record<Language, string> = {
  uk: "Українська",
  en: "English",
}

/** Перемикач мови інтерфейсу. Тимчасово в шапці демо; на кроці 0.4 переїде в меню користувача. */
function LanguageSwitch() {
  const { t } = useTranslation()
  const [appearance, setAppearance] = useAppearance()
  return (
    <div
      role="group"
      aria-label={t("app.language")}
      className="ms-auto flex gap-1"
    >
      {LANGUAGES.map((language) => (
        <button
          key={language}
          type="button"
          lang={language}
          aria-pressed={appearance.language === language}
          onClick={() => {
            setAppearance({ language })
          }}
          className="inline-flex min-h-touch items-center rounded-md px-3 font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground"
        >
          {LANGUAGE_NAMES[language]}
        </button>
      ))}
    </div>
  )
}

export function App() {
  const { t } = useTranslation()
  const route = useRoute()
  const Page = PAGES[route]

  return (
    <TooltipProvider>
      <div className="min-h-dvh">
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <p className="font-semibold">{t("app.eyebrow")}</p>
            <nav aria-label={t("app.nav")}>
              <ul className="flex flex-wrap gap-1">
                {(Object.keys(ROUTES) as Route[]).map((r) => (
                  <li key={r}>
                    <a
                      href={ROUTES[r]}
                      aria-current={r === route ? "page" : undefined}
                      className="inline-flex min-h-touch items-center rounded-md px-3 font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
                    >
                      {t(`app.pages.${r}`)}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <LanguageSwitch />
          </div>
        </header>
        <main className="@container mx-auto max-w-7xl px-4 py-6">
          <Suspense fallback={<Spinner className="mx-auto size-6" />}>
            <Page />
          </Suspense>
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  )
}
