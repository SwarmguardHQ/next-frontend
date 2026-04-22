import { Button } from "@/components/ui/button";
import { Flame, Cloud, Mountain, UserPlus, Droplets, Unlink, Skull } from "lucide-react";

export const INCIDENT_EVENTS = [
  { id: "fire", label: "Fire", icon: <Flame className="h-4 w-4" /> },
  { id: "smoke", label: "Smoke", icon: <Cloud className="h-4 w-4" /> },
  { id: "earthquake", label: "Earthquake", icon: <Mountain className="h-4 w-4" /> },
  { id: "survivor", label: "Survivor", icon: <UserPlus className="h-4 w-4" /> },
  { id: "flood", label: "Flood Zone", icon: <Droplets className="h-4 w-4" /> },
  { id: "collapse", label: "Collapse", icon: <Unlink className="h-4 w-4" /> },
  { id: "biohazard", label: "Biohazard", icon: <Skull className="h-4 w-4" /> },
];

interface QuickCommandsProps {
  disabled: boolean;
  onEventAction: (eventId: string) => void;
}

function EventButton({ s, disabled, onEventAction }: { s: typeof INCIDENT_EVENTS[0]; disabled: boolean; onEventAction: (id: string) => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => onEventAction(s.id)}
      className="h-7 gap-1.5 border-slate-800 text-xs text-slate-500 hover:border-slate-600 hover:text-slate-800"
    >
      {s.icon}
      {s.label}
    </Button>
  );
}

export function QuickCommands({ disabled, onEventAction }: QuickCommandsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
         <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Report Event:</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {INCIDENT_EVENTS.map((s) => (
          <EventButton
            key={s.id}
            s={s}
            disabled={disabled}
            onEventAction={onEventAction}
          />
        ))}
      </div>
    </div>
  );
}