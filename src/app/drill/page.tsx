import BottomNav from "@/components/BottomNav";
import DrillRunner from "./DrillRunner";

export default function DrillPage() {
  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-none px-3 pt-1 sm:px-6">
        <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-hidden">
          <DrillRunner />
        </div>
      </main>
      <BottomNav inFlow />
    </>
  );
}
