import { createCard, listCards } from "@/data/cards"
import { NextRequest, NextResponse } from "next/server"

/**
 * Cards.
 *
 * GET returns records, which carry the last four and never the number.
 * POST is the single moment the full number exists in a response; it is not
 * stored, so it cannot be read back afterwards.
 */

export function GET() {
  return NextResponse.json({ cards: listCards() })
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: "Expected a JSON body." }, { status: 400 })
  }

  const result = createCard((body ?? {}) as Record<string, unknown>)
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 })
  }

  return NextResponse.json(
    { card: result.card, cardNumber: result.cardNumber },
    { status: 201 },
  )
}
