import { useCanAccess } from "ra-core"
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react"

import { formatIban } from "@/lib/ua-ids"

import {
  ORGANIZATIONS,
  type Address,
  type BankAccount,
  type Organization,
  type OrganizationCard,
} from "../contract"
import { useContactsT } from "../use-contacts-t"
import { AccessAction } from "./access-action"
import { withPrimary } from "./detail-items"
import {
  RemoveDialog,
  type Removal,
  type Removing,
} from "./detail-remove-dialog"
import type { DetailRowAction } from "./detail-row-actions"
import {
  AddressFormDialog,
  BankAccountFormDialog,
  usePreloadForm,
} from "./form-dialogs"
import type { DetailState } from "./organization-sections"
import { useDetailUpdate } from "./use-detail-update"

/**
 * Редагування адрес і рахунків у картці організації (ADR-0028): «Додати…» в заголовку вкладки,
 * меню дій у рядку, форми в діалозі (лінивими чанками), підтвердження видалення. Усе — з правом
 * `organizations:update`: без нього «Додати…» неактивна з причиною, а таблиці — лише для читання.
 * Поки адрес і рахунків немає (вантажаться чи не завантажились), дій немає: зміна потребує колекції.
 * Поки зберігається дія без форми («Зробити основним», «Видалити»), інші дії неактивні.
 */

type Editing =
  | { kind: "address"; item?: Address }
  | { kind: "bankAccount"; item?: BankAccount }

interface DetailEditing {
  /** «Додати адресу» для заголовка вкладки; поки колекції немає — `null`. */
  readonly addAddress: ReactNode
  readonly addBankAccount: ReactNode
  /** Дії рядка; без права чи колекції — `undefined` (таблиця лише для читання). */
  readonly addressActions?: (address: Address) => DetailRowAction[]
  readonly bankAccountActions?: (account: BankAccount) => DetailRowAction[]
  /** Діалоги форм і підтвердження. */
  readonly dialogs: ReactNode
}

export function useDetailEditing(
  organization: Organization | undefined,
  state: DetailState,
): DetailEditing {
  const t = useContactsT()
  const { canAccess = false } = useCanAccess({
    resource: ORGANIZATIONS,
    action: "update",
  })
  const card = useMemo<OrganizationCard | undefined>(
    () =>
      organization && state.detail
        ? { ...organization, ...state.detail }
        : undefined,
    [organization, state.detail],
  )
  const [editing, setEditing] = useState<Editing | null>(null)
  const [removal, setRemoval] = useState<Removal | null>(null)
  // Куди повернути фокус після діалогу: «Додати…» чи кнопка меню рядка.
  const openerRef = useRef<HTMLElement | null>(null)
  const addAddressRef = useRef<HTMLButtonElement>(null)
  const addAccountRef = useRef<HTMLButtonElement>(null)
  const { save, isSaving } = useDetailUpdate()
  usePreloadForm("address", "update")
  usePreloadForm("bankAccount", "update")

  const open = (next: Editing, opener: HTMLElement | null) => {
    openerRef.current = opener
    setEditing(next)
  }
  const rowActions = useRowActions(card, canAccess, isSaving, {
    edit: open,
    remove: (target, opener) => {
      openerRef.current = opener
      setRemoval({ target, open: true, removed: false })
    },
    makePrimary: (account) => {
      if (!card) return
      const iban = formatIban(account.iban)
      // Помилку показує сам запит; фокус лишається на меню рядка.
      void save(
        card,
        { bankAccounts: withPrimary(card.bankAccounts, account.id) },
        {
          saved: t("organization.bankAccounts.primarySaved", { iban }),
          pending: t("organization.bankAccounts.primarySaving", { iban }),
        },
      )
    },
  })
  const close = () => {
    setEditing(null)
  }
  return {
    addAddress: card ? (
      <AddDetailAction
        kind="address"
        buttonRef={addAddressRef}
        busy={isSaving}
        onOpen={open}
      />
    ) : null,
    addBankAccount: card ? (
      <AddDetailAction
        kind="bankAccount"
        buttonRef={addAccountRef}
        busy={isSaving}
        onOpen={open}
      />
    ) : null,
    ...rowActions,
    dialogs: card ? (
      <>
        {editing?.kind === "address" ? (
          <AddressFormDialog
            organization={card}
            address={editing.item}
            finalFocus={openerRef}
            onClose={close}
            onSaved={close}
          />
        ) : null}
        {editing?.kind === "bankAccount" ? (
          <BankAccountFormDialog
            organization={card}
            account={editing.item}
            finalFocus={openerRef}
            onClose={close}
            onSaved={close}
          />
        ) : null}
        <RemoveDialog
          organization={card}
          removal={removal}
          onChange={setRemoval}
          opener={openerRef}
          fallback={
            removal?.target.kind === "address" ? addAddressRef : addAccountRef
          }
          save={save}
        />
      </>
    ) : null,
  }
}

