"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  const ref = useRef<InstanceType<typeof SpeechRecognition> | null>(null);

  useEffect(() => {
    const SR =
      typeof window !== "undefined"
        ? window.SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition: typeof SpeechRecognition }).webkitSpeechRecognition
        : null;

    if (!SR) {
      setSupported(false);
      return;
    }

    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";

    r.onresult = (e: SpeechRecognitionEvent) => {
      let fin = "";
      let tmp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript;
        else tmp += e.results[i][0].transcript;
      }
      if (fin) setTranscript((p) => (p + " " + fin).trim());
      setInterim(tmp);
    };

    r.onend = () => setIsListening(false);
    ref.current = r;
  }, []);

  const start = useCallback(() => {
    setTranscript("");
    setInterim("");
    ref.current?.start();
    setIsListening(true);
  }, []);

  const stop = useCallback(() => {
    ref.current?.stop();
    setIsListening(false);
  }, []);

  return { isListening, transcript, interim, supported, start, stop };
}