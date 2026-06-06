"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthHeaders } from "./auth-headers";

type LanguageHint = string;
type ErrorKind = "unsupported" | "microphone" | "recording" | "transcription";

type StartOptions = {
  languageHint: LanguageHint;
  sourcePage: "add" | "conversation";
  onTranscript: (transcript: string) => void;
};

const MAX_RECORDING_MS = 20_000;

export function useHighAccuracySpeech() {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const optionsRef = useRef<StartOptions | null>(null);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const transcribeRecording = useCallback(async () => {
    const options = optionsRef.current;
    const durationMs = Date.now() - startedAtRef.current;
    const chunks = chunksRef.current;
    setRecording(false);
    cleanup();

    if (!options || chunks.length === 0) {
      setError("音声を録音できませんでした。もう一度試すか、手入力で進めてください。");
      setErrorKind("recording");
      return;
    }

    setTranscribing(true);
    setError(null);
    setErrorKind(null);
    try {
      const audio = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
      const form = new FormData();
      form.set("audio", audio, `speech.${extensionFromMime(audio.type)}`);
      form.set("languageHint", options.languageHint);
      form.set("sourcePage", options.sourcePage);
      form.set("durationMs", String(durationMs));

      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/speech/transcribe", {
        method: "POST",
        headers: authHeaders,
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "音声の文字起こしに失敗しました");
      }
      const transcript = typeof data.transcript === "string" ? data.transcript.trim() : "";
      if (!transcript) {
        throw new Error("音声を文字起こしできませんでした");
      }
      options.onTranscript(transcript);
    } catch (err) {
      setError(err instanceof Error ? err.message : "音声の文字起こしに失敗しました");
      setErrorKind("transcription");
    } finally {
      setTranscribing(false);
    }
  }, [cleanup]);

  const startRecording = useCallback(async (options: StartOptions) => {
    setError(null);
    setErrorKind(null);
    optionsRef.current = options;

    if (recording) {
      stopRecording();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("このブラウザでは高精度音声入力に対応していません。手入力で試してください。");
      setErrorKind("unsupported");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setError("録音中にエラーが発生しました。手入力で試してください。");
        setErrorKind("recording");
        setRecording(false);
        cleanup();
      };

      recorder.onstop = () => {
        void transcribeRecording();
      };

      recorder.start();
      setRecording(true);
      timeoutRef.current = window.setTimeout(() => {
        stopRecording();
      }, MAX_RECORDING_MS);
    } catch {
      setError("マイクを使えませんでした。ブラウザのマイク許可を確認するか、手入力で試してください。");
      setErrorKind("microphone");
      setRecording(false);
      cleanup();
    }
  }, [cleanup, recording, stopRecording, transcribeRecording]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    recording,
    transcribing,
    error,
    errorKind,
    startRecording,
    stopRecording,
  };
}

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function extensionFromMime(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg")) return "mp3";
  return "webm";
}
