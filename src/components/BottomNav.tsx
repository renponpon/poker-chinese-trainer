"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const items = [
  { href: "/", label: "翻訳", icon: TranslateIcon, match: ["/", "/add"], tutorial: "nav-translate" },
  { href: "/drill", label: "ドリル", icon: CardsIcon, match: ["/drill"], tutorial: "nav-drill" },
  { href: "/library", label: "保存", icon: LibraryIcon, match: ["/library"], tutorial: "nav-library" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    const isTextInput = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(
        target.closest("input, textarea, select, [contenteditable='true']"),
      );
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (isTextInput(event.target)) {
        setInputFocused(true);
      }
    };

    const handleFocusOut = () => {
      window.setTimeout(() => {
        setInputFocused(isTextInput(document.activeElement));
      }, 0);
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-40 bg-neutral-950/95 px-4 py-3 backdrop-blur transition-transform duration-200 ${
        inputFocused ? "pointer-events-none translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
        {items.map((item) => {
          const active = item.match.includes(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-tutorial={item.tutorial}
              className={`flex flex-col items-center gap-1 rounded-2xl px-4 py-2.5 text-xs font-bold transition ${
                active
                  ? "bg-emerald-500 text-neutral-950"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
              }`}
            >
              <Icon />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function TranslateIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5h9" />
      <path d="M9 3v2" />
      <path d="M7 5c.6 2.5 2.1 4.6 4.5 6" />
      <path d="M5 11c2.5-1 4.4-3.1 5-6" />
      <path d="M13 19l4-9 4 9" />
      <path d="M14.5 16h5" />
    </svg>
  );
}

function CardsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="4" width="12" height="15" rx="2" />
      <path d="M9 8h4" />
      <path d="M9 12h3" />
      <path d="M8 20h9a2 2 0 0 0 2-2V7" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6.5 12 3l8 3.5-8 3.5-8-3.5Z" />
      <path d="m4 12 8 3.5L20 12" />
      <path d="m4 17.5 8 3.5 8-3.5" />
    </svg>
  );
}
