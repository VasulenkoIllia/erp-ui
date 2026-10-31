# Чужий код і ліцензії

Код erp-ui захищено авторським правом, усі права застережено (`LICENSE`). Частини нижче належать своїм авторам і лишаються під своїми ліцензіями.

## Код, перебудований у кіті

Компоненти в `registry/ui`, де в шапці файла є рядок `erp-ui: основа — shadcn …`, взято з shadcn/ui і змінено. Правки erp-ui позначено в коді.

### shadcn/ui

Джерело: https://github.com/shadcn-ui/ui

```
MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Залежності, які ставить кіт

Ці пакети не лежать у репозиторії: проект отримує їх із npm разом із їхніми ліцензіями. Перелік зроблено за `registry/package.json` станом на 31.10.2026.

| Пакет | Ліцензія |
|---|---|
| `@base-ui/react` | MIT |
| `@fontsource/geist` | OFL-1.1 |
| `@hookform/resolvers` | MIT |
| `@tanstack/react-query` | MIT |
| `@tanstack/react-table` | MIT |
| `@tanstack/react-virtual` | MIT |
| `class-variance-authority` | Apache-2.0 |
| `cn` | MIT |
| `google-libphonenumber` | MIT AND Apache-2.0 |
| `i18next` | MIT |
| `input-otp` | MIT |
| `lean-qr` | MIT |
| `lucide-react` | ISC |
| `ra-core` | MIT |
| `react-day-picker` | MIT |
| `react-hook-form` | MIT |
| `react-i18next` | MIT |
| `react-number-format` | MIT |
| `react-router` | MIT |
| `react-router-dom` | MIT |
| `shadcn` | MIT |
| `sonner` | MIT |
| `tw-animate-css` | MIT |
| `zod` | MIT |

Тільки для розробки й тестів проекту:

| Пакет | Ліцензія |
|---|---|
| `@axe-core/playwright` | MPL-2.0 |
| `@playwright/test` | Apache-2.0 |
| `@types/google-libphonenumber` | MIT |
| `msw` | MIT |
