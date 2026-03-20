import { Button } from "@/components/ui/button";
import { SCENARIOS } from "@/lib/drone-scenarios";

interface QuickCommandsProps {
  disabled: boolean;
  onCommand: (label: string) => void;
}

export function QuickCommands({ disabled, onCommand }: QuickCommandsProps) {
  const scenarios = Object.values(SCENARIOS).filter((s) => s.id !== "unknown");

  return (
    <div>
      <p className="mb-2 font-mono text-[10px] tracking-widest text-slate-500 uppercase">
        Quick Commands
      </p>
      <div className="flex flex-wrap gap-2">
        {scenarios.map((s) => (
          <Button
            key={s.id}
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onCommand(s.label)}
            className="h-7 gap-1.5 border-slate-800  text-xs text-slate-500 hover:border-slate-600 hover:text-slate-800"
          >
            {s.icon}
            {s.label}
          </Button>
        ))}
      </div>
    </div>
  );
}