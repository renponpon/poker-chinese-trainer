import AuthButton from "@/components/AuthButton";
import HomeMenu from "@/app/HomeMenu";

export default function AppHeader() {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-extrabold tracking-tight text-neutral-100">
          Phrabit
        </span>
        <span className="text-[11px] font-medium tracking-[0.18em] text-neutral-400">
          フレービット
        </span>
      </div>
      <div className="flex items-center gap-2">
        <AuthButton />
        <HomeMenu />
      </div>
    </header>
  );
}
