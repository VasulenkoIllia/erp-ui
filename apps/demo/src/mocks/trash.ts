import { http } from "msw/http"

import { API_PREFIX } from "@/registry/lib/api"
import { errorResponse } from "@/registry/lib/mock-server"
import { createTrashMocks } from "@/registry/lib/mock-trash"
import { TRASH_PATH } from "@/registry/lib/trash"

import { NO_TRASH_RESOURCE } from "./resources"

/**
 * Кошик демо (PF16, ADR-0095), один на застосунок: строк 30 днів, ресурси модулів і товари сторінки
 * «Кошик». Для `NO_TRASH_RESOURCE` список відповідає 404: так сторінка показує бекенд без кошика.
 */
export function createDemoTrash() {
  const trash = createTrashMocks()
  const noTrash = http.get(`${API_PREFIX}${TRASH_PATH}`, ({ request }) =>
    new URL(request.url).searchParams.get("resource") === NO_TRASH_RESOURCE
      ? errorResponse(404, { code: "not_found", message: "No trash" })
      : undefined,
  )
  return { bin: trash.bin, handlers: [noTrash, ...trash.handlers] }
}
