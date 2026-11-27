/**
 * Photo strings in English (part of UI11, ADR-0101, ADR-0103). Ukrainian — lib/i18n-uk-photos.
 */
import type { ErpUiTranslation } from "@/registry/lib/i18n-uk"
import type { ukPhotos } from "@/registry/lib/i18n-uk-photos"

export const enPhotos = {
  photos: {
    input: {
      choose: "Choose photos",
      add: "Add photos",
      dropHint: "Drag photos here or paste a screenshot",
      limit_one: "Up to {{count}} photo: JPEG, PNG or WebP, up to {{size}}",
      limit_other:
        "Up to {{count}} photos: JPEG, PNG or WebP, each up to {{size}}",
      cropHint:
        "Draw a frame around the part you need, or tap two corners one after the other.",
      output: "Output {{width}} × {{height}} px",
      wholePhoto: "Whole photo",
      remove: "Remove the photo",
      removeAll: "Remove all",
      loading_one: "Reading {{count}} photo…",
      loading_other: "Reading {{count}} photos…",
      added: "Added the photo “{{name}}”",
      addedSeveral_one: "Added {{count}} photo",
      addedSeveral_other: "Added {{count}} photos",
      removed: "Removed the photo “{{name}}”",
      cleared: "Photos removed",
      earlier: "Earlier",
      later: "Later",
      earlierLabel: "Earlier: photo “{{name}}”",
      laterLabel: "Later: photo “{{name}}”",
      moved: "Photo “{{name}}” is now {{index}} of {{count}}",
      movedMain: "Photo “{{name}}” is now the main one",
      errors: {
        type: "“{{name}}” isn't a JPEG, PNG or WebP photo.",
        size: "“{{name}}” is larger than {{size}}.",
        unreadable: "Couldn't read “{{name}}” as a photo.",
        duplicate: "“{{name}}” is already added.",
        tooMany_one: "You can't add more than {{count}} photo.",
        tooMany_other: "You can't add more than {{count}} photos.",
      },
    },
    crop: {
      area: "Cropping the photo “{{name}}”",
      role: "crop area",
      keys: "Arrow keys move the frame, Shift with arrow keys resizes it, Delete brings back the whole photo, Escape cancels the first corner.",
      frame:
        "Frame {{width}} × {{height}} px, {{x}} from the left, {{y}} from the top, photo {{photoWidth}} × {{photoHeight}}",
      whole: "Whole photo, {{width}} × {{height}} px",
      corner: "First corner chosen, tap the second one",
    },
    strip: {
      label: "Chosen photos",
      position: "Photo {{index}} of {{count}}:",
      cropped: "cropped",
      main: "main",
      removeShort: "Remove",
      remove: "Remove photo {{index}}: {{name}}",
    },
    gallery: {
      noPhoto: "No photo",
      failed: "The photo didn't load",
      show: "Photo {{index}} of {{count}}",
      thumbs: "Photos: {{name}}",
      open: "Open the large photo “{{name}}” in a new tab",
    },
    grid: {
      loading: "Loading cards",
    },
  },
} satisfies ErpUiTranslation<typeof ukPhotos>
