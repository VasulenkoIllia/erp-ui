import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import * as account from "@/registry/lib/account"
import { createAccountApi } from "@/registry/lib/account"
import { ApiError, createApiClient } from "@/registry/lib/api"
import { createAuditApi } from "@/registry/lib/audit"
import * as auth from "@/registry/lib/auth"
import * as authFactors from "@/registry/lib/auth-factors"
import { createInvitationsApi } from "@/registry/lib/invitations"
import * as localized from "@/registry/lib/localized-text"
import { createPlatformApis, lazyApi } from "@/registry/lib/platform-api"
import { createQueryClient } from "@/registry/lib/query-client"
import { createAdminApi } from "@/registry/lib/security-policy"
import { createTimelineApi } from "@/registry/lib/timeline"
import { createWebhooksApi } from "@/registry/lib/webhooks"

const client = createApiClient({ baseUrl: "http://erp.test/api/v1" })
const chunkError = () =>
  new TypeError("Failed to fetch dynamically imported module")

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
    const failure = chunkError()
    const load = vi
      .fn<() => Promise<ReportsApi>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue({
        list: () => Promise.resolve(["ok"]),
        run: () => Promise.resolve(),
      })
    const reports = lazyApi(load, { list: true, run: true })

    await expect(reports.list(1)).rejects.toBe(failure)
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

  it("паралельні перші виклики вантажать API один раз", async () => {
    const load = vi.fn(() =>
      Promise.resolve<ReportsApi>({
        list: () => Promise.resolve(["a"]),
        run: () => Promise.resolve(),
      }),
    )
    const reports = lazyApi(load, { list: true, run: true })

    await Promise.all([reports.list(1), reports.run("r1"), reports.list(2)])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("паралельні виклики під час збою відхиляються тією самою помилкою", async () => {
    const failure = chunkError()
    const load = vi
      .fn<() => Promise<ReportsApi>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue({
        list: () => Promise.resolve(["ok"]),
        run: () => Promise.resolve(),
      })
    const reports = lazyApi(load, { list: true, run: true })

    const results = await Promise.allSettled([
      reports.list(1),
      reports.run("r"),
    ])
    expect(results).toEqual([
      { status: "rejected", reason: failure },
      { status: "rejected", reason: failure },
    ])
    expect(load).toHaveBeenCalledTimes(1)
    await expect(reports.list(1)).resolves.toEqual(["ok"])
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("синхронний виняток у load — відхилений проміс, а не виняток виклику", async () => {
    const reports = lazyApi<ReportsApi>(
      () => {
        throw new Error("broken")
      },
      { list: true, run: true },
    )
    const call = reports.list(1)
    expect(call).toBeInstanceOf(Promise)
    await expect(call).rejects.toThrow("broken")
  })

  it("збій чанка — текст «оновіть сторінку» і один автоповтор запиту", () => {
    const { result } = renderHook(() => useApiErrorMessage())
    expect(result.current(chunkError())).toMatch(/Оновіть сторінку/)
    expect(
      result.current(new ApiError(0, { code: "offline", message: "" })),
    ).toBe("Немає з'єднання з сервером")
    const retry = createQueryClient().getDefaultOptions().queries?.retry
    expect(typeof retry).toBe("function")
    const shouldRetry = retry as (count: number, error: unknown) => boolean
    expect(shouldRetry(0, chunkError())).toBe(true)
    expect(shouldRetry(1, chunkError())).toBe(false)
    expect(shouldRetry(0, new TypeError("x is not a function"))).toBe(false)
  })

  it("старі імена з lib/auth і lib/account — ті самі значення (сумісність до мажорної)", () => {
    expect(auth.localizedText).toBe(localized.localizedText)
    expect(auth.localizedTextSchema).toBe(localized.localizedTextSchema)
    expect(auth.AUTH_FACTORS).toBe(authFactors.AUTH_FACTORS)
    expect(account.SETUP_FACTORS).toBe(authFactors.SETUP_FACTORS)
    const text: auth.LocalizedText = { uk: "Так" }
    const factor: auth.AuthFactor = "totp"
    const setup: account.SetupFactor = "sms"
    expect(localized.localizedText(text, "uk")).toBe("Так")
    expect([factor, setup]).toEqual(["totp", "sms"])
  })
})
