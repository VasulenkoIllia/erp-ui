import {
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Download,
  Lock,
  Plus,
  Settings,
  SlidersHorizontal,
  Trash2,
  type LucideIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"

import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import { Checkbox } from "@/registry/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/registry/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/registry/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/registry/ui/sheet"
import { Spinner } from "@/registry/ui/spinner"
import { Separator } from "@/registry/ui/separator"
import { Skeleton } from "@/registry/ui/skeleton"
import { Switch } from "@/registry/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/registry/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/registry/ui/tabs"
import { Textarea } from "@/registry/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/registry/ui/tooltip"

import { CURRENCIES, INVOICES, SAMPLE, type StatusKind } from "@/fixtures"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

const usePageT = () => useTranslation("demo", { keyPrefix: "primitivesPage" }).t

const STATUS_ICONS: Record<StatusKind, LucideIcon> = {
  success: CircleCheck,
  warning: CircleAlert,
  destructive: CircleX,
  info: Clock,
}

/** Статус: soft-тло + іконка + підпис (SPEC §6.3). Повний StatusBadge з'явиться в PF03. */
function StatusBadge({ kind }: { kind: StatusKind }) {
  const Icon = STATUS_ICONS[kind]
  const { t } = useTranslation()
  return (
    <Badge variant={kind}>
      <Icon aria-hidden />
      {t(`statuses.${kind}`)}
    </Badge>
  )
}

function ButtonsSection() {
  const t = usePageT()
  return (
    <Section title={t("buttons")}>
      <div className="flex flex-wrap gap-2">
        <Button>{t("variants.default")}</Button>
        <Button variant="secondary">{t("variants.secondary")}</Button>
        <Button variant="outline">{t("variants.outline")}</Button>
        <Button variant="ghost">{t("variants.ghost")}</Button>
        <Button variant="destructive">
          <Trash2 aria-hidden />
          {t("variants.destructive")}
        </Button>
        <Button variant="link">{t("variants.link")}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button>
          <Plus aria-hidden />
          {t("create")}
        </Button>
        <Button disabled>
          <Spinner label={t("saving")} />
          {t("saving")}
        </Button>
        <Button variant="outline" size="icon" aria-label={t("settings")}>
          <Settings aria-hidden />
        </Button>
        <Button size="sm" variant="outline">
          {t("small")}
        </Button>
        <Button size="lg" variant="outline">
          {t("large")}
        </Button>
        {/* SPEC §8.4: дія без прав — неактивна, але у фокусі й з причиною в підказці. */}
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="outline" disabled focusableWhenDisabled />}
          >
            {t("unavailable")}
          </TooltipTrigger>
          <TooltipContent>{t("unavailableHint")}</TooltipContent>
        </Tooltip>
      </div>
    </Section>
  )
}

function StatusesSection() {
  const t = usePageT()
  return (
    <Section title={t("statuses")}>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STATUS_ICONS) as StatusKind[]).map((kind) => (
          <StatusBadge key={kind} kind={kind} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge>{t("badges.new")}</Badge>
        <Badge variant="secondary">{t("badges.draft")}</Badge>
        <Badge variant="outline">{t("badges.archived")}</Badge>
      </div>
      <Tabs defaultValue="all">
        <TabsList aria-label={t("tabsLabel")}>
          <TabsTrigger value="all">{t("tabs.all")}</TabsTrigger>
          <TabsTrigger value="draft">{t("tabs.draft")}</TabsTrigger>
          <TabsTrigger value="sent">{t("tabs.sent")}</TabsTrigger>
          <TabsTrigger value="paid">{t("tabs.paid")}</TabsTrigger>
        </TabsList>
      </Tabs>
    </Section>
  )
}

