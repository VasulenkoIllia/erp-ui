import tokens from "@design/palette-tokens.json"
import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react"
import { useId, type ReactNode } from "react"

import { strings } from "@/strings"

import {
  DENSITIES,
  PALETTES,
  SIDEBARS,
  THEME_MODES,
  type Palette,
  type ThemeMode,
} from "./appearance"
import { useAppearance } from "./store"

interface Option<T extends string> {
  value: T
  label: string
  adornment?: ReactNode
}

interface OptionGroupProps<T extends string> {
  legend: string
  name: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  hint?: string
}

/** Група радіокнопок у вигляді сегментів. Тимчасовий демо-компонент до примітивів кроку 0.2. */
function OptionGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  hint,
}: OptionGroupProps<T>) {
  const hintId = useId()
  return (
    <fieldset aria-describedby={hint ? hintId : undefined}>
      <legend className="mb-2 font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = option.value === value
          return (
            <label
              key={option.value}
              className="relative inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => {
                  onChange(option.value)
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              {option.adornment}
              <span>{option.label}</span>
              {checked ? (
                <Check aria-hidden className="size-4 text-primary" />
              ) : null}
            </label>
          )
        })}
      </div>
      {hint ? (
        <p id={hintId} className="mt-2 text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </fieldset>
  )
}

/** Кружечок палітри: ліва половина — основний колір світлої теми, права — темної. */
function PaletteSwatch({ palette }: { palette: Palette }) {
  const { light, dark } = tokens[palette]
  return (
    <span
      aria-hidden
      className="size-4 shrink-0 rounded-full border border-border"
      style={{
        background: `linear-gradient(90deg, ${light.primary.css} 50%, ${dark.primary.css} 50%)`,
      }}
    />
  )
}

const THEME_ICONS: Record<ThemeMode, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

export function AppearanceControls() {
  const [appearance, setAppearance] = useAppearance()
  const s = strings.controls

  return (
    <section
      aria-labelledby="appearance-title"
      className="space-y-5 rounded-xl border border-border bg-card p-4 text-card-foreground"
    >
      <h2 id="appearance-title" className="text-base font-semibold">
        {s.title}
      </h2>

      <OptionGroup
        legend={s.palette}
        name="palette"
        value={appearance.palette}
        onChange={(palette) => {
          setAppearance({ palette })
        }}
        options={PALETTES.map((palette) => ({
          value: palette,
          label: strings.palettes[palette],
          adornment: <PaletteSwatch palette={palette} />,
        }))}
      />

      <OptionGroup
        legend={s.theme}
        name="theme"
        value={appearance.theme}
        onChange={(theme) => {
          setAppearance({ theme })
        }}
        options={THEME_MODES.map((theme) => {
          const Icon = THEME_ICONS[theme]
          return {
            value: theme,
            label: strings.themes[theme],
            adornment: <Icon aria-hidden className="size-4" />,
          }
        })}
      />

      <OptionGroup
        legend={s.density}
        name="density"
        value={appearance.density}
        onChange={(density) => {
          setAppearance({ density })
        }}
        options={DENSITIES.map((density) => ({
          value: density,
          label: strings.densities[density],
        }))}
      />

      <OptionGroup
        legend={s.sidebar}
        name="sidebar"
        value={appearance.sidebar}
        hint={s.sidebarHint}
        onChange={(sidebar) => {
          setAppearance({ sidebar })
        }}
        options={SIDEBARS.map((sidebar) => ({
          value: sidebar,
          label: strings.sidebars[sidebar],
        }))}
      />
    </section>
  )
}
