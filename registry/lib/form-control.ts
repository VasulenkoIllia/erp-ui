/**
 * Пропси, які `FormField` (erp/form-field) дає полю: id, стан помилки, зв'язок із підказкою й помилкою. Окремим
 * файлом без react-hook-form: поле кіта (`FormSelect`) бере тип і не тягне бібліотеку форм (ADR-0099).
 */
export interface FormControlProps {
  id: string
  "aria-invalid"?: true
  "aria-describedby"?: string
  readOnly?: boolean
  disabled?: boolean
}
