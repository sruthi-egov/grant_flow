import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Clock, RefreshCw, FlaskConical, User, Mail, Shield } from "lucide-react";
import { format, parseISO } from "date-fns";

const STATUS_COLORS = { sent: "bg-green-100 text-green-700", failed: "bg-red-100 text-red-700", skipped: "bg-gray-100 text-gray-600" };
const TYPE_COLORS = { upcoming: "bg-blue-100 text-blue-700", overdue: "bg-orange-100 text-orange-700", test: "bg-purple-100 text-purple-700" };
const SOURCE_COLORS = { "Record Contact": "bg-indigo-100 text-indigo-700", "Additional Recipient": "bg-teal-100 text-teal-700" };

export default function NotificationLogsViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [showTestOnly, setShowTestOnly] = useState(false);
  const [page, setPage] = useState(0);
  const PER_PAGE = 20;

  const load = async () => {
    setLoading(true);
    const all = await base44.entities.NotificationLog.list("-created_date", 200);
    setLogs(all);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = logs.filter(l => {
    if (filter !== "all" && l.status !== filter) return false;
    if (showTestOnly && !l.is_test) return false;
    if (!showTestOnly && l.is_test) return false;
    return true;
  });
  const paged = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4" /> Notification History
            </CardTitle>
            <CardDescription>Audit trail of sent, failed, and test notifications.</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">Real</span>
              <Switch checked={showTestOnly} onCheckedChange={v => { setShowTestOnly(v); setPage(0); }} />
              <span className="text-muted-foreground">Test</span>
            </div>
            <Select value={filter} onValueChange={v => { setFilter(v); setPage(0); }}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={load} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {paged.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {showTestOnly ? "No test notification logs yet." : "No notification logs yet."}
          </p>
        ) : (
          <div className="space-y-2">
            {paged.map(log => (
              <div key={log.id} className="flex items-start justify-between p-3 bg-muted/30 rounded-lg text-sm gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[log.status] || ''}`}>{log.status}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[log.notification_type] || ''}`}>{log.notification_type}</span>
                    {log.is_test && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700 flex items-center gap-1">
                        <FlaskConical className="w-3 h-3" /> TEST
                      </span>
                    )}
                    {log.recipient_source && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[log.recipient_source] || ''} flex items-center gap-1`}>
                        {log.recipient_source === "Record Contact" ? <User className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                        {log.recipient_source}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{log.rule_name}</span>
                  </div>
                  <p className="font-medium truncate">{log.item_title || '—'}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>To: {log.recipient_email}</span>
                    {log.record_type && <span>· {log.record_type}</span>}
                  </div>
                  {log.initiated_by && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Shield className="w-3 h-3" /> Initiated by: {log.initiated_by}
                    </p>
                  )}
                  {log.error_message && <p className="text-xs text-red-600 mt-1">{log.error_message}</p>}
                </div>
                <div className="text-right text-xs text-muted-foreground shrink-0">
                  {log.sent_date && <p>{format(parseISO(log.sent_date), "MMM d, yyyy HH:mm")}</p>}
                  <p className="text-muted-foreground/70">Scheduled: {log.scheduled_for_date}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}