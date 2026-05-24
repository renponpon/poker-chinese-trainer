import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";

export default function FeedbackPage() {
  return (
    <main className="min-h-screen px-5 pb-28 pt-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <AppHeader />

        <section className="overflow-hidden rounded-[32px] bg-neutral-900/70 p-6">
          <div className="inline-flex rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">
            30秒で送れます
          </div>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight text-neutral-50">
            使っていて気になったことを教えてください
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-300">
            小さな違和感でも大丈夫です。「ここが押しづらい」「この訳が変」「こう使いたい」など、次の改善にそのまま反映します。
          </p>
          <div className="mt-5 grid gap-2 text-sm text-neutral-300">
            <div className="rounded-2xl bg-neutral-950/60 p-3">
              匿名で送信できます
            </div>
            <div className="rounded-2xl bg-neutral-950/60 p-3">
              一言だけでも助かります
            </div>
            <div className="rounded-2xl bg-neutral-950/60 p-3">
              個人名・店名などのプライベート情報は書かないでください
            </div>
          </div>
        </section>

        <a
          href="/feedback/form"
          className="rounded-3xl bg-emerald-500 px-5 py-4 text-center text-base font-extrabold text-neutral-950 transition hover:bg-emerald-400"
        >
          フィードバックを送る
        </a>

        <p className="text-center text-xs leading-relaxed text-neutral-500">
          回答はGoogleフォームに保存されます。アプリ側では送信内容を保存しません。
        </p>
      </div>
      <BottomNav />
    </main>
  );
}
