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

import { CONTACTS, ORGANIZATIONS } from "../contract"
import { useContactsT } from "../use-contacts-t"
import type { ContactFormDialogProps } from "./contact-form"
import type { OrganizationFormDialogProps } from "./organization-form"

// Форми тягнуть react-hook-form, резолвер zod і поля вводу: окремими чанками, а не в сторінці
// списку чи картки (ADR-0009, ADR-0026).
const OrganizationForm = lazyWithPreload(() =>
  import("./organization-form").then((m) => m.OrganizationFormDialog),
)
const ContactForm = lazyWithPreload(() =>
  import("./contact-form").then((m) => m.ContactFormDialog),
)

const FORMS = {
  organization: { component: OrganizationForm, resource: ORGANIZATIONS },
  contact: { component: ContactForm, resource: CONTACTS },
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
