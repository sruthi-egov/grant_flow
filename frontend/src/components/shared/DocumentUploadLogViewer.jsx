import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, ShieldCheck, ShieldX, Copy, Ban, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import RejectedDocumentsViewer from "@/components/shared/RejectedDocumentsViewer";

export default function DocumentUploadLogViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const fetchLogs = () => {
    base44.entities.DocumentUploadLog.list("-created_date", 200)
      .then(data => { setLogs(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchLogs(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this document log entry? This cannot be undone.")) return;
    setDeleting(id);
    await base44.entities.DocumentUploadLog.delete(id);
    setLogs(prev => prev.filter(l => l.id !== id));
    setDeleting(null);
  };

  const invalidDocs = logs.filter(l => l.is_invalid === true);
  const validDocs = logs.filter(l => l.is_invalid !== true);
  const dpiRelevant = validDocs.filter(l => l.is_dpi_relevant !== false);
  const nonDpi = validDocs.filter(l => l.is_dpi_relevant === false);

  const renderRow = (log) => (
    <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
      <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate">{log.file_name}</p>
          {log.is_duplicate && (
            <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs gap-1">
              <Copy className="w-3 h-3" /> Duplicate
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">{log.entity_type}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Uploaded by {log.uploaded_by || "—"} · {log.created_date ? format(parseISO(log.created_date), "d MMM yyyy, HH:mm") : "—"}
        </p>
        {log.is_invalid && log.invalid_reason && (
          <p className="text-xs text-red-600 mt-0.5 italic">"{log.invalid_reason}"</p>
        )}
        {!log.is_invalid && log.dpi_relevance_reason && (
          <p className="text-xs text-muted-foreground mt-0.5 italic">"{log.dpi_relevance_reason}"</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {log.is_invalid ? (
          <Badge className="bg-red-100 text-red-700">Invalid</Badge>
        ) : (
          <Badge className={log.is_dpi_relevant !== false ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>
            {log.is_dpi_relevant !== false ? "DPI Relevant" : "Non-DPI"}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50"
          disabled={deleting === log.id}
          onClick={() => handleDelete(log.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading document log...</p>;

  return (
    <div className="space-y-6">

      {/* Invalid Documents — DPI Centre mentions */}
      {invalidDocs.length > 0 && (
        <Card className="border-red-300 bg-red-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-red-700">
              <Ban className="w-4 h-4" /> Invalid Documents — DPI Centre Mentioned ({invalidDocs.length})
            </CardTitle>
            <p className="text-sm text-red-600">These documents reference "DPI Centre" as a party and were rejected. They did not populate any form fields.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {invalidDocs.map(renderRow)}
          </CardContent>
        </Card>
      )}

      {/* DPI Relevant */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-green-700">
            <ShieldCheck className="w-4 h-4" /> DPI Relevant Documents ({dpiRelevant.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {dpiRelevant.length === 0
            ? <p className="text-sm text-muted-foreground">No DPI-relevant documents uploaded yet.</p>
            : dpiRelevant.map(renderRow)
          }
        </CardContent>
      </Card>

      {/* Non-DPI Relevant */}
      {nonDpi.length > 0 && (
        <Card className="border-yellow-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-yellow-700">
              <ShieldX className="w-4 h-4" /> Non-DPI Relevant Documents ({nonDpi.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground">These documents were uploaded but identified as not relevant to DPI's mandate.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {nonDpi.map(renderRow)}
          </CardContent>
        </Card>
      )}

      {logs.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No documents have been uploaded yet.</p>
      )}

      {/* Rejected / Non-Relevant Documents */}
      <RejectedDocumentsViewer />
    </div>
  );
}