function FieldsSection() {
  const t = usePageT()
  const kitT = useErpUiT()
  const format = useFormat()
  return (
    <Section title={t("fields")}>
      <div className="grid gap-4 @2xl:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="f-normal">{t("field.normal.label")}</FieldLabel>
          <Input
            id="f-normal"
            defaultValue={SAMPLE.company}
            aria-describedby="f-normal-hint"
          />
          <FieldDescription id="f-normal-hint">
            {t("field.normal.hint")}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="f-focus">{t("field.focus.label")}</FieldLabel>
          <Input
            id="f-focus"
            defaultValue={SAMPLE.person}
            aria-describedby="f-focus-hint"
            data-testid="field-focus"
          />
          <FieldDescription id="f-focus-hint">
            {t("field.focus.hint")}
          </FieldDescription>
        </Field>
        <Field data-invalid>
          <FieldLabel htmlFor="f-error">{t("field.error.label")}</FieldLabel>
          <Input
            id="f-error"
            defaultValue={SAMPLE.edrpouShort}
            aria-invalid
            aria-describedby="f-error-msg"
          />
          <FieldError id="f-error-msg">
            {kitT("validation.edrpou.length")}
          </FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="f-async">{t("field.async.label")}</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="f-async"
              defaultValue={SAMPLE.edrpou}
              aria-describedby="f-async-msg"
              aria-busy
            />
            <InputGroupAddon align="inline-end">
              <Spinner label={t("field.async.hint")} />
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription id="f-async-msg">
            {t("field.async.hint")}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="f-dirty">
            {t("field.dirty.label")}
            <span className="font-normal text-info-foreground">
              • {t("field.dirty.mark")}
            </span>
          </FieldLabel>
          <Input
            id="f-dirty"
            defaultValue={SAMPLE.iban}
            aria-describedby="f-dirty-hint"
          />
          <FieldDescription id="f-dirty-hint">
            {t("field.dirty.hint")}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="f-saved">{t("field.saved.label")}</FieldLabel>
          <Input
            id="f-saved"
            defaultValue={SAMPLE.note}
            aria-describedby="f-saved-hint"
          />
          <FieldDescription
            id="f-saved-hint"
            className="flex items-center gap-1"
          >
            <Check aria-hidden className="size-3.5 text-success-foreground" />
            {t("field.saved.hint", {
              time: format.date(SAMPLE.savedAt, "time", {
                timeZone: "Europe/Kyiv",
              }),
            })}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="f-readonly">
            {t("field.readOnly.label")}
          </FieldLabel>
          <Input
            id="f-readonly"
            defaultValue={format.percent(SAMPLE.vatRate)}
            readOnly
            aria-describedby="f-readonly-hint"
          />
          <FieldDescription id="f-readonly-hint">
            {t("field.readOnly.hint")}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="f-locked">{t("field.locked.label")}</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="f-locked"
              defaultValue={format.number(120_000, {
                minimumFractionDigits: 2,
              })}
              readOnly
              aria-describedby="f-locked-hint"
            />
            <InputGroupAddon align="inline-end">
              <Lock aria-hidden />
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription id="f-locked-hint">
            {t("field.locked.hint", { name: SAMPLE.person })}
          </FieldDescription>
        </Field>
        <Field data-disabled>
          <FieldLabel htmlFor="f-disabled">
            {t("field.disabled.label")}
          </FieldLabel>
          <Input
            id="f-disabled"
            defaultValue={t("field.disabled.value")}
            disabled
            aria-describedby="f-disabled-hint"
          />
          <FieldDescription id="f-disabled-hint">
            {t("field.disabled.hint")}
          </FieldDescription>
        </Field>
      </div>
    </Section>
  )
}

