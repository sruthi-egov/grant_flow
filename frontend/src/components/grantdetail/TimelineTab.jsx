import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format, parseISO } from "date-fns";
import { DollarSign, Calendar, CheckCircle2, AlertCircle, Clock, Package, TrendingUp, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const typeConfig = {
  tranche: {
    label: "Tranche",
    icon: TrendingUp,
    colors: {
      received: "bg-green-100 text-green-700 border-green-200",
      invoiced: "bg-blue-100 text-blue-700 border-blue-200",
      pending:  "bg-yellow-100 text-yellow-700 border-yellow-200",
      overdue:  "bg-red-100 text-red-700 border-red-200",
    },
    dots: {
      received: "bg-green-500",
      invoiced: "bg-blue-500",
      pending:  "bg-yellow-400",
      overdue:  "bg-red-500",
    },
  },
  milestone: {
    label: "Milestone",
    icon: DollarSign,
    colors: {
      paid:     "bg-green-100 text-green-700 border-green-200",
      invoiced: "bg-blue-100 text-blue-700 border-blue-200",
      pending:  "bg-yellow-100 text-yellow-700 border-yellow-200",
      overdue:  "bg-red-100 text-red-700 border-red-200",
    },
    dots: {
      paid:     "bg-green-500",
      invoiced: "bg-blue-500",
      pending:  "bg-yellow-400",
      overdue:  "bg-red-500",
    },
  },
  deliverable: {
    label: "Deliverable",
    icon: Package,
    colors: {
      completed:   "bg-green-100 text-green-700 border-green-200",
      in_progress: "bg-blue-100 text-blue-700 border-blue-200",
      pending:     "bg-yellow-100 text-yellow-700 border-yellow-200",
      overdue:     "bg-red-100 text-red-700 border-red-200",
    },
    dots: {
      completed:   "bg-green-500",
      in_progress: "bg-blue-500",
      pending:     "bg-yellow-400",
      overdue:     "bg-red-500",
    },
  },
  reporting: {
    label: "Report",
    icon: FileText,
    colors: {
      submitted: "bg-green-100 text-green-700 border-green-200",
      upcoming:  "bg-yellow-100 text-yellow-700 border-yellow-200",
      overdue:   "bg-red-100 text-red-700 border-red-200",
      Submitted: "bg-green-100 text-green-700 border-green-200",
      Pending:   "bg-yellow-100 text-yellow-700 border-yellow-200",
      Overdue:   "bg-red-100 text-red-700 border-red-200",
    },
    dots: {
      submitted: "bg-green-500",
      upcoming:  "bg-yellow-400",
      overdue:   "bg-red-500",
      Submitted: "bg-green-500",
      Pending:   "bg-yellow-400",
      Overdue:   "bg-red-500",
    },
  },
};

function getDate(event) {
  return event.due_date || event.invoice_trigger_date || event.received_date;
}

function getTitle(event) {
  if (event._type === "tranche") return event.tranche_name;
  if (event._type === "milestone") return event.title;
  if (event._type === "deliverable") return event.name;
  if (event._type === "reporting") return event.obligation_name || event.report_type;
  return "Event";
}

function getStatusLabel(status) {
  if (!status) return "Unknown";
  return status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function TimelineTab({ grantId }) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    Promise.all([
      base44.entities.GrantTranche.filter({ grant_id: grantId }),
      base44.entities.Milestone.filter({ grant_id: grantId }),
      base44.entities.GrantDeliverable.filter({ grant_id: grantId }),
      base44.entities.GrantReportingObligation.filter({ grant_id: grantId }),
    ]).then(([tranches, milestones, deliverables, obligations]) => {
      const all = [
        ...tranches.map(e => ({ ...e, _type: "tranche" })),
        ...milestones.map(e => ({ ...e, _type: "milestone" })),
        ...deliverables.map(e => ({ ...e, _type: "deliverable" })),
        ...obligations.map(e => ({ ...e, _type: "reporting" })),
      ].filter(e => getDate(e)).sort((a, b) => new Date(getDate(a)) - new Date(getDate(b)));
      setEvents(all);
      setLoading(false);
    });
  }, [grantId]);

  if (loading) return <div className="text-muted-foreground text-sm py-8 text-center">Loading timeline...</div>;

  if (events.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p>No timeline events yet.</p>
      </div>
    );
  }

  return (
    <div className="relative pl-8">
      <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
      <div className="space-y-5">
        {events.map((event) => {
          const cfg = typeConfig[event._type];
          const Icon = cfg.icon;
          const status = event.status?.toLowerCase?.() ?? event.status ?? "pending";
          const colorClass = cfg.colors[event.status] || cfg.colors[status] || "bg-gray-100 text-gray-600 border-gray-200";
          const dotClass = cfg.dots[event.status] || cfg.dots[status] || "bg-gray-400";
          const date = getDate(event);

          return (
            <div key={`${event._type}-${event.id}`} className="relative flex gap-4 items-start">
              <div className={cn("absolute -left-5 mt-1.5 w-3.5 h-3.5 rounded-full border-2 border-background", dotClass)} />
              <div className="flex-1 rounded-lg border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm">{getTitle(event)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{cfg.label}</span>
                    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", colorClass)}>
                      {getStatusLabel(event.status)}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{format(parseISO(date), "MMM d, yyyy")}</span>
                  {event.amount != null && (
                    <span className="font-medium text-foreground">${event.amount.toLocaleString()}</span>
                  )}
                  {event.phase && <span>Phase: {event.phase}</span>}
                </div>
                {event.notes && (
                  <p className="mt-2 text-xs text-muted-foreground border-t pt-2">{event.notes}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}