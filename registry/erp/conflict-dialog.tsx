"use client"

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

export function ConflictDialog({
  open,
  onOpenChange,
  fields,
  onOverwrite,
  onReload,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Поля, що відрізняються. */
  fields: ConflictField[]
  /** Зберегти свої зміни поверх актуальної версії. */
  onOverwrite: () => void
  /** Відкинути свої зміни й узяти збережене. */
  onReload: () => void
}) {
  const t = useErpUiT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("conflict.title")}</DialogTitle>
          <DialogDescription>{t("conflict.description")}</DialogDescription>
        </DialogHeader>
        <Table label={t("conflict.title")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("conflict.field")}</TableHead>
              <TableHead>{t("conflict.mine")}</TableHead>
              <TableHead>{t("conflict.theirs")}</TableHead>
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
            {t("conflict.reload")}
          </Button>
          <Button onClick={onOverwrite}>{t("conflict.overwrite")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
