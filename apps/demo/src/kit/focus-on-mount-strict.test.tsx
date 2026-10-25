import { render, screen } from "@testing-library/react"
import { StrictMode } from "react"
import { describe, expect, it } from "vitest"

import { PageState } from "@/registry/erp/page-state"

/**
 * Крок A2a, рев'ю: у StrictMode ефект запускається двічі, і другий запуск не має вважати перший екран
 * сесії «наступним». Окремий файл: перший екран сесії — модульний стан хука.
 */
describe("useFocusHeadingOnMount у StrictMode", () => {
  it("перший екран сесії — h1 стану без фокуса", () => {
    render(
      <StrictMode>
        <PageState kind="error" headingLevel={1} onRetry={() => undefined} />
      </StrictMode>,
    )
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Не вдалося завантажити дані",
      }),
    ).not.toHaveFocus()
  })
})
