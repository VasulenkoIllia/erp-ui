/**
 * Document numbering strings in English (PF03b, ADR-0058). Ukrainian — lib/i18n-uk-numbering.
 */
import type { ukNumbering } from "@/registry/lib/i18n-uk-numbering"

export const enNumbering: typeof ukNumbering = {
  numbering: {
    title: "Document numbering",
    noNumber: "No number",
    seriesList: "Document types",
    emptyTitle: "Nothing to number yet",
    emptyDescription:
      "Number series appear here once the project has documents with numbers.",
    template: "Number template",
    templateHint:
      "Tags: {YYYY} year, {YY} two-digit year, {MM} month, {BRANCH} branch code, {####} four-digit counter.",
    tokens: "Insert a tag",
    tokenNames: {
      YYYY: "year",
      YY: "two-digit year",
      MM: "month",
      BRANCH: "branch code",
      counter: "counter",
    },
    insertToken: "Insert {{token}}, {{name}}",
    resetYearly: "Restart every year",
    resetYearlyHint:
      "The counter starts from 1 in each calendar year of the document date.",
    perBranch: "Separate for each branch",
    perBranchHint:
      "Each branch has its own counter, with its code in the number.",
    preview: "Next number",
    previewHint: "Unless someone submits a document first.",
    previewBranch: "Branch for the preview",
    noBranch: "No branch",
    previewFailed: "Couldn't load the counter",
    saved: "Numbering saved",
    readOnly:
      "You can see the numbering, but only someone with the settings permission can change it.",
    issues: {
      required: "Enter a template",
      too_long: "No more than {{max}} characters",
      unknown_token: "Unknown tag or unmatched brace",
      counter_required: "Add a counter, for example {####}",
      counter_duplicate: "Use only one counter",
      year_required:
        "Add the year {YYYY} or {YY}: otherwise numbers repeat next year",
      branch_required:
        "Add the branch code {BRANCH}: otherwise numbers of different branches collide",
    },
  },
}
