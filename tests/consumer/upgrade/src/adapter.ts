// Адаптер проекту (ADR-0021) для сценарію оновлення (scripts/upgrade-smoke.mjs): провайдери кіта на
// фабриках, своє поверх. Файл проекту, написаний на попередньому тегу: після оновлення мінорною чи
// патч-версією він компілюється без змін.
import { createApiClient } from "@/lib/api"
import { createAuthProvider, type ErpAuthProvider } from "@/lib/auth"
import { createDataProvider, type ErpDataProvider } from "@/lib/data-provider"

const BASE_URL = "/backend/v2"

const client = createApiClient({ baseUrl: BASE_URL })
const kitData = createDataProvider(client, {
  resourcePath: (resource) => resource.replace(/^sales-/, "sales/"),
})
const kitAuth = createAuthProvider(client, { baseUrl: BASE_URL })

/** Бекенд проекту віддає й архівні записи: список їх не показує. */
export const dataProvider: ErpDataProvider = {
  ...kitData,
  getList: (resource, params) =>
    kitData.getList(resource, {
      ...params,
      filter: { ...params.filter, archived: false },
    }),
}

/** Вихід ще й прибирає чернетку проекту з браузера. */
export const authProvider: ErpAuthProvider = {
  ...kitAuth,
  logout: (params) => {
    sessionStorage.removeItem("project-draft")
    return kitAuth.logout(params)
  },
}
