export default function DataHandlingNotice() {
  return (
    <section className="rounded-2xl border border-yellow-500/20 bg-yellow-950/20 px-4 py-3 text-sm leading-relaxed text-yellow-50">
      <div className="font-bold text-yellow-100">
        業務情報を入れる前に
      </div>
      <p className="mt-1 text-yellow-100/90">
        入力した文章は翻訳・解説生成のためAIに送信され、生成後はこの端末のライブラリと運営側の記録先に保存されることがあります。ログイン中はクラウドにも同期されます。
      </p>
      <p className="mt-1 text-yellow-100/80">
        顧客名、社外秘、図面番号、個人情報などは伏せ字にしてください。不要なフレーズはライブラリの削除ボタンでこの端末から消せます。クラウド・運営側記録の削除は別途対応が必要です。
      </p>
    </section>
  );
}
