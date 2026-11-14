/**
 * «Що зробити в проекті» між версіями для `scripts/erp-ui-kit.mjs` (ADR-0088): з `CHANGELOG.md`
 * версії кіта, наприкінці звіту `update` (і `--dry-run`), щоб агент у проекті не шукав їх на GitHub.
 * Файл ставить `shadcn add` разом із командою: у проекті його не правте.
 */
import { forTerminal, isReleaseTag } from "./erp-ui-kit-lib.mjs"

const PROJECT_STEPS = "Що зробити в проекті"
/** Будь-який розділ `## [...]`: інший заголовок (напр. `1.4.0-rc.1`) теж закриває попередній розділ. */
const VERSION_HEADING = /^## \[([^\]]+)\]/
const RELEASE_VERSION = /^\d+\.\d+\.\d+$/
const STEP_BULLET = `- **${PROJECT_STEPS}`

/** `1.10.0` > `1.9.2`: числами, а не рядком. */
function compareVersions(a, b) {
  const [x, y] = [a, b].map((version) => version.split(".").map(Number))
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

/** Розділи `## [...]`: назва й рядки до наступного розділу. */
function versionSections(changelog) {
  const sections = []
  for (const line of changelog.split("\n")) {
    const heading = VERSION_HEADING.exec(line)
    if (heading) sections.push({ version: heading[1], lines: [] })
    else sections.at(-1)?.lines.push(line)
  }
  return sections
}

/**
 * Кроки проекту з розділу версії: у вступі випуску — від рядка з «Що зробити в проекті» до першого
 * підрозділу `###`; у підрозділах — пункти `- **Що зробити в проекті**` (так пише їх `Unreleased`).
 */
function stepsOf(lines) {
  const firstSubsection = lines.findIndex((line) => line.startsWith("### "))
  const intro = firstSubsection < 0 ? lines : lines.slice(0, firstSubsection)
  const start = intro.findIndex((line) => line.includes(PROJECT_STEPS))
  const fromIntro = start < 0 ? [] : intro.slice(start)
  const bullets =
    firstSubsection < 0
      ? []
      : lines
          .slice(firstSubsection)
          .filter((line) => line.startsWith(STEP_BULLET))
  return [fromIntro.join("\n").trim(), ...bullets].filter(Boolean).join("\n")
}

/**
 * Розділи між версією проекту (`fromKit`, тег) і новою (`toKit`) з їхніми кроками проекту (без
 * кроків — порожній рядок): тег — розділи `X.Y.Z` після `fromKit` до нього включно; гілка чи
 * коміт — усі новіші за `fromKit` і `Unreleased`. Від старшої до новішої. Версія проекту не тег —
 * `undefined`: звірити нема з чим.
 */
export function projectSteps(changelog, fromKit, toKit) {
  if (!isReleaseTag(fromKit)) return undefined
  const from = fromKit.slice(1)
  const to = isReleaseTag(toKit) ? toKit.slice(1) : undefined
  return versionSections(changelog)
    .filter(({ version }) =>
      version === "Unreleased"
        ? to === undefined
        : RELEASE_VERSION.test(version) &&
          compareVersions(version, from) > 0 &&
          (to === undefined || compareVersions(version, to) <= 0),
    )
    .map(({ version, lines }) => ({ version, steps: stepsOf(lines) }))
    .reverse()
}

const versionName = (version) =>
  version === "Unreleased" ? "ще не випущене" : `v${version}`

/**
 * Наприкінці звіту: що проект робить руками (CHANGELOG версії). Перше встановлення (версії проекту
 * немає) — нічого. Розділ версії без кроків — назвати: формат міг змінитись, а мовчання читалось
 * би як «нічого робити не треба». Текст — без керівних символів (`forTerminal`).
 */
export function printProjectSteps(changelog, fromKit, toKit) {
  if (fromKit === undefined) return
  if (changelog === undefined) {
    console.log(
      `\n${PROJECT_STEPS}: у версії ${toKit} немає CHANGELOG.md, дивіться його на GitHub.`,
    )
    return
  }
  const sections = projectSteps(changelog, fromKit, toKit)
  if (sections === undefined) {
    console.log(
      `\n${PROJECT_STEPS}: версія проекту ${fromKit} — не тег, розділи між версіями — у CHANGELOG.md кіта.`,
    )
    return
  }
  const withSteps = sections.filter(({ steps }) => steps)
  const without = sections.filter(({ steps }) => !steps)
  if (!withSteps.length && !without.length) {
    console.log(
      `\n${PROJECT_STEPS} (${fromKit} → ${toKit}): нових розділів у CHANGELOG.md немає.`,
    )
    return
  }
  console.log(`\n${PROJECT_STEPS} (${fromKit} → ${toKit}, CHANGELOG.md кіта):`)
  for (const { version, steps } of withSteps)
    console.log(`\n== ${versionName(version)} ==\n${forTerminal(steps)}`)
  if (without.length)
    console.log(
      `\nБез пункту «${PROJECT_STEPS}»: ${without.map(({ version }) => versionName(version)).join(", ")} — перегляньте ці розділи CHANGELOG.md кіта.`,
    )
}
