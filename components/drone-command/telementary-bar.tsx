import { TelemetryState } from "@/types/drone";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Wifi } from "lucide-react";

export function TelemetryBar({ telemetry }: { telemetry: TelemetryState }) {
  const items = [
    { label: "ALT", value: telemetry.altitude, unit: "m" },
    { label: "SPD", value: telemetry.speed.toFixed(1), unit: "m/s" },
    { label: "BAT", value: telemetry.battery, unit: "%", warn: telemetry.battery < 30 },
    { label: "LAT", value: telemetry.lat.toFixed(4), unit: "" },
    { label: "LNG", value: telemetry.lng.toFixed(4), unit: "" },
  ];

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-800 mr-2">
          <Wifi className="h-3 w-3 text-emerald-500" />
          <span className="font-mono text-emerald-500">LIVE</span>
        </div>

        {items.map((item, i) => (
          <div key={i} className="flex items-baseline gap-1.5">
            <span className="font-mono text-[10px] tracking-widest text-slate-800">{item.label}</span>
            <span
              className={`font-mono text-sm font-medium ${
                item.warn ? "text-red-400" : "text-slate-400"
              }`}
            >
              {item.value}
              {item.unit && (
                <span className="text-[10px] text-slate-700 ml-0.5">{item.unit}</span>
              )}
            </span>
          </div>
        ))}

        <div className="ml-auto">
          <Badge
            variant="outline"
            className="font-mono text-[10px] tracking-widest border-slate-700 text-slate-400"
          >
            {telemetry.status}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}