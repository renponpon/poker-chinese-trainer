import AuthButton from "@/components/AuthButton";
import HomeMenu from "@/app/HomeMenu";

export default function AppHeader() {
  return (
    <header className="flex items-center justify-between">
      <div className="text-xl font-extrabold tracking-tight text-neutral-100">
        Phrabit
      </div>
      <div className="flex items-center gap-2">
        <AuthButton />
        <HomeMenu />
      </div>
    </header>
  );
}
