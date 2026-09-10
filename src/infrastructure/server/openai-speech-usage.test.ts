import assert from "node:assert/strict";
import test from "node:test";
import { getSpeechBudgetUnits, getTranscriptionBudgetUnits, getTranscriptionReservationUnits } from "./openai-speech-usage";

test("transcribe uses billed tokens, not file size or an unrelated duration", () => {
  assert.equal(getTranscriptionBudgetUnits("gpt-4o-transcribe", {
    duration: 3200,
    usage: { type: "tokens", input_tokens: 100, output_tokens: 20, total_tokens: 120 },
  }), 5);
  assert.equal(getTranscriptionBudgetUnits("gpt-4o-transcribe", {
    usage: { type: "tokens", input_tokens: 100, output_tokens: 21, total_tokens: 121 },
  }), 5);
});

test("missing, inconsistent and invalid usage never releases the reservation", () => {
  for (const usage of [null, {}, [], { type: "duration", seconds: 1 },
    { type: "tokens", input_tokens: 100, output_tokens: 20, total_tokens: 119 },
    { type: "tokens", input_tokens: "100", output_tokens: 20, total_tokens: 120 },
    { type: "tokens", input_tokens: -1, output_tokens: 20, total_tokens: 19 },
    { type: "tokens", input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    { type: "tokens", input_tokens: 0.5, output_tokens: 20, total_tokens: 20.5 },
    { type: "tokens", input_tokens: Infinity, output_tokens: 1, total_tokens: Infinity },
    { type: "tokens", input_tokens: 1_000_001, output_tokens: 0, total_tokens: 1_000_001 },
  ]) assert.equal(getTranscriptionBudgetUnits("gpt-4o-transcribe", { duration: 1, usage }), null);
  assert.equal(getTranscriptionBudgetUnits("gpt-4o-transcribe", null), null);
});

test("unknown models cannot reuse the transcribe price conversion", () => {
  assert.equal(getTranscriptionBudgetUnits("other-model", {
    usage: { type: "tokens", input_tokens: 100, output_tokens: 20, total_tokens: 120 },
  }), null);
});

test("Whisper retains duration billing and rounds up fractional seconds", () => {
  assert.equal(getTranscriptionBudgetUnits("whisper-1", { duration: 1.2 }), 2);
  assert.equal(getTranscriptionBudgetUnits("whisper-1", { duration: 500, usage: { type: "duration", seconds: 2.5 } }), 3);
  for (const seconds of [0, -1, NaN, Infinity, "2", 2_147_483_648]) {
    assert.equal(getTranscriptionBudgetUnits("whisper-1", { duration: seconds }), null);
  }
});

test("0.03 yen per unit covers output tokens valued at $10 per million and 220 yen per dollar", () => {
  for (const totalTokens of [1, 9, 10, 11, 120, 500, 2000, 1000000]) {
    const units = getTranscriptionBudgetUnits("gpt-4o-transcribe", {
      usage: { type: "tokens", input_tokens: 0, output_tokens: totalTokens, total_tokens: totalTokens },
    });
    assert.ok(units !== null);
    assert.ok(units * 30_000 >= totalTokens * 2200);
  }
});

test("a single non-chunked request reserves the model input plus output bounds independent of file format or size", () => {
  for (const bytes of [1, 7058, 102400, 321974, 5 * 1024 * 1024]) {
    const units = getTranscriptionReservationUnits("gpt-4o-transcribe", bytes);
    assert.equal(units, 600);
    assert.equal(units * 0.03, 18);
    assert.equal(getTranscriptionBudgetUnits("gpt-4o-transcribe", {
      usage: { type: "tokens", input_tokens: 16000, output_tokens: 2000, total_tokens: 18000 },
    }), units);
  }
  assert.equal(getTranscriptionReservationUnits("whisper-1", 102400), 3200);
  assert.equal(getTranscriptionReservationUnits("unknown-model", 102400), 3200);
});

test("weighted token units cover input at $2.50 and output at $10 per million with rounding and currency margin", () => {
  for (const inputTokens of [0, 1, 39, 40, 41, 100, 16000, 16001, 1_000_000]) {
    for (const outputTokens of [0, 1, 9, 10, 11, 20, 2000, 2001]) {
      const totalTokens = inputTokens + outputTokens;
      if (totalTokens === 0 || totalTokens > 1_000_000) continue;
      const units = getTranscriptionBudgetUnits("gpt-4o-transcribe", {
        usage: { type: "tokens", input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens },
      });
      assert.ok(units !== null);
      const invoiceMicroyenAt220 = inputTokens * 550 + outputTokens * 2200;
      assert.ok(units * 30_000 >= invoiceMicroyenAt220 * 1.2);
      if (inputTokens <= 16000 && outputTokens <= 2000) assert.ok(units <= 600);
    }
  }
  assert.equal(getTranscriptionBudgetUnits("gpt-4o-transcribe", {
    usage: { type: "tokens", input_tokens: 16000, output_tokens: 2001, total_tokens: 18001 },
  }), 601);
});

test("TTS usage rounds up at 30 tokens per unit and never guesses missing usage", () => {
  assert.equal(getSpeechBudgetUnits("gpt-4o-mini-tts", { input_tokens: 14, output_tokens: 101, total_tokens: 115 }), 4);
  for (const value of [null, [], {}, { input_tokens: 14, output_tokens: 101, total_tokens: 114 },
    { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    { input_tokens: "14", output_tokens: 101, total_tokens: 115 },
    { input_tokens: -1, output_tokens: 101, total_tokens: 100 },
    { input_tokens: 0.5, output_tokens: 1, total_tokens: 1.5 },
    { input_tokens: 0, output_tokens: Infinity, total_tokens: Infinity },
    { input_tokens: 0, output_tokens: 1_000_001, total_tokens: 1_000_001 },
  ]) assert.equal(getSpeechBudgetUnits("gpt-4o-mini-tts", value), null);
  assert.equal(getSpeechBudgetUnits("tts-1", { input_tokens: 14, output_tokens: 101, total_tokens: 115 }), null);
});

test("0.10 yen per TTS unit covers all tokens valued at $12 per million and 220 yen per dollar", () => {
  for (const totalTokens of [1, 29, 30, 31, 115, 500, 2000, 1000000]) {
    const units = getSpeechBudgetUnits("gpt-4o-mini-tts", { input_tokens: 0, output_tokens: totalTokens, total_tokens: totalTokens });
    assert.ok(units !== null);
    assert.ok(units * 100_000 >= totalTokens * 2640);
  }
});
