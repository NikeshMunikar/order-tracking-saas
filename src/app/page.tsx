import Link from "next/link";
import { redirect } from "next/navigation";

import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";
import { auth } from "@/server/auth/config";

const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-white transition-colors hover:bg-ink";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-control bg-surface px-5 text-sm font-medium text-ink transition-colors hover:bg-raised";

// Every item here describes a capability that already exists in the
// authenticated app. Nothing is aspirational.
const capabilities = [
  {
    term: "Orders",
    detail:
      "Build an order from your product catalog with quantities, prices, delivery or pickup, and an optional estimated delivery time.",
  },
  {
    term: "Customers and products",
    detail:
      "Keep a customer list and a product catalog with prices so a new order takes seconds to assemble.",
  },
  {
    term: "A tracking link per order",
    detail:
      "Every order gets a link your customer can open in a browser — no account and no app.",
  },
  {
    term: "Status updates",
    detail:
      "Move an order through received, confirmed, preparing, ready, out for delivery, and delivered, or cancel it before delivery.",
  },
  {
    term: "Delivery and pickup",
    detail:
      "Record a delivery address or pickup details, with the delivery fee and any discount reflected in the total.",
  },
  {
    term: "A team",
    detail:
      "Invite staff to the business so more than one person can keep orders moving.",
  },
];

const trackingIncludes = [
  "The order number and its current status",
  "A timeline of every status the order has reached, with the time it changed",
  "The estimated delivery time when one is set",
  "Item lines, subtotal, delivery fee, discount, and total",
  "Delivery address or pickup details, and the business contact",
];

const trackingExampleEntries = [
  { glyph: "✓", label: "Order received", state: "complete" as const },
  { glyph: "●", label: "Order confirmed", state: "current" as const },
  { glyph: "○", label: "Preparing", state: "upcoming" as const },
  { glyph: "○", label: "Out for delivery", state: "upcoming" as const },
  { glyph: "○", label: "Delivered", state: "upcoming" as const },
];

/**
 * A static, honest example of the real customer tracking page. It is the
 * same interface the public route renders, shown so the hero has something
 * true to look at rather than an abstract shape.
 */
function TrackingExample() {
  return (
    <figure className="rounded-lg border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-semibold text-ink">Order #ORD-1042</p>
        <span className="inline-flex items-center whitespace-nowrap rounded bg-status-info-bg px-2 py-0.5 text-xs font-medium leading-4 text-status-info-fg">
          Order confirmed
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">Bright Coffee Roasters</p>

      <ol className="mt-4 flex flex-col gap-2.5 text-sm">
        {trackingExampleEntries.map((entry) => (
          <li key={entry.label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={
                entry.state === "upcoming"
                  ? "text-control"
                  : entry.state === "current"
                    ? "text-accent"
                    : "text-ink"
              }
            >
              {entry.glyph}
            </span>
            <span
              className={
                entry.state === "current"
                  ? "font-medium text-ink"
                  : entry.state === "upcoming"
                    ? "text-muted"
                    : "text-ink"
              }
            >
              {entry.label}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-sm">
        <span className="text-muted">Total</span>
        <span className="font-medium text-ink">USD 24.00</span>
      </div>

      <figcaption className="mt-4 text-xs text-muted">
        An example of the customer&apos;s tracking page — no account required.
      </figcaption>
    </figure>
  );
}

export default async function HomePage() {
  const session = await auth();

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />

      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-5xl gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-2 lg:items-center">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl lg:text-5xl">
              Order tracking for small businesses.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Create an order, share one link, and let your customer follow every status
              change — no account and no app needed.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className={primaryButton}>
                Create an account
              </Link>
              <Link href="/login" className={secondaryButton}>
                Sign in
              </Link>
            </div>
            <ul className="mt-8 flex flex-col gap-2 text-sm text-muted">
              <li>No customer accounts to manage.</li>
              <li>Delivery or pickup, with prices and totals.</li>
              <li>Status updates your customer can see right away.</li>
            </ul>
          </div>

          <TrackingExample />
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-16">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              What the day needs
            </h2>
            <p className="mt-3 max-w-2xl text-base text-muted">
              The working parts of running orders for a small business, without the parts
              you do not need.
            </p>

            <dl className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {capabilities.map((capability) => (
                <div key={capability.term}>
                  <dt className="text-base font-medium text-ink">{capability.term}</dt>
                  <dd className="mt-1 text-sm text-muted">{capability.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            How it works
          </h2>
          <ol className="mt-8 flex list-decimal flex-col gap-6 pl-5 marker:font-medium marker:text-muted">
            <li>
              <p className="font-medium text-ink">Create the order</p>
              <p className="mt-1 text-sm text-muted">
                Pick a customer, add items from your catalog, and set delivery or pickup.
              </p>
            </li>
            <li>
              <p className="font-medium text-ink">Share the tracking link</p>
              <p className="mt-1 text-sm text-muted">
                Copy the link from the order and send it however you already talk to your
                customer.
              </p>
            </li>
            <li>
              <p className="font-medium text-ink">Your customer follows along</p>
              <p className="mt-1 text-sm text-muted">
                Each status change you make appears on the tracking page, with the time it
                happened.
              </p>
            </li>
          </ol>
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-2 lg:items-start">
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                What your customer sees
              </h2>
              <p className="mt-3 text-base text-muted">
                The tracking page is built for a phone and shows only what the customer
                needs.
              </p>
              <ul className="mt-6 flex flex-col gap-3 text-sm text-ink">
                {trackingIncludes.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden="true" className="text-accent">
                      &mdash;
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-line bg-raised p-5 sm:p-6">
              <h3 className="text-base font-semibold text-ink">Kept private</h3>
              <p className="mt-2 text-sm text-muted">
                The tracking page never shows your customer&apos;s email or notes, your
                internal order notes, who on your team made a change, or any internal
                reference numbers. A customer only sees the order they were sent.
              </p>
              <p className="mt-4 text-sm text-muted">
                A missing, mistyped, or expired link shows the same neutral message, so a
                link never reveals whether an order exists.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-5 py-16 text-center sm:px-8 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Send your first order
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted">
            Create a business, add a product, and share a tracking link in a few minutes.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/register" className={primaryButton}>
              Create an account
            </Link>
            <Link href="/login" className={secondaryButton}>
              Sign in
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
