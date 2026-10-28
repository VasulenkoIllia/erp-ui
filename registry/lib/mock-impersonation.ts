/**
 * Мок «Увійти як…» (ADR-0011, ADR-0032): адміністратор із `users:impersonate` починає й завершує
 * роботу від імені людини компанії запиту — з причиною, повторним підтвердженням і записом у журнал
 * входів людини й журнал аудиту. Обробники бере `createAccountHandlers` (`lib/mock-account`).
 * Права адміністратора й людини — у компанії запиту (ADR-0034).
 */
import { http, type HttpHandler } from "msw/http"

import { hasPermission } from "@/registry/lib/auth"
import {
  actorOf,
  recordSignIn,
  validation,
} from "@/registry/lib/mock-account-state"
import { recordAudit } from "@/registry/lib/mock-audit"
import {
  mockPermissionsIn,
  mockRequestPermissions,
} from "@/registry/lib/mock-company-roles"
import {
  currentMockUser,
  errorResponse,
  getMockSession,
  mockCompanyTarget,
  mockUsersList,
  noContent,
  unauthenticated,
  writeMockSession,
} from "@/registry/lib/mock-server"
import { impersonationBlock } from "@/registry/lib/roles"

export interface ImpersonationMockOptions {
  baseUrl: string
  /** Повторне підтвердження (`lib/mock-account-state`, `accountChangeGuard`). */
  reauthRequired: () => Response | null
}

export function createImpersonationHandlers({
  baseUrl,
  reauthRequired,
}: ImpersonationMockOptions): HttpHandler[] {
  return [
    http.post(`${baseUrl}/auth/impersonation`, async ({ request }) => {
      const admin = currentMockUser()
      const session = getMockSession()
      if (!admin || !session) return unauthenticated()
      if (session.impersonatorId)
        return errorResponse(409, {
          code: "conflict",
          message: "Already impersonating",
        })
      // Права обох — у компанії запиту (ADR-0034).
      const access = mockRequestPermissions(request, admin)
      if (access instanceof Response) return access
      if (!hasPermission(access.permissions, "users", "impersonate"))
        return errorResponse(403, {
          code: "forbidden",
          message: "Missing users:impersonate",
        })
      const body = (await request.json()) as {
        userId?: string
        reason?: string
      }
      const target = mockCompanyTarget(request, admin, body.userId)
      if (target instanceof Response) return target
      if (target.id === admin.id) return validation({ userId: "invalid" })
      // Іншого адміністратора чи людину з правами, яких немає в адміністратора, — ні: інакше
      // «Увійти як…» обходить розподіл прав («стеля», ADR-0032). До повторного підтвердження:
      // слабшого не просять пароль, щоб потім відмовити.
      if (
        impersonationBlock(
          access.permissions,
          mockPermissionsIn(target, access.companyId),
        )
      )
        return errorResponse(403, {
          code: "forbidden",
          message: "Cannot impersonate an administrator or a stronger user",
        })
      const reauth = reauthRequired()
      if (reauth) return reauth
      const reason = body.reason?.trim() ?? ""
      if (!reason) return validation({ reason: "required" })
      writeMockSession({
        ...session,
        userId: target.id,
        impersonatorId: admin.id,
        // «Стелю» перевірили лише тут: інша компанія людини — 403 (`mockRequestCompany`).
        impersonationCompanyId: access.companyId ?? undefined,
        reauthUntil: undefined,
      })
      recordSignIn(target, {
        result: "success",
        method: "impersonation",
        impersonatedBy: admin.name,
      })
      recordAudit({
        action: "auth.impersonation_started",
        category: "auth",
        actor: actorOf(admin),
        target: { type: "users", id: target.id, name: target.name },
        reason,
      })
      return noContent()
    }),

    http.delete(`${baseUrl}/auth/impersonation`, () => {
      const session = getMockSession()
      if (session?.stage !== "authenticated") return unauthenticated()
      if (!session.impersonatorId)
        return errorResponse(409, {
          code: "conflict",
          message: "Not impersonating",
        })
      writeMockSession({
        ...session,
        userId: session.impersonatorId,
        impersonatorId: undefined,
        impersonationCompanyId: undefined,
        reauthUntil: undefined,
      })
      const admin = mockUsersList().find((u) => u.id === session.impersonatorId)
      const target = mockUsersList().find((u) => u.id === session.userId)
      if (admin)
        recordAudit({
          action: "auth.impersonation_ended",
          category: "auth",
          actor: actorOf(admin),
          ...(target
            ? { target: { type: "users", id: target.id, name: target.name } }
            : {}),
        })
      return noContent()
    }),
  ]
}
