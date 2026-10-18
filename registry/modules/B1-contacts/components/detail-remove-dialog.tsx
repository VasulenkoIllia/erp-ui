import { useState, type RefObject } from "react"

import { ConfirmDialog } from "@/components/erp/confirm-dialog"
import { formatIban } from "@/lib/ua-ids"

import type { Address, BankAccount, OrganizationCard } from "../contract"
import { useContactsT } from "../use-contacts-t"
import { nextPrimary, withoutItem } from "./detail-items"
import type { useDetailUpdate } from "./use-detail-update"

export type Removing =
  | { kind: "address"; item: Address }
  | { kind: "bankAccount"; item: BankAccount }

/**
 * Видалення, поки діалог відкритий і закривається: ціль лишається до кінця анімації, а не
 * перемикається на «Видалити адресу?». `removed` — рядка вже немає, фокус — на «Додати…»; інакше —
 * на кнопку меню рядка, з якого відкрили.
 */
export interface Removal {
  readonly target: Removing
  readonly open: boolean
  readonly removed: boolean
}

/** «Видалити адресу?» / «Видалити рахунок?»: що видаляють і, для основного рахунку, — хто стане основним. */
export function RemoveDialog({
  organization,
  removal,
  onChange,
  opener,
  fallback,
  save,
}: {
  organization: OrganizationCard
  removal: Removal | null
  onChange: (removal: Removal) => void
  /** Кнопка меню рядка, з якого відкрили. */
  opener: RefObject<HTMLElement | null>
  /** «Додати…» вкладки: рядка після видалення немає. */
  fallback: RefObject<HTMLButtonElement | null>
  save: ReturnType<typeof useDetailUpdate>["save"]
}) {
  const t = useContactsT()
  // Опис — на час відкриття: поки йде запит і діалог закривається, картка вже без елемента, і
  // наступний основний рахувався б інакше.
  const [shown, setShown] = useState<{
    target: Removing
    description: string
  } | null>(null)
  if (removal && removal.target !== shown?.target)
    setShown({
      target: removal.target,
      description: removalText(organization, removal.target, t).description,
    })
  const close = (removed: boolean) => {
    if (removal) onChange({ ...removal, open: false, removed })
  }
  const isAccount = removal?.target.kind === "bankAccount"
  return (
    <ConfirmDialog
      open={removal?.open === true}
      title={t(
        isAccount
          ? "organization.bankAccounts.deleteTitle"
          : "organization.addresses.deleteTitle",
      )}
      description={shown?.description ?? ""}
      confirmLabel={t(
        isAccount
          ? "organization.bankAccounts.deleteConfirm"
          : "organization.addresses.deleteConfirm",
      )}
      destructive
      returnFocus={() =>
        !removal?.removed && opener.current?.isConnected
          ? opener.current
          : fallback.current
      }
      onClose={() => {
        close(false)
      }}
      onConfirm={async () => {
        if (!removal) return
        // Зміна — від картки зараз: її версію й колекцію бере запит.
        const { changes, done } = removalText(organization, removal.target, t)
        const result = await save(organization, changes, { saved: done })
        // Помилка — діалог лишається: людина повторює чи скасовує. Конфлікт — опис застарів.
        if (result === "saved") close(true)
        else if (result === "conflict") close(false)
      }}
    />
  )
}

/** Опис, зміна колекції й повідомлення для видалення. */
function removalText(
  organization: OrganizationCard,
  removing: Removing,
  t: ReturnType<typeof useContactsT>,
) {
  if (removing.kind === "address") {
    const { item } = removing
    const line = [item.line, item.postalCode, item.city]
      .filter(Boolean)
      .join(", ")
    return {
      description: `${t(`organization.addresses.kinds.${item.kind}`)}: ${line}`,
      changes: { addresses: withoutItem(organization.addresses, item.id) },
      done: t("organization.addresses.deleted", { line: item.line }),
    }
  }
  const { item } = removing
  const iban = formatIban(item.iban)
  const next = nextPrimary(organization.bankAccounts, item.id)
  const consequence = next
    ? t("organization.bankAccounts.nextPrimary", {
        iban: formatIban(next.iban),
      })
    : item.primary
      ? t("organization.bankAccounts.lastAccount")
      : ""
  return {
    description: [
      `${[iban, item.bankName].filter(Boolean).join(", ")}.`,
      consequence,
    ]
      .filter(Boolean)
      .join(" "),
    changes: {
      bankAccounts: withoutItem(organization.bankAccounts, item.id).map(
        (account) =>
          next && account.id === next.id
            ? { ...account, primary: true }
            : account,
      ),
    },
    done: t("organization.bankAccounts.deleted", { iban }),
  }
}
