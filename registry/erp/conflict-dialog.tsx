import * as React from "react"

import { useErpUiT } from "@/registry/lib/i18n"
import { Button } from "@/registry/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/registry/ui/table"

/**
 * Конфлікт збереження (SPEC §8.2): «хтось зберіг, поки ви редагували» — порівняння значень і вибір.
 * Відкривайте на ApiError 409 `conflict`: `current` з помилки — це «збережено зараз».
 * Кнопки називають наслідок; введені дані не губляться, доки користувач не вибере.
 */
export interface ConflictField {
  key: string
  label: string
  mine: React.ReactNode
  theirs: React.ReactNode
}

/** Тексти діалогу замість типових «Зберегти мої зміни»: дія над записом (ADR-0057). */
export interface ConflictDialogLabels {
  title: string
  description: string
  mine: string
  theirs: string
  overwrite: string
  reload: string
}

export function ConflictDialog({
  open,
  onOpenChange,
  fields,
  onOverwrite,
  onReload,
  labels,
  finalFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Поля, що відрізняються. */
  fields: ConflictField[]
  /** Зберегти свої зміни поверх актуальної версії. */
  onOverwrite: () => void
  /** Відкинути свої зміни й узяти збережене. */
  onReload: () => void
  labels?: Partial<ConflictDialogLabels>
  /** Куди повернути фокус після закриття: кнопка, з якої відкрили, могла зникнути. */
  finalFocus?: React.ComponentProps<typeof DialogContent>["finalFocus"]
}) {
  const t = useErpUiT()
  const text = {
    title: t("conflict.title"),
    description: t("conflict.description"),
    mine: t("conflict.mine"),
    theirs: t("conflict.theirs"),
    overwrite: t("conflict.overwrite"),
    reload: t("conflict.reload"),
    // Порожнє значення не перекриває типовий текст.
    ...Object.fromEntries(
      Object.entries(labels ?? {}).filter(([, value]) => Boolean(value)),
    ),
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" finalFocus={finalFocus}>
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
          <DialogDescription>{text.description}</DialogDescription>
        </DialogHeader>
        <Table label={text.title}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("conflict.field")}</TableHead>
              <TableHead>{text.mine}</TableHead>
              <TableHead>{text.theirs}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field) => (
              <TableRow key={field.key}>
                <TableCell className="text-muted-foreground">
                  {field.label}
                </TableCell>
                <TableCell className="font-medium">{field.mine}</TableCell>
                <TableCell>{field.theirs}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <DialogFooter>
          <Button variant="outline" onClick={onReload}>
            {text.reload}
          </Button>
          <Button onClick={onOverwrite}>{text.overwrite}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
