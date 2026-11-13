import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  copyPath,
  useDocumentStatuses,
  useDocumentTransitions,
} from "@/registry/lib/document-kind"
import { useErpUiT } from "@/registry/lib/i18n"
import type { StatusTransition } from "@/registry/lib/statuses"

/**
 * Вид документа (ADR-0086): статуси й граф дій мовою інтерфейсу з рядків модуля, підписи кіта для
 * спільних дій, зміни розширення проекту; адреса копії документа.
 */
type Key =
  | "statuses.draft"
  | "statuses.issued"
  | "actions.submit"
  | "confirm.submit.title"
  | "confirm.submit.description"
  | "confirm.submit.action"

const t = (key: Key) => `[${key}]`

const TRANSITIONS: readonly StatusTransition[] = [
  { id: "submit", from: ["draft"], to: "issued" },
  { id: "cancel", from: ["draft", "issued"], to: "cancelled" },
  { id: "archive", from: ["issued"], to: "archived" },
]

describe("useDocumentTransitions", () => {
  it("дія модуля — своїм підписом і підтвердженням, «Скасувати» — підписом кіта, решта — id", () => {
    const { result } = renderHook(() => ({
      transitions: useDocumentTransitions(
        TRANSITIONS,
        {
          actionLabels: { submit: "actions.submit" },
          confirms: { submit: "confirm.submit" },
        },
        t,
        undefined,
      ),
      kitT: useErpUiT(),
    }))
    const [submit, cancel, archive] = result.current.transitions
    expect(submit).toMatchObject({
      id: "submit",
      label: "[actions.submit]",
      confirm: {
        title: "[confirm.submit.title]",
        description: "[confirm.submit.description]",
        action: "[confirm.submit.action]",
      },
    })
    expect(cancel?.label).toBe(result.current.kitT("documentActions.cancel"))
    expect(cancel?.confirm).toBeUndefined()
    expect(archive?.label).toBe("archive")
  })

  it("розширення ховає дію модуля", () => {
    const { result } = renderHook(() =>
      useDocumentTransitions<Key, never>(TRANSITIONS, {}, t, {
        hide: ["archive"],
      }),
    )
    expect(result.current.map(({ id }) => id)).toEqual(["submit", "cancel"])
  })
})

describe("useDocumentStatuses", () => {
  it("підпис статусу — рядком модуля; розширення ховає статус", () => {
    const { result } = renderHook(() =>
      useDocumentStatuses(
        [
          { id: "draft", tone: "neutral", label: "statuses.draft" },
          { id: "issued", tone: "info", label: "statuses.issued" },
        ],
        t,
        { hide: ["issued"] },
      ),
    )
    expect(result.current.options).toEqual([
      expect.objectContaining({ id: "draft", label: "[statuses.draft]" }),
    ])
  })
})

describe("copyPath", () => {
  it("адреса нової форми з документом, який копіюють", () => {
    expect(copyPath("/sales/quotes/new")("q 7")).toBe(
      "/sales/quotes/new?copy=q+7",
    )
  })
})
