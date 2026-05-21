import { SRS_STATUS_GUIDE } from "@/lib/srs";
import type { SrsStatus } from "@/lib/types";

export default function HomeGuides() {
  return (
    <div className="flex flex-col gap-2">
      <details className="group rounded-2xl border border-neutral-800 bg-neutral-900/40">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold text-neutral-200">
          スマホにインストールする方法
          <span className="text-neutral-500 transition group-open:rotate-180">⌄</span>
        </summary>
        <div className="border-t border-neutral-800 px-4 py-3 text-sm leading-relaxed text-neutral-400">
          <p>
            <span className="font-bold text-neutral-300">iOS（Safari）:</span>{" "}
            共有アイコンをタップし、「ホーム画面に追加」を選択します。
          </p>
          <p className="mt-2">
            <span className="font-bold text-neutral-300">Android（Chrome）:</span>{" "}
            画面に表示される「アプリをインストール」をタップするか、メニューから選択します。
          </p>
        </div>
      </details>

      <details className="group rounded-2xl border border-neutral-800 bg-neutral-900/40">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold text-neutral-200">
          SRSステータスの説明
          <span className="text-neutral-500 transition group-open:rotate-180">⌄</span>
        </summary>
        <div className="border-t border-neutral-800 px-4 py-3">
          <p className="text-xs leading-relaxed text-neutral-500">
            Anki系のSM-2をベースに、間違えた問題をすぐ戻す挙動を加えています。
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {SRS_STATUS_GUIDE.map((item) => (
              <div
                key={item.status}
                className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3"
              >
                <div className="flex items-center gap-2">
                  <StatusBadge status={item.status} />
                  <span className="text-sm font-bold text-neutral-100">
                    {item.label}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-neutral-300">
                  {item.definition}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                  {item.cycle}
                </p>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}

function StatusBadge({ status }: { status: SrsStatus }) {
  const palette: Record<SrsStatus, string> = {
    new: "border-neutral-700 bg-neutral-800 text-neutral-400",
    learning: "border-yellow-700/60 bg-yellow-900/30 text-yellow-200",
    review: "border-indigo-700/60 bg-indigo-900/30 text-indigo-200",
    maintenance: "border-blue-700/60 bg-blue-900/30 text-blue-200",
    mastered: "border-emerald-700/60 bg-emerald-900/30 text-emerald-200",
  };
  const label: Record<SrsStatus, string> = {
    new: "新規",
    learning: "学習中",
    review: "復習中",
    maintenance: "メンテ",
    mastered: "習得",
  };

  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${palette[status]}`}
    >
      {label[status]}
    </span>
  );
}
