import { beforeEach, describe, expect, it } from "vitest"
import { isLuhnValid } from "@/lib/cards"
import {
  MAX_LIMIT_MINOR,
  cardById,
  createCard,
  listCards,
  setCardStatus,
  validateIssue,
} from "./cards"
import { store } from "./store"

/**
 * Issuing is where a wrong limit becomes a real card, which is the mistake
 * this ticket exists to stop. These pin the rejections so they cannot quietly
 * regress into a 201.
 */

const valid = {
  nickname: "Ad spend",
  merchantId: "mch_01", // Lumen Coffee Roasters, USD
  limit: "250.00",
  currency: "USD",
}

beforeEach(() => {
  store.cards.length = 0
})

describe("validateIssue", () => {
  it("accepts a well-formed request and converts the limit once", () => {
    const result = validateIssue(valid)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.limitMinor).toBe(25000)
      expect(Number.isInteger(result.value.limitMinor)).toBe(true)
    }
  })

  it("rejects a missing merchant", () => {
    expect(validateIssue({ ...valid, merchantId: undefined }).ok).toBe(false)
  })

  it("rejects a merchant that does not exist", () => {
    expect(validateIssue({ ...valid, merchantId: "mch_99" }).ok).toBe(false)
  })

  it("rejects a zero or negative limit", () => {
    expect(validateIssue({ ...valid, limit: "0" }).ok).toBe(false)
    expect(validateIssue({ ...valid, limit: "-5" }).ok).toBe(false)
  })

  it("rejects a limit above the ceiling but allows the ceiling itself", () => {
    // 5,000,000 minor units is $50,000.00.
    expect(validateIssue({ ...valid, limit: "50000" }).ok).toBe(true)
    expect(validateIssue({ ...valid, limit: "50000.01" }).ok).toBe(false)
    expect(MAX_LIMIT_MINOR).toBe(5_000_000)
  })

  it("rejects a currency outside USD, EUR and GBP", () => {
    expect(validateIssue({ ...valid, currency: "JPY" }).ok).toBe(false)
    expect(validateIssue({ ...valid, currency: "" }).ok).toBe(false)
  })

  it("rejects a currency the merchant does not settle in", () => {
    // mch_04 is Halcyon Studio, GBP.
    const result = validateIssue({ ...valid, merchantId: "mch_04", currency: "USD" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain("GBP")
  })

  it("rejects a blank nickname", () => {
    expect(validateIssue({ ...valid, nickname: "   " }).ok).toBe(false)
  })

  it("rejects a limit that is not a number", () => {
    expect(validateIssue({ ...valid, limit: "two hundred" }).ok).toBe(false)
    expect(validateIssue({ ...valid, limit: "$250" }).ok).toBe(false)
  })
})

describe("createCard", () => {
  it("returns the full number once and never stores it", () => {
    const result = createCard(valid)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.cardNumber).toHaveLength(16)
    expect(result.cardNumber.startsWith("4242")).toBe(true)
    expect(isLuhnValid(result.cardNumber)).toBe(true)

    // The record keeps the last four and nothing else from the number.
    expect(result.card.last4).toBe(result.cardNumber.slice(-4))
    expect(JSON.stringify(result.card)).not.toContain(result.cardNumber)
    expect(JSON.stringify(store.cards)).not.toContain(result.cardNumber)
  })

  it("starts a card active with no spend", () => {
    const result = createCard(valid)
    if (!result.ok) throw new Error("expected the card to be issued")
    expect(result.card.status).toBe("active")
    expect(result.card.spentMinor).toBe(0)
  })

  it("does not write anything when validation fails", () => {
    createCard({ ...valid, limit: "0" })
    expect(store.cards).toHaveLength(0)
  })

  it("stamps createdAt in UTC", () => {
    const result = createCard(valid, new Date("2026-08-13T23:30:00.000Z"))
    if (!result.ok) throw new Error("expected the card to be issued")
    expect(result.card.createdAt).toBe("2026-08-13T23:30:00.000Z")
  })

  it("lists the newest card first", () => {
    createCard({ ...valid, nickname: "older" }, new Date("2026-08-01T00:00:00.000Z"))
    createCard({ ...valid, nickname: "newer" }, new Date("2026-08-02T00:00:00.000Z"))
    expect(listCards().map((c) => c.nickname)).toEqual(["newer", "older"])
  })
})

