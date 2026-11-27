import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PhotoInput } from "@/registry/erp/photo-input"
import { Dialog, DialogContent, DialogTitle } from "@/registry/ui/dialog"
import {
  usePhotoChoice,
  type PhotoChoiceOptions,
  type PhotoChoiceState,
} from "@/registry/hooks/use-photo-choice"
import { createDemoI18n } from "@/i18n"

/**
 * Поле фото в jsdom: адреси blob:, декодування й видимість підмінено (jsdom їх не має); обрізання мишею,
 * стискання на canvas і справжній буфер обміну — e2e `photos.spec.ts`.
 */
let urls = 0
const createObjectURL = vi.fn(() => `blob:test/${String(++urls)}`)
const revokeObjectURL = vi.fn()
/** Декодування, яке тест відпускає сам: фото «ще читається». */
let gate: Promise<void> | null = null

beforeEach(() => {
  urls = 0
  gate = null
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }))
  // jsdom не декодує зображень.
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: async function decode(this: HTMLImageElement) {
      await (gate ?? Promise.resolve())
      if (this.src.endsWith("/broken")) throw new Error("decode")
    },
  })
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
    1600,
  )
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(
    1200,
  )
  // jsdom не має захоплення вказівника.
  HTMLElement.prototype.setPointerCapture = vi.fn()
  // jsdom не рахує розмітку: видимість — за атрибутом hidden предків.
  HTMLElement.prototype.checkVisibility = function checkVisibility(
    this: HTMLElement,
  ) {
    return !this.closest("[hidden]")
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLImageElement.prototype, "decode")
  Reflect.deleteProperty(HTMLElement.prototype, "checkVisibility")
  Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture")
})

const png = (name: string, bytes = name) =>
  new File([bytes], name, { type: "image/png" })

let state: PhotoChoiceState | null = null

function Harness({
  options,
  disabled,
  hidden,
}: {
  options?: PhotoChoiceOptions
  disabled?: boolean
  hidden?: boolean
}) {
  const photos = usePhotoChoice(options)
  useEffect(() => {
    state = photos
  })
  return (
    <div hidden={hidden}>
      <input aria-label="Пошук" />
      <PhotoInput photos={photos} label="Фото товару" disabled={disabled} />
    </div>
  )
}

const strip = () => screen.queryByRole("list", { name: "Вибрані фото" })
const thumbs = () =>
  within(strip() ?? document.body).queryAllByRole("button", {
    name: /^Фото \d з \d/,
  })
const input = () => screen.getByTestId("photo-input-file")

function paste(target: EventTarget, files: File[], types = ["Files"]) {
  const event = new Event("paste", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "clipboardData", { value: { files, types } })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

function drag(target: EventTarget, type: "dragover" | "drop", types: string[]) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  const dataTransfer = { types, files: [], dropEffect: "copy" }
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer })
  act(() => {
    target.dispatchEvent(event)
  })
  return { event, dataTransfer }
}

