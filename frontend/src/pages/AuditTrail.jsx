import { useState, useEffect, useMemo } from "react";
import { api } from "@/api/apiClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Search, RefreshCw, FileText, CheckCircle2, AlertTriangle, XCircle, ChevronDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useDebounce } from "@/hooks/useDebounce";
import { SkeletonTable, SkeletonKPI } from "@/components/ui/skeleton-card";

const STATUS_COLORS = {
  success: "bg-green-100 text-green-700",
  warning: "bg-yellow-100 text-yellow-700",
  error: "bg-red-100 text-red-700",
};

const ACTION_ICONS = {
  document_uploaded: "📄",
  document_force_approved: "✅",
  document_reclassified: "🔄",
  document_deleted: "🗑️",
  grant_created: "📝",
  health_score_calculated: "📊",
};

const PAGE_SIZE = 50;

export default function AuditTrail() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState(new Set());

  const debouncedSearch = useDebounce(search, 350);

  const fetchLogs = async () => {
    setLoading(true);
    const data = await api.entities.AuditLog.list("-created_date", 500);
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => {
    api.auth.me().then(u => {
      setUser(u);
      if (u?.role === "admin") fetchLogs();
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const toggleRow = (id) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const uniqueActions = useMemo(() => ["All", ...new Set(logs.map(l => l.action_type).filter(Boolean))], [logs]);

  const filtered = useMemo(() => logs.filter(log => {
    const s = debouncedSearch.toLowerCase();
    const matchSearch = !s ||
      log.description?.toLowerCase().includes(s) ||
      log.entity_name?.toLowerCase().includes(s) ||
      log.user_email?.toLowerCase().includes(s);
    const matchAction = actionFilter === "All" || log.action_type === actionFilter;
    const matchStatus = statusFilter === "All" || log.status === statusFilter;
    return matchSearch && matchAction && matchStatus;
  }), [logs, debouncedSearch, actionFilter, statusFilter]);

  useEffect(() => { setPage(1); }, [debouncedSearch, actionFilter, statusFilter]);

  const paginated = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);

  const stats = useMemo(() => ({
    total: logs.length,
    success: logs.filter(l => l.status === "success").length,
    warning: logs.filter(l => l.status === "warning").length,
    error: logs.filter(l => l.status === "error").length,
  }), [logs]);

  if (!loading && user && user.role !== "admin") {
    return (
      <div className="p-6 max-w-2xl mx-auto mt-20 text-center">
        <Shield className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground mt-2">The Audit Trail is only accessible to administrators.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="w-7 h-7 text-primary" /> Audit Trail
          </h1>
          <p className="text-muted-foreground mt-1">Complete log of all actions performed across the system.</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {loading ? [1,2,3,4].map(i => <SkeletonKPI key={i} />) : (
          [
            { label: "Total Actions", value: stats.total, icon: FileText, color: "text-blue-600" },
            { label: "Success", value: stats.success, icon: CheckCircle2, color: "text-green-600" },
            { label: "Warnings", value: stats.warning, icon: AlertTriangle, color: "text-yellow-600" },
            { label: "Errors", value: stats.error, icon: XCircle, color: "text-red-600" },
          ].map((s, i) => (
            <Card key={i}>
              <CardContent className="p-4 text-center">
                <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.color}`} />
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by description, entity, or user..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Action type" /></SelectTrigger>
          <SelectContent>
            {uniqueActions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            {["All", "success", "warning", "error"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!loading && (
        <p className="text-xs text-muted-foreground">
          Showing {paginated.length} of {filtered.length} entries
          {filtered.length !== logs.length && ` (filtered from ${logs.length} total)`}
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <SkeletonTable rows={8} />
          ) : paginated.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Shield className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p>No audit log entries found.</p>
            </div>
          ) : (
            <div className="divide-y">
              {paginated.map(log => {
                const isExpanded = expandedRows.has(log.id);
                const hasDetail = log.old_value || log.new_value;
                return (
                  <div key={log.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-start gap-3">
                      <span className="text-xl shrink-0 mt-0.5">{ACTION_ICONS[log.action_type] || "🔹"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{log.action_type?.replace(/_/g, " ")}</p>
                          {log.entity_type && <Badge variant="outline" className="text-xs">{log.entity_type}</Badge>}
                          {log.status && <Badge className={`text-xs ${STATUS_COLORS[log.status]}`}>{log.status}</Badge>}
                        </div>
                        {log.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{log.description}</p>}
                        <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground mt-1">
                          {log.user_email && <span>👤 {log.user_email}</span>}
                          {log.entity_name && <span>📄 {log.entity_name}</span>}
                        </div>
                        {hasDetail && isExpanded && (
                          <div className="mt-2 text-xs bg-muted/40 rounded p-2 font-mono break-all">
                            {log.old_value && <p><span className="text-red-500">− </span>{log.old_value}</p>}
                            {log.new_value && <p><span className="text-green-600">+ </span>{log.new_value}</p>}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {log.created_date ? format(parseISO(log.created_date), "d MMM yyyy, HH:mm") : "—"}
                        </span>
                        {hasDetail && (
                          <button onClick={() => toggleRow(log.id)} className="text-xs text-primary flex items-center gap-0.5 hover:underline">
                            {isExpanded ? "Hide" : "Details"}
                            <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {paginated.length < filtered.length && (
        <div className="text-center">
          <Button variant="outline" onClick={() => setPage(p => p + 1)}>
            Load more ({filtered.length - paginated.length} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}