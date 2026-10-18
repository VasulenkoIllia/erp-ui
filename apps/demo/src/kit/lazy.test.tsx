import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Suspense } from "react"
import { describe, expect, it, vi } from "vitest"

import { ErrorBoundary } from "@/registry/erp/error-boundary"
import { ChunkLoadError, lazyWithPreload } from "@/registry/lib/lazy"

const Ready = () => <p>Сторінка готова</p>

/** Завантажувач, що спершу відмовляє `failures` разів (офлайн), а потім віддає сторінку. */
function flakyLoader(failures: number) {
  let attempts = 0
  const load = vi.fn(() => {
    attempts += 1
    return attempts <= failures
      ? Promise.reject(new Error("offline"))
      : Promise.resolve(Ready)
  })
  return load
}

/** Рендер, що може призупинитись: React 19 у тестах чекає на асинхронний act. */
async function renderAsync(ui: React.ReactElement) {
  await act(() => {
    render(ui)
    return Promise.resolve()
  })
}

function renderLazy(Page: React.ComponentType) {
  return renderAsync(
    <ErrorBoundary>
      <Suspense fallback={<p>Вантажу</p>}>
        <Page />
      </Suspense>
    </ErrorBoundary>,
  )
}

describe("lazyWithPreload і ErrorBoundary (ADR-0009)", () => {
  it("завантажений заздалегідь компонент рендериться без кадру з fallback", async () => {
    const Page = lazyWithPreload(flakyLoader(0))
    await Page.preload()
    await renderLazy(Page)
    expect(screen.getByText("Сторінка готова")).toBeVisible()
    expect(screen.queryByText("Вантажу")).toBeNull()
  })

  it("чанк не завантажився — стан помилки, «Спробувати ще» вантажить знову", async () => {
    // React пише перехоплену помилку в консоль — у тесті це шум.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const load = flakyLoader(1)
    const Page = lazyWithPreload(load)
    await renderLazy(Page)

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не вдалося завантажити дані",
    )
    // Відмова запам'ятовується до повтору: рендери після збою не вантажать чанк знову.
    expect(load).toHaveBeenCalledTimes(1)

    const retry = screen.getByRole("button", { name: "Спробувати ще" })
    await act(async () => {
      await userEvent.click(retry)
    })
    expect(await screen.findByText("Сторінка готова")).toBeVisible()
    expect(load).toHaveBeenCalledTimes(2)
    consoleError.mockRestore()
  })

  it("повтор не вдався — з'являється «Оновити сторінку»; помилка йде в onError", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const onError = vi.fn()
    const Page = lazyWithPreload(flakyLoader(2))
    await renderAsync(
      <ErrorBoundary onError={onError}>
        <Suspense fallback={<p>Вантажу</p>}>
          <Page />
        </Suspense>
      </ErrorBoundary>,
    )
    const retry = await screen.findByRole("button", { name: "Спробувати ще" })
    expect(
      screen.queryByRole("button", { name: "Оновити сторінку" }),
    ).toBeNull()
    expect(onError).toHaveBeenCalledWith(
      expect.any(ChunkLoadError),
      expect.anything(),
    )

    await act(async () => {
      await userEvent.click(retry)
    })
    expect(
      await screen.findByRole("button", { name: "Оновити сторінку" }),
    ).toBeVisible()
    consoleError.mockRestore()
  })

  it("frame: стан помилки за замовчуванням у своїй рамці, повтор і «Оновити сторінку» — від межі", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const Page = lazyWithPreload(flakyLoader(2))
    await renderAsync(
      <ErrorBoundary
        frame={(content) => (
          <section aria-label="Нова організація">{content}</section>
        )}
      >
        <Suspense fallback={<p>Вантажу</p>}>
          <Page />
        </Suspense>
      </ErrorBoundary>,
    )
    const frame = await screen.findByRole("region", {
      name: "Нова організація",
    })
    await act(async () => {
      await userEvent.click(
        within(frame).getByRole("button", { name: "Спробувати ще" }),
      )
    })
    // Після повтору межа малює стан заново — рамку шукаємо знову.
    const reload = await screen.findByRole("button", {
      name: "Оновити сторінку",
    })
    expect(
      screen.getByRole("region", { name: "Нова організація" }),
    ).toContainElement(reload)
    consoleError.mockRestore()
  })

  it("preload після збою пробує ще раз і ніколи не відхиляється", async () => {
    const load = flakyLoader(1)
    const Page = lazyWithPreload(load)
    await expect(Page.preload()).resolves.toBeUndefined()
    await Page.preload()
    expect(load).toHaveBeenCalledTimes(2)
    await renderLazy(Page)
    expect(screen.getByText("Сторінка готова")).toBeVisible()
  })

  it("невдалий попередній прогрів не заважає: перший рендер вантажить знову", async () => {
    const load = flakyLoader(1)
    const Page = lazyWithPreload(load)
    await Page.preload()
    await renderLazy(Page)
    expect(await screen.findByText("Сторінка готова")).toBeVisible()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("помилка чанка несе причину й повтор", () => {
    const retry = vi.fn()
    const error = new ChunkLoadError(new Error("404"), retry)
    expect(error.cause).toEqual(new Error("404"))
    error.retry()
    expect(retry).toHaveBeenCalledOnce()
  })

  it("власний вигляд для тісних місць отримує повтор", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const Page = lazyWithPreload(flakyLoader(1))
    await renderAsync(
      <ErrorBoundary
        fallback={(retry) => (
          <button type="button" onClick={retry}>
            Повторити панель
          </button>
        )}
      >
        <Suspense fallback={null}>
          <Page />
        </Suspense>
      </ErrorBoundary>,
    )
    const retry = await screen.findByRole("button", {
      name: "Повторити панель",
    })
    await act(async () => {
      await userEvent.click(retry)
    })
    expect(await screen.findByText("Сторінка готова")).toBeVisible()
    consoleError.mockRestore()
  })
})
