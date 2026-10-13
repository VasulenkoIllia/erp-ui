"use client"

import type * as React from "react"

import { useHasPermission, useMe } from "@/registry/hooks/use-me"

/**
 * Показати вміст лише тим, кому дозволено (ADR-0003, ADR-0014): кнопки, розділи, пункти меню.
 * Це косметика інтерфейсу — сервер однаково перевіряє права (SPEC §17).
 *
 *   <PermissionGate resource="invoices" action="delete">
 *     <Button variant="destructive">Видалити</Button>
 *   </PermissionGate>
 *
 * `fallback` — що показати без права (за замовчуванням нічого); поки профіль вантажиться —
 * `loading` (за замовчуванням теж нічого, щоб кнопки не блимали).
 */
export function PermissionGate({
  resource,
  action,
  children,
  fallback = null,
  loading = null,
}: {
  resource: string
  action: string
  children: React.ReactNode
  fallback?: React.ReactNode
  loading?: React.ReactNode
}) {
  const { isPending } = useMe()
  const allowed = useHasPermission(resource, action)
  if (isPending) return <>{loading}</>
  return <>{allowed ? children : fallback}</>
}
