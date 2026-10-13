/**
 * Сценарії моків (SPEC §17, правило 2 CLAUDE.md): як поводиться мок-сервер — для демо, тестів і розробки.
 *
 * - `success` — звичайна робота; `error` — 500; `empty` — порожні списки; `slow` — затримка 3 с;
 *   `conflict` — збереження повертає 409; `forbidden` — 403; `offline` — мережевий збій.
 * - Сценарій задається для всіх ресурсів або окремо для ресурсу; вибір зберігається в localStorage,
 *   тож переживає перезавантаження. Цей модуль не імпортує MSW — його бере й панель розробника.
 */

export const SCENARIOS = [
  "success",
  "error",
  "empty",
  "slow",
  "conflict",
  "forbidden",
  "offline",
] as const
export type Scenario = (typeof SCENARIOS)[number]

/** Затримка сценарію `slow`: між 1 і 10 с UI показує скелетон чи спінер (SPEC §8.2). */
export const SLOW_DELAY_MS = 3000

export interface ScenarioState {
  global: Scenario
  resources: Record<string, Scenario>
}

const STORAGE_KEY = "erp-ui:mock-scenarios"
const DEFAULT_STATE: ScenarioState = { global: "success", resources: {} }

const isScenario = (value: unknown): value is Scenario =>
  SCENARIOS.includes(value as Scenario)

function read(): ScenarioState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<ScenarioState>) : {}
    return {
      global: isScenario(parsed.global) ? parsed.global : "success",
      resources: Object.fromEntries(
        Object.entries(parsed.resources ?? {}).filter(([, v]) => isScenario(v)),
      ),
    }
  } catch {
    return DEFAULT_STATE
  }
}

let state: ScenarioState = read()
const listeners = new Set<() => void>()

function commit(next: ScenarioState) {
  state = next
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Сховище недоступне — сценарій діє до перезавантаження.
  }
  listeners.forEach((listener) => {
    listener()
  })
}

export function getScenarioState(): ScenarioState {
  return state
}

/** Сценарій для всіх ресурсів або, з `resource`, лише для нього. */
export function setScenario(scenario: Scenario, resource?: string): void {
  if (!resource) {
    commit({ ...state, global: scenario })
    return
  }
  const resources = { ...state.resources }
  if (scenario === state.global) delete resources[resource]
  else resources[resource] = scenario
  commit({ ...state, resources })
}

export function resetScenarios(): void {
  commit(DEFAULT_STATE)
}

export function scenarioFor(resource: string): Scenario {
  return state.resources[resource] ?? state.global
}

export function subscribeScenarios(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
