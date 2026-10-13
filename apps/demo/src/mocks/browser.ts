import { setupWorker } from "msw/browser"

import { handlers } from "./handlers"

/** MSW у браузері: демо — це застосунок без бекенду (SPEC §17). */
export async function startMocks() {
  const worker = setupWorker(...handlers)
  await worker.start({
    onUnhandledFrame: "bypass",
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  })
}
