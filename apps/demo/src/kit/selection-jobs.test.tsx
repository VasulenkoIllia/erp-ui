import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ZodError } from "zod"

import { mergeFailures } from "@/registry/erp/job-failures"
import { isJobStatusLost } from "@/registry/hooks/use-job"
import { useRowSelection } from "@/registry/hooks/use-row-selection"
import { ApiError } from "@/registry/lib/api"
import { JOB_FAILURE_SAMPLE, jobSchema } from "@/registry/lib/jobs"

const apiError = (status: number, code: string) =>
  new ApiError(status, { code, message: code })

describe("вибір рядків (hooks/use-row-selection)", () => {
  it("інший фільтр скидає вибір, і повернення до попереднього його не оживляє", () => {
    const { result, rerender } = renderHook(
      ({ filter }) => useRowSelection([filter, "zoriana"]),
      { initialProps: { filter: "draft" } },
    )
    act(() => {
      result.current.selectAll()
    })
    expect(result.current.state.mode).toBe("all")

    rerender({ filter: "paid" })
    expect(result.current.state).toMatchObject({ mode: "ids" })
    expect(result.current.isSelected("inv-1")).toBe(false)

    rerender({ filter: "draft" })
    expect(result.current.state).toMatchObject({ mode: "ids" })
    expect(result.current.isSelected("inv-1")).toBe(false)
  })
})

describe("стан задачі (hooks/use-job, lib/jobs)", () => {
  it("опитування зупиняється лише тоді, коли стан не дізнатись", () => {
    expect(isJobStatusLost(apiError(404, "not_found"))).toBe(true)
    expect(isJobStatusLost(apiError(401, "unauthenticated"))).toBe(true)
    expect(isJobStatusLost(apiError(403, "forbidden"))).toBe(true)
    expect(isJobStatusLost(new ZodError([]))).toBe(true)
    expect(isJobStatusLost(apiError(0, "offline"))).toBe(false)
    expect(isJobStatusLost(apiError(503, "server"))).toBe(false)
    expect(isJobStatusLost(apiError(429, "rate_limited"))).toBe(false)
    expect(isJobStatusLost(apiError(408, "server"))).toBe(false)
  })

  it("лічильники задачі мають сходитись", () => {
    const job = {
      id: "job-1",
      resource: "invoices",
      action: "approve",
      status: "running",
      total: 10,
      processed: 4,
      succeeded: 3,
      failed: 1,
      failures: [
        { code: "locked", count: 1, retryable: true, items: [{ id: "a" }] },
      ],
    }
    expect(jobSchema.safeParse(job).success).toBe(true)
    expect(jobSchema.safeParse({ ...job, succeeded: 4 }).success).toBe(false)
    expect(jobSchema.safeParse({ ...job, failures: [] }).success).toBe(false)
    expect(jobSchema.safeParse({ ...job, status: "done" }).success).toBe(false)
  })

  it("невдачі повтору й попередніх задач — одна група на причину", () => {
    const items = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `${prefix}-${String(i)}`,
      }))
    const merged = mergeFailures([
      { code: "locked", count: 2, retryable: true, items: items("a", 2) },
      {
        code: "invalid_status",
        count: 30,
        retryable: false,
        items: items("b", 20),
      },
      { code: "locked", count: 25, retryable: false, items: items("c", 20) },
    ])
    expect(
      merged.map(({ code, count, retryable }) => ({ code, count, retryable })),
    ).toEqual([
      { code: "locked", count: 27, retryable: false },
      { code: "invalid_status", count: 30, retryable: false },
    ])
    expect(merged[0]?.items).toHaveLength(JOB_FAILURE_SAMPLE)
    expect(merged[0]?.items[0]).toEqual({ id: "a-0" })
  })
})
