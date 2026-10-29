/**
 * Мок налаштувань компанії (ADR-0014): реквізити, логотип і печатка, філії поточної компанії
 * (`X-Company-Id`, інакше — компанія користувача).
 *
 * - Профіль кожної компанії живе в localStorage (`erp-ui:mock-company:<id>`); початковий —
 *   `profiles` з опцій або назва з компаній користувачів.
 * - Реквізити перевіряються як на сервері: ЄДРПОУ, РНОКПП, ІПН ПДВ і IBAN — контрольні суми LC12.
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/registry/lib/api"
import { PALETTES } from "@/registry/lib/appearance"
import { hasPermission } from "@/registry/lib/auth"
import {
  COMPANY_IMAGE_MAX_BYTES,
  COMPANY_IMAGE_TYPES,
  COMPANY_KINDS,
  type Branch,
  type CompanyImage,
  type CompanyProfile,
} from "@/registry/lib/company"
import { auditChanges, recordAudit } from "@/registry/lib/mock-audit"
import { mockRequestPermissions } from "@/registry/lib/mock-company-roles"
import {
  currentMockUser,
  errorResponse,
  impersonationForbidden,
  json,
  mockUsersList,
  noContent,
  randomToken,
  unauthenticated,
  type MockUser,
} from "@/registry/lib/mock-server"
import { validateUaId, type UaIdKind } from "@/registry/lib/ua-ids"

const KEY = (companyId: string) => `erp-ui:mock-company:${companyId}`

export type MockCompanyProfile = Partial<Omit<CompanyProfile, "id">>

export interface CompanyMockOptions {
  baseUrl?: string
  /** Початкові профілі компаній: { zoriana: { legalName, edrpou, iban, … } }. */
  profiles?: Record<string, MockCompanyProfile>
}

const validation = (fields: Record<string, string>) =>
  errorResponse(422, {
    code: "validation",
    message: "Validation failed",
    fieldErrors: fields,
  })

const TEXT_FIELDS = [
  "name",
  "legalName",
  "bankName",
  "address",
  "phone",
  "email",
  "website",
  "accountant",
] as const

