import { canTransition, generateCardNumber } from "@/lib/cards"
import { parseAmountToMinorUnits } from "@/lib/money"
import { merchantById } from "./merchants"
import { store } from "./store"
import { Card, CardStatus, Currency } from "./types"

/**
 * The one card module. Every read and write of store.cards goes through here,
 * the way payment filtering goes through queries.ts. Validation lives here too,
 * so a route handler cannot forget it.
 */

/** Ceiling from the ticket: nothing above 5,000,000 minor units. */
export const MAX_LIMIT_MINOR = 5_000_000

const CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP"]

const NICKNAME_MAX = 60

export interface IssueCardInput {
  nickname?: unknown
  merchantId?: unknown
  /** The limit as the client typed it, e.g. "250" or "250.00". Converted here, once. */
  limit?: unknown
  currency?: unknown
  /** Optional replay guard, so a double-click issues one card rather than two. */
  idempotencyKey?: unknown
}

interface ValidIssue {
  nickname: string
  merchantId: string
  limitMinor: number
  currency: Currency
}

export type Validated =
  | { ok: true; value: ValidIssue }
  | { ok: false; message: string }

/**
 * Everything arriving from the client is checked against an allowlist before it
 * reaches the store. Reject early and return; the message is safe to show a user.
 */
export function validateIssue(input: IssueCardInput): Validated {
  const nickname = typeof input.nickname === "string" ? input.nickname.trim() : ""
  if (!nickname) {
    return { ok: false, message: "Give the card a nickname." }
  }
  if (nickname.length > NICKNAME_MAX) {
    return { ok: false, message: `Keep the nickname under ${NICKNAME_MAX} characters.` }
  }

  if (typeof input.merchantId !== "string" || !input.merchantId) {
    return { ok: false, message: "Choose a merchant." }
  }
  const merchant = merchantById(input.merchantId)
  if (!merchant) {
    return { ok: false, message: "That merchant does not exist." }
  }

  if (typeof input.currency !== "string" || !CURRENCIES.includes(input.currency as Currency)) {
    return { ok: false, message: "Choose a currency of USD, EUR, or GBP." }
  }
  const currency = input.currency as Currency

  // A card is single-merchant, and the merchant settles in one currency. Issuing
  // across that line is the wrong-limit class of mistake this ticket exists to stop.
  if (currency !== merchant.currency) {
    return {
      ok: false,
      message: `${merchant.name} settles in ${merchant.currency}. Issue the card in ${merchant.currency}.`,
    }
  }

  if (typeof input.limit !== "string" || !input.limit.trim()) {
    return { ok: false, message: "Set a spend limit." }
  }
  const limitMinor = parseAmountToMinorUnits(input.limit)
  if (limitMinor === null) {
    return { ok: false, message: "Enter the limit as a number, like 250 or 250.00." }
  }
  if (limitMinor <= 0) {
    return { ok: false, message: "The spend limit must be greater than zero." }
  }
  if (limitMinor > MAX_LIMIT_MINOR) {
    return { ok: false, message: "The spend limit cannot exceed 5,000,000 minor units." }
  }

  return { ok: true, value: { nickname, merchantId: merchant.id, limitMinor, currency } }
}

export type IssueResult =
  | { ok: true; card: Card; cardNumber: string; replayed?: true }
  | { ok: false; message: string }

const pad = (n: number, width = 6) => String(n).padStart(width, "0")

/**
 * Issues a card. This is the ONLY place a full card number exists, and it is
 * returned rather than stored — the record keeps the last four and a reference.
 */
export function createCard(input: IssueCardInput, now = new Date()): IssueResult {
  const key =
    typeof input.idempotencyKey === "string" && input.idempotencyKey.trim()
      ? input.idempotencyKey.trim()
      : undefined

  // Ops double-clicking Issue must not produce two cards. The replay returns
  // the original record, and deliberately not its number: that was revealed
  // once already and is not recoverable.
  if (key) {
    const existing = store.cards.find((card) => card.idempotencyKey === key)
    if (existing) {
      return { ok: true, card: existing, cardNumber: "", replayed: true }
    }
  }

  const validated = validateIssue(input)
  if (!validated.ok) return validated

  const { nickname, merchantId, limitMinor, currency } = validated.value
  const cardNumber = generateCardNumber()
  const seq = store.cards.length + 1
  const createdAt = now.toISOString()

  const card: Card = {
    id: `card_${pad(seq)}`,
    nickname,
    merchantId,
    limitMinor,
    spentMinor: 0,
    currency,
    status: "active",
    last4: cardNumber.slice(-4),
    reference: `cref_${pad(seq)}`,
    createdAt,
    history: [{ at: createdAt, from: null, to: "active" }],
    idempotencyKey: key,
  }

  store.cards.push(card)
  return { ok: true, card, cardNumber }
}

/** Newest first, so the card just issued is at the top of the list. */
export function listCards(): Card[] {
  return [...store.cards].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function cardById(id: string): Card | null {
  return store.cards.find((card) => card.id === id) ?? null
}

export type StatusResult =
  | { ok: true; card: Card }
  | { ok: false; message: string; notFound?: boolean }

/**
 * The state machine guard. It lives here rather than in the UI, because the UI
 * is not the enforcement.
 */
export function setCardStatus(
  id: string,
  to: CardStatus,
  now = new Date(),
): StatusResult {
  const card = cardById(id)
  if (!card) return { ok: false, message: "No such card.", notFound: true }

  if (!canTransition(card.status, to)) {
    return {
      ok: false,
      message:
        card.status === "cancelled"
          ? "A cancelled card is cancelled for good."
          : `A ${card.status} card cannot become ${to}.`,
    }
  }

  card.history.push({ at: now.toISOString(), from: card.status, to })
  card.status = to
  return { ok: true, card }
}
