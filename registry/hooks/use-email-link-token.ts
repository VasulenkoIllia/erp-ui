import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "ra-core"

/**
 * Токен із листа для екранів «новий пароль», «запрошення» й «вхід за посиланням» (ADR-0010,
 * ADR-0030): посилання веде на `…?token=…`, а щойно екран його прочитав, токен зникає з рядка
 * адреси й записів історії вкладки («Назад», «Вперед») — його не видно на спільному екрані, на
 * знімку екрана й у посиланні, яке людина скопіює з адреси (вікторина A2a, 25.10.2026).
 *
 * - Чого хук не прибирає: перший запит сторінки з токеном (журнали сервера й CDN; з роутером на
 *   шляхах — і `Referer` ресурсів, які сторінка встигла запросити), запис у глобальній історії
 *   браузера й скрипти, що прочитали адресу раніше (аналітика, моніторинг). Для роутера на шляхах —
 *   заголовок `Referrer-Policy: no-referrer` на HTML і маскування `token` у журналах
 *   (`docs/using-erp-ui.md`, розділ 6); з hash-роутером частина після `#` на сервер не йде.
 * - Запис історії замінюється (`replace`), решта параметрів, якір і стан переходу лишаються.
 * - Поки екран змонтовано, токен у `sessionStorage` цієї вкладки (ключ на екран): оновлення сторінки
 *   не губить форму «новий пароль». Пішла з екрана переходом у застосунку (успіх, «До входу») —
 *   ключ стерто. `clearEmailLinkTokens` стирає всі: після входу (`useAfterLogin`) і на екрані входу
 *   (`erp/auth-routes`), куди веде кожен вихід (кнопка, таймер, 401, інша вкладка). Пішла повз
 *   застосунок (інша адреса вручну) — ключ лишається до входу, екрана входу чи закриття вкладки.
 * - Новий токен в адресі (друге посилання в тій самій вкладці) замінює збережений.
 * - Без сховища (приватний режим із забороною) — лише в пам'яті: після оновлення екран скаже
 *   «посилання недійсне», а посилання з листа ще діє.
 * - Роутер — через ra-core (`useLocation`, `useNavigate`), тож працює з будь-яким. Хук ставлять над
 *   межею помилок і `Suspense` екрана: так токен зникає з адреси, поки чанк екрана ще вантажиться, а
 *   помилка екрана й «Спробувати ще» його не стирають.
 *
 *   const token = useEmailLinkToken("reset")
 *   <ErrorBoundary><Suspense …><ResetPasswordScreen token={token} … /></Suspense></ErrorBoundary>
 */
export type EmailLinkScreen = "reset" | "invite" | "link"

const TOKEN_PARAM = "token"
const STORAGE_PREFIX = "erp-ui:email-link-token:"

function readToken(screen: EmailLinkScreen): string | null {
  try {
    return globalThis.sessionStorage?.getItem(STORAGE_PREFIX + screen) ?? null
  } catch {
    return null
  }
}

function writeToken(screen: EmailLinkScreen, token: string | null): void {
  try {
    if (token)
      globalThis.sessionStorage?.setItem(STORAGE_PREFIX + screen, token)
    else globalThis.sessionStorage?.removeItem(STORAGE_PREFIX + screen)
  } catch {
    // Без сховища токен живе в пам'яті екрана до оновлення сторінки.
  }
}

/** Стерти токени листів у цій вкладці (за префіксом — і екранів, яких ще немає в типі). */
export function clearEmailLinkTokens(): void {
  try {
    const storage = globalThis.sessionStorage
    const keys = Array.from({ length: storage.length }, (_, i) =>
      storage.key(i),
    )
    for (const key of keys)
      if (key?.startsWith(STORAGE_PREFIX)) storage.removeItem(key)
  } catch {
    // Без сховища токенів у ньому немає.
  }
}

export function useEmailLinkToken(screen: EmailLinkScreen): string | null {
  const location = useLocation()
  const navigate = useNavigate()
  const fromUrl = new URLSearchParams(location.search).get(TOKEN_PARAM)
  const [stored, setStored] = useState(() => ({
    screen,
    token: readToken(screen),
  }))
  // Інший екран без перемонтування — його власний токен, а не попереднього; новий токен з адреси —
  // одразу в стан: після заміни адреси екран бачить той самий токен.
  if (stored.screen !== screen) setStored({ screen, token: readToken(screen) })
  else if (fromUrl !== null && fromUrl !== stored.token)
    setStored({ screen, token: fromUrl })
  const token = fromUrl ?? stored.token

  // Запис — на кожне монтування: StrictMode і перемонтування знімають ефект (ключ стерто) і ставлять
  // знову, тож токен, що був лише у вкладці, не губиться.
  useEffect(() => {
    if (token === null) return
    writeToken(screen, token)
    return () => {
      writeToken(screen, null)
    }
  }, [screen, token])

  useEffect(() => {
    if (fromUrl === null) return
    const rest = new URLSearchParams(location.search)
    rest.delete(TOKEN_PARAM)
    const search = rest.toString()
    navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : "",
        hash: location.hash,
      },
      { replace: true, state: location.state as unknown },
    )
  }, [fromUrl, location, navigate])

  return token
}
