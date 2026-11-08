import BottomNav from "@/components/BottomNav";
import LibraryView from "./LibraryView";

export default function LibraryPage() {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-1 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <h1 className="sr-only">保存フレーズ</h1>

        <LibraryView />
      </div>
      <BottomNav />
    </main>
  );
}
