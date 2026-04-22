import { Button } from "@/components/ui/button";
import { SCENARIOS } from "@/lib/drone-scenarios";
import { useDraggable } from "@dnd-kit/core";

interface QuickCommandsProps {
  disabled: boolean;
  onCommand: (label: string) => void;
}

function DraggableCommandButton({ s, disabled, onCommand }: { s: { id: string; label: string; icon: React.ReactNode }; disabled: boolean; onCommand: (label: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `command-${s.label}`,
    data: { type: s.label, s },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 50 : undefined,
        opacity: isDragging ? 0 : 1,
      }
    : undefined;

  return (
    <Button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => onCommand(s.label)}
      className="h-7 gap-1.5 border-slate-800 text-xs text-slate-500 hover:border-slate-600 hover:text-slate-800 cursor-grab"
    >
      {s.icon}
      {s.label}
    </Button>
  );
}

export function QuickCommands({ disabled, onCommand }: QuickCommandsProps) {
  const scenarios = Object.values(SCENARIOS).filter((s) => s.id !== "unknown");

  return (
    <div className="flex flex-wrap gap-2">
      {scenarios.map((s) => (
        <DraggableCommandButton
          key={s.id}
          s={s}
          disabled={disabled}
          onCommand={onCommand}
        />
      ))}
    </div>
  );
}
