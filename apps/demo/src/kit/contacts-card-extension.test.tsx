import { QueryClient } from "@tanstack/react-query"
import { render, renderHook, screen, within } from "@testing-library/react"
import { CoreAdminContext, type DataProvider } from "ra-core"
import { Suspense, type ReactNode } from "react"
import { MemoryRouter, Route, Routes } from "react-router"
import { describe, expect, it, vi } from "vitest"

import {
  createContactsModule,
  type ContactsExtension,
} from "@/registry/modules/B1-contacts"
import { useContactColumns } from "@/registry/modules/B1-contacts/components/contact-columns"
import { createContactsFixtures } from "@/registry/modules/B1-contacts/fixtures"
import {
  ContactsModuleContext,
  contactsPaths,
} from "@/registry/modules/B1-contacts/module-context"

/**
 * Крок 1.7: точки розширення картки B1 для бекенду без посади й журналу змін — рядки «Подробиць»
 * (`detailRows`) і журнал «Історія» (`history: false`); «—» для порожнього телефону в списку.
 */

const { organizations, contacts } = createContactsFixtures({ locale: "uk" })
const CONTACT = contacts.find(
  (contact) =>
    contact.organizationId !== null &&
    contact.position !== "" &&
    contact.segments.length > 0,
)
const ORGANIZATION = organizations[0]
if (!CONTACT || !ORGANIZATION) throw new Error("fixtures: no contact")

/**
 * Записи картки з фікстур; списки (сегменти, журнал, організації) — порожні. «Історію» шукаємо
 * текстом: у jsdom ширина 0, тож журнал — вкладкою, а на широкому екрані він панеллю.
 */
const dataProvider = {
  getOne: (resource: string, { id }: { id: string }) =>
    Promise.resolve({
      data:
        resource === "contacts"
          ? contacts.find((contact) => contact.id === id)
          : {
              ...organizations.find((organization) => organization.id === id),
              addresses: [],
              bankAccounts: [],
            },
    }),
  getList: () => Promise.resolve({ data: [], total: 0 }),
  getMany: (_resource: string, { ids }: { ids: string[] }) =>
    Promise.resolve({
      data: organizations.filter((organization) =>
        ids.includes(organization.id),
      ),
    }),
} as unknown as DataProvider

/**
 * Сторінки модуля — ліниві чанки. Чанк завантажено заздалегідь (`preload`), тож рендер не
 * призупиняється: призупинений поза `act` рендер React у тестах сам не відновлює.
 */
async function renderCard(path: string, extension?: ContactsExtension) {
  const contactsModule = createContactsModule({ extension })
  await Promise.all([
    import("@/registry/modules/B1-contacts/pages/contact-page"),
    import("@/registry/modules/B1-contacts/pages/organization-page"),
  ])
  contactsModule.preload(path)
  await vi.dynamicImportSettled()
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CoreAdminContext
        dataProvider={dataProvider}
        queryClient={new QueryClient()}
      >
        <Suspense fallback={null}>
          <Routes>
            {contactsModule.routes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={route.element}
              />
            ))}
          </Routes>
        </Suspense>
      </CoreAdminContext>
    </MemoryRouter>,
  )
}

describe("картка контакту B1: розширення для бекенду без посади й журналу", () => {
  it("без розширення — «Посада» в «Подробицях» і журнал «Історія»", async () => {
    await renderCard(`/contacts/${CONTACT.id}`)
    const details = await screen.findByRole("region", { name: "Подробиці" })
    expect(within(details).getByText("Посада")).toBeInTheDocument()
    // Підпис сегментів з'являється, коли завантажився довідник: це перевірка, що негатив нижче не порожній.
    expect(await within(details).findByText("Сегменти")).toBeInTheDocument()
    expect(screen.getAllByText("Історія")).not.toHaveLength(0)
  })

  it("`detailRows.hide` ховає рядки, `history: false` — журнал", async () => {
    await renderCard(`/contacts/${CONTACT.id}`, {
      contacts: {
        detailRows: { hide: ["position", "segments"] },
        history: false,
      },
    })
    const details = await screen.findByRole("region", { name: "Подробиці" })
    expect(within(details).queryByText("Посада")).not.toBeInTheDocument()
    expect(within(details).getByText("Телефон")).toBeInTheDocument()
    await expect(
      within(details).findByText("Сегменти", {}, { timeout: 300 }),
    ).rejects.toThrow()
    expect(screen.queryAllByText("Історія")).toHaveLength(0)
  })
})

describe("картка організації B1: ті самі точки розширення", () => {
  it("«Реквізити» без IBAN, картка без «Історії»", async () => {
    await renderCard(`/organizations/${ORGANIZATION.id}`, {
      organizations: { detailRows: { hide: ["iban"] }, history: false },
    })
    const requisites = await screen.findByRole("tabpanel", {
      name: "Реквізити",
    })
    expect(within(requisites).queryByText(/^IBAN/)).not.toBeInTheDocument()
    expect(within(requisites).getByText("Телефон")).toBeInTheDocument()
    expect(screen.queryAllByText("Історія")).toHaveLength(0)
  })

  it("без розширення — IBAN і вкладка «Історія»", async () => {
    await renderCard(`/organizations/${ORGANIZATION.id}`)
    const requisites = await screen.findByRole("tabpanel", {
      name: "Реквізити",
    })
    expect(within(requisites).getByText(/^IBAN/)).toBeInTheDocument()
    expect(screen.getAllByText("Історія")).not.toHaveLength(0)
  })
})

describe("список контактів B1: порожні значення", () => {
  it("порожній телефон — «—», як порожній email", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter>
        <CoreAdminContext
          dataProvider={dataProvider}
          queryClient={new QueryClient()}
        >
          <ContactsModuleContext.Provider
            value={{
              extension: {},
              paths: contactsPaths(""),
              preload: () => undefined,
            }}
          >
            {children}
          </ContactsModuleContext.Provider>
        </CoreAdminContext>
      </MemoryRouter>
    )
    const { result } = renderHook(() => useContactColumns(), { wrapper })
    const cell = (id: string) =>
      result.current
        .find((column) => column.id === id)
        ?.cell({ ...CONTACT, phone: "", email: "" })
    render(
      <>
        <p data-testid="phone">{cell("phone")}</p>
        <p data-testid="email">{cell("email")}</p>
      </>,
    )
    expect(screen.getByTestId("phone")).toHaveTextContent(/^—$/)
    expect(screen.getByTestId("email")).toHaveTextContent(/^—$/)
  })
})
