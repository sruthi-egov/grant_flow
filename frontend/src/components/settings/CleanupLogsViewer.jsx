import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const SCOPE_LABELS = {
  files_only: "Files Only",
  files_and_validation_logs: "Files + Validation Logs",
  files_metadata_and_tables: "Files + Metadata + Tables",
  files_and_extracted_items: "Files + Extracted Items",
  full_file_cleanup: "Full Cleanup",
};

export default function CleanupLogsViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const data = await api.entities.CleanupLog.list("-created_date", 20);
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="w-4 h-4" />
              Cleanup Logs
            </CardTitle>
            <CardDescription>History of file cleanup operations performed by admins.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No cleanup operations have been performed yet.</p>
        ) : (
          <div className="space-y-3">
            {logs.map(log => (
              <div key={log.id} className="border rounded-lg p-4 text-sm space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {log.status === "completed"
                      ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                      : log.status === "failed"
                        ? <XCircle className="w-4 h-4 text-red-500" />
                        : <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                    <span className="font-medium">{SCOPE_LABELS[log.cleanup_scope] || log.cleanup_scope}</span>
                    <Badge variant="outline" className={log.status === "completed" ? "text-green-700 border-green-300" : log.status === "failed" ? "text-red-700 border-red-300" : "text-blue-700 border-blue-300"}>
                      {log.status}
                    </Badge>
                    {log.backup_exported && <Badge variant="outline" className="text-xs">Backup taken</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{log.started_at ? new Date(log.started_at).toLocaleString() : ""}</span>
                </div>
                <p className="text-muted-foreground text-xs">By: {log.initiated_by_email}</p>
                {log.summary && <p className="text-xs text-muted-foreground">{log.summary}</p>}
                {log.errors?.length > 0 && (
                  <div className="text-xs text-red-600 space-y-0.5">
                    {log.errors.map((e, i) => <p key={i}>• {e}</p>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}