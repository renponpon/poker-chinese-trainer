"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import AppHeader from "./AppHeader";

const mainTabPaths = new Set(["/", "/add", "/add/experience", "/drill", "/library"]);

export default function MainTabFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (!mainTabPaths.has(pathname)) return children;

  return (
    <div className="flex h-dvh flex-col pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="relative z-50 shrink-0 px-3 sm:px-6">
        <div className="mx-auto w-full max-w-4xl">
          <AppHeader hideSyncedStatus />
        </div>
      </div>
      {children}
    </div>
  );
}