describe("PhotoInput", () => {
  it("додає кілька файлів і озвучує додане", async () => {
    render(<Harness />)
    await userEvent.upload(input(), [png("a.png"), png("b.png")])
    await waitFor(() => {
      expect(thumbs()).toHaveLength(2)
    })
    expect(thumbs()[1]).toHaveAttribute("aria-pressed", "true")
    await waitFor(() => {
      expect(document.getElementById("erp-ui-announcer")).toHaveTextContent(
        "Додано 2 фото",
      )
    })
    expect(screen.getByTestId("photo-output")).toHaveTextContent(
      "На виході 1024 × 768 px",
    )
    expect(screen.getByRole("button", { name: "Додати фото" })).toBeEnabled()
  })

  it("відхиляє SVG, нечитабельне, повтор і зайве з поясненням", async () => {
    createObjectURL.mockImplementationOnce(() => "blob:test/broken")
    render(<Harness options={{ max: 2 }} />)
    const same = png("a.png")
    await userEvent.upload(input(), [png("bad.png"), same])
    await waitFor(() => {
      expect(thumbs()).toHaveLength(1)
    })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Не вдалося прочитати «bad.png» як фото.",
    )
    const svg = new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })
    fireEvent.change(input(), { target: { files: [svg, same, png("c.png")] } })
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "«logo.svg» не фото JPEG, PNG чи WebP. «a.png» уже додано.",
      )
    })
    fireEvent.change(input(), { target: { files: [png("d.png")] } })
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Більше 2 фото додати не можна.",
      )
    })
    expect(thumbs()).toHaveLength(2)
    // Адреса нечитабельного й повтору відкликана одразу.
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test/broken")
  })

  it("бере зображення, вставлене будь-де, але не текст, вставлений у поле", async () => {
    render(<Harness />)
    const event = paste(document.body, [png("shot.png")])
    expect(event.defaultPrevented).toBe(true)
    await waitFor(() => {
      expect(thumbs()).toHaveLength(1)
    })
    const text = paste(
      screen.getByRole("textbox", { name: "Пошук" }),
      [png("table.png")],
      ["text/plain", "Files"],
    )
    expect(text.defaultPrevented).toBe(false)
    // Скриншот у полі пошуку без тексту — фото.
    paste(screen.getByRole("textbox", { name: "Пошук" }), [png("shot2.png")])
    await waitFor(() => {
      expect(thumbs()).toHaveLength(2)
    })
  })

  it("не бере вставку, коли поле приховане чи недоступне", () => {
    const { rerender } = render(<Harness hidden />)
    expect(paste(document.body, [png("a.png")]).defaultPrevented).toBe(false)
    rerender(<Harness disabled />)
    expect(paste(document.body, [png("a.png")]).defaultPrevented).toBe(false)
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it("не бере вставку, коли відкрито модальне вікно", async () => {
    const { container } = render(
      <>
        <Harness />
        <Dialog open>
          <DialogContent>
            <DialogTitle>Інше вікно</DialogTitle>
          </DialogContent>
        </Dialog>
      </>,
    )
    // Base UI позначає решту сторінки data-base-ui-inert, а не inert.
    await waitFor(() => {
      expect(container).toHaveAttribute("data-base-ui-inert")
    })
    expect(paste(document.body, [png("a.png")]).defaultPrevented).toBe(false)
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it("нечитабельний файл місця не займає: на нього береться наступний", async () => {
    createObjectURL.mockImplementationOnce(() => "blob:test/broken")
    render(<Harness options={{ max: 2 }} />)
    await userEvent.upload(input(), [
      png("bad.png"),
      png("b.png"),
      png("c.png"),
    ])
    await waitFor(() => {
      expect(thumbs()).toHaveLength(2)
    })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Не вдалося прочитати «bad.png» як фото.",
    )
    expect(screen.getByRole("alert")).not.toHaveTextContent("Більше")
  })

  it("«Читаємо…» рахує фото, що вміщаються, а не виклики", async () => {
    let release: () => void = () => undefined
    gate = new Promise((resolve) => {
      release = resolve
    })
    render(<Harness />)
    await userEvent.upload(
      input(),
      Array.from({ length: 6 }, (_, index) => png(`${String(index)}.png`)),
    )
    await waitFor(() => {
      expect(screen.getByText("Читаємо 4 фото…")).toBeInTheDocument()
    })
    await act(async () => {
      release()
      await state?.settled()
    })
    expect(thumbs()).toHaveLength(4)
    expect(screen.queryByText(/Читаємо/)).not.toBeInTheDocument()
  })

  it("на ліміті «Додати фото» недоступна, але фокус лишається на ній", async () => {
    render(<Harness options={{ max: 1 }} />)
    const choose = screen.getByRole("button", { name: "Вибрати фото" })
    choose.focus()
    paste(document.body, [png("a.png")])
    await waitFor(() => {
      expect(thumbs()).toHaveLength(1)
    })
    const add = screen.getByRole("button", { name: "Додати фото" })
    expect(add).toHaveAttribute("aria-disabled", "true")
    expect(add).toHaveFocus()
  })

  it("файл, кинутий повз поле, сторінку не замінює, і коли поле недоступне", () => {
    render(
      <>
        <Harness disabled />
        <input type="file" aria-label="Договір" />
      </>,
    )
    const outside = drag(document.body, "dragover", ["Files"])
    expect(outside.event.defaultPrevented).toBe(true)
    expect(outside.dataTransfer.dropEffect).toBe("none")
    expect(drag(document.body, "drop", ["Files"]).event.defaultPrevented).toBe(
      true,
    )
    // Текст і посилання перетягуються як завжди, рідне поле файла приймає своє.
    expect(
      drag(document.body, "dragover", ["text/plain"]).event.defaultPrevented,
    ).toBe(false)
    const contract = screen.getByLabelText("Договір")
    expect(drag(contract, "drop", ["Files"]).event.defaultPrevented).toBe(false)
  })

  it("поле підсвічується лише для файлів", () => {
    render(<Harness />)
    const zone = screen.getByRole("group", { name: "Фото товару" })
    drag(zone, "dragover", ["text/uri-list"])
    expect(zone).not.toHaveAttribute("data-dragging")
    drag(zone, "dragover", ["Files"])
    expect(zone).toHaveAttribute("data-dragging")
  })

  it("settled() дочікується фото, що ще читаються", async () => {
    let release: () => void = () => undefined
    gate = new Promise((resolve) => {
      release = resolve
    })
    render(<Harness />)
    paste(document.body, [png("slow.png")])
    await waitFor(() => {
      expect(screen.getByText("Читаємо 1 фото…")).toBeInTheDocument()
    })
    let photos = -1
    const waiting = state?.settled().then((choice) => {
      photos = choice.photos.length
    })
    await Promise.resolve()
    expect(photos).toBe(-1)
    release()
    await act(async () => {
      await waiting
    })
    expect(photos).toBe(1)
  })

  it("«Прибрати всі» відкликає адреси, фото, що ще читалося, не додається", async () => {
    render(<Harness />)
    await userEvent.upload(input(), [png("a.png"), png("b.png")])
    await waitFor(() => {
      expect(thumbs()).toHaveLength(2)
    })
    let release: () => void = () => undefined
    gate = new Promise((resolve) => {
      release = resolve
    })
    paste(document.body, [png("late.png")])
    await userEvent.click(screen.getByRole("button", { name: "Прибрати всі" }))
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test/1")
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test/2")
    await act(async () => {
      release()
      await state?.settled()
    })
    expect(strip()).toBeNull()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test/3")
    expect(screen.getByRole("button", { name: "Вибрати фото" })).toHaveFocus()
  })

  it("при виході відкликає адреси всіх фото", async () => {
    const { unmount } = render(<Harness />)
    await userEvent.upload(input(), [png("a.png")])
    await waitFor(() => {
      expect(thumbs()).toHaveLength(1)
    })
    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test/1")
  })
})

describe("PhotoStrip у полі", () => {
  async function withPhotos(count: number) {
    render(<Harness />)
    await userEvent.upload(
      input(),
      Array.from({ length: count }, (_, index) => png(`${String(index)}.png`)),
    )
    await waitFor(() => {
      expect(thumbs()).toHaveLength(count)
    })
  }

  it("після «Прибрати» фокус на фото, що стало на це місце, за останнім — на попереднє", async () => {
    await withPhotos(3)
    await userEvent.click(
      screen.getByRole("button", { name: "Прибрати фото 2: 1.png" }),
    )
    expect(
      screen.getByRole("button", { name: "Фото 2 з 2: 2.png" }),
    ).toHaveFocus()
    await userEvent.click(
      screen.getByRole("button", { name: "Прибрати фото 2: 2.png" }),
    )
    expect(
      screen.getByRole("button", { name: "Фото 1 з 1: 0.png" }),
    ).toHaveFocus()
    await userEvent.click(
      screen.getByRole("button", { name: "Прибрати фото 1: 0.png" }),
    )
    expect(screen.getByRole("button", { name: "Вибрати фото" })).toHaveFocus()
  })

  it("подвійний клік прибирає одне фото", async () => {
    await withPhotos(3)
    const remove = screen.getByRole("button", {
      name: "Прибрати фото 1: 0.png",
    })
    fireEvent.click(remove, { detail: 1 })
    fireEvent.click(
      screen.getByRole("button", { name: "Прибрати фото 1: 1.png" }),
      { detail: 2 },
    )
    expect(thumbs()).toHaveLength(2)
  })

  it("з клавіатури: рамка, зсув, розмір, усе фото; позначка «обрізано»", async () => {
    await withPhotos(1)
    const area = screen.getByRole("application", {
      name: "Обрізання фото «0.png»",
    })
    area.focus()
    await userEvent.keyboard("{ArrowRight}")
    expect(screen.getByTestId("photo-crop-status")).toHaveTextContent(
      "Рамка 1280 × 960 px, від лівого краю 160, від верху 120",
    )
    expect(
      screen.getByRole("button", { name: "Фото 1 з 1: 0.png обрізано" }),
    ).toBeInTheDocument()
    await userEvent.keyboard("{ArrowRight}{Shift>}{ArrowLeft}{/Shift}")
    expect(screen.getByTestId("photo-crop-status")).toHaveTextContent(
      "Рамка 1248 × 960 px, від лівого краю 192",
    )
    await userEvent.keyboard("{Delete}")
    expect(screen.getByTestId("photo-crop-status")).toHaveTextContent(
      "Усе фото, 1600 × 1200 px",
    )
    expect(
      screen.queryByRole("button", { name: "Усе фото" }),
    ).not.toBeInTheDocument()
  })
})

describe("PhotoCrop у полі", () => {
  async function cropArea() {
    render(<Harness />)
    await userEvent.upload(input(), [png("0.png")])
    const area = await screen.findByRole("application", {
      name: "Обрізання фото «0.png»",
    })
    // Фото на екрані 400 × 300: пікселі фото вчетверо більші.
    vi.spyOn(area, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 300 }),
    )
    return area
  }
  const at = (pointerId: number, clientX: number, clientY: number) => ({
    pointerId,
    clientX,
    clientY,
    button: 0,
  })
  const status = () => screen.getByTestId("photo-crop-status")

  it("рамку веде перший палець, другий її не чіпає", async () => {
    const area = await cropArea()
    fireEvent.pointerDown(area, at(1, 40, 30))
    fireEvent.pointerDown(area, at(2, 300, 250))
    fireEvent.pointerMove(area, at(2, 390, 290))
    fireEvent.pointerMove(area, at(1, 200, 150))
    fireEvent.pointerUp(area, at(2, 390, 290))
    fireEvent.pointerUp(area, at(1, 200, 150))
    expect(status()).toHaveTextContent(
      "Рамка 640 × 480 px, від лівого краю 160, від верху 120",
    )
  })

  it("два кути по черзі; Escape скасовує перший", async () => {
    const area = await cropArea()
    fireEvent.pointerDown(area, at(1, 40, 30))
    fireEvent.pointerUp(area, at(1, 40, 30))
    expect(status()).toHaveTextContent("Перший кут вибрано, торкніться другого")
    area.focus()
    const escape = fireEvent.keyDown(area, { key: "Escape" })
    // Скасовано лише кут: діалог навколо поля не закривається.
    expect(escape).toBe(false)
    expect(status()).toHaveTextContent("Усе фото, 1600 × 1200 px")
    expect(fireEvent.keyDown(area, { key: "Escape" })).toBe(true)
    fireEvent.pointerDown(area, at(1, 40, 30))
    fireEvent.pointerUp(area, at(1, 40, 30))
    fireEvent.pointerDown(area, at(1, 200, 150))
    fireEvent.pointerUp(area, at(1, 200, 150))
    expect(status()).toHaveTextContent("Рамка 640 × 480 px")
  })
})

