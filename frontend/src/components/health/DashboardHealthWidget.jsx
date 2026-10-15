/**
 * DashboardHealthWidget — uses pre-fetched data passed as props.
 * Zero API calls — computes health scores from props using useMemo.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ArrowRight } from "lucide-react";
import { calculateGrantHealthScore, scoreBg } from "@/hooks/useGrantHealthScore";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function DashboardHealthWidget({ grants, milestones, tranches, obligations, uploadLogs, deliverables, weights }) {
  const scores = useMemo(() => {
    if (!grants || grants.length === 0 || !weights) return [];
    const activeGrants = grants.filter(g => !g.archived && g.status === "active");
    return activeGrants.map(grant => {
      const score = calculateGrantHealthScore(
        grant,
        {
          milestones: (milestones || []).filter(m => m.grant_id === grant.id),
          tranches: (tranches || []).filter(t => t.grant_id === grant.id),
          obligations: (obligations || []).filter(o => o.grant_id === grant.id),
          uploadLogs: (uploadLogs || []).filter(l => l.entity_id === grant.id),
          deliverables: (deliverables || []).filter(d => d.grant_id === grant.id),
        },
        weights
      );
      return { grant, score };
    });
  }, [grants, milestones, tranches, obligations, uploadLogs, deliverables, weights]);

  const green = scores.filter(s => s.score.health_status === "Green").length;
  const amber = scores.filter(s => s.score.health_status === "Amber").length;
  const red = scores.filter(s => s.score.health_status === "Red").length;
  const avg = scores.length > 0
    ? Math.round(scores.reduce((s, r) => s + r.score.overall_score, 0) / scores.length)
    : null;

  const atRisk = scores
    .filter(s => s.score.health_status === "Red" || s.score.health_status === "Amber")
    .sort((a, b) => a.score.overall_score - b.score.overall_score)
    .slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="w-4 h-4 text-primary" /> Grant Health Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {scores.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active grants to calculate health score.</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-muted/40 rounded-lg p-2">
                <p className="text-lg font-bold">{avg ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Avg Score</p>
              </div>
              <div className="bg-green-50 rounded-lg p-2">
                <p className="text-lg font-bold text-green-600">{green}</p>
                <p className="text-xs text-green-700">Green</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-2">
                <p className="text-lg font-bold text-amber-600">{amber}</p>
                <p className="text-xs text-amber-700">Amber</p>
              </div>
              <div className="bg-red-50 rounded-lg p-2">
                <p className="text-lg font-bold text-red-600">{red}</p>
                <p className="text-xs text-red-700">Red</p>
              </div>
            </div>
            {atRisk.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Grants Requiring Attention</p>
                <div className="space-y-1.5">
                  {atRisk.map(({ grant, score }) => (
                    <Link key={grant.id} to={createPageUrl(`GrantDetail?id=${grant.id}`)}>
                      <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{grant.title || grant.grant_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{score.reasons[0] || ""}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreBg(score.health_status)}`}>
                            {score.overall_score}
                          </span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}