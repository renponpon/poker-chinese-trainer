import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import DrillRunner from "./DrillRunner";

export default function DrillPage() {
  return (
    <main className="fixed inset-0 overflow-hidden overscroll-none px-3 pt-8 sm:px-6">
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-3 overflow-hidden">
        <AppHeader />

        <DrillRunner />
      </div>
      <BottomNav />
    </main>
  );
}
