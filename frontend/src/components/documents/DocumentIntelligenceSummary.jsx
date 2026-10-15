/**
 * Small dashboard widget showing document intelligence summary.
 */
import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function DocumentIntelligenceSummary() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.entities.DocumentValidationLog.list("-created_date", 500).then(docs => {
      setStats({
        total: docs.length,
        valid: docs.filter(d => d.validation_status === "Valid" || d.validation_status === "ForceApproved").length,
        invalid: docs.filter(d => d.validation_status === "Invalid").length,
        duplicate: docs.filter(d => d.validation_status === "Duplicate").length,
        pending: docs.filter(d => ["PendingReview", "NeedsReview"].includes(d.validation_status)).length,
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="w-4 h-4 text-primary" /> Document Intelligence
        </CardTitle>
        <Link to={createPageUrl("DocumentIntelligence")}>
          <Button variant="ghost" size="sm" className="gap-1 text-xs">View All <ArrowRight className="w-3 h-3" /></Button>
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
        ) : !stats || stats.total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Documents</span>
              <span className="font-semibold">{stats.total}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3.5 h-3.5" />Valid</span>
              <span className="font-semibold text-green-700">{stats.valid}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-red-600"><XCircle className="w-3.5 h-3.5" />Invalid</span>
              <span className="font-semibold text-red-700">{stats.invalid}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-orange-500"><AlertTriangle className="w-3.5 h-3.5" />Duplicates</span>
              <span className="font-semibold text-orange-600">{stats.duplicate}</span>
            </div>
            {stats.pending > 0 && (
              <div className="mt-2 pt-2 border-t">
                <Link to={createPageUrl("DocumentIntelligence")}>
                  <p className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1.5">
                    ⚠ {stats.pending} document{stats.pending > 1 ? "s" : ""} pending admin review
                  </p>
                </Link>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}