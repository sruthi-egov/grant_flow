import { Badge } from "@/components/ui/badge";
import { scoreBg } from "@/hooks/useGrantHealthScore";

/**
 * Compact health score badge — used in cards and list rows.
 */
export default function HealthScoreBadge({ score, status, size = "sm" }) {
  if (score == null || status == null) return null;
  const cls = scoreBg(status);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${size === "sm" ? "text-xs" : "text-sm"} ${cls}`}>
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          status === "Green" ? "bg-green-600" : status === "Amber" ? "bg-amber-500" : "bg-red-600"
        }`}
      />
      {Math.round(score)}/100 · {status}
    </span>
  );
}