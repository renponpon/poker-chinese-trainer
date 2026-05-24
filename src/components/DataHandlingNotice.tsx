export default function DataHandlingNotice() {
  return (
    <section className="text-sm leading-relaxed text-neutral-400">
      <p>
        入力した文章や音声は、翻訳・文字起こし・解説を作るためにAIへ送信されます。作成されたフレーズはこの端末のライブラリに保存され、ログイン中はアカウントにも同期されます。
      </p>
      <p className="mt-2">
        仕事の内容を入れる時は、気になる固有名詞や番号だけ伏せ字にすると安心です。不要になったフレーズはライブラリから削除できます。
      </p>
    </section>
  );
}
