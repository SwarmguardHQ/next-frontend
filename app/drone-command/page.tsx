"use client";

import { useState, useEffect, useCallback } from "react";
import { Mic } from "lucide-react";

import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { SCENARIOS, BASE_TELEMETRY, classifyIntent } from "@/lib/drone-scenarios";
import { TelemetryBar } from "@/components/drone-command/telementary-bar";
import { VoiceInput } from "@/components/drone-command/voice-input";
import { ScenarioSteps } from "@/components/drone-command/scenario-steps";
import { QuickCommands } from "@/components/drone-command/quick-commands";
import { CommandHistory } from "@/components/drone-command/command-history";
import { CommandLog, CommandStatus, DroneScenario, TelemetryState } from "@/types/drone";

export default function VoiceCommandPage() {
  const { isListening, transcript, interim, supported, start, stop } = useSpeechRecognition();

  const [status, setStatus] = useState<CommandStatus>("idle");
  const [activeScenario, setActiveScenario] = useState<DroneScenario | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [telemetry, setTelemetry] = useState<TelemetryState>(BASE_TELEMETRY);
  const [logs, setLogs] = useState<CommandLog[]>([]);
  const [mockText, setMockText] = useState("");
  const [feedback, setFeedback] = useState("");

  const executeCommand = useCallback(
    async (text: string) => {
      if (!text.trim() || status === "executing" || status === "processing") return;

      const scenarioId = classifyIntent(text);
      const scenario = SCENARIOS[scenarioId];

      setStatus("processing");
      setFeedback("Classifying intent…");
      await new Promise((r) => setTimeout(r, 600));

      if (scenarioId === "unknown") {
        setFeedback(`Could not map "${text}" to a drone command.`);
        setStatus("error");
        setTimeout(() => { setStatus("idle"); setFeedback(""); }, 3000);
        return;
      }

      setActiveScenario(scenario);
      setActiveStep(0);
      setStatus("executing");
      setFeedback(`Executing: ${scenario.label}`);
      const startTime = Date.now();

      for (let i = 0; i < scenario.steps.length; i++) {
        setActiveStep(i);
        await new Promise((r) => setTimeout(r, 700 + Math.random() * 400));
      }
      setActiveStep(scenario.steps.length);

      setTelemetry((prev) => ({
        ...prev,
        ...scenario.telemetry,
        battery: Math.max(prev.battery - Math.floor(Math.random() * 3 + 1), 5),
      }));

      const execTime = (Date.now() - startTime) / 1000;
      setLogs((prev) =>
        [
          {
            id: crypto.randomUUID(),
            transcript: text,
            scenario,
            timestamp: new Date(),
            executionTime: execTime,
          },
          ...prev,
        ].slice(0, 6)
      );

      setStatus("done");
      setFeedback(`${scenario.label} — complete`);
      setTimeout(() => { setStatus("idle"); setFeedback(""); }, 2500);
    },
    [status]
  );

  // Auto-fire when STT stops
  useEffect(() => {
    if (!isListening && transcript && status === "idle") {
      executeCommand(transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);

  const handleMic = () => (isListening ? stop() : start());
  const handleMockSubmit = () => { executeCommand(mockText); setMockText(""); };
  const isActive = status === "executing" || status === "processing";

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Page header — matches your dashboard pattern */}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Mic className="h-8 w-8 text-primary" />
          Voice Command
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Left / main column */}
        <div className="md:col-span-2 space-y-4">
          <TelemetryBar telemetry={telemetry} />

          <VoiceInput
            isListening={isListening}
            transcript={transcript}
            interim={interim}
            supported={supported}
            isActive={isActive}
            status={status}
            feedback={feedback}
            mockText={mockText}
            onMicClick={handleMic}
            onMockChange={setMockText}
            onMockSubmit={handleMockSubmit}
          />

          {activeScenario && (
            <ScenarioSteps scenario={activeScenario} activeStep={activeStep} />
          )}

          <CommandHistory logs={logs} />
        </div>

        {/* Right column — quick commands + tips */}
        <div className="space-y-4">
          <QuickCommands disabled={isActive} onCommand={executeCommand} />

          <div className="rounded-lg border border-slate-800 bg-slate-200 p-4 space-y-2">
            <p className="font-mono text-[10px] tracking-widest text-slate-700 uppercase mb-3">
              Example phrases
            </p>
            {[
              "Start patrol mission",
              "Inspect the east tower",
              "Return to home base",
              "Begin area survey",
              "Emergency land now",
              "Follow the target",
              "Hold current position",
            ].map((phrase) => (
              <button
                key={phrase}
                disabled={isActive}
                onClick={() => executeCommand(phrase)}
                className="block w-full text-left text-xs text-slate-500 hover:text-slate-300 py-1 border-b border-slate-800/50 last:border-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-mono"
              >
                "{phrase}"
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}