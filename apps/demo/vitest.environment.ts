/**
 * Середовище модульних тестів демо: jsdom, але Blob, File і FormData — з Node, як і fetch.
 *
 * Vitest у jsdom бере ці класи з jsdom, а fetch лишає з Node. undici 7+ (Node 24 і новіші)
 * обгортає частину форми в глобальний File і сам перевіряє, що це File з Node: файл у FormData
 * не доходить до моку (RequestContentLengthMismatchError), а мок не може розібрати форму.
 * У браузері fetch і ці класи з одного світу; тут так само.
 *
 * FileReader лишається з jsdom і Blob з Node не читає. Ним користується буфер обміну
 * user-event (`navigator.clipboard.readText()`), тож такий тест іде у звичайному jsdom:
 * `// @vitest-environment jsdom` на початку файла.
 */
import { builtinEnvironments, type Environment } from "vitest/runtime"

const NODE_CLASSES = ["Blob", "File", "FormData"] as const

export default {
  name: "jsdom",
  viteEnvironment: "client",
  async setup(global: Record<string, unknown>, options) {
    const fromNode = NODE_CLASSES.map((key) => [key, global[key]] as const)
    const jsdom = await builtinEnvironments.jsdom.setup(global, options)
    // Повз сеттер Vitest: він пише й у вікно jsdom, а Request від Vitest упізнає тіло з jsdom
    // саме за класами вікна.
    for (const [key, value] of fromNode)
      Object.defineProperty(global, key, {
        value,
        writable: true,
        configurable: true,
      })
    return jsdom
  },
} satisfies Environment
