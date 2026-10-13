#!/usr/bin/env node
/**
 * Систематичні правки erp-ui для коду, взятого з shadcn (ADR-0006: зовнішні компоненти перебудовуємо).
 * Застосовується до свіжих файлів upstream перед ручним портуванням оновлення:
 *   node scripts/adapt-upstream.mjs registry/ui/button.tsx [інші файли…]
 * Що робить (лише класи Tailwind, ідемпотентно):
 *   - фокус: суцільне кільце 2 px кольору --ring замість напівпрозорого 3 px (контраст ≥ 3:1);
 *   - текст помилок: text-destructive → text-destructive-foreground (≥ 4.5:1 для тексту);
 *   - підкладка модалок: bg-black/10 → bg-overlay (токен), без розмиття (SPEC §6.5: без «скла»);
 *   - довільні розміри й кольори upstream → шкала Tailwind або токени (check-tokens без винятків).
 * Специфічні правки (висоти з токенів щільності, варіанти статусів тощо) робляться вручну
 * й позначаються коментарем «erp-ui:».
 */
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/** Правка окремого класу: фокус-кільце 3 px → 2 px (лише у варіантах із «focus»). */
function adaptToken(token) {
  const m = /^(.*focus[^:]*:)ring-(?:3|\[3px\])$/.exec(token)
  return m ? `${m[1]}ring-2` : token
}

/** [шаблон, заміна] для всього тексту. */
export const RULES = [
  // cn із підтримкою утиліт щільності (registry/lib/utils.ts).
  [/import \{ cn \} from "cn"/g, 'import { cn } from "@/registry/lib/utils"'],
  [/\bring-ring\/50\b/g, "ring-ring"],
  // Текст помилок.
  [/\btext-destructive(?![\w/-])/g, "text-destructive-foreground"],
  // Підкладка модалок.
  [/\bbg-black\/10\b/g, "bg-overlay"],
  [/\s*\bsupports-backdrop-filter:backdrop-blur-\w+\b/g, ""],
  // Довільні значення → шкала.
  [/\brounded-\[min\(var\(--radius-md\),1[02]px\)\]/g, "rounded-md"],
  [/\brounded-\[calc\(var\(--radius\)-5px\)\]/g, "rounded-sm"],
  [/\brounded-\[calc\(var\(--radius\)-3px\)\]/g, "rounded-md"],
  [/\brounded-\[2px\]/g, "rounded-xs"],
  [/\brounded-\[4px\]/g, "rounded-sm"],
  [/\btext-\[0\.8rem\]/g, "text-xs"],
  [/\b(m[lr])-\[-0\.3rem\]/g, "-$1-1.25"],
  [/\b(m[lr])-\[-0\.15rem\]/g, "-$1-0.5"],
  [/\bp-\[3px\]/g, "p-0.75"],
  [/\bbottom-\[-5px\]/g, "-bottom-1.25"],
  [/\bh-\[18\.4px\]/g, "h-4.5"],
  [/\bw-\[32px\]/g, "w-8"],
  [/\bh-\[14px\]/g, "h-3.5"],
  [/\bw-\[24px\]/g, "w-6"],
  [
    /\bhover:bg-\[color-mix\(in_oklch,var\(--secondary\),var\(--foreground\)_5%\)\]/g,
    "hover:bg-accent hover:text-accent-foreground",
  ],
]

export function adapt(source) {
  const tokens = source.replace(/[^\s"'`]+/g, adaptToken)
  return RULES.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    tokens,
  )
}

function main() {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error("Використання: node scripts/adapt-upstream.mjs <файли…>")
    process.exit(1)
  }
  for (const file of files) {
    const before = readFileSync(file, "utf8")
    const after = adapt(before)
    if (after !== before) writeFileSync(file, after)
    console.log(`${after === before ? "без змін" : "оновлено"}  ${file}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