export function createCompanyHandlers({
  baseUrl = API_PREFIX,
  profiles = {},
}: CompanyMockOptions = {}): HttpHandler[] {
  const initial = (id: string): CompanyProfile => {
    const name =
      mockUsersList()
        .flatMap((u) => u.companies)
        .find((c) => c.id === id)?.name ?? id
    return {
      id,
      name,
      legalName: name,
      kind: "legal",
      vatPayer: false,
      logoUrl: null,
      stampUrl: null,
      branches: [],
      ...profiles[id],
    }
  }

  const load = (id: string): CompanyProfile => {
    try {
      const raw = globalThis.localStorage?.getItem(KEY(id))
      if (raw) return { ...initial(id), ...(JSON.parse(raw) as object) }
    } catch {
      // Пошкоджений стан — з початкового.
    }
    return initial(id)
  }

  const save = (profile: CompanyProfile) => {
    try {
      globalThis.localStorage?.setItem(KEY(profile.id), JSON.stringify(profile))
    } catch {
      // Без сховища — до перезавантаження.
    }
  }

  /**
   * Член компанії; зміни — право `company:update` у компанії запиту (A2c1) і не «Увійти як…».
   */
  const access = (
    request: Request,
    change = false,
  ): { user: MockUser; id: string } | Response => {
    const user = currentMockUser()
    if (!user) return unauthenticated()
    const scoped = mockRequestPermissions(request, user)
    if (scoped instanceof Response) return scoped
    const id = scoped.companyId
    if (!id)
      return errorResponse(403, {
        code: "forbidden",
        message: "Not a member of this company",
      })
    if (change) {
      if (!hasPermission(scoped.permissions, "company", "update"))
        return errorResponse(403, {
          code: "forbidden",
          message: "Missing company:update",
        })
      const denied = impersonationForbidden()
      if (denied) return denied
    }
    return { user, id }
  }

  const idIssue = (kind: UaIdKind, value: unknown) =>
    typeof value === "string" && value ? validateUaId(kind, value) : null

  const imageHandlers = (kind: CompanyImage) => [
    http.put(`${baseUrl}/company/${kind}`, async ({ request }) => {
      const ctx = access(request, true)
      if (ctx instanceof Response) return ctx
      const file = (await request.formData()).get("file")
      if (!file || typeof file === "string")
        return validation({ file: "required" })
      if (!(COMPANY_IMAGE_TYPES as readonly string[]).includes(file.type))
        return validation({ file: "type" })
      if (file.size > COMPANY_IMAGE_MAX_BYTES)
        return validation({ file: "tooLarge" })
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ""
      for (const byte of bytes) binary += String.fromCharCode(byte)
      const url = `data:${file.type};base64,${btoa(binary)}`
      const profile = load(ctx.id)
      save({ ...profile, [kind === "logo" ? "logoUrl" : "stampUrl"]: url })
      return json({ url })
    }),
    http.delete(`${baseUrl}/company/${kind}`, ({ request }) => {
      const ctx = access(request, true)
      if (ctx instanceof Response) return ctx
      const profile = load(ctx.id)
      save({ ...profile, [kind === "logo" ? "logoUrl" : "stampUrl"]: null })
      return noContent()
    }),
  ]

  return [
    http.get(`${baseUrl}/company`, ({ request }) => {
      const ctx = access(request)
      if (ctx instanceof Response) return ctx
      return json(load(ctx.id))
    }),

    http.patch(`${baseUrl}/company`, async ({ request }) => {
      const ctx = access(request, true)
      if (ctx instanceof Response) return ctx
      const body = (await request.json()) as Partial<CompanyProfile>
      const before = load(ctx.id)
      const next: CompanyProfile = { ...before }
      for (const key of TEXT_FIELDS)
        if (typeof body[key] === "string") next[key] = body[key].trim()
      if (body.kind && (COMPANY_KINDS as readonly string[]).includes(body.kind))
        next.kind = body.kind
      if (typeof body.vatPayer === "boolean") next.vatPayer = body.vatPayer
      for (const key of ["edrpou", "rnokpp", "vatIpn", "iban"] as const)
        if (typeof body[key] === "string")
          next[key] = body[key].replace(/\s/g, "")
      if (body.director !== undefined) next.director = body.director
      if (body.palette === null) next.palette = null
      else if (
        body.palette &&
        (PALETTES as readonly string[]).includes(body.palette)
      )
        next.palette = body.palette

      const fields: Record<string, string> = {}
      if (!next.name.trim()) fields.name = "required"
      if (!next.legalName.trim()) fields.legalName = "required"
      if (next.kind === "legal") {
        if (!next.edrpou) fields.edrpou = "required"
        const issue = idIssue("edrpou", next.edrpou)
        if (issue) fields.edrpou = issue
      } else {
        if (!next.rnokpp) fields.rnokpp = "required"
        const issue = idIssue("rnokpp", next.rnokpp)
        if (issue) fields.rnokpp = issue
      }
      if (next.vatPayer) {
        if (!next.vatIpn) fields.vatIpn = "required"
        const issue = idIssue("vatIpn", next.vatIpn)
        if (issue) fields.vatIpn = issue
      }
      const ibanIssue = idIssue("iban", next.iban)
      if (ibanIssue) fields.iban = ibanIssue
      if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email))
        fields.email = "invalid"
      if (Object.keys(fields).length) return validation(fields)

      save(next)
      const flat = ({
        branches,
        logoUrl,
        stampUrl,
        director,
        ...rest
      }: CompanyProfile) => {
        void branches
        void logoUrl
        void stampUrl
        return {
          ...rest,
          "director.name": director?.name,
          "director.position": director?.position,
        }
      }
      recordAudit({
        action: "company.updated",
        category: "company",
        companyId: ctx.id,
        target: { type: "company", id: next.id, name: next.name },
        changes: auditChanges(flat(before), flat(next)),
      })
      return json(next)
    }),

    ...imageHandlers("logo"),
    ...imageHandlers("stamp"),

    http.post(`${baseUrl}/company/branches`, async ({ request }) => {
      const ctx = access(request, true)
      if (ctx instanceof Response) return ctx
      const body = (await request.json()) as Partial<Branch>
      if (!body.name?.trim()) return validation({ name: "required" })
      const branch: Branch = {
        id: `br-${randomToken().slice(0, 8)}`,
        name: body.name.trim(),
        ...(body.code?.trim() ? { code: body.code.trim() } : {}),
        ...(body.address?.trim() ? { address: body.address.trim() } : {}),
        ...(body.phone?.trim() ? { phone: body.phone.trim() } : {}),
      }
      const profile = load(ctx.id)
      save({ ...profile, branches: [...profile.branches, branch] })
      return json(branch, { status: 201 })
    }),

    http.patch(
      `${baseUrl}/company/branches/:id`,
      async ({ params, request }) => {
        const ctx = access(request, true)
        if (ctx instanceof Response) return ctx
        const profile = load(ctx.id)
        const current = profile.branches.find((b) => b.id === params.id)
        if (!current)
          return errorResponse(404, { code: "not_found", message: "Not found" })
        const body = (await request.json()) as Partial<Branch>
        if (body.name !== undefined && !body.name.trim())
          return validation({ name: "required" })
        const next: Branch = { ...current }
        for (const key of ["name", "code", "address", "phone"] as const)
          if (typeof body[key] === "string") {
            const value = body[key].trim()
            if (value) next[key] = value
            else if (key !== "name") delete next[key]
          }
        save({
          ...profile,
          branches: profile.branches.map((b) => (b.id === next.id ? next : b)),
        })
        return json(next)
      },
    ),

    http.delete(`${baseUrl}/company/branches/:id`, ({ params, request }) => {
      const ctx = access(request, true)
      if (ctx instanceof Response) return ctx
      const profile = load(ctx.id)
      if (!profile.branches.some((b) => b.id === params.id))
        return errorResponse(404, { code: "not_found", message: "Not found" })
      save({
        ...profile,
        branches: profile.branches.filter((b) => b.id !== params.id),
      })
      return noContent()
    }),
  ]
}