describe("PhotoInput: порядок фото", () => {
  it("«Раніше» й «Пізніше» пересувають показане фото, перше — «головне»; нове місце чутно", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await userEvent.upload(input(), [png("a.png"), png("b.png"), png("c.png")])
    await waitFor(() => {
      expect(thumbs()).toHaveLength(3)
    })
    const names = () => thumbs().map((thumb) => thumb.textContent)
    expect(names()[0]).toMatch(/a\.png\s*головне/)
    // Показане — останнє додане «c»: «Пізніше» вимкнене, «Раніше» — ні.
    const later = screen.getByRole("button", { name: "Пізніше: фото «c.png»" })
    expect(later).toHaveAttribute("aria-disabled", "true")
    const earlier = screen.getByRole("button", {
      name: "Раніше: фото «c.png»",
    })
    await user.click(earlier)
    expect(names().map((name) => name?.match(/\w\.png/)?.[0])).toEqual([
      "a.png",
      "c.png",
      "b.png",
    ])
    await waitFor(() => {
      expect(document.getElementById("erp-ui-announcer")).toHaveTextContent(
        "Фото «c.png» тепер 2 з 3",
      )
    })
    await user.click(earlier)
    expect(names()[0]).toMatch(/c\.png\s*головне/)
    expect(state?.value.photos.map((photo) => photo.name)).toEqual([
      "c.png",
      "a.png",
      "b.png",
    ])
    // На краю кнопка вимкнена, але фокус на ній лишається.
    expect(earlier).toHaveAttribute("aria-disabled", "true")
    expect(earlier).toHaveFocus()
    await waitFor(() => {
      expect(document.getElementById("erp-ui-announcer")).toHaveTextContent(
        "Фото «c.png» тепер головне",
      )
    })
  })

  it("одне фото чи недоступне поле — без порядку", async () => {
    const { rerender } = render(<Harness />)
    await userEvent.upload(input(), [png("a.png")])
    await waitFor(() => {
      expect(thumbs()).toHaveLength(1)
    })
    expect(screen.queryByRole("button", { name: /^Раніше/ })).toBeNull()
    expect(thumbs()[0]).not.toHaveTextContent("головне")
    await userEvent.upload(input(), [png("b.png")])
    await waitFor(() => {
      expect(thumbs()).toHaveLength(2)
    })
    rerender(<Harness disabled />)
    expect(screen.getByRole("button", { name: /^Раніше/ })).toBeDisabled()
    expect(strip()?.querySelector("li[draggable='true']")).toBeNull()
  })
})

describe("PhotoInput англійською", () => {
  it("рядки поля є англійською", async () => {
    await act(async () => {
      await createDemoI18n("en").changeLanguage("en")
    })
    render(<Harness />)
    expect(
      await screen.findByRole("button", { name: "Choose photos" }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Up to 4 photos: JPEG, PNG or WebP/)).toBeVisible()
  })
})

describe("usePhotoChoice", () => {
  it("тримає той самий об'єкт стану між рендерами без змін", () => {
    const seen: PhotoChoiceState[] = []
    function Probe() {
      const photos = usePhotoChoice()
      seen.push(photos)
      return null
    }
    const { rerender } = render(<Probe />)
    rerender(<Probe />)
    expect(seen[1]).toBe(seen[0])
  })
})
