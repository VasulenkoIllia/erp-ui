import { screen, waitFor } from "@testing-library/react"
import { expect } from "vitest"

/**
 * Base UI переносить фокус у діалог у наступному кадрі: до цього клік по полю його не втримає,
 * кадр забере фокус у перше поле, і введений текст піде туди.
 */
export async function waitForDialogFocus() {
  const dialog = await screen.findByRole("dialog")
  await waitFor(() => {
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })
}
