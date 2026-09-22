import { describe, expect, it } from "vitest"
import { CardStatus } from "@/data/types"
import {
  CARD_NUMBER_LENGTH,
  TEST_BIN,
  canTransition,
  generateCardNumber,
  isLuhnValid,
  luhnCheckDigit,
  maskLast4,
  spendState,
} from "./cards"

/**
 * A card number that fails Luhn is a card that never works, and a number that
 * is not on the test BIN is a compliance problem in a training repo. Both are
 * cheap to pin here and expensive to find by clicking.
 */

/** Deterministic stand-in for Math.random, so a generated number is reproducible. */
const sequence = (values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

describe("luhnCheckDigit", () => {
  it("completes the canonical test number", () => {
    // 4242424242424242 is the well-known test card; the final 2 is its check digit.
    expect(luhnCheckDigit("424242424242424")).toBe(2)
  })

  it("produces a digit that makes the finished number valid", () => {
    const payload = "424212345678901"
    const finished = payload + String(luhnCheckDigit(payload))
    expect(isLuhnValid(finished)).toBe(true)
  })

  it("always returns a single digit", () => {
    for (let n = 0; n < 40; n++) {
      const payload = "4242" + String(n).padStart(11, "0")
      const digit = luhnCheckDigit(payload)
      expect(digit).toBeGreaterThanOrEqual(0)
      expect(digit).toBeLessThanOrEqual(9)
    }
  })
})

describe("isLuhnValid", () => {
  it("accepts the canonical test number", () => {
    expect(isLuhnValid("4242424242424242")).toBe(true)
  })

  it("rejects a number with a transposed digit", () => {
    expect(isLuhnValid("4242424242424243")).toBe(false)
  })

  it("rejects anything that is not all digits", () => {
    expect(isLuhnValid("4242-4242-4242-4242")).toBe(false)
  })
})

describe("generateCardNumber", () => {
  it("is 16 digits on the test BIN and passes Luhn", () => {
    const number = generateCardNumber(sequence([0.42]))
    expect(number).toHaveLength(CARD_NUMBER_LENGTH)
    expect(number.startsWith(TEST_BIN)).toBe(true)
    expect(isLuhnValid(number)).toBe(true)
  })

  it("holds for every generator output, not just a lucky one", () => {
    for (let d = 0; d < 10; d++) {
      const number = generateCardNumber(sequence([d / 10]))
      expect(number.startsWith(TEST_BIN)).toBe(true)
      expect(number).toHaveLength(CARD_NUMBER_LENGTH)
      expect(isLuhnValid(number)).toBe(true)
    }
  })

  it("stays on the test BIN with the real random source", () => {
    for (let n = 0; n < 50; n++) {
      const number = generateCardNumber()
      expect(number.startsWith(TEST_BIN)).toBe(true)
      expect(isLuhnValid(number)).toBe(true)
    }
  })
})

describe("canTransition", () => {
  it("allows a card to be frozen and thawed", () => {
    expect(canTransition("active", "frozen")).toBe(true)
    expect(canTransition("frozen", "active")).toBe(true)
  })

  it("allows either live state to be cancelled", () => {
    expect(canTransition("active", "cancelled")).toBe(true)
    expect(canTransition("frozen", "cancelled")).toBe(true)
  })

  it("treats cancelled as terminal", () => {
    const targets: CardStatus[] = ["active", "frozen", "cancelled"]
    for (const to of targets) {
      expect(canTransition("cancelled", to)).toBe(false)
    }
  })

  it("rejects a transition to the state it is already in", () => {
    expect(canTransition("active", "active")).toBe(false)
    expect(canTransition("frozen", "frozen")).toBe(false)
  })
})

describe("spendState", () => {
  it("is normal well under the limit", () => {
    expect(spendState(0, 25000)).toEqual({ percent: 0, tone: "normal" })
    expect(spendState(12500, 25000)).toEqual({ percent: 50, tone: "normal" })
  })

  it("turns amber at exactly 80 percent, not after", () => {
    expect(spendState(19999, 25000).tone).toBe("normal")
    expect(spendState(20000, 25000)).toEqual({ percent: 80, tone: "amber" })
  })

  it("caps the bar at 100 percent when a card is over its limit", () => {
    expect(spendState(50000, 25000)).toEqual({ percent: 100, tone: "amber" })
  })

  it("does not divide by a zero limit", () => {
    expect(spendState(500, 0)).toEqual({ percent: 0, tone: "normal" })
  })
})

describe("maskLast4", () => {
  it("is the only shape a card number takes after creation", () => {
    expect(maskLast4("4242")).toBe("•••• 4242")
  })
})
