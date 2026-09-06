import AuthButton from "@/components/AuthButton";
import HomeMenu from "@/app/HomeMenu";
import AccountSyncNotice from "./AccountSyncNotice";

export default function AppHeader({ hideSyncedStatus = false }: { hideSyncedStatus?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-extrabold tracking-tight text-neutral-100">
            Phrabit
          </span>
          <span className="text-xs font-medium tracking-[0.18em] text-neutral-400">
            フレービット
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AuthButton />
          <HomeMenu />
        </div>
      </header>
      <AccountSyncNotice hideSyncedStatus={hideSyncedStatus} />
    </div>
  );
}
