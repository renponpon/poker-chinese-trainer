import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import LibraryView from "./LibraryView";

export default function LibraryPage() {
  return (
    <main className="min-h-screen px-4 pb-28 pt-8 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <AppHeader />
        <h1 className="text-2xl font-extrabold text-neutral-100">
          ライブラリ
        </h1>

        <LibraryView />
      </div>
      <BottomNav />
    </main>
  );
}
