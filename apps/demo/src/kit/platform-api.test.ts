import { describe, expect, it, vi } from "vitest"

import { createAccountApi } from "@/registry/lib/account"
import { createApiClient } from "@/registry/lib/api"
import { createAuditApi } from "@/registry/lib/audit"
import { createInvitationsApi } from "@/registry/lib/invitations"
import { createPlatformApis, lazyApi } from "@/registry/lib/platform-api"
import { createAdminApi } from "@/registry/lib/security-policy"
import { createTimelineApi } from "@/registry/lib/timeline"
import { createWebhooksApi } from "@/registry/lib/webhooks"

const client = createApiClient({ baseUrl: "http://erp.test/api/v1" })

interface ReportsApi {
  list: (page: number) => Promise<string[]>
  run: (id: string) => Promise<void>
}

describe("API платформи (ADR-0092)", () => {
  it("ліниві API мають ті самі методи, що й справжні", () => {
    const apis = createPlatformApis(client)
    const keys = (api: object) => Object.keys(api).sort()
    expect(keys(apis.account)).toEqual(keys(createAccountApi(client)))
    expect(keys(apis.admin)).toEqual(keys(createAdminApi(client)))
    expect(keys(apis.audit)).toEqual(keys(createAuditApi(client)))
    expect(keys(apis.webhooks)).toEqual(keys(createWebhooksApi(client)))
    expect(keys(apis.invitations)).toEqual(keys(createInvitationsApi(client)))
    expect(keys(apis.timeline)).toEqual(keys(createTimelineApi(client)))
  })

  it("вантажить API один раз, при першому виклику, і передає аргументи", async () => {
    const list = vi.fn((page: number) => Promise.resolve([`p${page}`]))
    const load = vi.fn(() =>
      Promise.resolve<ReportsApi>({ list, run: () => Promise.resolve() }),
    )
    const reports = lazyApi(load, { list: true, run: true })

    expect(load).not.toHaveBeenCalled()
    await expect(reports.list(2)).resolves.toEqual(["p2"])
    await reports.list(3)
    expect(load).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenLastCalledWith(3)
  })

  it("перевизначення методу в адаптері лишає решту лінивими", async () => {
    const run = vi.fn(() => Promise.resolve())
    const reports = lazyApi<ReportsApi>(
      () => Promise.resolve({ list: () => Promise.resolve(["kit"]), run }),
      { list: true, run: true },
    )
    const projectRun = vi.fn(() => Promise.resolve())
    const adapted: ReportsApi = { ...reports, run: projectRun }

    await adapted.run("r1")
    await expect(adapted.list(1)).resolves.toEqual(["kit"])
    expect(projectRun).toHaveBeenCalledWith("r1")
    expect(run).not.toHaveBeenCalled()
  })

  it("збій завантаження відхиляє виклик, а повтор вантажить заново", async () => {
    const chunkError = new TypeError(
      "Failed to fetch dynamically imported module",
    )
    const load = vi
      .fn<() => Promise<ReportsApi>>()
      .mockRejectedValueOnce(chunkError)
      .mockResolvedValue({
        list: () => Promise.resolve(["ok"]),
        run: () => Promise.resolve(),
      })
    const reports = lazyApi(load, { list: true, run: true })

    await expect(reports.list(1)).rejects.toBe(chunkError)
    await expect(reports.list(1)).resolves.toEqual(["ok"])
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("помилка методу не скидає завантажений API", async () => {
    const load = vi.fn(() =>
      Promise.resolve<ReportsApi>({
        list: () => Promise.reject(new Error("500")),
        run: () => Promise.resolve(),
      }),
    )
    const reports = lazyApi(load, { list: true, run: true })

    await expect(reports.list(1)).rejects.toThrow("500")
    await reports.run("r1")
    expect(load).toHaveBeenCalledTimes(1)
  })
})
