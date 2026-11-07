import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import DrillRunner from "./DrillRunner";

export default function DrillPage() {
  return (
    <main className="fixed inset-0 flex flex-col overflow-hidden overscroll-none px-3 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-1 overflow-hidden">
        <AppHeader hideSyncedStatus />

        <DrillRunner />
      </div>
      <BottomNav inFlow />
    </main>
  );
}
