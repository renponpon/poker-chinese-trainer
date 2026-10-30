"use client";

import { useId, useRef, useState } from "react";
import { DRILL_LIMITS, MAX_CUSTOM_DRILL_LIMIT, drillLimitLabel } from "@/domain/practice/drill-preferences";
import { useSharedDrillPreferences } from "./DrillPreferencesProvider";

export default function DrillQuestionSettings() {
  const { limit, ready, error, pending, change, retry } = useSharedDrillPreferences();
  const [custom, setCustom] = useState(!DRILL_LIMITS.some((value) => value === limit) && limit !== 0);
  const [draft, setDraft] = useState(limit === 0 ? "" : String(limit));
  const [validation, setValidation] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  return <section aria-label="1回あたりのドリル出題数" className="mb-2 rounded-xl bg-neutral-900 px-4 py-4">
    <h2 className="mb-3 text-base font-bold text-neutral-200">1回あたりのドリル出題数</h2>
    <fieldset disabled={!ready} className="grid grid-cols-3 gap-2 disabled:opacity-50">
      <legend className="sr-only">1回の出題数を選ぶ</legend>
      {[...DRILL_LIMITS, 0].map((value) => <button type="button" key={value} aria-pressed={!custom && limit === value} onClick={() => {
        if (change(value)) { setCustom(false); setValidation(null); }
      }} className={`min-h-11 rounded-xl text-sm font-bold ${!custom && limit === value ? "bg-emerald-500 text-neutral-950" : "bg-neutral-950 text-neutral-200"}`}>{drillLimitLabel(value)}</button>)}
      <button type="button" aria-expanded={custom} aria-controls={inputId + "-form"} onClick={() => { setCustom(true); setDraft(limit === 0 ? "" : String(limit)); setValidation(null); }}
        className={`col-span-2 min-h-11 rounded-xl text-sm font-bold ${custom ? "bg-emerald-500 text-neutral-950" : "bg-neutral-950 text-neutral-200"}`}>カスタム</button>
    </fieldset>
    {custom && <form id={inputId + "-form"} className="mt-3" noValidate onSubmit={(event) => {
      event.preventDefault();
      const normalized = draft.trim().replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
      const value = Number(normalized);
      if (!/^[0-9]+$/.test(normalized) || !Number.isInteger(value) || value < 1 || value > MAX_CUSTOM_DRILL_LIMIT) {
        setValidation(`1〜${MAX_CUSTOM_DRILL_LIMIT}の整数を入力してください。`);
        input.current?.focus();
        return;
      }
      if (change(value)) { setDraft(String(value)); setValidation(null); }
    }}>
      <label htmlFor={inputId} className="text-xs text-neutral-300">問題数（1〜{MAX_CUSTOM_DRILL_LIMIT}問）</label>
      <div className="mt-1 flex gap-2">
        <input ref={input} id={inputId} type="text" inputMode="numeric" autoComplete="off" value={draft} disabled={!ready}
          aria-invalid={Boolean(validation)} aria-describedby={validation ? inputId + "-error" : undefined}
          onChange={(event) => { setDraft(event.target.value); setValidation(null); }} className="min-h-11 min-w-0 flex-1 rounded-xl bg-neutral-950 px-3 text-base text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
        <button type="submit" disabled={!ready} className="min-h-11 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-neutral-950">保存</button>
      </div>
      {validation && <p id={inputId + "-error"} role="alert" className="mt-2 text-xs text-amber-200">{validation}</p>}
    </form>}
    <p role="status" className="mt-3 text-sm text-neutral-300">設定：{drillLimitLabel(limit)}。変更は次の回から反映します。</p>
    <p className="mt-2 text-xs leading-relaxed text-neutral-400">無制限は、その回を始める時点の復習対象すべてです。未来の復習予定は含みません。</p>
    <p className="mt-2 text-xs leading-relaxed text-neutral-400">Badは同じ回で再出題し、進捗は増えません。Good・Perfectで進みます。</p>
    <p className="mt-2 text-xs leading-relaxed text-neutral-400">英語・中国語で共通です。サンプル・保存後の1回練習には適用しません。{pending ? "端末に保存済み・設定を同期中です。" : ""}</p>
    {error && <div role="alert" className="mt-3 text-sm text-amber-200"><p>{error}</p><button type="button" onClick={retry} className="mt-2 min-h-11 underline">設定を再試行</button></div>}
  </section>;
}
