import { useState } from "react"
import { useGetOne } from "ra-core"

import {
  DocumentGeneratorButton,
  type DocumentTemplateOption,
} from "@/registry/erp/document-generator"
import { useCompanyProfile } from "@/registry/hooks/use-company-profile"
import { localizedText } from "@/registry/lib/auth"
import { useLanguage } from "@/registry/lib/i18n"
import {
  partyDetailsFrom,
  partyFromCompany,
  type PartyDetails,
} from "@/registry/lib/document-parties"
import {
  templateDetailOf,
  type TemplateDocument,
  type TemplateParty,
} from "@/registry/lib/document-template"
import type { Order, Quote } from "@/registry/modules/B3-sales"
import type { Invoice } from "@/registry/modules/K2-invoices"
import type { RecordSlotProps } from "@/registry/templates/object-page"

import { organizationParty } from "@/data/organizations"

/**
 * Дія «Документ із шаблону» на картках пропозиції, замовлення (B3) і рахунку (K2) — компоненти проекту в
 * слоті `actions` розширення (ADR-0086, ADR-0087): файли модулів не змінювались. Шаблони Word демо
 * збираються кодом і вантажаться лише з генератором (`@/data/docx-templates`); у проекті `load` бере
 * файл .docx зі статичних файлів чи API.
 *
 * Сторони: у рахунку — знімки `supplier` і `buyer` (ADR-0068); у пропозиції й замовленні знімків немає,
 * тож наша сторона — з профілю компанії, клієнт — з картки організації, яку вантажимо, лише коли
 * генератор відкрили.
 */

const templates = () => import("@/data/docx-templates")

const CONTRACT: DocumentTemplateOption = {
  id: "contract",
  label: { uk: "Договір поставки", en: "Supply contract" },
  load: () => templates().then((m) => m.templateFile(m.contractTemplate())),
}
const PAYMENT_LETTER: DocumentTemplateOption = {
  id: "payment-letter",
  label: { uk: "Лист про оплату", en: "Payment request letter" },
  load: () =>
    templates().then((m) => m.templateFile(m.paymentLetterTemplate())),
}
const QUOTE_TEMPLATES = [CONTRACT]
const DUE_TEMPLATES = [CONTRACT, PAYMENT_LETTER]

const SUPPLIER: TemplateParty["label"] = { uk: "Постачальник", en: "Supplier" }
const BUYER: TemplateParty["label"] = { uk: "Покупець", en: "Buyer" }
const DRAFT = { uk: "Чернетка", en: "Draft" }
const PARTIES_LOADING = {
  uk: "Реквізити сторін ще завантажуються",
  en: "Party details are still loading",
}

const contractField = (record: { readonly [key: string]: unknown }) => ({
  key: "contract",
  label: { uk: "Договір", en: "Contract" },
  value: typeof record.contract === "string" ? record.contract : null,
})

const headOf = (
  record: Pick<Quote, "number" | "date" | "currency" | "total">,
): TemplateDocument => ({
  number: record.number,
  date: record.date,
  currency: record.currency,
  total: record.total,
  ...templateDetailOf(record),
})

/** Назва файла: номер документа, у чернетки — «Чернетка» мовою інтерфейсу. */
function useFileName(number: string | null): string {
  const { language } = useLanguage()
  return number ?? localizedText(DRAFT, language) ?? DRAFT.uk
}

/** Наша компанія — з профілю, клієнт — з картки організації після відкриття генератора. */
function useSalesParties(
  clientId: string,
  clientName: string,
): {
  parties: TemplateDocument["parties"]
  /** Поки профіль компанії чи картка клієнта вантажаться, завантаження файла неактивне з причиною. */
  unavailableReason: string | undefined
  onOpenChange: (isOpen: boolean) => void
} {
  const { language } = useLanguage()
  const [isOpen, setOpen] = useState(false)
  const company = useCompanyProfile()
  const client = useGetOne<{ id: string } & Record<string, unknown>>(
    "organizations",
    { id: clientId },
    { enabled: isOpen },
  )
  const ours: PartyDetails | undefined = company.data
    ? partyDetailsFrom(partyFromCompany(company.data))
    : undefined
  const theirs = partyDetailsFrom(
    client.data ? organizationParty(client.data) : { name: clientName },
  )
  const isLoading = company.isPending || (isOpen && client.isPending)
  return {
    parties: {
      ...(ours ? { contractor: { details: ours, label: SUPPLIER } } : {}),
      customer: { details: theirs, label: BUYER },
    },
    unavailableReason: isLoading
      ? localizedText(PARTIES_LOADING, language)
      : undefined,
    onOpenChange: setOpen,
  }
}

export function QuoteFromTemplate({ record }: RecordSlotProps<Quote>) {
  const sales = useSalesParties(record.clientId, record.clientName)
  const fileName = useFileName(record.number)
  return (
    <DocumentGeneratorButton
      document={{
        ...headOf(record),
        parties: sales.parties,
        fields: [
          {
            key: "validUntil",
            label: { uk: "Дійсна до", en: "Valid until" },
            value: { date: record.validUntil },
          },
        ],
      }}
      templates={QUOTE_TEMPLATES}
      fileName={fileName}
      unavailableReason={sales.unavailableReason}
      onOpenChange={sales.onOpenChange}
    />
  )
}

export function OrderFromTemplate({ record }: RecordSlotProps<Order>) {
  const sales = useSalesParties(record.clientId, record.clientName)
  const fileName = useFileName(record.number)
  return (
    <DocumentGeneratorButton
      document={{
        ...headOf(record),
        parties: sales.parties,
        fields: [
          {
            key: "dueDate",
            label: { uk: "Виконати до", en: "Due date" },
            value: { date: record.dueDate },
          },
        ],
      }}
      templates={DUE_TEMPLATES}
      fileName={fileName}
      unavailableReason={sales.unavailableReason}
      onOpenChange={sales.onOpenChange}
    />
  )
}

export function InvoiceFromTemplate({ record }: RecordSlotProps<Invoice>) {
  const fileName = useFileName(record.number)
  return (
    <DocumentGeneratorButton
      document={{
        ...headOf(record),
        parties: {
          contractor: { details: record.supplier, label: SUPPLIER },
          customer: { details: record.buyer, label: BUYER },
        },
        fields: [
          {
            key: "dueDate",
            label: { uk: "Сплатити до", en: "Due date" },
            value: { date: record.dueDate },
          },
          contractField(record),
        ],
      }}
      templates={DUE_TEMPLATES}
      fileName={fileName}
    />
  )
}
