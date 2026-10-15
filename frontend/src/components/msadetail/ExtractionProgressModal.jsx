import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Circle, XCircle, RefreshCw } from "lucide-react";

const STEPS = [
  { id: "find_pdf", label: "Finding linked agreement PDF" },
  { id: "reading", label: "Reading agreement" },
  { id: "extracting", label: "Identifying key clauses" },
  { id: "preparing", label: "Preparing review" },
];

// status: 'running' | 'done' | 'error' | 'idle'
// activeStep: one of the step ids
export default function ExtractionProgressModal({ open, activeStep, status, errorMessage, onClose, onRetry }) {
  const activeIdx = STEPS.findIndex(s => s.id === activeStep);

  return (
    <Dialog open={open} onOpenChange={status === "error" ? onClose : undefined}>
      <DialogContent className="max-w-md" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {status === "error"
              ? <XCircle className="w-5 h-5 text-red-500" />
              : <Loader2 className="w-5 h-5 animate-spin text-primary" />
            }
            Extracting Key Clauses from Agreement
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {STEPS.map((step, i) => {
            const isPast = i < activeIdx;
            const isCurrent = i === activeIdx;
            const isFuture = i > activeIdx;
            const isErrorStep = status === "error" && isCurrent;

            return (
              <div key={step.id} className="flex items-center gap-3">
                <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                  {isErrorStep
                    ? <XCircle className="w-5 h-5 text-red-500" />
                    : isPast
                      ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                      : isCurrent
                        ? <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        : <Circle className="w-5 h-5 text-muted-foreground/30" />
                  }
                </div>
                <span className={`text-sm ${
                  isErrorStep ? "text-red-600 font-medium"
                  : isPast ? "text-muted-foreground line-through"
                  : isCurrent ? "text-foreground font-medium"
                  : "text-muted-foreground"
                }`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {status === "running" && (
          <p className="text-xs text-muted-foreground border-t pt-3">
            This may take 15–60 seconds for long agreements. Please do not close this window.
          </p>
        )}

        {status === "error" && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {errorMessage || "Extraction failed. Please retry or add clauses manually."}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
              <Button size="sm" onClick={onRetry} className="gap-1">
                <RefreshCw className="w-3 h-3" /> Retry
              </Button>
            </div>
          </div>
        )}

        {status === "running" && (
          <div className="border-t pt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}