/** «Додати адресу» / «Додати рахунок»: без права — неактивна з причиною. */
function AddDetailAction({
  kind,
  buttonRef,
  busy,
  onOpen,
}: {
  kind: Editing["kind"]
  buttonRef: Ref<HTMLButtonElement>
  busy: boolean
  onOpen: (next: Editing, opener: HTMLElement | null) => void
}) {
  const t = useContactsT()
  return (
    <AccessAction
      ref={buttonRef}
      resource={ORGANIZATIONS}
      action="update"
      icon="create"
      label={t(
        kind === "address"
          ? "organization.addresses.add"
          : "organization.bankAccounts.add",
      )}
      deniedReason={t("organization.editDenied")}
      busy={busy}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        onOpen({ kind }, event.currentTarget)
      }}
    />
  )
}

/** Дії рядків: стабільні, поки не змінились право й стан запиту — інакше таблиця перебудовує колонки. */
function useRowActions(
  card: OrganizationCard | undefined,
  canEdit: boolean,
  isSaving: boolean,
  handlers: {
    edit: (next: Editing, opener: HTMLElement | null) => void
    remove: (target: Removing, opener: HTMLElement | null) => void
    makePrimary: (account: BankAccount) => void
  },
) {
  const t = useContactsT()
  // Останні обробники без перебудови дій: вони нові на кожен рендер картки.
  const handlersRef = useRef(handlers)
  useLayoutEffect(() => {
    handlersRef.current = handlers
  })
  const edit = useCallback(
    (target: Editing): DetailRowAction => ({
      id: "edit",
      label: t("organization.detail.edit"),
      disabled: isSaving,
      onSelect: (trigger) => {
        handlersRef.current.edit(target, trigger)
      },
    }),
    [t, isSaving],
  )
  const remove = useCallback(
    (target: Removing): DetailRowAction => ({
      id: "delete",
      label: t("organization.detail.delete"),
      destructive: true,
      disabled: isSaving,
      onSelect: (trigger) => {
        handlersRef.current.remove(target, trigger)
      },
    }),
    [t, isSaving],
  )
  const addressActions = useCallback(
    (address: Address) => [
      edit({ kind: "address", item: address }),
      remove({ kind: "address", item: address }),
    ],
    [edit, remove],
  )
  const bankAccountActions = useCallback(
    (account: BankAccount) => [
      edit({ kind: "bankAccount", item: account }),
      ...(account.primary
        ? []
        : [
            {
              id: "makePrimary",
              label: t("organization.bankAccounts.makePrimary"),
              disabled: isSaving,
              onSelect: () => {
                handlersRef.current.makePrimary(account)
              },
            },
          ]),
      remove({ kind: "bankAccount", item: account }),
    ],
    [t, isSaving, edit, remove],
  )
  return canEdit && card ? { addressActions, bankAccountActions } : {}
}
