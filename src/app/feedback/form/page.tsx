import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import FeedbackFormClient from "./FeedbackFormClient";

export default function FeedbackFormPage() {
  return (
    <main className="min-h-screen px-5 pb-28 pt-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <AppHeader />

        <FeedbackFormClient />
      </div>
      <BottomNav />
    </main>
  );
}
