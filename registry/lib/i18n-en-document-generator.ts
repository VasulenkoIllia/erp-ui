/**
 * Document-from-template (.docx) strings in English (UI44, ADR-0087). Ukrainian — lib/i18n-uk-document-generator.
 */
import type { ukDocumentGenerator } from "@/registry/lib/i18n-uk-document-generator"
import type { ErpUiTranslation } from "@/registry/lib/i18n-uk"

export const enDocumentGenerator = {
  documentGenerator: {
    action: "Document from template",
    title: "Document from template",
    description:
      "Choose a Word template: its tags are filled with the document's data. You can correct the values before downloading.",
    template: "Template",
    ownFile: "Own .docx file",
    fileLabel: "Template file",
    fileHint: "Word .docx with tags such as {customer.name}",
    reading: "Reading the template…",
    loadFailed:
      "The template did not load. Check your connection and try again.",
    retry: "Try again",
    notDocx: "This is not a Word .docx file, or the file is damaged.",
    fillFailed:
      "The template could not be filled. Check it in Word and choose it again.",
    tooLarge: "The template is too large: unpacked, it exceeds {{size}} MB.",
    choose: "Choose a template to see its tags and preview.",
    fields: "Template tags",
    fieldsHint:
      "Values come from the document. A correction here goes only into this file; the document does not change.",
    noTags: "The template has no tags: the file downloads unchanged.",
    read_one: "Template read: {{count}} tag.",
    read_other: "Template read: {{count}} tags.",
    issues_one:
      "The template has {{count}} error, marked next to the tag. Fix the template in Word and choose it again.",
    issues_other:
      "The template has {{count}} errors, marked next to the tags. Fix the template in Word and choose it again.",
    issuesTitle: "Template errors",
    issue: {
      unknown:
        "There is no such tag. Fix the name in the template: available tags are listed under “Tags you can insert”.",
      unknownInLoop:
        "Document lines have no such tag. Available ones are in the “Document lines” group of the tag list.",
      raw: "Tags with @ are not supported: remove the @ in the template.",
      unclosed_tag: "The tag is not closed: } is missing after the name.",
      unopened_tag: "The tag is not opened: { is missing before the name.",
      duplicate_open_tag: "An extra { in the tag.",
      duplicate_close_tag: "An extra } in the tag.",
      unclosed_loop:
        "The block is not closed: a tag with / and the same name is missing.",
      unopened_loop:
        "A block end without a start: a tag with # and the same name is missing.",
      closing_tag_does_not_match_opening_tag:
        "The block end does not match its start: the names after # and / must be the same.",
      other: "The tag is written incorrectly.",
    },
    loop_one: "{{count}} line, taken from the document",
    loop_other: "{{count}} lines, taken from the document",
    preview: "Preview",
    previewTitle: "Preview of “{{name}}”",
    previewUpdating: "Updating the preview…",
    previewFailed:
      "The preview failed. You can still download the file and open it in Word.",
    previewEmpty: "The document with your values will appear here.",
    download: "Download .docx",
    downloadBlocked: "Fix the template errors first",
    downloadNoTemplate: "Choose a template first",
    reference: "Tags you can insert",
    referenceHint:
      "Paste a tag into the Word template as is, braces included. Document lines repeat between {#lines} and {/lines}.",
    groups: {
      document: "Document",
      lines: "Document lines",
      fields: "Other fields",
    },
    document: {
      number: "Number",
      date: "Date",
      dateLong: "Date in words",
      currency: "Currency",
      net: "Amount before tax",
      tax: "Tax",
      total: "Total",
      totalInWords: "Total in words",
      draft: "no number",
    },
    party: {
      name: "Full name",
      code: "Company or tax ID",
      vatIpn: "VAT number",
      iban: "IBAN",
      bankName: "Bank",
      address: "Address",
      phone: "Phone",
      email: "Email",
      signerPosition: "Signatory's position",
      signerName: "Signatory (full name)",
      representedBy: "Represented by",
      basis: "Acting under",
      clause: "Party in the contract text",
      signature: "Signature line “Olena KOVAL”",
    },
    line: {
      no: "No.",
      name: "Name",
      quantity: "Quantity",
      unit: "Unit",
      price: "Price",
      discount: "Discount",
      tax: "Tax",
      net: "Amount before tax",
      total: "Amount",
    },
  },
} satisfies ErpUiTranslation<typeof ukDocumentGenerator>
