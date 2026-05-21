export default function DataHandlingNotice() {
  return (
    <section className="text-sm leading-relaxed text-neutral-400">
      <div className="font-bold text-neutral-200">
        入力データについて
      </div>
      <p className="mt-2">
        入力した文章は、翻訳や解説を作るためにAIへ送信されます。作成されたフレーズはこの端末のライブラリに保存され、ログイン中はアカウントにも同期されます。
      </p>
      <p className="mt-2">
        仕事の内容を入れる時は、気になる固有名詞や番号だけ伏せ字にすると安心です。不要になったフレーズはライブラリから削除できます。
      </p>
    </section>
  );
}
