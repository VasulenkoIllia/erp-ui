/**
 * Налаштування компанії (ADR-0014, основа модуля A1): реквізити для рахунків і документів,
 * логотип, печатка й підпис, філії. Компанія — поточна (`X-Company-Id`, ADR-0002).
 *
 * Контракт (під `/api/v1`; читати може кожен у компанії, змінювати — право `company:update`):
 * - `GET /company` → профіль; `PATCH /company` (зміни) → профіль. Помилки — 422 `fieldErrors`
 *   з кодами LC12 (`edrpou`: `length` / `checksum`, `iban`: `country` / …) і `required`.
 * - Зображення: `PUT /company/logo` і `PUT /company/stamp` (multipart, поле `file`; PNG, JPG, WebP
 *   чи SVG до 1 МБ) → { url }; `DELETE /company/logo|stamp` → 204.
 * - Філії: `POST /company/branches` → філія; `PATCH` і `DELETE /company/branches/:id`.
 * - Юрособа має ЄДРПОУ (8 цифр), ФОП — РНОКПП (10 цифр); платник ПДВ — ІПН (12 цифр).
 * - `palette` — палітра компанії: застосунок бере її типовою (`useBrandAppearance(palette)`).
 */
import { z } from "zod"

import type { ApiClient } from "@/registry/lib/api"
import { PALETTES } from "@/registry/lib/appearance"

export const COMPANY_KINDS = ["legal", "fop"] as const
export type CompanyKind = (typeof COMPANY_KINDS)[number]

export const branchSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Код філії для документів і податкової (необов'язково). */
  code: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
})
export type Branch = z.infer<typeof branchSchema>

export const companyProfileSchema = z.object({
  id: z.string(),
  /** Коротка назва в інтерфейсі: «Зоряна логістика». */
  name: z.string(),
  /** Повна назва для документів: ТОВ «Зоряна логістика». */
  legalName: z.string(),
  kind: z.enum(COMPANY_KINDS),
  edrpou: z.string().optional(),
  rnokpp: z.string().optional(),
  vatPayer: z.boolean(),
  vatIpn: z.string().optional(),
  iban: z.string().optional(),
  bankName: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  director: z.object({ name: z.string(), position: z.string() }).optional(),
  accountant: z.string().optional(),
  logoUrl: z.string().nullable(),
  /** Печатка чи підпис для документів (PNG з прозорим тлом). */
  stampUrl: z.string().nullable(),
  /**
   * Палітра компанії (SPEC §6.2): типова для всіх у компанії, хто не обрав свою; `null` — як у
   * бренду сторінки входу.
   */
  palette: z.enum(PALETTES).nullable().optional(),
  branches: z.array(branchSchema),
})
export type CompanyProfile = z.infer<typeof companyProfileSchema>

/** Що змінюється у формі (без id, зображень і філій). */
export type CompanyUpdate = Partial<
  Omit<CompanyProfile, "id" | "logoUrl" | "stampUrl" | "branches">
>

export type CompanyImage = "logo" | "stamp"

const imageSchema = z.object({ url: z.string() })

export interface CompanyApi {
  get: () => Promise<CompanyProfile>
  update: (patch: CompanyUpdate) => Promise<CompanyProfile>
  uploadImage: (kind: CompanyImage, image: Blob) => Promise<string>
  removeImage: (kind: CompanyImage) => Promise<void>
  createBranch: (input: Omit<Branch, "id">) => Promise<Branch>
  updateBranch: (
    id: string,
    input: Partial<Omit<Branch, "id">>,
  ) => Promise<Branch>
  removeBranch: (id: string) => Promise<void>
}

export function createCompanyApi(client: ApiClient): CompanyApi {
  return {
    get: () => client.get("/company", { schema: companyProfileSchema }),
    update: (patch) =>
      client.patch("/company", patch, { schema: companyProfileSchema }),
    async uploadImage(kind, image) {
      const form = new FormData()
      form.append("file", image, kind)
      const { url } = await client.put(`/company/${kind}`, form, {
        schema: imageSchema,
      })
      return url
    },
    async removeImage(kind) {
      await client.delete(`/company/${kind}`)
    },
    createBranch: (input) =>
      client.post("/company/branches", input, { schema: branchSchema }),
    updateBranch: (id, input) =>
      client.patch(`/company/branches/${encodeURIComponent(id)}`, input, {
        schema: branchSchema,
      }),
    async removeBranch(id) {
      await client.delete(`/company/branches/${encodeURIComponent(id)}`)
    },
  }
}

export const COMPANY_QUERY_KEYS = {
  profile: ["erp-ui", "company", "profile"],
} as const

/** Найбільший файл зображення компанії. */
export const COMPANY_IMAGE_MAX_BYTES = 1024 * 1024
export const COMPANY_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const