function ChoiceSection() {
  const t = usePageT()
  const { locale } = useFormat()
  const names = new Intl.DisplayNames([locale], { type: "currency" })
  const currencyItems = CURRENCIES.map((code) => {
    const name = names.of(code) ?? code
    return {
      value: code,
      label: `${name.charAt(0).toLocaleUpperCase(locale)}${name.slice(1)} · ${code}`,
    }
  })
  return (
    <Section title={t("choice")}>
      <Field>
        <FieldLabel htmlFor="f-currency">{t("currency")}</FieldLabel>
        <Select items={currencyItems} defaultValue="UAH">
          <SelectTrigger id="f-currency" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {currencyItems.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field orientation="horizontal">
        <Checkbox id="f-vat" defaultChecked />
        <FieldLabel htmlFor="f-vat">{t("vatPayer")}</FieldLabel>
      </Field>
      <Field orientation="horizontal">
        <Switch id="f-remind" defaultChecked />
        <FieldLabel htmlFor="f-remind">{t("remind")}</FieldLabel>
      </Field>
      <Separator />
      <Field>
        <FieldLabel htmlFor="f-note">{t("note")}</FieldLabel>
        <Textarea id="f-note" placeholder={t("notePlaceholder")} />
      </Field>
      {/* SPEC §8.2: скелетон — лише в контейнерах, у формі майбутнього контенту. */}
      <div className="space-y-2" aria-hidden>
        <Skeleton className="h-row w-full" />
        <Skeleton className="h-row w-2/3" />
      </div>
    </Section>
  )
}

function OverlaysSection() {
  const t = usePageT()
  return (
    <Section title={t("overlays")}>
      <div className="flex flex-wrap items-center gap-2">
        <Dialog>
          <DialogTrigger render={<Button variant="destructive" />}>
            <Trash2 aria-hidden />
            {t("dialog.open")}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t("dialog.title", { number: SAMPLE.invoiceNumber })}
              </DialogTitle>
              <DialogDescription>{t("dialog.description")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                {t("dialog.cancel")}
              </DialogClose>
              <DialogClose render={<Button variant="destructive" />}>
                {t("dialog.confirm")}
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Sheet>
          <SheetTrigger render={<Button variant="outline" />}>
            <SlidersHorizontal aria-hidden />
            {t("sheet.open")}
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{t("sheet.title")}</SheetTitle>
              <SheetDescription>{t("sheet.description")}</SheetDescription>
            </SheetHeader>
            <div className="px-4">
              <Field>
                <FieldLabel htmlFor="f-sheet-client">
                  {t("sheet.client")}
                </FieldLabel>
                <Input id="f-sheet-client" />
              </Field>
            </div>
            <SheetFooter>
              <Button>{t("sheet.apply")}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label={t("exportLabel")}
              />
            }
          >
            <Download aria-hidden />
          </TooltipTrigger>
          <TooltipContent>{t("tooltip")}</TooltipContent>
        </Tooltip>

        <Button
          variant="secondary"
          onClick={() => {
            toast.success(t("toast.saved"))
          }}
        >
          {t("toast.open")}
        </Button>
        {/* SPEC §8.2: тост із дією «Скасувати» не зникає сам. */}
        <Button
          variant="secondary"
          onClick={() => {
            toast(t("toast.archived"), {
              duration: Infinity,
              action: {
                label: t("toast.undo"),
                onClick: () => undefined,
              },
            })
          }}
        >
          {t("toast.undoOpen")}
        </Button>
      </div>
    </Section>
  )
}

function TableSection() {
  const t = usePageT()
  const { t: tp } = useTranslation("demo", { keyPrefix: "preview" })
  const format = useFormat()
  return (
    <Section title={t("table")}>
      <Table label={tp("tableCaption")}>
        <TableHeader>
          <TableRow>
            <TableHead>{tp("columns.number")}</TableHead>
            <TableHead>{tp("columns.client")}</TableHead>
            <TableHead className="text-right">{tp("columns.amount")}</TableHead>
            <TableHead>{tp("columns.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {INVOICES.map((row) => (
            <TableRow key={row.number}>
              <TableCell className="tabular-nums">{row.number}</TableCell>
              <TableCell>{row.client}</TableCell>
              <TableCell className="text-right tabular-nums">
                {format.money(row.amount)}
              </TableCell>
              <TableCell>
                <StatusBadge kind={row.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  )
}

export function PrimitivesPage() {
  const t = usePageT()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      <div className="grid grid-cols-1 items-start gap-6 @4xl:grid-cols-2">
        <ButtonsSection />
        <StatusesSection />
        <FieldsSection />
        <div className="space-y-6">
          <ChoiceSection />
          <OverlaysSection />
        </div>
        <div className="@4xl:col-span-2">
          <TableSection />
        </div>
      </div>
    </div>
  )
}
