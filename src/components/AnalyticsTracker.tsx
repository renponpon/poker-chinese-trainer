"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordProductAnalyticsEvent } from "@/lib/product-analytics";

export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    recordProductAnalyticsEvent({
      eventName: "page_view",
      route: pathname,
    });
  }, [pathname]);

  return null;
}
