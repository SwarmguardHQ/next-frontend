import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DroneScenario } from "@/types/drone";
import { cn } from "@/lib/utils";

interface ScenarioStepsProps {
  scenario: DroneScenario;
  activeStep: number;
}

export function ScenarioSteps({ scenario, activeStep }: ScenarioStepsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">{scenario.icon}</span>
          <div>
            <CardTitle className="text-sm text-slate-800">{scenario.label}</CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              {scenario.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <ol className="space-y-0">
          {scenario.steps.map((step, i) => {
            const isDone = i < activeStep;
            const isActive = i === activeStep;
            const isPending = i > activeStep;

            return (
              <li
                key={i}
                className={cn(
                  "flex items-center gap-3 py-2.5 border-b border-slate-800/60 last:border-0 text-sm transition-colors duration-300",
                  isDone && "text-slate-500",
                  isActive && "text-slate-200",
                  isPending && "text-slate-600"
                )}
              >
                <span className="shrink-0">
                  {isDone && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  )}
                  {isActive && (
                    <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                  )}
                  {isPending && (
                    <Circle className="h-4 w-4 text-slate-700" />
                  )}
                </span>
                {step}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}