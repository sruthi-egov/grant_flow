import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, Activity } from "lucide-react";
import { calculateGrantHealthScore, loadWeightConfig, scoreBg } from "@/hooks/useGrantHealthScore";
import { format } from "date-fns";

export default function GrantHealthReport() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [calcDate] = useState(new Date().toISOString());

  useEffect(() => {
    const load = async () => {
      const grants = await base44.entities.Grant.list("-created_date", 200);
      const active = grants.filter(g => !g.archived);
      const weights = await loadWeightConfig();

      const results = await Promise.all(
        active.map(async grant => {
          const [milestones, tranches, obligations, uploadLogs, deliverables] = await Promise.all([
            base44.entities.Milestone.filter({ grant_id: grant.id }),
            base44.entities.GrantTranche.filter({ grant_id: grant.id }),
            base44.entities.GrantReportingObligation.filter({ grant_id: grant.id }),
            base44.entities.DocumentUploadLog.filter({ entity_id: grant.id }),
            base44.entities.GrantDeliverable.filter({ grant_id: grant.id }),
          ]);
          const score = calculateGrantHealthScore(grant, { milestones, tranches, obligations, uploadLogs, deliverables }, weights);
          return { grant, score };
        })
      );
      setRows(results);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = rows.filter(({ grant, score }) => {
    if (statusFilter !== "all" && score.health_status !== statusFilter) return false;
    if (search && !(grant.title || grant.grant_name || "").toLowerCase().includes(search.toLowerCase()) &&
        !(grant.funder || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (minScore && score.overall_score < Number(minScore)) return false;
    if (maxScore && score.overall_score > Number(maxScore)) return false;
    return true;
  });

  const exportCSV = () => {
    const headers = ["Grant Name", "Donor", "Grant Amount", "Overall Score", "Status", "Milestone Score", "Financial Score", "Reporting Score", "Document Score", "Timeline Score", "Key Risk", "Calculated Date"];
    const csvRows = filtered.map(({ grant, score }) => [
      `"${grant.title || grant.grant_name || ""}"`,
      `"${grant.funder || ""}"`,
      grant.total_amount || 0,
      score.overall_score,
      score.health_status,
      score.milestone_score,
      score.financial_score,
      score.reporting_score,
      score.document_score,
      score.timeline_score,
      `"${score.reasons[0] || ""}"`,
      format(new Date(calcDate), "d MMM yyyy HH:mm"),
    ]);
    const csv = [headers, ...csvRows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `grant_health_report_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mr-2" /> Calculating health scores...
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input placeholder="Search grant or donor..." value={search} onChange={e => setSearch(e.target.value)} className="w-52" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Green">Green</SelectItem>
            <SelectItem value="Amber">Amber</SelectItem>
            <SelectItem value="Red">Red</SelectItem>
          </SelectContent>
        </Select>
        <Input type="number" placeholder="Min score" value={minScore} onChange={e => setMinScore(e.target.value)} className="w-28" />
        <Input type="number" placeholder="Max score" value={maxScore} onChange={e => setMaxScore(e.target.value)} className="w-28" />
        <Button variant="outline" className="gap-2 ml-auto" onClick={exportCSV}>
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-40" />
          No grants available to calculate health score.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Grant Name</th>
                <th className="text-left px-4 py-3 font-medium">Donor</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
                <th className="text-center px-4 py-3 font-medium">Health Score</th>
                <th className="text-center px-4 py-3 font-medium">Milestone</th>
                <th className="text-center px-4 py-3 font-medium">Financial</th>
                <th className="text-center px-4 py-3 font-medium">Reporting</th>
                <th className="text-center px-4 py-3 font-medium">Document</th>
                <th className="text-center px-4 py-3 font-medium">Timeline</th>
                <th className="text-left px-4 py-3 font-medium">Key Risk</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ grant, score }) => (
                <tr key={grant.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium max-w-[200px]">
                    <span className="truncate block">{grant.title || grant.grant_name}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[140px]">
                    <span className="truncate block">{grant.funder || "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {grant.total_amount ? `$${grant.total_amount.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${scoreBg(score.health_status)}`}>
                      {score.overall_score}/100 · {score.health_status}
                    </span>
                  </td>
                  {[score.milestone_score, score.financial_score, score.reporting_score, score.document_score, score.timeline_score].map((s, i) => (
                    <td key={i} className={`px-4 py-3 text-center tabular-nums font-medium ${s >= 80 ? "text-green-600" : s >= 50 ? "text-amber-600" : "text-red-600"}`}>
                      {s}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px]">
                    <span className="line-clamp-2">{score.reasons[0] || "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Calculated: {format(new Date(calcDate), "d MMM yyyy, HH:mm")} · {filtered.length} grants shown
      </p>
    </div>
  );
}