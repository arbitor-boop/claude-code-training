# SPEC · NWP-201 — Issue virtual cards from the console

**Ticket:** [NWP-201](../tickets/NWP-201.md)
**Branch:** `NWP-201-issue-cards`
**Author:** aidan.pulaski@teradyne.com
**Status:** reviewed

## Problem

Ops issues virtual cards by messaging the platform team, who create them by hand. It takes hours, it
happens twelve to twenty times a week, and last month two cards went out with the wrong spend limit
because the request lived in a Slack thread. Marcus wants issuing in the console today: issue a card,
see the cards issued, open one to check it.

## Current state

Cards do not exist in this codebase. Everything below is what is already here to build on.

- `src/data/types.ts` — the domain model. `Currency` is already exactly `"USD" | "EUR" | "GBP"`
  (line 1), which is the allowlist the ticket asks for. `Merchant` carries its own `currency` and a
  `riskTier`, but **no category field**.
- `src/data/store.ts` — the in-memory store on `globalThis`, shaped by a `Store` interface holding
  `merchants, payments, refunds, disputes, payouts`. Writes live for the process; that is deliberate.
- `src/data/queries.ts` — the one payment query builder, and the pattern to mirror: `parseFilters`
  allowlists client input per field before anything reaches the store.
- `src/data/merchants.ts` — ten fictional merchants and `merchantById(id)`. Note `mch_04` and `mch_09`
  are GBP and `mch_05`/`mch_06` are EUR, so merchant currency genuinely varies.
- `src/lib/money.ts` — `formatMoney(minorUnits, currency)` and `parseAmountToMinorUnits(input): number | null`,
  which already rejects negatives, symbols and more than two decimal places. It accepts `"0"`, so a
  zero check stays explicit.
- `src/lib/dates.ts` — `formatDate(iso)` for table dates.
- `src/lib/utils.ts` — `cx`, `focusInput`, `focusRing`.
- `src/app/payments/page.tsx` — the server-component page shape to copy: filters from `searchParams`,
  `TableRoot/Table/...` from `src/components/Table.tsx`, and a written empty state at lines 93-104.
- `src/app/api/payments/route.ts` — the thin route-handler shape: parse, validate, delegate, serialize.
- `vitest.config.ts` — `environment: "node"`, `include: ["src/**/*.test.ts"]`. No DOM, so component
  tests are impossible; only pure functions are testable.

**Contradictions with the ticket and rules, stated plainly:**

1. `.claude/rules/components.md` claims `src/components/` "already has Button, Input, Select, **Dialog**,
   Badge". There is no `Dialog.tsx`, no `Checkbox`, no `RadioGroup` and no `Label` component. The ticket
   says "a form **or** dialog", so this builds a plain form and adds no dependency.
2. The ticket wants "spend against the limit", but **nothing links a payment to a card** — `Payment` has
   no card reference. Spend cannot be derived. See Approach.
3. `build-battle/CLAUDE.md` says "No hooks", so nothing blocks a red push; `npm test` is run by hand.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Money is integer minor units. A `$250.00` limit is `25000`." | ticket, `money.md` | Limits drift by rounding; the exact bug Marcus reported |
| "Never persist or display a full card number after creation." | ticket, `cards.md` | A PAN-shaped string leaks into a list payload or the store |
| "Every generated number starts with `4242`" and carries a valid Luhn digit | ticket, `cards.md` | Repo contains something resembling a real PAN |
| `active → frozen → active`; either → `cancelled`; `cancelled` is terminal | ticket, `cards.md` | A cancelled card comes back to life |
| "Validate everything from the client against an allowlist" | `api-routes.md`, ORG-STANDARDS #7 | Client-supplied currency or limit reaches the store |
| Storage and bucketing in UTC | ORG-STANDARDS #4 | `createdAt` is ambiguous across the Berlin and London merchants |

## Approach

Three layers, mirroring how payments already work. `src/lib/cards.ts` holds the pure functions — Luhn
check digit, number generation on the `4242` BIN, masking, the transition guard, and the spend
threshold — so every rule the grader cares about is unit-testable in the existing node environment.
`src/data/cards.ts` is the single card command/query module, playing the role `queries.ts` plays for
payments: it owns validation and is the only thing that writes `store.cards`. Route handlers stay thin.
The full card number is returned by exactly one function, at creation, and is never written to the
store — the `Card` record holds `last4` and an opaque `reference` only.

On spend: because no payment links to a card, `spentMinor` is a field on `Card` initialised to `0`, and
the amber-past-80% threshold is proven by a unit test on `spendState` rather than by seeded data.
**Considered and rejected:** seeding cards with invented spend so the bar looks good in a screenshot —
`CLAUDE.md` calls editing seed data to make a case look different a defect, and it would also hide the
empty state, which is itself a stretch goal.

