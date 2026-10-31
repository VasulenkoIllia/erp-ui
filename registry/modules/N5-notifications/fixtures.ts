import type { MockInboxItem } from "@/lib/mock-inbox"

const MINUTE_MS = 60_000

const ago = (minutes: number, now: number) =>
  new Date(now - minutes * MINUTE_MS).toISOString()

export interface NotificationsFixtureOptions {
  /** Для кого сповіщення; порожньо — нікому. */
  readonly users?: readonly string[]
  /** Момент відліку, щоб тест не залежав від годинника. */
  readonly now?: number
}

/** Приклади центру сповіщень: нове, важливе, прочитане. Події збігаються з демо-налаштуваннями. */
export function createNotificationsFixtures({
  users = [],
  now = Date.now(),
}: NotificationsFixtureOptions = {}): Record<string, MockInboxItem[]> {
  return Object.fromEntries(
    users.map((userId) => [
      userId,
      [
        {
          id: `n5-${userId}-task`,
          type: "tasks.assigned",
          title: {
            uk: "Вам призначили завдання: звірка з контрагентом",
            en: "Task assigned to you: reconciliation with a counterparty",
          },
          createdAt: ago(20, now),
          readAt: null,
          actor: { name: "Іван Петренко" },
        },
        {
          id: `n5-${userId}-overdue`,
          type: "invoices.overdue",
          title: {
            uk: "Рахунок 2026-0031 прострочено",
            en: "Invoice 2026-0031 is overdue",
          },
          body: {
            uk: "ТОВ «Північний вітер» не оплатив 9 200,00 ₴ у строк.",
            en: "Pivnichnyi Viter LLC didn't pay ₴9,200.00 on time.",
          },
          createdAt: ago(90, now),
          readAt: null,
          severity: "warning",
        },
        {
          id: `n5-${userId}-paid`,
          type: "invoices.paid",
          title: {
            uk: "Рахунок 2026-0028 оплачено",
            en: "Invoice 2026-0028 is paid",
          },
          createdAt: ago(60 * 26, now),
          readAt: ago(60 * 25, now),
          severity: "success",
        },
      ] satisfies MockInboxItem[],
    ]),
  )
}
