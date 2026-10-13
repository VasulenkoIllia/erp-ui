"use client"

import { ChevronsUpDownIcon } from "lucide-react"

import { useErpUiT } from "@/registry/lib/i18n"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/registry/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/registry/ui/sidebar"

/**
 * Перемикач компанії чи робочого простору (PF02) — опція оболонки, ставиться в `header` AppShell.
 * Одна компанія — просто назва без меню. У вузькій панелі лишається квадрат з ініціалами.
 */
export interface Company {
  id: string
  name: string
  /** Другий рядок: ЄДРПОУ, місто, тариф. */
  description?: string
}

function CompanyMark({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground"
    >
      {name
        .replace(/^(ТОВ|ФОП|ПП|ПрАТ|АТ|LLC|Ltd)\s+/i, "")
        .replace(/[«"]/g, "")
        .charAt(0)
        .toLocaleUpperCase()}
    </span>
  )
}

function CompanyText({ company }: { company: Company }) {
  return (
    // У вузькій панелі лишається лише квадрат з ініціалом; назва — для скрінрідера.
    <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:sr-only">
      <span className="truncate font-medium">{company.name}</span>
      {company.description ? (
        <span className="truncate text-xs">{company.description}</span>
      ) : null}
    </span>
  )
}

export function CompanySwitcher({
  companies,
  value,
  onValueChange,
}: {
  companies: Company[]
  value: string
  onValueChange: (id: string) => void
}) {
  const t = useErpUiT()
  const current = companies.find((c) => c.id === value) ?? companies[0]
  if (!current) return null

  if (companies.length === 1) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center gap-2 p-2 text-sm">
            <CompanyMark name={current.name} />
            <CompanyText company={current} />
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label={`${t("company.switch")}: ${current.name}`}
              />
            }
          >
            <CompanyMark name={current.name} />
            <CompanyText company={current} />
            <ChevronsUpDownIcon
              aria-hidden
              className="ml-auto group-data-[collapsible=icon]:hidden"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("company.label")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={current.id}
                onValueChange={(id: string) => {
                  onValueChange(id)
                }}
              >
                {companies.map((company) => (
                  <DropdownMenuRadioItem key={company.id} value={company.id}>
                    <CompanyText company={company} />
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
