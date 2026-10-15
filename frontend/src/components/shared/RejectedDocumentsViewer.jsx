import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FileX, Search, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function RejectedDocumentsViewer() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    api.entities.DocumentUploadLog.filter({ is_rejected: true })
      .then(data => {
        const sorted = [...data].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        setDocs(sorted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this document entry? This cannot be undone.")) return;
    setDeleting(id);
    await api.entities.DocumentUploadLog.delete(id);
    setDocs(prev => prev.filter(d => d.id !== id));
    setDeleting(null);
  };

  const filtered = docs.filter(d => {
    const matchSearch = !search ||
      d.file_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.uploaded_by?.toLowerCase().includes(search.toLowerCase()) ||
      d.rejection_reason?.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || d.entity_type === filterType;
    return matchSearch && matchType;
  });

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading rejected documents...</p>;

  return (
    <Card className="border-orange-200 bg-orange-50/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-orange-700">
          <FileX className="w-4 h-4" /> Rejected / Non-Relevant Documents ({docs.length})
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Documents that failed content validation. They were not added to any grant or contract record.
        </p>

        {docs.length > 0 && (
          <div className="flex gap-2 mt-3 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name, uploader, reason..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="h-8 text-sm border border-input rounded-md px-2 bg-background"
            >
              <option value="all">All Modules</option>
              <option value="Grant">Grant</option>
              <option value="SOW">SOW</option>
              <option value="MSA">MSA</option>
              <option value="MOU">MOU</option>
            </select>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-2">
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No rejected documents yet.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No results match your search.</p>
        ) : (
          filtered.map(doc => (
            <div key={doc.id} className="flex items-start gap-3 p-3 rounded-lg border border-orange-200 bg-white hover:bg-orange-50/40 transition-colors">
              <FileX className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{doc.file_name}</p>
                  <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">{doc.entity_type}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Uploaded by {doc.uploaded_by || "—"} · {doc.created_date ? format(parseISO(doc.created_date), "d MMM yyyy, HH:mm") : "—"}
                </p>
                {doc.rejection_reason && (
                  <p className="text-xs text-orange-700 mt-1 font-medium">Reason: {doc.rejection_reason}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className="bg-orange-100 text-orange-700 border-orange-200 whitespace-nowrap">
                  Rejected
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                  disabled={deleting === doc.id}
                  onClick={() => handleDelete(doc.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}