On currency: the ticket only hints at ops "picking the wrong currency". Since a card is single-merchant
and the merchant settles in one currency, a card currency that disagrees with `merchant.currency` is
rejected server-side with its own message. **Rejected alternative:** silently coercing to the merchant's
currency, which would repeat the wrong-limit class of bug the ticket is about.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/lib/cards.ts` | Add | Pure: `luhnCheckDigit`, `generateCardNumber`, `maskLast4`, `canTransition`, `spendState` |
| `src/lib/cards.test.ts` | Add | Unit tests for Luhn and the transitions — the ticket's cheapest stretch |
| `src/data/types.ts` | Change | Add `CardStatus` and `Card` |
| `src/data/store.ts` | Change | Add `cards: Card[]` to `Store` and `createStore()` |
| `src/data/cards.ts` | Add | Validation, `createCard`, `listCards`, `cardById`, `setCardStatus` |
| `src/app/api/cards/route.ts` | Add | `GET` list, `POST` issue — the only response carrying a full number |
| `src/app/api/cards/[id]/status/route.ts` | Add | `PATCH` status, guarded server-side |
| `src/app/cards/page.tsx` | Add | The list, with a written empty state |
| `src/app/cards/[id]/page.tsx` | Add | Detail: full record and spend against limit |
| `src/app/cards/issue-form.tsx` | Add | Client form plus the one-time reveal panel |
| `src/app/siteConfig.ts` | Change | `baseLinks.cards` |
| `src/components/ui/navigation/AppSidebar.tsx` | Change | Nav entry so `/cards` is reachable |
| `src/components/ui/navigation/Breadcrumbs.tsx` | Change | `LABELS` entry so the crumb reads "Cards" |

## Plan

1. **Types and store** — `CardStatus`, `Card` (with `limitMinor`, `spentMinor`, `last4`, `reference`,
   `createdAt`), and two lines in `store.ts`. *Done when:* `npx tsc --noEmit` is clean.
2. **Pure helpers** — `src/lib/cards.ts`. 16 digits: `4242` + 11 generated + Luhn check digit.
   *Done when:* every generated number is 16 digits, starts `4242`, and passes a Luhn validator.
3. **Tests** — `src/lib/cards.test.ts` covering the check digit against known-good values, the
   `4242` prefix, that generated numbers validate, every legal and illegal transition, and
   `spendState` at 0 / 79 / 80 / 100 / over. *Done when:* `npm test` is green.
4. **Card module** — `src/data/cards.ts`. Validation rejects: missing or unknown merchant, a limit that
   is not a positive integer, a limit above `5_000_000`, a currency outside the allowlist, a currency
   that disagrees with the merchant, and a missing nickname. *Done when:* each rejection is reachable.
5. **Routes** — `GET`/`POST /api/cards` and `PATCH /api/cards/[id]/status`, returning the error shape
   `api-routes.md` requires. *Done when:* a bad POST returns 400 with a safe message and a good one
   returns the number exactly once; a `GET` never contains a full number.
6. **List and nav** — `/cards` plus the three nav touches. *Done when:* the sidebar link works, the
   breadcrumb reads "Cards", and with no cards the written empty state shows.
7. **Issue form and reveal** — the form posts, the success panel shows the full number once, and
   dismissing it clears the number from client state. *Done when:* the card appears in the list masked.
8. **Detail and spend** — full record plus the progress bar. *Done when:* the bar renders and the
   record shows `•••• ` and the last four.
9. **Freeze/unfreeze** — buttons calling `PATCH`, refreshing without a full reload. *Stretch; only if
   the clock allows.*

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Issue a card | Submit the form; the new card appears in the `/cards` list |
| Card list | `/cards` shows nickname, merchant, masked number, limit, status, created date |
| Card detail | Opening a card shows the record and spend against the limit |
| Generated numbers | Unit test: 16 digits, `4242` prefix, Luhn-valid, over many generations |
| Reveal once, mask forever | Success panel shows it once; `GET /api/cards` response contains no full number; the stored record has only `last4` |
| Server-side validation | Curl each of the six rejections and confirm 400 plus a safe message |
| State machine | Unit test on `canTransition`; `PATCH` to an illegal transition returns 400 |
| Minor units | `parseAmountToMinorUnits` at the boundary; `formatMoney` at render; no float in `Card` |

Run `npm test` and `npm run lint`, then exercise `/cards` in the browser.

## Risks

- **Reveal-once leaks** are the easiest way to fail a headline rule. The number must never enter the
  `Card` record, the list payload, or persist in React state after the panel closes.
- **Spend is always zero**, so the progress bar looks untested in the UI. Mitigated by the unit test;
  called out in the PR rather than hidden.
- **`spentMinor` and `limitMinor` share a currency** by construction, so no cross-currency sum arises.

## Out of scope

- Persistence, auth, real card network calls, and editing a limit after issue (NWP-202) — all named
  out of scope by the ticket.
- Merchant category lock: `Merchant` has no category field, so it needs a taxonomy invented from
  nothing. Highest cost of the five stretch goals, lowest value. Deliberately dropped.

## Open questions

- None blocking. The currency-mismatch rejection is a judgement call the ticket only hints at; it is
  documented above and easy to relax to a warning if the reviewer disagrees.