describe("idempotency", () => {
  it("issues one card when the same key arrives twice", () => {
    const input = { ...valid, idempotencyKey: "key-abc" }
    const first = createCard(input)
    const second = createCard(input)

    expect(first.ok && second.ok).toBe(true)
    expect(store.cards).toHaveLength(1)
    if (first.ok && second.ok) {
      expect(second.card.id).toBe(first.card.id)
      expect(second.replayed).toBe(true)
      // The number was revealed once. A replay does not get to see it again.
      expect(second.cardNumber).toBe("")
    }
  })

  it("issues separate cards for separate keys", () => {
    createCard({ ...valid, idempotencyKey: "key-1" })
    createCard({ ...valid, idempotencyKey: "key-2" })
    expect(store.cards).toHaveLength(2)
  })

  it("still issues when no key is supplied", () => {
    createCard(valid)
    createCard(valid)
    expect(store.cards).toHaveLength(2)
  })
})

describe("history", () => {
  it("opens with the issuing event", () => {
    const result = createCard(valid, new Date("2026-08-13T10:00:00.000Z"))
    if (!result.ok) throw new Error("expected the card to be issued")
    expect(result.card.history).toEqual([
      { at: "2026-08-13T10:00:00.000Z", from: null, to: "active" },
    ])
  })

  it("records every transition in order, oldest first", () => {
    const result = createCard(valid, new Date("2026-08-13T10:00:00.000Z"))
    if (!result.ok) throw new Error("expected the card to be issued")
    const id = result.card.id

    setCardStatus(id, "frozen", new Date("2026-08-14T09:00:00.000Z"))
    setCardStatus(id, "active", new Date("2026-08-15T09:00:00.000Z"))
    setCardStatus(id, "cancelled", new Date("2026-08-16T09:00:00.000Z"))

    expect(cardById(id)?.history).toEqual([
      { at: "2026-08-13T10:00:00.000Z", from: null, to: "active" },
      { at: "2026-08-14T09:00:00.000Z", from: "active", to: "frozen" },
      { at: "2026-08-15T09:00:00.000Z", from: "frozen", to: "active" },
      { at: "2026-08-16T09:00:00.000Z", from: "active", to: "cancelled" },
    ])
  })

  it("does not record a transition the server refused", () => {
    const result = createCard(valid)
    if (!result.ok) throw new Error("expected the card to be issued")
    const id = result.card.id

    setCardStatus(id, "cancelled")
    const before = cardById(id)!.history.length
    setCardStatus(id, "active")
    expect(cardById(id)?.history).toHaveLength(before)
  })
})

describe("setCardStatus", () => {
  const issue = () => {
    const result = createCard(valid)
    if (!result.ok) throw new Error("expected the card to be issued")
    return result.card.id
  }

  it("moves a card through freeze and back", () => {
    const id = issue()
    expect(setCardStatus(id, "frozen").ok).toBe(true)
    expect(cardById(id)?.status).toBe("frozen")
    expect(setCardStatus(id, "active").ok).toBe(true)
    expect(cardById(id)?.status).toBe("active")
  })

  it("keeps a cancelled card cancelled", () => {
    const id = issue()
    expect(setCardStatus(id, "cancelled").ok).toBe(true)
    expect(setCardStatus(id, "active").ok).toBe(false)
    expect(setCardStatus(id, "frozen").ok).toBe(false)
    expect(cardById(id)?.status).toBe("cancelled")
  })

  it("reports a card that does not exist separately from a bad transition", () => {
    const missing = setCardStatus("card_999999", "frozen")
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.notFound).toBe(true)
  })
})
