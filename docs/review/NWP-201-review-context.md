# Review Context Pack — NWP-201 · Issue virtual cards

> **Purpose.** One file that makes any reviewing agent productive in a single read, with no
> repository exploration. Hand this to N reviewers in parallel and their findings will be
> comparable, because they share the same facts, the same vocabulary and the same output contract.
>
> **Snapshot:** commit `d39195d` on branch `NWP-201-issue-cards`, plus uncommitted work in flight.
> **Volatile.** A second session is editing this branch concurrently. Re-run §7 before trusting
> any count or status in §3.

---

## 1. How to use this pack

1. Read §2–§5. That is the whole brief.
2. Run §7 to refresh the volatile facts.
3. Review only your assigned dimension (§6). Do not review the others; overlap wastes budget
   and produces duplicate findings that then have to be merged by hand.
4. Return findings in the §8 contract. Nothing else.
5. **Do not edit any file.** Review is read-only. A second session is writing to this branch and
   your edit will collide with theirs.

---

## 2. What is being reviewed

Ops issues virtual cards by messaging the platform team, who create them by hand. It takes hours,
happens twelve to twenty times a week, and last month two cards went out with the wrong spend
limit. NWP-201 puts issuing in the console.

This is a **timed, scored competition submission**. It is graded by an automated reviewer against a
published rubric, so a finding is only worth raising if it moves a rubric line or is a genuine
defect. "I would have written it differently" is not a finding.

