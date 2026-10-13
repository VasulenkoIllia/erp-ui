import { Toaster } from "@/registry/ui/sonner"
import { TooltipProvider } from "@/registry/ui/tooltip"

import { AppearancePage } from "@/pages/AppearancePage"
import { PrimitivesPage } from "@/pages/PrimitivesPage"
import { ROUTES, useRoute, type Route } from "@/router"
import { strings } from "@/strings"

const PAGES: Record<Route, () => React.JSX.Element> = {
  appearance: AppearancePage,
  primitives: PrimitivesPage,
}

export function App() {
  const route = useRoute()
  const Page = PAGES[route]
  const s = strings.app

  return (
    <TooltipProvider>
      <div className="min-h-dvh">
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <p className="font-semibold">{s.eyebrow}</p>
            <nav aria-label={s.nav}>
              <ul className="flex flex-wrap gap-1">
                {(Object.keys(ROUTES) as Route[]).map((r) => (
                  <li key={r}>
                    <a
                      href={ROUTES[r]}
                      aria-current={r === route ? "page" : undefined}
                      className="inline-flex min-h-touch items-center rounded-md px-3 font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
                    >
                      {s.pages[r]}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>
        <main className="@container mx-auto max-w-7xl px-4 py-6">
          <Page />
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  )
}
