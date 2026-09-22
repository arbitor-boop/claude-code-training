import { StatusBadge } from "@/components/ui/payments/StatusBadge"
import { cardById } from "@/data/cards"
import { merchantById } from "@/data/merchants"
import { maskLast4, spendState } from "@/lib/cards"
import { formatDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cx } from "@/lib/utils"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CardActions } from "../card-actions"

/**
 * Written out literally so Tailwind generates them — a computed class name is
 * invisible to the scanner, and an inline style attribute is against the rules
 * in .claude/rules/components.md. The bar rounds to 5%; the exact figure is
 * printed beside it.
 */
const BAR_WIDTHS = [
  "w-[0%]", "w-[5%]", "w-[10%]", "w-[15%]", "w-[20%]", "w-[25%]", "w-[30%]",
  "w-[35%]", "w-[40%]", "w-[45%]", "w-[50%]", "w-[55%]", "w-[60%]", "w-[65%]",
  "w-[70%]", "w-[75%]", "w-[80%]", "w-[85%]", "w-[90%]", "w-[95%]", "w-[100%]",
] as const

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const card = cardById(id)
  if (!card) notFound()

  const merchant = merchantById(card.merchantId)
  const spend = spendState(card.spentMinor, card.limitMinor)

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Nickname", value: card.nickname },
    { label: "Merchant", value: merchant?.name ?? card.merchantId },
    { label: "Card number", value: maskLast4(card.last4) },
    { label: "Reference", value: card.reference },
    {
      label: "Spend limit",
      value: formatMoney(card.limitMinor, card.currency),
    },
    { label: "Currency", value: card.currency },
    { label: "Issued", value: formatDate(card.createdAt) },
  ]

  return (
    <section aria-label={`Card ${card.nickname}`} className="px-4 py-6 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/cards"
            className="text-sm text-blue-600 hover:underline dark:text-blue-500"
          >
            ← All cards
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-gray-900 dark:text-gray-50">
            {card.nickname}
          </h1>
        </div>
        <StatusBadge status={card.status} />
      </div>

      <div className="mt-6 max-w-xl rounded-md border border-gray-200 p-4 dark:border-gray-800">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-50">
            Spend against limit
          </p>
          <p className="text-sm tabular-nums text-gray-500">
            {formatMoney(card.spentMinor, card.currency)} of{" "}
            {formatMoney(card.limitMinor, card.currency)}
          </p>
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
          role="progressbar"
          aria-valuenow={spend.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Spend against limit"
        >
          <div
            className={cx(
              "h-full rounded-full",
              BAR_WIDTHS[Math.round(spend.percent / 5)],
              spend.tone === "amber"
                ? "bg-amber-500 dark:bg-amber-500"
                : "bg-blue-500 dark:bg-blue-500",
            )}
          />
        </div>
        <p className="mt-1.5 text-sm text-gray-500">{spend.percent}% used</p>
      </div>

      <dl className="mt-6 max-w-xl divide-y divide-gray-200 dark:divide-gray-800">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4 py-2.5">
            <dt className="text-sm text-gray-500">{row.label}</dt>
            <dd className="text-sm font-medium tabular-nums text-gray-900 dark:text-gray-50">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-6">
        <CardActions cardId={card.id} status={card.status} />
      </div>
    </section>
  )
}
