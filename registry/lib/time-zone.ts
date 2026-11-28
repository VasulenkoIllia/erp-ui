/**
 * Чи знає Intl часовий пояс IANA ("Europe/Kyiv"). Окремим файлом: його бере `lib/user-timezone`, що є в кожній
 * сторінці, і йому не треба тягнути за собою весь `lib/dates`.
 */
const knownZones = new Map<string, boolean>()

/** Чи знає Intl часовий пояс IANA ("Europe/Kyiv"); відповідь запам'ятовується. */
export function isTimeZone(zone: string): boolean {
  let known = knownZones.get(zone)
  if (known === undefined) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone })
      known = true
    } catch {
      known = false
    }
    knownZones.set(zone, known)
  }
  return known
}
