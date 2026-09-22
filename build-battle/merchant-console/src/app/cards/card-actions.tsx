"use client"

import { Button } from "@/components/Button"
import { CardStatus } from "@/data/types"
import { useRouter } from "next/navigation"
import * as React from "react"

/**
 * Freeze, thaw and cancel. The server owns the state machine; these buttons
 * only offer the transitions it would accept, and refresh in place rather
 * than reloading the page.
 */
export function CardActions({
  cardId,
  status,
}: {
  cardId: string
  status: CardStatus
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState<CardStatus | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function move(to: CardStatus) {
    setPending(to)
    setError(null)
    try {
      const response = await fetch(`/api/cards/${cardId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: to }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        setError(payload?.message ?? "Could not change the card's status.")
        return
      }
      router.refresh()
    } catch {
      setError("Could not reach the server. Try again.")
    } finally {
      setPending(null)
    }
  }

  if (status === "cancelled") {
    return (
      <p className="text-sm text-gray-500">
        This card is cancelled. Nothing comes back from that.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {status === "active" ? (
          <Button
            variant="secondary"
            className="py-1.5"
            isLoading={pending === "frozen"}
            loadingText="Freezing..."
            onClick={() => move("frozen")}
          >
            Freeze
          </Button>
        ) : (
          <Button
            variant="secondary"
            className="py-1.5"
            isLoading={pending === "active"}
            loadingText="Unfreezing..."
            onClick={() => move("active")}
          >
            Unfreeze
          </Button>
        )}
        <Button
          variant="destructive"
          className="py-1.5"
          isLoading={pending === "cancelled"}
          loadingText="Cancelling..."
          onClick={() => move("cancelled")}
        >
          Cancel card
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-500">
          {error}
        </p>
      )}
    </div>
  )
}
