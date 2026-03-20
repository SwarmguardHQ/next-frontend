import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import { CommandLog } from "@/types/drone";

export function CommandHistory({ logs }: { logs: CommandLog[] }) {
  if (!logs.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm text-slate-500">
          <History className="h-4 w-4" />
          Command History
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 space-y-2">
        {logs.map((log) => (
          <div
            key={log.id}
            className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-200/50 px-3 py-2"
          >
            <span className="text-slate-800 shrink-0">{log.scenario.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-700">{log.scenario.label}</p>
              <p className="text-xs text-slate-600 italic truncate">"{log.transcript}"</p>
            </div>
            <div className="text-right shrink-0 space-y-0.5">
              <p className="font-mono text-xs text-slate-900">{log.executionTime.toFixed(1)}s</p>
              <p className="font-mono text-[10px] text-slate-600">
                {log.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 border-emerald-800 text-emerald-500 bg-emerald-50 text-[10px] font-mono"
            >
              DONE
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}