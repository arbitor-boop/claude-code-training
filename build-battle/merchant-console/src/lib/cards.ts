import { CardStatus } from "@/data/types"

/**
 * Virtual card primitives. Everything here is pure so the rules the reviewer
 * cares about — the test BIN, the check digit, the state machine — are
 * provable without a browser.
 *
 * Nothing in this repository may resemble a real PAN, so generation is pinned
 * to the 4242 test BIN.
 */

export const TEST_BIN = "4242"
export const CARD_NUMBER_LENGTH = 16

export const CARD_STATUSES = ["active", "frozen", "cancelled"] as const

/** active <-> frozen, either to cancelled, and cancelled is terminal. */
const TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  active: ["frozen", "cancelled"],
  frozen: ["active", "cancelled"],
  cancelled: [],
}

export function canTransition(from: CardStatus, to: CardStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/**
 * The Luhn check digit for a payload that the digit will be appended to.
 * The rightmost payload digit is doubled, because in the finished number it
 * sits second from the right.
 */
export function luhnCheckDigit(payload: string): number {
  let sum = 0
  let double = true

  for (let i = payload.length - 1; i >= 0; i--) {
    let digit = payload.charCodeAt(i) - 48
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    double = !double
    sum += digit
  }

  return (10 - (sum % 10)) % 10
}

/** Whether a complete number, check digit included, satisfies Luhn. */
export function isLuhnValid(cardNumber: string): boolean {
  if (!/^\d+$/.test(cardNumber)) return false

  let sum = 0
  let double = false

  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = cardNumber.charCodeAt(i) - 48
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    double = !double
    sum += digit
  }

  return sum % 10 === 0
}

/**
 * A 16-digit number on the test BIN with a valid check digit.
 * The generator is injectable so tests can pin the output.
 */
export function generateCardNumber(rand: () => number = Math.random): string {
  const bodyLength = CARD_NUMBER_LENGTH - TEST_BIN.length - 1
  let payload = TEST_BIN

  for (let i = 0; i < bodyLength; i++) {
    payload += String(Math.floor(rand() * 10))
  }

  return payload + String(luhnCheckDigit(payload))
}

/** The only representation of a card number allowed outside creation. */
export function maskLast4(last4: string): string {
  return `•••• ${last4}`
}

export interface SpendState {
  /** Whole percent of the limit consumed, capped at 100 for display. */
  percent: number
  tone: "normal" | "amber"
}

/** Spend against a limit. Amber once the card is 80% consumed. */
export function spendState(
  spentMinor: number,
  limitMinor: number,
): SpendState {
  if (limitMinor <= 0) return { percent: 0, tone: "normal" }

  const percent = Math.min(100, Math.floor((spentMinor / limitMinor) * 100))
  return { percent, tone: percent >= 80 ? "amber" : "normal" }
}
