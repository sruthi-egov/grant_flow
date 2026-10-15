import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, TrendingUp, FileText, Calendar, Clock } from "lucide-react";
import { calculateGrantHealthScore, loadWeightConfig, scoreBg, scoreColor, PARAM_LABELS } from "@/hooks/useGrantHealthScore";
import { format } from "date-fns";

const PARAMS = [
  { key: "milestone_score", wKey: "milestone_weightage", wdKey: "milestone_weighted_score", label: "Milestone Completion" },
  { key: "financial_score", wKey: "financial_weightage", wdKey: "financial_weighted_score", label: "Financial Utilization" },
  { key: "reporting_score", wKey: "reporting_weightage", wdKey: "reporting_weighted_score", label: "Reporting Compliance" },
  { key: "document_score", wKey: "document_weightage", wdKey: "document_weighted_score", label: "Document Completeness" },
  { key: "timeline_score", wKey: "timeline_weightage", wdKey: "timeline_weighted_score", label: "Timeline Adherence" },
];

export default function GrantHealthScoreTab({ grantId, grant }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recalcing, setRecalcing] = useState(false);
  const [lastCalc, setLastCalc] = useState(null);

  const calculate = async () => {
    setRecalcing(true);
    const [milestones, tranches, obligations, uploadLogs, deliverables, weights] = await Promise.all([
      api.entities.Milestone.filter({ grant_id: grantId }),
      api.entities.GrantTranche.filter({ grant_id: grantId }),
      api.entities.GrantReportingObligation.filter({ grant_id: grantId }),
      api.entities.DocumentUploadLog.filter({ entity_id: grantId }),
      api.entities.GrantDeliverable.filter({ grant_id: grantId }),
      loadWeightConfig(),
    ]);

    const score = calculateGrantHealthScore(grant, { milestones, tranches, obligations, uploadLogs, deliverables }, weights);
    setResult(score);
    setLastCalc(new Date().toISOString());
    setRecalcing(false);
  };

  useEffect(() => {
    if (!grantId) return;
    setLoading(true);
    calculate().finally(() => setLoading(false));
  }, [grantId]);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!result) return (
    <div className="text-center py-16 text-muted-foreground">Grant Health Score cannot be calculated due to missing required data.</div>
  );

  const statusColor = scoreBg(result.health_status);

  return (
    <div className="space-y-6">
      {/* Header score card */}
      <Card className={`border-2 ${result.health_status === "Green" ? "border-green-200 bg-green-50/30" : result.health_status === "Amber" ? "border-amber-200 bg-amber-50/30" : "border-red-200 bg-red-50/30"}`}>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Grant Health Score</p>
              <div className="flex items-baseline gap-3">
                <span className={`text-5xl font-bold ${scoreColor(result.health_status)}`}>{result.overall_score}</span>
                <span className="text-2xl text-muted-foreground">/100</span>
                <Badge className={`text-sm px-3 py-1 ${statusColor}`}>{result.health_status}</Badge>
              </div>
              {lastCalc && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Last calculated: {format(new Date(lastCalc), "d MMM yyyy, HH:mm")}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 self-start sm:self-center"
              onClick={calculate}
              disabled={recalcing}
            >
              {recalcing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Recalculate
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Score Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Score Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left pb-2 font-medium text-muted-foreground">Parameter</th>
                  <th className="text-right pb-2 font-medium text-muted-foreground">Score</th>
                  <th className="text-right pb-2 font-medium text-muted-foreground">Weightage</th>
                  <th className="text-right pb-2 font-medium text-muted-foreground">Weighted</th>
                  <th className="text-left pb-2 pl-4 font-medium text-muted-foreground hidden md:table-cell">Progress</th>
                </tr>
              </thead>
              <tbody>
                {PARAMS.map(p => {
                  const score = result[p.key];
                  const weightage = result[p.wKey];
                  const weighted = result[p.wdKey];
                  const statusClr = score >= 80 ? "bg-green-500" : score >= 50 ? "bg-amber-400" : "bg-red-500";
                  return (
                    <tr key={p.key} className="border-b last:border-0">
                      <td className="py-3 pr-2 font-medium">{p.label}</td>
                      <td className="py-3 text-right tabular-nums">
                        <span className={score >= 80 ? "text-green-600 font-semibold" : score >= 50 ? "text-amber-600 font-semibold" : "text-red-600 font-semibold"}>
                          {score}
                        </span>
                      </td>
                      <td className="py-3 text-right text-muted-foreground tabular-nums">{weightage}%</td>
                      <td className="py-3 text-right font-semibold tabular-nums">{weighted}</td>
                      <td className="py-3 pl-4 hidden md:table-cell">
                        <div className="w-32 bg-muted rounded-full h-2">
                          <div className={`h-2 rounded-full ${statusClr}`} style={{ width: `${Math.min(100, score)}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-muted/30">
                  <td className="py-3 pr-2 font-bold">Overall Score</td>
                  <td className="py-3 text-right" />
                  <td className="py-3 text-right text-muted-foreground font-medium">100%</td>
                  <td className="py-3 text-right font-bold text-lg">{result.overall_score}</td>
                  <td className="hidden md:table-cell" />
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Reasons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Score Explanation</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {result.reasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className={`mt-0.5 w-4 h-4 shrink-0 rounded-full flex items-center justify-center text-white text-xs font-bold ${result.health_status === "Green" ? "bg-green-500" : result.health_status === "Amber" ? "bg-amber-400" : "bg-red-500"}`}>
                  {i + 1}
                </span>
                {reason}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Missing data notices */}
      {Object.values(result._missing).some(Boolean) && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Some scores use estimated values</p>
              <p className="text-xs text-muted-foreground mt-1">
                Parameters with missing data use a neutral score of 50 to avoid unfair penalisation.
                {result._missing.milestones && " Add milestones to improve accuracy."} 
                {result._missing.financial && " Set a total grant amount for financial scoring."} 
                {result._missing.reporting && " Add reporting obligations to improve compliance score."} 
                {result._missing.documents && " Upload documents to improve completeness score."} 
                {result._missing.timeline && " Add deliverables with due dates for timeline scoring."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}