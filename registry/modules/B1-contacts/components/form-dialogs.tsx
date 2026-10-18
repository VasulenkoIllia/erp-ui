import { useCanAccess } from "ra-core"
import {
  Suspense,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react"

import { ErrorBoundary } from "@/components/erp/error-boundary"
import { LoadingFallback } from "@/components/erp/page-state"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { lazyWithPreload, whenIdle } from "@/lib/lazy"

import { CONTACTS, ORGANIZATIONS, SEGMENTS } from "../contract"
import { useContactsT } from "../use-contacts-t"
import type { AddressFormDialogProps } from "./address-form"
import type { BankAccountFormDialogProps } from "./bank-account-form"
import type { ContactFormDialogProps } from "./contact-form"
import type { OrganizationFormDialogProps } from "./organization-form"
import type { SegmentFormDialogProps } from "./segment-form"

// Форми тягнуть react-hook-form, резолвер zod і поля вводу: окремими чанками, а не в сторінці
// списку чи картки (ADR-0009, ADR-0026).
const OrganizationForm = lazyWithPreload(() =>
  import("./organization-form").then((m) => m.OrganizationFormDialog),
)
const ContactForm = lazyWithPreload(() =>
  import("./contact-form").then((m) => m.ContactFormDialog),
)
const SegmentForm = lazyWithPreload(() =>
  import("./segment-form").then((m) => m.SegmentFormDialog),
)
const AddressForm = lazyWithPreload(() =>
  import("./address-form").then((m) => m.AddressFormDialog),
)
const BankAccountForm = lazyWithPreload(() =>
  import("./bank-account-form").then((m) => m.BankAccountFormDialog),
)

const FORMS = {
  organization: { component: OrganizationForm, resource: ORGANIZATIONS },
  contact: { component: ContactForm, resource: CONTACTS },
  segment: { component: SegmentForm, resource: SEGMENTS },
  // Адреси й рахунки — частина організації: право `organizations:update` (ADR-0028).
  address: { component: AddressForm, resource: ORGANIZATIONS },
  bankAccount: { component: BankAccountForm, resource: ORGANIZATIONS },
} as const

/**
 * Форма вантажиться, коли браузер вільний: перше відкриття не чекає на мережу. Без права на дію
 * форму не відкрити, тож і чанк не потрібен.
 */
export function usePreloadForm(
  form: keyof typeof FORMS,
  action: "create" | "update",
) {
  const { component, resource } = FORMS[form]
  const { canAccess } = useCanAccess({ resource, action })
  useEffect(
    () =>
      canAccess
        ? whenIdle(() => {
            void component.preload()
          })
        : undefined,
    [component, canAccess],
  )
}

/** Діалог змонтований, лише поки відкритий: `{editing ? <OrganizationFormDialog … /> : null}`. */
export function OrganizationFormDialog(props: OrganizationFormDialogProps) {
  const t = useContactsT()
  return (
    <FormChunkBoundary
      title={t(
        props.organization
          ? "organization.form.editTitle"
          : "organization.form.createTitle",
      )}
      onClose={props.onClose}
      finalFocus={props.finalFocus}
    >
      <OrganizationForm {...props} />
    </FormChunkBoundary>
  )
}

/** Діалог змонтований, лише поки відкритий: `{editing ? <ContactFormDialog … /> : null}`. */
export function ContactFormDialog(props: ContactFormDialogProps) {
  const t = useContactsT()
  return (
    <FormChunkBoundary
      title={t(
        props.contact ? "contact.form.editTitle" : "contact.form.createTitle",
      )}
      onClose={props.onClose}
      finalFocus={props.finalFocus}
    >
      <ContactForm {...props} />
    </FormChunkBoundary>
  )
}

/** Діалог змонтований, лише поки відкритий: `{editing ? <SegmentFormDialog … /> : null}`. */
export function SegmentFormDialog(props: SegmentFormDialogProps) {
  const t = useContactsT()
  return (
    <FormChunkBoundary
      title={t(
        props.segment ? "segments.form.editTitle" : "segments.form.createTitle",
      )}
      onClose={props.onClose}
      finalFocus={props.finalFocus}
    >
      <SegmentForm {...props} />
    </FormChunkBoundary>
  )
}

/** Діалог змонтований, лише поки відкритий: `{editing ? <AddressFormDialog … /> : null}`. */
export function AddressFormDialog(props: AddressFormDialogProps) {
  const t = useContactsT()
  return (
    <FormChunkBoundary
      title={t(
        props.address
          ? "organization.addresses.form.editTitle"
          : "organization.addresses.form.createTitle",
      )}
      onClose={props.onClose}
      finalFocus={props.finalFocus}
    >
      <AddressForm {...props} />
    </FormChunkBoundary>
  )
}

/** Діалог змонтований, лише поки відкритий: `{editing ? <BankAccountFormDialog … /> : null}`. */
export function BankAccountFormDialog(props: BankAccountFormDialogProps) {
  const t = useContactsT()
  return (
    <FormChunkBoundary
      title={t(
        props.account
          ? "organization.bankAccounts.form.editTitle"
          : "organization.bankAccounts.form.createTitle",
      )}
      onClose={props.onClose}
      finalFocus={props.finalFocus}
    >
      <BankAccountForm {...props} />
    </FormChunkBoundary>
  )
}

/**
 * Поки чанк форми вантажиться чи не завантажився — діалог із назвою форми: спінер або стан помилки
 * межі («Спробувати ще», після другої невдачі — «Оновити сторінку»). Esc і «Закрити» його
 * закривають. Коли форму замінює справжній діалог, фокус не повертається на кнопку під ним:
 * інакше він на мить стрибав би з діалогу.
 */
function FormChunkBoundary({
  title,
  onClose,
  finalFocus,
  children,
}: {
  title: string
  onClose: () => void
  finalFocus: RefObject<HTMLElement | null> | undefined
  children: ReactNode
}) {
  const isClosingRef = useRef(false)
  const shell = (body: ReactNode) => (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open) return
        isClosingRef.current = true
        onClose()
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        finalFocus={() =>
          isClosingRef.current ? (finalFocus?.current ?? true) : false
        }
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  )
  return (
    <ErrorBoundary frame={shell} className="min-h-0 border-0">
      <Suspense fallback={shell(<LoadingFallback className="h-24" />)}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}
