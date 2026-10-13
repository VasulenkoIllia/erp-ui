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
import type { ReactNode } from "react"
import { toast } from "sonner"

import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/registry/ui/card"
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

import { strings, type StatusKind } from "@/strings"

import { PageHeader } from "./PageHeader"

const s = strings.primitivesPage

const STATUS_ICONS: Record<StatusKind, LucideIcon> = {
  success: CircleCheck,
  warning: CircleAlert,
  destructive: CircleX,
  info: Clock,
}

/** Статус: soft-тло + іконка + підпис (SPEC §6.3). Повний StatusBadge з'явиться в PF03. */
function StatusBadge({ kind }: { kind: StatusKind }) {
  const Icon = STATUS_ICONS[kind]
  return (
    <Badge variant={kind}>
      <Icon aria-hidden />
      {strings.preview.statuses[kind]}
    </Badge>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

function ButtonsSection() {
  return (
    <Section title={s.buttons}>
      <div className="flex flex-wrap gap-2">
        <Button>{s.variants.default}</Button>
        <Button variant="secondary">{s.variants.secondary}</Button>
        <Button variant="outline">{s.variants.outline}</Button>
        <Button variant="ghost">{s.variants.ghost}</Button>
        <Button variant="destructive">
          <Trash2 aria-hidden />
          {s.variants.destructive}
        </Button>
        <Button variant="link">{s.variants.link}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button>
          <Plus aria-hidden />
          {s.create}
        </Button>
        <Button disabled>
          <Spinner label={s.saving} />
          {s.saving}
        </Button>
        <Button variant="outline" size="icon" aria-label={s.settings}>
          <Settings aria-hidden />
        </Button>
        <Button size="sm" variant="outline">
          {s.small}
        </Button>
        <Button size="lg" variant="outline">
          {s.large}
        </Button>
        {/* SPEC §8.4: дія без прав — неактивна, але у фокусі й з причиною в підказці. */}
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="outline" disabled focusableWhenDisabled />}
          >
            {s.unavailable}
          </TooltipTrigger>
          <TooltipContent>{s.unavailableHint}</TooltipContent>
        </Tooltip>
      </div>
    </Section>
  )
}

function StatusesSection() {
  return (
    <Section title={s.statuses}>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STATUS_ICONS) as StatusKind[]).map((kind) => (
          <StatusBadge key={kind} kind={kind} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge>{s.badges.new}</Badge>
        <Badge variant="secondary">{s.badges.draft}</Badge>
        <Badge variant="outline">{s.badges.archived}</Badge>
      </div>
      <Tabs defaultValue="all">
        <TabsList aria-label={s.tabsLabel}>
          <TabsTrigger value="all">{s.tabs.all}</TabsTrigger>
          <TabsTrigger value="draft">{s.tabs.draft}</TabsTrigger>
          <TabsTrigger value="sent">{s.tabs.sent}</TabsTrigger>
          <TabsTrigger value="paid">{s.tabs.paid}</TabsTrigger>
        </TabsList>
      </Tabs>
    </Section>
  )
}

function FieldsSection() {
  const f = s.field
  return (
    <Section title={s.fields}>
      <div className="grid gap-4 @2xl:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="f-normal">{f.normal.label}</FieldLabel>
          <Input
            id="f-normal"
            defaultValue={f.normal.value}
            aria-describedby="f-normal-hint"
          />
          <FieldDescription id="f-normal-hint">
            {f.normal.hint}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="f-focus">{f.focus.label}</FieldLabel>
          <Input
            id="f-focus"
            defaultValue={f.focus.value}
            aria-describedby="f-focus-hint"
            data-testid="field-focus"
          />
          <FieldDescription id="f-focus-hint">{f.focus.hint}</FieldDescription>
        </Field>
        <Field data-invalid>
          <FieldLabel htmlFor="f-error">{f.error.label}</FieldLabel>
          <Input
            id="f-error"
            defaultValue={f.error.value}
            aria-invalid
            aria-describedby="f-error-msg"
          />
          <FieldError id="f-error-msg">{f.error.hint}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="f-async">{f.async.label}</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="f-async"
              defaultValue={f.async.value}
              aria-describedby="f-async-msg"
              aria-busy
            />
            <InputGroupAddon align="inline-end">
              <Spinner label={f.async.hint} />
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription id="f-async-msg">{f.async.hint}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="f-dirty">
            {f.dirty.label}
            <span className="font-normal text-info-foreground">
              • {f.dirty.mark}
            </span>
          </FieldLabel>
          <Input
            id="f-dirty"
            defaultValue={f.dirty.value}
            aria-describedby="f-dirty-hint"
          />
          <FieldDescription id="f-dirty-hint">{f.dirty.hint}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="f-saved">{f.saved.label}</FieldLabel>
          <Input
            id="f-saved"
            defaultValue={f.saved.value}
            aria-describedby="f-saved-hint"
          />
          <FieldDescription
            id="f-saved-hint"
            className="flex items-center gap-1"
          >
            <Check aria-hidden className="size-3.5 text-success-foreground" />
            {f.saved.hint}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="f-readonly">{f.readOnly.label}</FieldLabel>
          <Input
            id="f-readonly"
            defaultValue={f.readOnly.value}
            readOnly
            aria-describedby="f-readonly-hint"
          />
          <FieldDescription id="f-readonly-hint">
            {f.readOnly.hint}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="f-locked">{f.locked.label}</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="f-locked"
              defaultValue={f.locked.value}
              readOnly
              aria-describedby="f-locked-hint"
            />
            <InputGroupAddon align="inline-end">
              <Lock aria-hidden />
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription id="f-locked-hint">
            {f.locked.hint}
          </FieldDescription>
        </Field>
        <Field data-disabled>
          <FieldLabel htmlFor="f-disabled">{f.disabled.label}</FieldLabel>
          <Input
            id="f-disabled"
            defaultValue={f.disabled.value}
            disabled
            aria-describedby="f-disabled-hint"
          />
          <FieldDescription id="f-disabled-hint">
            {f.disabled.hint}
          </FieldDescription>
        </Field>
      </div>
    </Section>
  )
}

function ChoiceSection() {
  return (
    <Section title={s.choice}>
      <Field>
        <FieldLabel htmlFor="f-currency">{s.currency}</FieldLabel>
        <Select items={s.currencies} defaultValue="UAH">
          <SelectTrigger id="f-currency" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {s.currencies.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field orientation="horizontal">
        <Checkbox id="f-vat" defaultChecked />
        <FieldLabel htmlFor="f-vat">{s.vatPayer}</FieldLabel>
      </Field>
      <Field orientation="horizontal">
        <Switch id="f-remind" defaultChecked />
        <FieldLabel htmlFor="f-remind">{s.remind}</FieldLabel>
      </Field>
      <Separator />
      <Field>
        <FieldLabel htmlFor="f-note">{s.note}</FieldLabel>
        <Textarea id="f-note" placeholder={s.notePlaceholder} />
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
  const d = s.dialog
  const sh = s.sheet
  const t = s.toast
  return (
    <Section title={s.overlays}>
      <div className="flex flex-wrap items-center gap-2">
        <Dialog>
          <DialogTrigger render={<Button variant="destructive" />}>
            <Trash2 aria-hidden />
            {d.open}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{d.title}</DialogTitle>
              <DialogDescription>{d.description}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                {d.cancel}
              </DialogClose>
              <DialogClose render={<Button variant="destructive" />}>
                {d.confirm}
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Sheet>
          <SheetTrigger render={<Button variant="outline" />}>
            <SlidersHorizontal aria-hidden />
            {sh.open}
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{sh.title}</SheetTitle>
              <SheetDescription>{sh.description}</SheetDescription>
            </SheetHeader>
            <div className="px-4">
              <Field>
                <FieldLabel htmlFor="f-sheet-client">{sh.client}</FieldLabel>
                <Input id="f-sheet-client" />
              </Field>
            </div>
            <SheetFooter>
              <Button>{sh.apply}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label={s.exportLabel}
              />
            }
          >
            <Download aria-hidden />
          </TooltipTrigger>
          <TooltipContent>{s.tooltip}</TooltipContent>
        </Tooltip>

        <Button
          variant="secondary"
          onClick={() => {
            toast.success(t.saved)
          }}
        >
          {t.open}
        </Button>
        {/* SPEC §8.2: тост із дією «Скасувати» не зникає сам. */}
        <Button
          variant="secondary"
          onClick={() => {
            toast(t.archived, {
              duration: Infinity,
              action: {
                label: t.undo,
                onClick: () => undefined,
              },
            })
          }}
        >
          {t.undoOpen}
        </Button>
      </div>
    </Section>
  )
}

function TableSection() {
  const p = strings.preview
  return (
    <Section title={s.table}>
      <Table label={p.tableCaption}>
        <TableHeader>
          <TableRow>
            <TableHead>{p.columns.number}</TableHead>
            <TableHead>{p.columns.client}</TableHead>
            <TableHead className="text-right">{p.columns.amount}</TableHead>
            <TableHead>{p.columns.status}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {p.rows.map((row) => (
            <TableRow key={row.number}>
              <TableCell className="tabular-nums">{row.number}</TableCell>
              <TableCell>{row.client}</TableCell>
              <TableCell className="text-right tabular-nums">
                {row.amount}
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
  return (
    <div className="space-y-6">
      <PageHeader title={s.title} lead={s.lead} />
      <div className="grid items-start gap-6 @4xl:grid-cols-2">
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
