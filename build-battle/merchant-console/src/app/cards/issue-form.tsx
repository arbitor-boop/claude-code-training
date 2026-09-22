"use client"

import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Currency } from "@/data/types"
import { maskLast4 } from "@/lib/cards"
import { cx, focusInput } from "@/lib/utils"
import { useRouter } from "next/navigation"
import * as React from "react"

const CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP"]

interface MerchantOption {
  id: string
  name: string
  currency: Currency
}

/**
 * Issuing a card.
 *
 * The full number lives in this component's state for exactly as long as the
 * success panel is on screen, and is cleared when it closes. It is never
 * refetched, because the server does not keep it.
 */
export function IssueCardForm({ merchants }: { merchants: MerchantOption[] }) {
  const router = useRouter()
  const [nickname, setNickname] = React.useState("")
  const [merchantId, setMerchantId] = React.useState("")
  const [limit, setLimit] = React.useState("")
  const [currency, setCurrency] = React.useState<Currency>("USD")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [issued, setIssued] = React.useState<{
    nickname: string
    cardNumber: string
    last4: string
  } | null>(null)

  const selected = merchants.find((m) => m.id === merchantId)

  // The merchant settles in one currency, so follow it rather than let ops
  // discover the mismatch from a server error.
  const onMerchantChange = (id: string) => {
    setMerchantId(id)
    const merchant = merchants.find((m) => m.id === id)
    if (merchant) setCurrency(merchant.currency)
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)

    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname, merchantId, limit, currency }),
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload?.message ?? "Could not issue the card.")
        return
      }

      setIssued({
        nickname: payload.card.nickname,
        cardNumber: payload.cardNumber,
        last4: payload.card.last4,
      })
      setNickname("")
      setMerchantId("")
      setLimit("")
      setCurrency("USD")
      router.refresh()
    } catch {
      setError("Could not reach the server. Try again.")
    } finally {
      setPending(false)
    }
  }

  if (issued) {
    return (
      <div
        className="rounded-md border border-emerald-500/30 bg-emerald-50 p-4 dark:bg-emerald-950/30"
        role="status"
      >
        <p className="font-medium text-gray-900 dark:text-gray-50">
          {issued.nickname} is live
        </p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          This is the only time the full number is shown. Copy it now — after
          this it is {maskLast4(issued.last4)} everywhere.
        </p>
        <p className="mt-3 font-mono text-lg tracking-wider text-gray-900 tabular-nums dark:text-gray-50">
          {issued.cardNumber}
        </p>
        <Button
          variant="secondary"
          className="mt-4 py-1.5"
          onClick={() => setIssued(null)}
        >
          Done
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset className="space-y-4" disabled={pending}>
        <legend className="sr-only">Issue a virtual card</legend>

        <div>
          <label
            htmlFor="card-nickname"
            className="block text-sm font-medium text-gray-900 dark:text-gray-50"
          >
            Nickname
          </label>
          <Input
            id="card-nickname"
            name="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Ad spend — Q4"
            className="mt-1.5"
          />
        </div>

        <div>
          <label
            htmlFor="card-merchant"
            className="block text-sm font-medium text-gray-900 dark:text-gray-50"
          >
            Merchant
          </label>
          <select
            id="card-merchant"
            name="merchantId"
            value={merchantId}
            onChange={(e) => onMerchantChange(e.target.value)}
            className={cx(
              "mt-1.5 w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50",
              focusInput,
            )}
          >
            <option value="">Choose a merchant</option>
            {merchants.map((merchant) => (
              <option key={merchant.id} value={merchant.id}>
                {merchant.name} ({merchant.currency})
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label
              htmlFor="card-limit"
              className="block text-sm font-medium text-gray-900 dark:text-gray-50"
            >
              Spend limit
            </label>
            <Input
              id="card-limit"
              name="limit"
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="250.00"
              className="mt-1.5"
            />
          </div>

          <div className="w-32">
            <label
              htmlFor="card-currency"
              className="block text-sm font-medium text-gray-900 dark:text-gray-50"
            >
              Currency
            </label>
            <select
              id="card-currency"
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className={cx(
                "mt-1.5 w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50",
                focusInput,
              )}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selected && currency !== selected.currency && (
          <p className="text-sm text-amber-600 dark:text-amber-500">
            {selected.name} settles in {selected.currency}. The server will
            reject a card issued in {currency}.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-500">
            {error}
          </p>
        )}

        <Button type="submit" isLoading={pending} loadingText="Issuing...">
          Issue card
        </Button>
      </fieldset>
    </form>
  )
}
