import * as React from "react"
import { useSearchParams, type RouteObject } from "react-router"

import { AUTH_PATHS, type AuthPaths } from "@/registry/erp/auth-layout"
import type { CaptchaRenderer } from "@/registry/erp/captcha"
import { ErrorBoundary } from "@/registry/erp/error-boundary"
import { LoadingFallback } from "@/registry/erp/page-state"
import { lazyWithPreload } from "@/registry/lib/lazy"

/**
 * Маршрути екранів входу для React Router (крок 1.9, ADR-0029): вхід, відновлення пароля, новий
 * пароль, запрошення й вхід за посиланням із листа, реєстрація, повернення з SSO. Ставляться поруч
 * із брамою сесії (erp/app-gate), поза оболонкою.
 *
 * - Що показати на екрані входу, вирішує сервер (`GET /auth/methods`, ADR-0010): змонтовані всі
 *   екрани, тож посилання «Забули пароль?» чи «Зареєструватися» не ведуть на неіснуючі сторінки.
 * - Екрани — лінивими чанками: користувач, що вже увійшов, їх не вантажить. `preload(адреса)` —
 *   на старті для поточної адреси й коли браузер вільний (вихід без спінера на весь екран).
 * - Кожен екран — у своїй межі помилок: чанк, що не завантажився (офлайн, застарілий після деплою),
 *   покаже «Спробувати ще» з h1, а не білий екран.
 * - Вхід — завжди `/login`: туди ra-core веде гостя й після виходу, тож цю адресу не змінюють.
 *
 *   const auth = useMemo(() => createAuthRoutes({ afterLogin: "/crm/contacts", title: t("app.name") }), [t])
 *   const page = useRoutes([...auth.routes, { path: "*", element: <SessionGate><Shell /></SessionGate> }])
 */

/** Адреси екранів: ті, між якими ходять самі екрани (`AUTH_PATHS`), і ті, на які ведуть листи. */
export const AUTH_ROUTE_PATHS = {
  ...AUTH_PATHS,
  reset: "/login/reset",
  invite: "/login/invite",
  link: "/login/link",
}
export type AuthRoutePaths = typeof AUTH_ROUTE_PATHS

const SCREENS = {
  login: lazyWithPreload(() =>
    import("./login-screen").then((m) => m.LoginScreen),
  ),
  forgot: lazyWithPreload(() =>
    import("./account-recovery").then((m) => m.ForgotPasswordScreen),
  ),
  reset: lazyWithPreload(() =>
    import("./account-recovery").then((m) => m.ResetPasswordScreen),
  ),
  invite: lazyWithPreload(() =>
    import("./account-recovery").then((m) => m.AcceptInviteScreen),
  ),
  link: lazyWithPreload(() =>
    import("./account-recovery").then((m) => m.EmailLinkScreen),
  ),
  signUp: lazyWithPreload(() =>
    import("./sign-up-screen").then((m) => m.SignUpScreen),
  ),
  callback: lazyWithPreload(() =>
    import("./account-recovery").then((m) => m.SsoCallbackScreen),
  ),
} satisfies Record<keyof AuthRoutePaths, unknown>

export interface AuthRoutesOptions {
  /** Куди після входу, якщо ra-core не запам'ятав сторінку; також після запрошення й посилання. */
  afterLogin?: string
  /** Куди після реєстрації (напр. перший запуск); за замовчуванням — `afterLogin`. */
  afterSignUp?: string
  /** Інші адреси екранів, крім входу; листи сервера мають вести на ті самі. */
  paths?: Partial<Omit<AuthRoutePaths, "login">>
  /** Над формою входу: назва застосунку й підказка. */
  title?: string
  description?: React.ReactNode
  logo?: React.ReactNode
  footer?: React.ReactNode
  /** Інша перевірка «не бот» (за замовчуванням — Turnstile із `captchaSiteKey` сервера). */
  renderCaptcha?: CaptchaRenderer
}

export interface AuthRoutes {
  readonly routes: RouteObject[]
  /** Почати завантаження екрана за адресою; без адреси — екрана входу. */
  readonly preload: (pathname?: string) => void
}

type TokenScreen = "reset" | "invite" | "link"

interface ScreenCommon {
  logo?: React.ReactNode
  footer?: React.ReactNode
  paths: Partial<AuthPaths>
  afterLogin?: string
}

/** Екран за посиланням із листа: токен — з `?token=` адреси. */
function TokenRoute({
  screen,
  ...props
}: ScreenCommon & { screen: TokenScreen }) {
  const [search] = useSearchParams()
  const Screen = SCREENS[screen]
  return <Screen {...props} token={search.get("token")} />
}

/** Екран за адресою: своя межа помилок (ключ — адреса, щоб помилка не переходила на інший екран). */
const screenAt = (path: string, screen: React.ReactNode): RouteObject => ({
  path,
  element: (
    <ErrorBoundary
      key={path}
      headingLevel={1}
      frame={(content) => <main className="p-4 pt-24">{content}</main>}
    >
      <React.Suspense fallback={<LoadingFallback className="mt-24" />}>
        {screen}
      </React.Suspense>
    </ErrorBoundary>
  ),
})

export function createAuthRoutes({
  afterLogin,
  afterSignUp = afterLogin,
  paths: pathsOverride,
  title,
  description,
  logo,
  footer,
  renderCaptcha,
}: AuthRoutesOptions = {}): AuthRoutes {
  const paths: AuthRoutePaths = { ...AUTH_ROUTE_PATHS, ...pathsOverride }
  // Самі екрани посилаються лише на вхід, відновлення, реєстрацію й повернення з SSO.
  const common: ScreenCommon = {
    logo,
    footer,
    afterLogin,
    paths: {
      login: paths.login,
      forgot: paths.forgot,
      signUp: paths.signUp,
      callback: paths.callback,
    },
  }
  const token = (screen: TokenScreen) =>
    screenAt(paths[screen], <TokenRoute {...common} screen={screen} />)
  const routes: RouteObject[] = [
    screenAt(
      paths.login,
      <SCREENS.login
        {...common}
        title={title}
        description={description}
        renderCaptcha={renderCaptcha}
      />,
    ),
    screenAt(
      paths.forgot,
      <SCREENS.forgot {...common} renderCaptcha={renderCaptcha} />,
    ),
    token("reset"),
    token("invite"),
    token("link"),
    screenAt(
      paths.signUp,
      <SCREENS.signUp
        logo={logo}
        footer={footer}
        paths={common.paths}
        afterSignUp={afterSignUp}
        renderCaptcha={renderCaptcha}
      />,
    ),
    screenAt(paths.callback, <SCREENS.callback {...common} />),
  ]
  const preload = (pathname: string = paths.login) => {
    // Без запиту, якоря й кінцевої косої: «/login/» — той самий екран, що й «/login».
    const path = pathname.split(/[?#]/)[0]?.replace(/(.)\/+$/, "$1")
    const screen = (Object.keys(paths) as (keyof AuthRoutePaths)[]).find(
      (key) => paths[key] === path,
    )
    if (screen) void SCREENS[screen].preload()
  }
  return { routes, preload }
}
