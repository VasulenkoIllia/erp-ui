import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, beforeEach, vi } from "vitest"

import { createDemoI18n } from "@/i18n"

// jsdom не має matchMedia; за замовчуванням система «світла».
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Свіжий екземпляр i18next (українська) на кожен тест; тест може створити свій, напр. createDemoI18n("en").
beforeEach(() => {
  createDemoI18n("uk")
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})
