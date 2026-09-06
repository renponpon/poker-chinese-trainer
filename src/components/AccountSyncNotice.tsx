"use client";

import { useSyncExternalStore } from "react";
import { ACCOUNT_SYNC_STATUS_EVENT, getAccountSyncStatus } from "@/lib/account-phrase-sync";

function subscribe(onChange: () => void) {
  window.addEventListener(ACCOUNT_SYNC_STATUS_EVENT, onChange);
  return () => window.removeEventListener(ACCOUNT_SYNC_STATUS_EVENT, onChange);
}

export default function AccountSyncNotice({ hideSyncedStatus = false }: { hideSyncedStatus?: boolean }) {
  const status = useSyncExternalStore(subscribe, getAccountSyncStatus, () => "");
  if (hideSyncedStatus && status === "同期済み") return null;
  return status ? <p role="status" className="text-xs leading-relaxed text-neutral-400">{status}</p> : null;
}
