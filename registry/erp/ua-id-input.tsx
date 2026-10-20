import * as React from "react"
import { NumberFormatBase } from "react-number-format"

import type { ErpUiKey } from "@/registry/lib/i18n"
import {
  formatIban,
  normalizeUaId,
  UA_ID_LENGTH,
  type UaIdIssue,
  type UaIdKind,
} from "@/registry/lib/ua-ids"
import { Input } from "@/registry/ui/input"

/**
 * Поле українського ідентифікатора (LC12): ЄДРПОУ, РНОКПП, ІПН платника ПДВ, IBAN UA.
 *
 * - Приймає лише цифри; зайві цифри не вводяться; вставка з пробілами чи дефісами очищується.
 * - IBAN: «UA» додається сам, цифри групуються по 4 — «UA21 3223 1300 …».
 * - `value` і `onValueChange` — нормалізоване значення (без пробілів), його й зберігаємо.
 * - Перевірку контрольної суми робить форма: `validateUaId(kind, value)` з `lib/ua-ids`
 *   (за SPEC §8.3 — при виході з поля, далі під час виправлення).
 */
type UaIdInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "type" | "onChange"
> & {
  kind: UaIdKind
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}

const maxLength = (kind: UaIdKind) =>
  kind === "iban" ? 2 + UA_ID_LENGTH.iban : UA_ID_LENGTH[kind]

function UaIdInput({
  kind,
  value,
  defaultValue,
  onValueChange,
  ...props
}: UaIdInputProps) {
  const iban = kind === "iban"
  return (
    <NumberFormatBase
      customInput={Input}
      data-slot="ua-id-input"
      value={value}
      defaultValue={defaultValue}
      valueIsNumericString
      format={iban ? formatIban : (v: string) => v}
      removeFormatting={(v: string) => normalizeUaId(kind, v)}
      // Каретка не стає всередину префікса «UA».
      getCaretBoundary={(formatted: string) =>
        Array.from(
          { length: formatted.length + 1 },
          (_, i) => !(iban && formatted.startsWith("UA") && i < 2),
        )
      }
      isAllowed={(values) => values.value.length <= maxLength(kind)}
      onValueChange={(values) => onValueChange?.(values.value)}
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      {...props}
    />
  )
}

const ISSUE_KEYS: Record<
  UaIdKind,
  Record<Exclude<UaIdIssue, "country">, ErpUiKey> & { country?: ErpUiKey }
> = {
  edrpou: {
    length: "validation.edrpou.length",
    checksum: "validation.edrpou.checksum",
  },
  rnokpp: {
    length: "validation.rnokpp.length",
    checksum: "validation.rnokpp.checksum",
  },
  vatIpn: {
    length: "validation.vatIpn.length",
    checksum: "validation.vatIpn.checksum",
  },
  iban: {
    country: "validation.iban.country",
    length: "validation.iban.length",
    checksum: "validation.iban.checksum",
  },
}

/** Ключ тексту помилки для результату `validateUaId` у рядках кіта (`useErpUiT`). */
function uaIdIssueKey(kind: UaIdKind, issue: UaIdIssue): ErpUiKey {
  // "country" буває лише в IBAN.
  return ISSUE_KEYS[kind][issue] ?? ISSUE_KEYS[kind].length
}

export { UaIdInput, uaIdIssueKey, type UaIdInputProps }
