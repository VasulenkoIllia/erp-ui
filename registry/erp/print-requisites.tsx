import type { CompanyProfile } from "@/registry/lib/company"
import type { ErpUiTranslate } from "@/registry/lib/i18n"
import {
  isPartyFieldShown,
  signatureName,
  type PartyDetails,
} from "@/registry/lib/document-parties"
import { usePrintSheet } from "@/registry/lib/print"
import { formatIban } from "@/registry/lib/ua-ids"
import { cn } from "@/registry/lib/utils"

/**
 * Реквізити компанії на аркуші (PF08, ADR-0062): шапка з логотипом, сторони документа, підписи з
 * печаткою. Дані — профіль компанії (`lib/company`, модуль A1), текст — мовою аркуша
 * (`erp/print-preview`). Порожній реквізит не друкується рядком без значення. Сторони «як Замовник /
 * Виконавець» з `lib/document-parties` (UI45, ADR-0068): `partyRequisiteLines`, `partyClause`,
 * `PrintPartyDetails`; підпис — «Олена КОВАЛЬ» з ПІБ.
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
 * Підписи: посада й ім'я директора, головний бухгалтер («Олена КОВАЛЬ» з ПІБ, SPEC §11), печатка поверх
 * підпису директора. Немає директора — рядок «Підпис»; печатки немає чи `stamp={false}` — без неї.
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
      name: company.director && signatureName(company.director.name),
    },
  ]
  if (company.accountant)
    rows.push({
      role: t("print.sheet.accountant"),
      name: signatureName(company.accountant),
    })
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

/** «ЄДРПОУ 32855961»; порожнє значення — порожній рядок, і його не друкуємо. */
const labelled = (label: string, value: string) =>
  value.trim() ? `${label} ${value.trim()}` : ""

/**
 * Рядки реквізитів сторони мовою аркуша без порожніх значень: код за видом, ІПН, IBAN групами й банк,
 * адреса, телефон і пошта. Для `PrintParties` (`details`) і `PrintPartyDetails`.
 */
export function partyRequisiteLines(
  party: PartyDetails,
  t: ErpUiTranslate,
): string[] {
  const code = labelled(
    t(party.kind === "legal" ? "print.sheet.edrpou" : "print.sheet.rnokpp"),
    party.code,
  )
  const iban = party.iban.trim()
    ? `${t("print.sheet.iban")} ${formatIban(party.iban.trim())}`
    : ""
  return [
    [code, labelled(t("print.sheet.vatIpn"), party.vatIpn)],
    [iban, party.bankName],
    [party.address],
    [labelled(t("print.sheet.phone"), party.phone), party.email],
  ]
    .map((parts) =>
      parts
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", "),
    )
    .filter(Boolean)
}

/**
 * Сторона в тексті документа мовою аркуша: «ТОВ «Зоряна логістика», в особі директора Коваль Олени
 * Вікторівни, що діє на підставі Статуту (надалі «Виконавець»)». ФОП — без «в особі»; порожнє
 * пропускається.
 */
export function partyClause(
  party: PartyDetails,
  role: string,
  t: ErpUiTranslate,
): string {
  const representedBy = isPartyFieldShown("representedBy", party.kind)
    ? party.representedBy.trim()
    : ""
  const parts = [
    party.name.trim(),
    representedBy &&
      t("print.sheet.party.representedBy", { value: representedBy }),
    party.basis.trim() &&
      t("print.sheet.party.basis", { value: party.basis.trim() }),
  ].filter(Boolean)
  return [parts.join(", "), t("print.sheet.party.as", { role })]
    .filter(Boolean)
    .join(" ")
}

export interface PrintPartyEntry {
  /** Роль мовою аркуша: «Замовник», «Виконавець», «Постачальник». */
  label: string
  party: PartyDetails
}

/**
 * Реквізити й підписи сторін наприкінці договору чи акта: колонка на сторону з роллю, назвою,
 * реквізитами без порожніх рядків і підписом «Олена КОВАЛЬ» під лінією (посада — лише юрособи).
 */
export function PrintPartyDetails({
  parties,
}: {
  parties: readonly PrintPartyEntry[]
}) {
  const { t } = usePrintSheet()
  return (
    <section
      data-slot="print-party-details"
      data-print="avoid-break"
      className="grid gap-[3mm]"
    >
      <h3 className="text-center font-semibold">
        {t("print.sheet.party.title")}
      </h3>
      <div className="grid grid-cols-2 gap-x-[8mm] gap-y-[6mm]">
        {parties.map(({ label, party }, index) => (
          // Роль може повторюватись («Свідок»), рядки реквізитів — збігтися: списки сталі, ключ — місце.
          <div key={index} className="grid content-start gap-0.5">
            <p className="font-semibold">{label}</p>
            {party.name.trim() ? (
              <p className="font-medium">{party.name}</p>
            ) : null}
            {partyRequisiteLines(party, t).map((line, row) => (
              <p key={row} className="text-[8.5pt]">
                {line}
              </p>
            ))}
            <PartySignature party={party} />
          </div>
        ))}
      </div>
    </section>
  )
}

function PartySignature({ party }: { party: PartyDetails }) {
  const position = isPartyFieldShown("signerPosition", party.kind)
    ? party.signerPosition.trim()
    : ""
  return (
    <div className="mt-[6mm] grid gap-[2mm]">
      {position ? <p>{position}</p> : null}
      <p className="grid grid-cols-[minmax(0,1fr)_max-content] items-end gap-[3mm]">
        <span aria-hidden className="h-[6mm] border-b border-foreground" />
        <span>{signatureName(party.signerName)}</span>
      </p>
    </div>
  )
}
