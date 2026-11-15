/**
 * Чистий шар контрактів (ADR-0093): старий шлях змішаного файла віддає ті самі значення, що й його `-core`, а
 * назви іконок статусів у шарі ті самі, що й у `lib/icons`.
 */
import { describe, expect, expectTypeOf, it } from "vitest"

import * as appearance from "@/registry/lib/appearance"
import * as appearanceCore from "@/registry/lib/appearance-core"
import * as extensionFieldTypes from "@/registry/lib/extension-field-types"
import * as extensionFields from "@/registry/lib/extension-fields"
import * as extensionFieldsCore from "@/registry/lib/extension-fields-core"
import * as format from "@/registry/lib/format"
import * as formatCore from "@/registry/lib/format-core"
import * as i18n from "@/registry/lib/i18n"
import * as i18nCore from "@/registry/lib/i18n-core"
import type { STATUS_ICONS } from "@/registry/lib/icons"
import * as statuses from "@/registry/lib/statuses"
import * as statusesCore from "@/registry/lib/statuses-core"

/** Внутрішні імена `-core`, яких старий шлях не віддає. */
const INTERNAL = new Set(["onlyNewTransitions"])

const PAIRS: [string, object, object][] = [
  ["lib/appearance", appearance, appearanceCore],
  ["lib/extension-fields", extensionFields, extensionFieldsCore],
  ["lib/format", format, formatCore],
  ["lib/i18n", i18n, i18nCore],
  ["lib/statuses", statuses, statusesCore],
]

describe("чистий шар контрактів", () => {
  it.each(PAIRS)("%s реекспортує всі значення свого -core", (_, old, core) => {
    for (const [name, value] of Object.entries(core)) {
      if (INTERNAL.has(name)) continue
      expect(Reflect.get(old, name), name).toBe(value)
    }
  })

  it("lib/extension-field-types віддає unknownFieldType з -core", () => {
    expect(extensionFieldTypes.unknownFieldType).toBe(
      extensionFieldsCore.unknownFieldType,
    )
  })

  it("назви іконок статусів — ті самі, що ключі STATUS_ICONS", () => {
    expectTypeOf<statusesCore.StatusIcon>().toEqualTypeOf<
      keyof typeof STATUS_ICONS
    >()
  })
})
