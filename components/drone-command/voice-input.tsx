"use client";

import { Mic, MicOff, Send, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CommandStatus } from "@/types/drone";

interface VoiceInputProps {
  isListening: boolean;
  transcript: string;
  interim: string;
  supported: boolean;
  isActive: boolean;
  status: CommandStatus;
  feedback: string;
  mockText: string;
  onMicClick: () => void;
  onMockChange: (val: string) => void;
  onMockSubmit: () => void;
}

export function VoiceInput({
  isListening,
  transcript,
  interim,
  supported,
  isActive,
  status,
  feedback,
  mockText,
  onMicClick,
  onMockChange,
  onMockSubmit,
}: VoiceInputProps) {
  return (
    <Card>
      <CardContent className="p-0">
        {/* Main input row */}
        <div className="flex items-start gap-4 p-4">
          {/* Mic button */}
          <Button
            variant="outline"
            size="icon"
            disabled={isActive || !supported}
            onClick={onMicClick}
            className={cn(
              "h-10 w-10 shrink-0 rounded-full border-slate-700 bg-slate-900 transition-all",
              isListening &&
                "border-blue-500 bg-blue-500/10 text-blue-400 ring-2 ring-blue-500/20 animate-pulse"
            )}
          >
            {isListening ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4 text-slate-400" />
            )}
          </Button>

          {/* Transcript display */}
          <div className="flex-1 min-h-10">
            <p className="text-[10px] font-mono tracking-widest text-slate-500 mb-1 uppercase">
              {isListening ? "Listening…" : "Voice input"}
            </p>
            <p
              className={cn(
                "text-sm leading-relaxed",
                !transcript && !interim ? "text-slate-600 italic" : "text-slate-400"
              )}
            >
              {transcript || interim ? (
                <>
                  {transcript}
                  {interim && <span className="text-slate-700"> {interim}</span>}
                </>
              ) : (
                'Say "start patrol", "return home", "inspect the tower"…'
              )}
            </p>
          </div>
        </div>

        {/* Feedback strip */}
        {(feedback || isActive) && (
          <div
            className={cn(
              "flex items-center gap-2 border-t border-slate-800 px-4 py-2 text-xs font-mono",
              status === "error"
                ? "text-red-400"
                : status === "done"
                ? "text-emerald-400"
                : "text-slate-400"
            )}
          >
            {isActive && (
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
            )}
            {feedback}
          </div>
        )}

        {/* Unsupported warning */}
        {!supported && (
          <div className="flex items-center gap-2 border-t border-slate-800 px-4 py-2 text-xs text-amber-400">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Web Speech API unavailable in this browser — use text input below
          </div>
        )}

        {/* Text fallback */}
        <div className="flex gap-2 border-t border-slate-800  px-4 py-3">
          <Input
            className="h-8 border-slate-700  text-sm placeholder:text-slate-600 focus-visible:ring-slate-600"
            placeholder='Or type a command — "patrol the perimeter", "emergency land"…'
            value={mockText}
            disabled={isActive}
            onChange={(e) => onMockChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onMockSubmit()}
          />
          <Button
            size="sm"
            disabled={isActive || !mockText.trim()}
            onClick={onMockSubmit}
            className="h-8 shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}