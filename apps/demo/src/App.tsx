import { AppearanceControls } from "@/appearance/AppearanceControls"
import { TokenPreview } from "@/preview/TokenPreview"
import { strings } from "@/strings"

export function App() {
  const s = strings.app
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl space-y-1 px-4 py-5">
          <p className="text-muted-foreground">{s.eyebrow}</p>
          <h1 className="text-2xl font-semibold">{s.title}</h1>
          <p className="text-muted-foreground">{s.lead}</p>
        </div>
      </header>
      <main className="@container mx-auto max-w-7xl px-4 py-6">
        <div className="grid items-start gap-6 @5xl:grid-cols-3">
          <AppearanceControls />
          <div className="@5xl:col-span-2">
            <TokenPreview />
          </div>
        </div>
      </main>
    </div>
  )
}
