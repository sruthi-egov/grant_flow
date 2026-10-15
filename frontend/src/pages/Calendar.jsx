import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Loader2,
  DollarSign, FileText, ClipboardCheck, Handshake,
} from "lucide-react";
import { addMonths, subMonths, format, parseISO, isSameDay, isSameMonth } from "date-fns";
import MonthCalendar from "@/components/calendar/MonthCalendar";

const TYPE_META = {
  milestone: { label: "Milestones", icon: FileText, dot: "bg-blue-500", badge: "bg-blue-100 text-blue-700" },
  reporting: { label: "Reporting Deadlines", icon: ClipboardCheck, dot: "bg-purple-500", badge: "bg-purple-100 text-purple-700" },
  payment: { label: "Payments", icon: DollarSign, dot: "bg-green-500", badge: "bg-green-100 text-green-700" },
  mou: { label: "MoU Commitments", icon: Handshake, dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700" },
};

const STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-700",
  Pending: "bg-yellow-100 text-yellow-700",
  upcoming: "bg-yellow-100 text-yellow-700",
  Upcoming: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
  received: "bg-green-100 text-green-700",
  completed: "bg-green-100 text-green-700",
  Completed: "bg-green-100 text-green-700",
  submitted: "bg-blue-100 text-blue-700",
  Submitted: "bg-blue-100 text-blue-700",
  invoiced: "bg-blue-100 text-blue-700",
  sent: "bg-blue-100 text-blue-700",
  Sent: "bg-blue-100 text-blue-700",
  overdue: "bg-red-100 text-red-700",
  Overdue: "bg-red-100 text-red-700",
};

