"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  closeMenuOnEscape,
  shouldCloseMenuOnPathnameChange,
} from "./business-navigation-utils";

type BusinessNavigationProps = {
  businessId: string;
  businessName: string;
  isOwner: boolean;
};

type NavigationItem = {
  href: string;
  label: string;
};

export function BusinessNavigation({
  businessId,
  businessName,
  isOwner,
}: BusinessNavigationProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (shouldCloseMenuOnPathnameChange(previousPathname.current, pathname)) {
      setIsOpen(false);
    }

    previousPathname.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      closeMenuOnEscape(
        event.key,
        () => setIsOpen(false),
        () => menuButtonRef.current?.focus(),
      );
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const basePath = `/dashboard/${businessId}`;
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";

  const items: NavigationItem[] = [
    { href: basePath, label: "Dashboard" },
    { href: `${basePath}/orders`, label: "Orders" },
    { href: `${basePath}/customers`, label: "Customers" },
    { href: `${basePath}/products`, label: "Products" },
    ...(isOwner ? [{ href: `${basePath}/settings`, label: "Settings" }] : []),
    { href: `${basePath}/team`, label: "Team" },
  ];

  const isActive = (href: string) =>
    href === basePath
      ? normalizedPathname === basePath
      : normalizedPathname === href || normalizedPathname.startsWith(`${href}/`);

  return (
    <aside className="lg:w-[232px] lg:shrink-0">
      <div className="flex items-start justify-between gap-4 lg:block">
        <div className="min-w-0">
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-ink"
          >
            &larr; All businesses
          </Link>
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-ink lg:mt-2">
            {businessName}
          </h1>
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-controls="business-navigation"
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-raised lg:hidden"
        >
          <span>{isOpen ? "Close" : "Menu"}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      <nav
        id="business-navigation"
        aria-label="Business sections"
        className={`${
          isOpen ? "block" : "hidden"
        } mt-4 rounded-lg border border-line bg-surface p-1.5 lg:mt-6 lg:block lg:border-0 lg:bg-transparent lg:p-0`}
      >
        <ul className="grid gap-1">
          {items.map((item) => {
            const active = isActive(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-raised text-ink"
                      : "text-muted hover:bg-raised hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
