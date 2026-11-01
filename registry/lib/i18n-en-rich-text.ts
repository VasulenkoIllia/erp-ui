/** Рядки поля тексту (UI12, ADR-0052) англійською — ті самі ключі, що в lib/i18n-uk-rich-text. */
import type { ErpUiTranslation } from "@/registry/lib/i18n-uk"
import type { ukRichText } from "@/registry/lib/i18n-uk-rich-text"

export const enRichText: ErpUiTranslation<typeof ukRichText> = {
  richText: {
    toolbar: "Text formatting",
    bold: "Bold",
    italic: "Italic",
    bulletList: "Bulleted list",
    orderedList: "Numbered list",
    blockquote: "Quote",
    link: "Link",
    mention: "Mention a colleague",
    linkAddress: "Link address",
    linkApply: "Apply",
    linkRemove: "Remove link",
    linkInvalid: "Enter an address, for example https://example.com",
    loading: "Loading the editor",
    failed: "Could not load the editor. Your text is safe.",
    mentionsFound_one: "{{count}} person found",
    mentionsFound_other: "{{count}} people found",
    mentionsSearching: "Searching for colleagues",
    mentionsEmpty: "No one found",
    mentionsFailed: "Could not find colleagues",
  },
}
