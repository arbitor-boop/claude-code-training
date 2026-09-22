import { setCardStatus } from "@/data/cards"
import { CARD_STATUSES } from "@/lib/cards"
import { CardStatus } from "@/data/types"
import { NextRequest, NextResponse } from "next/server"

/**
 * Moves a card through its state machine. The transition is checked on the
 * server; the buttons in the UI are a convenience, never the enforcement.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: "Expected a JSON body." }, { status: 400 })
  }

  const status = (body as { status?: unknown })?.status
  if (typeof status !== "string" || !CARD_STATUSES.includes(status as CardStatus)) {
    return NextResponse.json(
      { message: "Status must be active, frozen, or cancelled." },
      { status: 400 },
    )
  }

  const result = setCardStatus(id, status as CardStatus)
  if (!result.ok) {
    return NextResponse.json(
      { message: result.message },
      { status: result.notFound ? 404 : 400 },
    )
  }

  return NextResponse.json({ card: result.card })
}
