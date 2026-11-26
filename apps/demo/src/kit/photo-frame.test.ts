import { describe, expect, it } from "vitest"

import { precheckPhoto } from "@/registry/hooks/use-photo-choice"
import {
  addPhotos,
  NO_PHOTOS,
  removePhoto,
  selectedPhoto,
  withCrop,
  type ChosenPhoto,
} from "@/registry/lib/photo-choice"
import {
  frameBetween,
  keyboardFrame,
  keyStep,
  moveFrame,
  outputSize,
  resizeFrame,
} from "@/registry/lib/photo-frame"
import {
  ariaKeyShortcuts,
  comboLabel,
  matchesShortcut,
  SHORTCUTS,
} from "@/registry/lib/shortcuts"

const SIZE = { width: 1000, height: 500 }

const photo = (name: string, fingerprint = name): ChosenPhoto => ({
  url: `blob:${name}`,
  name,
  fingerprint,
  image: {} as HTMLImageElement,
  width: 100,
  height: 100,
  crop: null,
})

describe("рамка фото", () => {
  it("між двома точками в будь-якому напрямку й у межах фото", () => {
    expect(
      frameBetween({ x: 600, y: 400 }, { x: 100, y: 50 }, SIZE, 16),
    ).toEqual({ x: 100, y: 50, width: 500, height: 350 })
    expect(
      frameBetween({ x: -50, y: -10 }, { x: 2000, y: 900 }, SIZE, 16),
    ).toEqual({ x: 0, y: 0, ...SIZE })
  })

  it("вузька рамка — клацання, а не обрізання", () => {
    expect(frameBetween({ x: 10, y: 10 }, { x: 20, y: 400 }, SIZE, 16)).toBe(
      null,
    )
  })

  it("з клавіатури починається з 80 % по центру й зсувається в межах фото", () => {
    const frame = keyboardFrame(SIZE)
    expect(frame).toEqual({ x: 100, y: 50, width: 800, height: 400 })
    expect(keyStep(SIZE)).toBe(20)
    expect(moveFrame(frame, 500, -500, SIZE)).toEqual({
      ...frame,
      x: 200,
      y: 0,
    })
  })

  it("розмір змінюється праворуч і вниз, не менше мінімуму й не за фото", () => {
    const frame = { x: 900, y: 400, width: 50, height: 50 }
    expect(resizeFrame(frame, 500, 500, SIZE, 16)).toEqual({
      ...frame,
      width: 100,
      height: 100,
    })
    expect(resizeFrame(frame, -500, -40, SIZE, 16)).toEqual({
      ...frame,
      width: 16,
      height: 16,
    })
  })

  it("на виході довша сторона до межі, мале фото не збільшується", () => {
    expect(outputSize({ width: 4000, height: 3000 })).toEqual({
      width: 1024,
      height: 768,
    })
    expect(outputSize({ width: 300, height: 200 })).toEqual({
      width: 300,
      height: 200,
    })
    expect(outputSize({ width: 3000, height: 4000 }, 800)).toEqual({
      width: 600,
      height: 800,
    })
  })
})

describe("вибрані фото", () => {
  it("додає до межі, повтор вмісту відкидає, показує останнє додане", () => {
    const first = addPhotos(NO_PHOTOS, [photo("a"), photo("b")], 3)
    expect(first.photos.map((each) => each.name)).toEqual(["a", "b"])
    expect(first.selectedUrl).toBe("blob:b")
    const next = addPhotos(
      first,
      [photo("a-again", "a"), photo("c"), photo("d")],
      3,
    )
    expect(next.photos.map((each) => each.name)).toEqual(["a", "b", "c"])
    expect(next.duplicates.map((each) => each.name)).toEqual(["a-again"])
    expect(next.rejected.map((each) => each.name)).toEqual(["d"])
    expect(next.selectedUrl).toBe("blob:c")
  })

  it("без показаного фото показує те, що стало на його місце, за останнім — попереднє", () => {
    const choice = addPhotos(NO_PHOTOS, [photo("a"), photo("b"), photo("c")])
    const middle = removePhoto({ ...choice, selectedUrl: "blob:b" }, "blob:b")
    expect(middle.selectedUrl).toBe("blob:c")
    const last = removePhoto(choice, "blob:c")
    expect(last.selectedUrl).toBe("blob:b")
    const other = removePhoto(choice, "blob:a")
    expect(other.selectedUrl).toBe("blob:c")
    expect(removePhoto(addPhotos(NO_PHOTOS, [photo("a")]), "blob:a")).toBe(
      NO_PHOTOS,
    )
  })

  it("та сама рамка лишає вибір тим самим об'єктом", () => {
    const choice = addPhotos(NO_PHOTOS, [photo("a")])
    const crop = { x: 1, y: 2, width: 30, height: 40 }
    const cropped = withCrop(choice, "blob:a", crop)
    expect(cropped).not.toBe(choice)
    expect(withCrop(cropped, "blob:a", { ...crop })).toBe(cropped)
    expect(selectedPhoto(cropped)?.crop).toEqual(crop)
    expect(selectedPhoto({ ...cropped, selectedUrl: "blob:gone" })?.name).toBe(
      "a",
    )
  })

  it("тип і розмір перевіряються до читання; файл без типу пробуємо", () => {
    expect(precheckPhoto({ type: "image/svg+xml", size: 10 }, 100)).toBe("type")
    expect(precheckPhoto({ type: "image/png", size: 101 }, 100)).toBe("size")
    expect(precheckPhoto({ type: "", size: 10 }, 100)).toBe(null)
    expect(precheckPhoto({ type: "image/webp", size: 100 }, 100)).toBe(null)
  })
})

describe("клавіші рамки в реєстрі", () => {
  it("Shift зі стрілками — розмір, підпис і aria-keyshortcuts з Shift", () => {
    const [grow] = SHORTCUTS.photoFrameResize.keys
    expect(comboLabel(grow, false)).toBe("Shift →")
    expect(comboLabel(grow, true)).toBe("⇧→")
    expect(ariaKeyShortcuts(SHORTCUTS.photoFrameResize, false)).toContain(
      "Shift+ArrowRight",
    )
    const shifted = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      shiftKey: true,
    })
    const plain = new KeyboardEvent("keydown", { key: "ArrowRight" })
    expect(matchesShortcut(shifted, SHORTCUTS.photoFrameResize)).toBe(true)
    expect(matchesShortcut(plain, SHORTCUTS.photoFrameResize)).toBe(false)
  })
})
