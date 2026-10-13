import { createCn } from "cn/config"

/**
 * cn для компонентів erp-ui: злиття класів Tailwind (як clsx + tailwind-merge),
 * що знає наші утиліти щільності з registry/tokens/base.css. Без цього
 * `cn("h-control", "h-10")` лишав би обидва класи, і перемагав би випадковий.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      h: [{ h: ["control", "row"] }],
      "min-h": [{ "min-h": ["control", "touch"] }],
      size: [{ size: ["control"] }],
    },
  },
})
