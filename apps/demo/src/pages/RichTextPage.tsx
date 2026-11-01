import { zodResolver } from "@hookform/resolvers/zod"
import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { z } from "zod"

import { FormField } from "@/registry/erp/form"
import { RichTextField } from "@/registry/erp/rich-text-field"
import { RichTextView } from "@/registry/erp/rich-text-view"
import { useMentionSearch } from "@/registry/hooks/use-mention-search"
import {
  isRichTextEmpty,
  richTextMentions,
  richTextSchema,
  richTextToPlain,
  type MentionSearch,
  type RichTextDoc,
  type RichTextMention,
} from "@/registry/lib/rich-text"
import { Button } from "@/registry/ui/button"

import { HOSTILE_NOTE, NOTE, PLAIN_NOTE } from "@/data/rich-text"
import { ROUTES } from "@/router"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

const EMPTY = { type: "doc" as const, content: [] }

/** Поле тексту (UI12, ADR-0052): форма, стани, згадки й показ збереженого тексту без редактора. */
export function RichTextPage() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("app.pages.richText")}
        lead={t("richTextPage.lead")}
      />
      <FormSection />
      <StatesSection />
      <ViewSection />
    </div>
  )
}

function FormSection() {
  const { t } = useTranslation()
  const schema = useMemo(
    () =>
      z.object({
        body: richTextSchema.refine(
          (doc) => !isRichTextEmpty(doc),
          t("richTextPage.required"),
        ),
      }),
    [t],
  )
  const form = useForm<
    z.input<typeof schema>,
    unknown,
    z.output<typeof schema>
  >({
    mode: "onTouched",
    resolver: zodResolver(schema),
    defaultValues: { body: EMPTY },
  })
  const [saved, setSaved] = useState<RichTextDoc | null>(null)
  return (
    <Section
      title={t("richTextPage.formTitle")}
      description={t("richTextPage.formDescription")}
    >
      <form
        noValidate
        className="max-w-2xl space-y-3"
        onSubmit={(event) => {
          void form.handleSubmit(({ body }) => {
            setSaved(body)
            form.reset({ body: EMPTY })
          })(event)
        }}
      >
        <FormField
          control={form.control}
          name="body"
          label={t("richTextPage.noteLabel")}
          description={t("richTextPage.noteHint")}
          render={({ field, control, labelId }) => (
            <RichTextField
              {...control}
              aria-labelledby={labelId}
              placeholder={t("richTextPage.placeholder")}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
        <Button type="submit">{t("richTextPage.save")}</Button>
      </form>
      {saved ? <SavedNote doc={saved} /> : null}
    </Section>
  )
}

function SavedNote({ doc }: { doc: RichTextDoc }) {
  const { t } = useTranslation()
  const people = richTextMentions(doc)
  return (
    <div data-testid="rich-text-saved" className="max-w-2xl space-y-2">
      <h3 className="text-sm font-medium">{t("richTextPage.savedTitle")}</h3>
      <RichTextView value={doc} />
      <p className="text-sm text-muted-foreground">
        {t("richTextPage.savedPlain", { text: richTextToPlain(doc) })}
      </p>
      <p className="text-sm text-muted-foreground">
        {t("richTextPage.savedPeople", {
          names: people.length
            ? people.map((person) => person.label).join(", ")
            : t("richTextPage.savedNobody"),
        })}
      </p>
    </div>
  )
}

/** Перший пошук падає, другий іде до довідника: видно помилку й повтор. */
function useFlakySearch(): MentionSearch {
  const search = useMentionSearch()
  const hasFailed = useRef(false)
  return useCallback(
    (query, signal) => {
      if (hasFailed.current) return search(query, signal)
      hasFailed.current = true
      return Promise.reject(new Error("demo"))
    },
    [search],
  )
}

function Example({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: (ids: { labelId: string; hintId?: string }) => ReactNode
}) {
  const labelId = useId()
  const hintId = useId()
  return (
    <div className="min-w-0 space-y-2">
      <p id={labelId} className="text-sm font-medium">
        {label}
      </p>
      {children({ labelId, hintId: hint ? hintId : undefined })}
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function StatesSection() {
  const { t } = useTranslation()
  const flakySearch = useFlakySearch()
  return (
    <Section
      title={t("richTextPage.statesTitle")}
      description={t("richTextPage.statesDescription")}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Example label={t("richTextPage.readOnly")}>
          {({ labelId }) => (
            <RichTextField readOnly aria-labelledby={labelId} value={NOTE} />
          )}
        </Example>
        <Example
          label={t("richTextPage.locked")}
          hint={t("richTextPage.lockedHint")}
        >
          {({ labelId, hintId }) => (
            <RichTextField
              readOnly
              aria-labelledby={labelId}
              aria-describedby={hintId}
              value={PLAIN_NOTE}
            />
          )}
        </Example>
        <Example label={t("richTextPage.disabled")}>
          {({ labelId }) => (
            <RichTextField disabled aria-labelledby={labelId} value={NOTE} />
          )}
        </Example>
        <Example
          label={t("richTextPage.invalid")}
          hint={t("richTextPage.required")}
        >
          {({ labelId, hintId }) => (
            <RichTextField
              aria-invalid
              aria-labelledby={labelId}
              aria-describedby={hintId}
              value={null}
            />
          )}
        </Example>
        <Example label={t("richTextPage.noMentions")}>
          {({ labelId }) => (
            <RichTextField
              mentions={false}
              aria-labelledby={labelId}
              value={null}
            />
          )}
        </Example>
        <Example
          label={t("richTextPage.flaky")}
          hint={t("richTextPage.flakyHint")}
        >
          {({ labelId, hintId }) => (
            <RichTextField
              mentions={flakySearch}
              aria-labelledby={labelId}
              aria-describedby={hintId}
              value={null}
            />
          )}
        </Example>
      </div>
      <Example label={t("richTextPage.narrow")}>
        {({ labelId }) => (
          <div className="max-w-72">
            <RichTextField aria-labelledby={labelId} value={NOTE} />
          </div>
        )}
      </Example>
    </Section>
  )
}

function MentionLink(mention: RichTextMention) {
  return (
    <Link
      to={`${ROUTES.users}/${encodeURIComponent(mention.id)}`}
      data-testid="rich-text-person-link"
    >
      @{mention.label}
    </Link>
  )
}

function ViewSection() {
  const { t } = useTranslation()
  return (
    <Section
      title={t("richTextPage.viewTitle")}
      description={t("richTextPage.viewDescription")}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Example label={t("richTextPage.viewNote")}>
          {() => (
            <div data-testid="rich-text-note">
              <RichTextView value={NOTE} />
            </div>
          )}
        </Example>
        <Example label={t("richTextPage.viewLinked")}>
          {() => <RichTextView value={NOTE} renderMention={MentionLink} />}
        </Example>
        <Example
          label={t("richTextPage.viewHostile")}
          hint={t("richTextPage.viewHostileHint")}
        >
          {() => (
            <div data-testid="rich-text-hostile">
              <RichTextView value={HOSTILE_NOTE} />
            </div>
          )}
        </Example>
        <Example label={t("richTextPage.viewPlain")}>
          {() => (
            <div data-testid="rich-text-plain">
              <RichTextView value={PLAIN_NOTE} />
            </div>
          )}
        </Example>
        <Example label={t("richTextPage.viewEmpty")}>
          {() => (
            <div data-testid="rich-text-empty">
              <RichTextView value={null} />
            </div>
          )}
        </Example>
      </div>
    </Section>
  )
}
