/** Рядки web push (PF19, ADR-0046) англійською — ті самі ключі, що в `i18n-uk-push.ts`. */
import type { ukPush } from "@/registry/lib/i18n-uk-push"

export const enPush: typeof ukPush = {
  push: {
    title: "Push on this device",
    off: "Notifications will appear on this device even when the app is closed.",
    on: "On. Notifications will appear on this device even when the app is closed.",
    denied:
      "The browser blocked notifications for this site. Allow them in the site settings of your browser.",
    unsupported:
      "This browser can't show push notifications. On iPhone and iPad they only work in an app added to the Home Screen.",
    enable: "Turn on for this device",
    disable: "Turn off for this device",
    test: "Send a test",
    testSent: "Test sent. If no notification appears, check Do Not Disturb.",
    failed: "The browser couldn't do this. Please try again.",
    notGranted:
      "The browser didn't get permission. Try again or allow notifications in the site settings.",
    impersonated:
      "While you act as another person, push on this device doesn't change.",
  },
}
