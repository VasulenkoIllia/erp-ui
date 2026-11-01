import { getCompanyId } from "@/registry/lib/company-scope"
import type { EditLockHolder } from "@/registry/lib/edit-lock"
import { pushMockNotification } from "@/registry/lib/mock-inbox"
import {
  dropMockRealtimeStream,
  setMockEditLock,
} from "@/registry/lib/mock-realtime"
import { currentMockUser } from "@/registry/lib/mock-server"
import { addMockTimelineEntry } from "@/registry/lib/mock-timeline-store"

import { invoices } from "./handlers"

/**
 * Колега в демо реального часу (ADR-0051): сервер моків живе в цій вкладці, тож чужі дії імітує
 * прямий виклик. Окремий модуль, щоб сторінка демо брала його лінивим чанком разом із моками.
 */
export const COLLEAGUE: EditLockHolder = {
  id: "u-marta",
  name: "Марта Шевчук",
}

const CLIENT_NAMES = ["ТОВ «Зоря»", "ТОВ «Північ»"] as const

/** Колега змінив клієнта рахунку: нова версія запису, журнал і подія, як від `PATCH`. */
export function colleagueChangesInvoice(id: string): void {
  const record = invoices.db.all().find((invoice) => invoice.id === id)
  const client =
    record?.client === CLIENT_NAMES[0] ? CLIENT_NAMES[1] : CLIENT_NAMES[0]
  invoices.db.patch(id, { client })
}

export function colleagueEditsInvoice(id: string, isEditing: boolean): void {
  setMockEditLock(getCompanyId(), "invoices", id, isEditing ? COLLEAGUE : null)
}

export function colleagueSendsNotification(): void {
  const user = currentMockUser()
  if (user)
    pushMockNotification(user.id, {
      type: "invoices.overdue",
      severity: "warning",
      title: { uk: "Рахунок прострочено", en: "Invoice overdue" },
      actor: { name: COLLEAGUE.name },
    })
}

/** Колега написав нотатку: простий текст, як від бекенду без оформлення (ADR-0052). */
export function colleagueWritesNote(id: string): void {
  addMockTimelineEntry(
    { resource: "invoices", id, companyId: getCompanyId() },
    {
      kind: "note",
      author: COLLEAGUE,
      version: 1,
      body: "Домовилась із клієнтом про оплату до п'ятниці.",
    },
  )
}

/** Клієнт відповів: вхідне повідомлення від людини поза компанією. */
export function customerReplies(id: string): void {
  addMockTimelineEntry(
    { resource: "invoices", id, companyId: getCompanyId() },
    {
      kind: "message",
      direction: "incoming",
      author: { name: "Богдан Мельник" },
      party: "ТОВ «Зоря»",
      body: "Дякую, рахунок отримали. Оплатимо цього тижня.",
    },
  )
}

export const dropConnection = dropMockRealtimeStream
