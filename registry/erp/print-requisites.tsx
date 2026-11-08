import type { CompanyProfile } from "@/registry/lib/company"
import { usePrintSheet } from "@/registry/lib/print"
import { formatIban } from "@/registry/lib/ua-ids"
import { cn } from "@/registry/lib/utils"

/**
 * Реквізити компанії на аркуші (PF08, ADR-0062): шапка з логотипом, сторони документа, підписи з
 * печаткою. Дані — профіль компанії (`lib/company`, модуль A1), текст — мовою аркуша
 * (`erp/print-preview`). Порожній реквізит не друкується рядком без значення; реквізити контрагента
 * «як Замовник / Виконавець» дасть `erp/party-details` (UI45).
 */

type Requisites = Pick<
  CompanyProfile,
  | "legalName"
  | "kind"
  | "edrpou"
  | "rnokpp"
  | "vatPayer"
  | "vatIpn"
  | "iban"
  | "bankName"
  | "address"
  | "phone"
  | "email"
  | "website"
>

/** Рядки реквізитів без порожніх значень. */
function useRequisiteLines(company: Requisites): string[] {
  const { t } = usePrintSheet()
  const code =
    company.kind === "legal"
      ? company.edrpou && `${t("print.sheet.edrpou")} ${company.edrpou}`
      : company.rnokpp && `${t("print.sheet.rnokpp")} ${company.rnokpp}`
  const vatIpn =
    company.vatPayer && company.vatIpn
      ? `${t("print.sheet.vatIpn")} ${company.vatIpn}`
      : ""
  const iban = company.iban
    ? `${t("print.sheet.iban")} ${formatIban(company.iban)}`
    : ""
  const phone = company.phone
    ? `${t("print.sheet.phone")} ${company.phone}`
    : ""
  return [
    [code, vatIpn],
    [iban, company.bankName],
    [company.address],
    [phone, company.email, company.website],
    [
      company.vatPayer
        ? t("print.sheet.vatPayer")
        : t("print.sheet.notVatPayer"),
    ],
  ]
    .map((parts) => parts.filter(Boolean).join(", "))
    .filter(Boolean)
}

/** Повна назва й реквізити компанії. */
export function PrintRequisites({
  company,
  className,
}: {
  company: Requisites
  className?: string
}) {
  const lines = useRequisiteLines(company)
  return (
    <div data-slot="print-requisites" className={cn("grid gap-0.5", className)}>
      <p className="font-semibold">{company.legalName}</p>
      {lines.map((line) => (
        <p key={line} className="text-[8.5pt]">
          {line}
        </p>
      ))}
    </div>
  )
}

/** Шапка аркуша: логотип ліворуч, реквізити компанії праворуч; без логотипа — лише реквізити. */
export function PrintCompanyHeader({
  company,
}: {
  company: Requisites & Pick<CompanyProfile, "logoUrl">
}) {
  const { t } = usePrintSheet()
  return (
    <header
      data-slot="print-company-header"
      className="flex items-start justify-between gap-[8mm] border-b border-border pb-[4mm]"
    >
      {company.logoUrl ? (
        <img
          src={company.logoUrl}
          alt={t("print.sheet.logo", { name: company.legalName })}
          className="max-h-[18mm] max-w-[50mm] shrink-0 object-contain"
        />
      ) : null}
      <PrintRequisites company={company} className="ms-auto text-end" />
    </header>
  )
}

export interface PrintParty {
  /** «Постачальник», «Покупець», «Виконавець»… мовою аркуша. */
  label: string
  name: string
  /** Реквізити сторони рядками: «ЄДРПОУ 12345678», адреса. */
  details?: readonly string[]
}

/** Сторони документа: підпис і назва, реквізити — дрібніше під назвою. */
export function PrintParties({ parties }: { parties: readonly PrintParty[] }) {
  return (
    <dl
      data-slot="print-parties"
      className="grid grid-cols-[max-content_1fr] gap-x-[4mm] gap-y-[2mm]"
    >
      {parties.map((party) => (
        <div key={party.label} className="contents">
          <dt className="text-muted-foreground">{party.label}</dt>
          <dd className="grid gap-0.5">
            <span className="font-medium">{party.name}</span>
            {party.details?.filter(Boolean).map((line) => (
              <span key={line} className="text-[8.5pt]">
                {line}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Підписи: посада й ім'я директора, головний бухгалтер, печатка поверх підпису директора. Немає
 * директора — рядок «Підпис»; печатки немає чи `stamp={false}` — без неї.
 */
export function PrintSignatures({
  company,
  stamp = true,
}: {
  company: Pick<
    CompanyProfile,
    "legalName" | "director" | "accountant" | "stampUrl"
  >
  /** Друкувати печатку компанії, якщо вона є. */
  stamp?: boolean
}) {
  const { t } = usePrintSheet()
  const rows: { role: string; name?: string }[] = [
    {
      role: company.director?.position ?? t("print.sheet.signature"),
      name: company.director?.name,
    },
  ]
  if (company.accountant)
    rows.push({ role: t("print.sheet.accountant"), name: company.accountant })
  return (
    <div
      data-slot="print-signatures"
      data-print="avoid-break"
      className="relative mt-[10mm] grid gap-[8mm]"
    >
      {rows.map((row) => (
        <SignatureLine key={row.role} role={row.role} name={row.name} />
      ))}
      {stamp && company.stampUrl ? (
        <img
          src={company.stampUrl}
          alt={t("print.sheet.stamp", { name: company.legalName })}
          className="absolute -top-[10mm] left-[38%] size-[36mm] object-contain"
        />
      ) : null}
    </div>
  )
}

function SignatureLine({ role, name }: { role: string; name?: string }) {
  return (
    <p className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,14rem)] items-end gap-[4mm]">
      <span>{role}</span>
      <span aria-hidden className="border-b border-foreground" />
      <span>{name}</span>
    </p>
  )
}