Ticket: `docs/tickets/NWP-201.md` · Spec: `docs/specs/NWP-201-issue-cards.md` ·
PR: [#210](https://github.com/JJFromTenex/claude-code-training/pull/210)

### The rubric, with weights

| Weight | Category | What it checks |
| --- | --- | --- |
| 40% | Core criteria | The six things the ticket says must work |
| 20% | Correctness rules | Minor units, Luhn on the test BIN, reveal-once masking, the state machine, server-side validation |
| 15% | Code quality | Conventions followed, no second implementations, no new bugs |
| 10% | Context and planning | Is there a spec, does it cite real files, does the code match it |
| 10% | PR description | What was built, what was met, how it was verified |
| 5% | Stretch goals | Freeze/unfreeze, spend progress, category lock, tests, real empty and error states |

Ties break toward: tests → keyboard and screen-reader behaviour → smaller diff.

### The six core criteria, verbatim

1. **Issue a card.** A form or dialog takes a nickname, the merchant, a spend limit, and a currency. Submitting creates the card and it appears in the list.
2. **Card list.** A `/cards` route showing every issued card: nickname, merchant, masked number, spend limit, status, and created date.
3. **Card detail.** Opening a card shows its full record and its spend against the limit.
4. **Generated card numbers.** Numbers are generated server-side on the `4242` test BIN and carry a valid Luhn check digit.
5. **Reveal once, mask forever.** The full number is shown exactly once, on the success screen right after creation. Everywhere else it is `•••• 4242`.
6. **Server-side validation.** Reject a missing merchant, a zero or negative limit, a limit above 5,000,000 minor units, and any currency outside `USD`, `EUR`, `GBP`.

### Hard rules — violating one costs the 20% block

| Rule | Source |
| --- | --- |
| Money is integer minor units; `$250.00` is `25000`; format once at the edge | ticket, `.claude/rules/money.md`, ORG-STANDARDS #1–2 |
| Never persist or display a full card number after creation; store last four + a reference | ticket, `.claude/rules/cards.md`, ORG-STANDARDS #8 |
| Every generated number starts `4242` and carries a valid Luhn digit | ticket, `.claude/rules/cards.md` |
| `active ⇄ frozen`, either → `cancelled`, `cancelled` terminal; guard on the server | ticket, `.claude/rules/cards.md` |
| Validate all client input against an allowlist server-side | `.claude/rules/api-routes.md`, ORG-STANDARDS #7 |
| Store and bucket in UTC; convert only at display | ORG-STANDARDS #4–5 |
| Tailwind only — no inline `style`, no CSS modules | `.claude/rules/components.md` |
| Reuse before rebuilding; a second implementation is a defect | ORG-STANDARDS #6, #9 |

### Explicitly out of scope — building these loses points

Persistence (no database, ORM or migrations — that is NWP-203), authentication, real card network
calls, editing a limit after issue (NWP-202).

---

## 3. What exists now

**Committed** (3 commits: `c9c1677` server, `631471d` UI, `d39195d` tests).
**Uncommitted, from the parallel session:** idempotency keys, a `history` audit trail, a friendly
not-found state, focus management, timezone-aware history display.

### Module map — the only files that matter

| File | Role |
| --- | --- |
| `src/lib/cards.ts` | **Pure.** `luhnCheckDigit`, `isLuhnValid`, `generateCardNumber(rand?)`, `maskLast4`, `canTransition`, `spendState`. Injectable RNG so output is testable. |
| `src/lib/cards.test.ts` | Luhn, the `4242` BIN, every transition, the 80% threshold |
| `src/data/cards.ts` | **The one card module.** `validateIssue`, `createCard`, `listCards`, `cardById`, `setCardStatus`. Only writer of `store.cards`. |
| `src/data/cards.test.ts` | Validation branches, idempotency, history, transitions |
| `src/data/types.ts` | `CardStatus`, `CardEvent`, `Card` |
| `src/data/store.ts` | `cards: Card[]` added to the in-memory `Store` |
| `src/app/api/cards/route.ts` | `GET` list, `POST` issue — the only response carrying a full number |
| `src/app/api/cards/[id]/status/route.ts` | `PATCH` status, server-guarded |
| `src/app/cards/page.tsx` | List + written empty state |
| `src/app/cards/[id]/page.tsx` | Detail, spend bar, history, not-found state |
| `src/app/cards/issue-form.tsx` | Client form + one-time reveal panel |
| `src/app/cards/card-actions.tsx` | Freeze / unfreeze / cancel, refresh in place |

Nav is wired in three places: `src/app/siteConfig.ts`, `src/components/ui/navigation/AppSidebar.tsx`,
`src/components/ui/navigation/Breadcrumbs.tsx`.

### Reused rather than rebuilt — flag any duplicate of these

`parseAmountToMinorUnits` and `formatMoney` (`src/lib/money.ts`) · `formatDate`, `formatInZone`
(`src/lib/dates.ts`) · `cx`, `focusInput` (`src/lib/utils.ts`) · `Button`, `Input`, `Table`, `Badge`
(`src/components/`) · `StatusBadge` (extended, not duplicated) · `merchants`, `merchantById`
(`src/data/merchants.ts`) · the existing `Currency` union, which is already exactly `USD|EUR|GBP`.

### Environment facts that trip people up

- **There is no `Dialog` component.** `.claude/rules/components.md` claims one exists; it does not.
  The nearest thing is `Drawer.tsx`. The ticket permits "a form **or** dialog", so a plain form is used.
- **There is no pre-push hook.** The brief claims one blocks a red suite. `.git/hooks` holds only
  `.sample` files, there is no `.husky`, `core.hooksPath` is unset. Tests are run by hand.
- **`vitest.config.ts`** is `environment: "node"`, `include: ["src/**/*.test.ts"]`. No DOM, so
  component tests are impossible. Only pure functions and modules are testable.
- **Merchants carry their own currency.** `mch_04`/`mch_09` are GBP, `mch_05`/`mch_06` are EUR.
- **Nothing links a payment to a card**, so `spentMinor` is structurally always `0`.

---

## 4. Judgement calls already made — engage these, do not rediscover them

A reviewer may argue any of these is wrong, but must engage the stated reasoning rather than
raise it as a fresh discovery.

| Decision | Reasoning |
| --- | --- |
| A card whose currency disagrees with its merchant's is **rejected**, not coerced | A card is single-merchant and the merchant settles in one currency. Silent coercion repeats the wrong-limit class of bug the ticket exists to stop. The ticket hints at ops who "pick the wrong currency". |
| `spentMinor` is always `0`; the amber threshold is proven by unit test, not seed data | No payment links to a card. Seeding invented spend would make the screenshot better and the data worse, and editing seed data is a scored defect. |
| `spendState` divides `spentMinor / limitMinor` | Both are integer minor units in the same currency; the result is a display percentage, never stored, never used as money. A ratio, not an amount. |
| The spend bar uses 21 literal `w-[n%]` Tailwind classes at 5% granularity | `components.md` bans inline `style`, and Tailwind cannot see a computed class name. Exact figure is printed alongside and exposed as `aria-valuenow`. |
| **Merchant category lock was cut** | `Merchant` has no category field, so it needs a taxonomy invented from nothing — the most expensive of five stretch goals for 1 point, and the least grounded in the data. |
| A replayed idempotency key returns `200` with the card and **no** number | The number was revealed once on the original request and is not recoverable. |
| Card statuses were added to the existing `StatusBadge` | It already spanned three status unions. A second badge would be a duplicate implementation. |

---

## 5. Where the points actually are

Scored so far: all six core criteria met and verified, four of five stretch goals.
**The remaining upside is small and specific.** Prioritise findings that:

- **Break a hard rule in §2.** Highest value — each is worth ~4 points and they are binary.
- **Are a real defect** a grader would find: an unhandled input, a race, a leak path, a wrong boundary.
- **Cost a tie-break:** a missing test on new behaviour, a keyboard or screen-reader failure.
- **Are a second implementation** of something in §3.

Explicitly **low value**, do not spend budget here: stylistic preferences, naming, file
organisation, added abstraction, anything in the out-of-scope list, and re-arguing §4.

---

## 6. Review dimensions — take exactly one

| Dimension | Scope |
| --- | --- |
| `rules` | The eight hard rules in §2. Trace each to the code that satisfies or violates it. |
| `leaks` | Every path the full card number could escape: creation response, list, detail, the stored record, client state after dismiss, history, logs, error messages. |
| `validation` | `validateIssue` and both routes. Boundaries, type confusion, unicode/whitespace, missing branches, malformed bodies, and whether the client can reach the store unvalidated. |
| `state` | The status machine and `history` under concurrency and replay. Idempotency correctness, including whether a replayed key can bypass validation or resurrect a cancelled card. |
| `coverage` | New behaviour with no test. Especially the parallel session's idempotency and history work, and anything only proven by hand. |
| `a11y` | Labels, focus movement on reveal and dismiss, `role`/`aria` correctness, keyboard operation of the form and the status buttons. Tie-break #2. |

---

## 7. Re-verify before trusting §3

```bash
cd build-battle/merchant-console
git -C ../.. log --oneline main..HEAD && git -C ../.. status --short
npx tsc --noEmit && npm run lint && npm test
```

Last run at snapshot: `tsc` clean, `lint` clean, **63 tests across 5 files passing** — though the
parallel session has since added tests, so expect a higher count.

---

## 8. Findings contract

Return **only** this shape. One object per finding, most severe first. Empty array is a valid and
useful answer.

```json
{
  "dimension": "rules | leaks | validation | state | coverage | a11y",
  "findings": [
    {
      "title": "short imperative claim",
      "file": "path/from/repo/root.ts",
      "line": 42,
      "severity": "blocker | high | medium | low",
      "rubricLine": "which rubric row or hard rule this moves, or 'none'",
      "failureScenario": "concrete inputs or steps -> the wrong result. Not a description of the code.",
      "fix": "the smallest change that resolves it",
      "confidence": "certain | likely | speculative"
    }
  ]
}
```

Rules for a finding:

- **A failure scenario is mandatory.** If you cannot state inputs that produce a wrong result, it is
  not a finding. This single rule is what keeps parallel reviewers from returning style opinions.
- **Cite `file:line`.** A finding without a location cannot be acted on under time pressure.
- **Mark speculation as speculative.** A wrong confident finding costs more than an honest hedge,
  because someone will spend clock disproving it.
- **Do not propose work that is out of scope** per §2, however tempting.