export default function Calendar() {
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ milestone: true, reporting: true, payment: true, mou: true });

  useEffect(() => {
    Promise.all([
      base44.entities.Grant.list("-created_date", 200),
      base44.entities.SOW.list("-created_date", 200),
      base44.entities.MOU.list("-created_date", 200),
      base44.entities.Milestone.list("due_date", 500),
      base44.entities.SowMilestone.list("due_date", 500).catch(() => []),
      base44.entities.ReportingDeadline.list("due_date", 500).catch(() => []),
      base44.entities.GrantReportingObligation.list("due_date", 500).catch(() => []),
      base44.entities.GrantTranche.list("due_date", 500),
      base44.entities.SowInvoice.list("due_date", 500).catch(() => []),
      base44.entities.MouCommitment.list("due_date", 500).catch(() => []),
    ]).then(([grants, sows, mous, milestones, sowMilestones, deadlines, obligations, tranches, invoices, mouCommitments]) => {
      setData({ grants, sows, mous, milestones, sowMilestones, deadlines, obligations, tranches, invoices, mouCommitments });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const events = useMemo(() => {
    if (!data) return [];
    const grantMap = Object.fromEntries(data.grants.map(g => [g.id, g.title || g.grant_name || "—"]));
    const sowMap = Object.fromEntries(data.sows.map(s => [s.id, s.title || "—"]));
    const mouMap = Object.fromEntries(data.mous.map(m => [m.id, m.title || "—"]));

    return [
      ...data.milestones.filter(m => m.due_date).map(m => ({
        id: `milestone-${m.id}`, date: m.due_date, type: "milestone",
        title: m.title, subtitle: grantMap[m.grant_id] || "—",
        amount: m.amount, status: m.status, detailLink: `GrantDetail?id=${m.grant_id}`,
      })),
      ...data.sowMilestones.filter(m => m.due_date).map(m => ({
        id: `sowmilestone-${m.id}`, date: m.due_date, type: "milestone",
        title: m.title, subtitle: sowMap[m.sow_id] || "—",
        amount: m.amount, status: m.status, detailLink: `SOWDetail?id=${m.sow_id}`,
      })),
      ...data.deadlines.filter(d => d.due_date).map(d => ({
        id: `deadline-${d.id}`, date: d.due_date, type: "reporting",
        title: d.report_type, subtitle: grantMap[d.grant_id] || "—",
        amount: null, status: d.status, detailLink: `GrantDetail?id=${d.grant_id}`,
      })),
      ...data.obligations.filter(o => o.due_date).map(o => ({
        id: `obligation-${o.id}`, date: o.due_date, type: "reporting",
        title: o.obligation_name, subtitle: grantMap[o.grant_id] || "—",
        amount: null, status: o.status, detailLink: `GrantDetail?id=${o.grant_id}`,
      })),
      ...data.tranches.filter(t => t.due_date).map(t => ({
        id: `tranche-${t.id}`, date: t.due_date, type: "payment",
        title: t.tranche_name, subtitle: grantMap[t.grant_id] || "—",
        amount: t.amount, status: t.status, detailLink: `GrantDetail?id=${t.grant_id}`,
      })),
      ...data.invoices.filter(i => i.due_date).map(i => ({
        id: `invoice-${i.id}`, date: i.due_date, type: "payment",
        title: i.invoice_number || `Invoice ${i.period || ""}`.trim(),
        subtitle: sowMap[i.sow_id] || "—",
        amount: i.amount, status: i.status, detailLink: `SOWDetail?id=${i.sow_id}`,
      })),
      ...data.mouCommitments.filter(c => c.due_date).map(c => ({
        id: `moucommit-${c.id}`, date: c.due_date, type: "mou",
        title: c.name, subtitle: mouMap[c.mou_id] || "—",
        amount: null, status: c.status, detailLink: `MOUDetail?id=${c.mou_id}`,
      })),
    ];
  }, [data]);

  const filteredEvents = useMemo(() => events.filter(e => filters[e.type]), [events, filters]);

  const selectedDayEvents = useMemo(() =>
    filteredEvents
      .filter(e => e.date && isSameDay(parseISO(e.date), selectedDate))
      .sort((a, b) => {
        const order = { payment: 0, milestone: 1, reporting: 2, mou: 3 };
        return (order[a.type] ?? 9) - (order[b.type] ?? 9);
      }),
  [filteredEvents, selectedDate]);

  const monthEventCount = useMemo(() =>
    filteredEvents.filter(e => {
      try { return isSameMonth(parseISO(e.date), currentMonth); } catch { return false; }
    }).length,
  [filteredEvents, currentMonth]);

  const toggleFilter = (type) => setFilters(f => ({ ...f, [type]: !f[type] }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CalendarIcon className="w-7 h-7 text-primary" /> Calendar
          </h1>
          <p className="text-muted-foreground mt-1">
            All milestones, reporting deadlines, and payment dates across grants and MoUs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()); }}>
            Today
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold min-w-[120px] text-center">
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(TYPE_META).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => toggleFilter(key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              filters[key] ? `${meta.badge} border-transparent` : "bg-muted/50 text-muted-foreground border-border opacity-60"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", meta.dot)} />
            {meta.label}
          </button>
        ))}
        <span className="text-xs text-muted-foreground ml-1">
          {monthEventCount} event{monthEventCount !== 1 ? "s" : ""} this month
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar grid */}
          <div className="lg:col-span-2 overflow-x-auto">
            <MonthCalendar
              month={currentMonth}
              events={filteredEvents}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          </div>

          {/* Selected day events panel */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {format(selectedDate, "EEEE, d MMM yyyy")}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {selectedDayEvents.length} event{selectedDayEvents.length !== 1 ? "s" : ""}
              </p>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
              {selectedDayEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No events on this day.</p>
              ) : selectedDayEvents.map(e => {
                const meta = TYPE_META[e.type];
                return (
                  <Link key={e.id} to={createPageUrl(e.detailLink)} className="block">
                    <div className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <meta.icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                          <p className="text-sm font-medium truncate">{e.title}</p>
                        </div>
                        {e.status && (
                          <Badge className={`shrink-0 text-[10px] ${STATUS_COLORS[e.status] || "bg-gray-100 text-gray-700"}`}>
                            {e.status}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{e.subtitle}</p>
                      {e.amount != null && e.amount > 0 && (
                        <p className="text-xs font-semibold text-green-600 mt-0.5">
                          ${(e.amount || 0).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}