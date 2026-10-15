import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Calendar, Hash, FileText, ExternalLink, TrendingUp } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";

const trancheStatusColors = {
  pending: "bg-yellow-100 text-yellow-700",
  invoiced: "bg-blue-100 text-blue-700",
  received: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
};

export default function GrantOverview({ grant }) {
  const [tranches, setTranches] = useState([]);
  const [milestones, setMilestones] = useState([]);

  useEffect(() => {
    Promise.all([
      api.entities.GrantTranche.filter({ grant_id: grant.id }, "due_date"),
      api.entities.Milestone.filter({ grant_id: grant.id }),
    ]).then(([t, m]) => { setTranches(t); setMilestones(m); });
  }, [grant.id]);

  const total = grant.total_amount || 0;
  // Tranches are the source of truth for funding received; milestones with amounts
  // duplicate the same payments, so only count tranches to avoid double-counting.
  // Fall back to paid milestones only when no tranches exist at all.
  const trancheReceived = tranches.filter(t => t.status === "received").reduce((s, t) => s + (t.amount || 0), 0);
  const milestoneReceived = milestones.filter(m => m.status === "paid").reduce((s, m) => s + (m.amount || 0), 0);
  const received = tranches.length > 0 ? trancheReceived : milestoneReceived;
  const invoiced = tranches.filter(t => t.status === "invoiced").reduce((s, t) => s + (t.amount || 0), 0);
  const pctReceived = total > 0 ? Math.min(100, Math.round(received / total * 100)) : 0;
  const pctInvoiced = total > 0 ? Math.min(100 - pctReceived, Math.round(invoiced / total * 100)) : 0;

  const fields = [
    { icon: Hash, label: "Grant Number", value: grant.grant_number || grant.contract_number },
    { icon: DollarSign, label: "Total Award", value: total ? `$${total.toLocaleString()}` : null },
    { icon: Calendar, label: "Start Date", value: grant.start_date ? format(parseISO(grant.start_date), "MMMM d, yyyy") : null },
    { icon: Calendar, label: "End Date", value: grant.end_date ? format(parseISO(grant.end_date), "MMMM d, yyyy") : null },
  ];

  const today = new Date();

  return (
    <div className="space-y-5">
      {/* Utilisation progress */}
      {total > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4 text-green-600" /> Funding Utilisation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Received</span>
              <span className="font-bold text-green-600">${received.toLocaleString()} <span className="text-muted-foreground font-normal">of ${total.toLocaleString()}</span></span>
            </div>
            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
              <div className="h-full flex">
                <div className="bg-green-500 h-full rounded-l-full transition-all" style={{ width: `${pctReceived}%` }} />
                <div className="bg-blue-400 h-full transition-all" style={{ width: `${pctInvoiced}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Received ({pctReceived}%)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" /> Invoiced ({pctInvoiced}%)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-muted border inline-block" /> Outstanding ({100 - pctReceived - pctInvoiced}%)</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tranche timeline */}
      {tranches.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="w-4 h-4 text-primary" /> Tranche Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tranches.map((t, i) => {
              const triggerDays = t.invoice_trigger_date ? differenceInDays(parseISO(t.invoice_trigger_date), today) : null;
              const triggerAlert = triggerDays !== null && triggerDays <= 7 && !t.invoice_date && t.status !== "invoiced" && t.status !== "received";
              return (
                <div key={t.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center shrink-0 mt-1">
                    <div className={`w-3 h-3 rounded-full border-2 ${t.status === "received" ? "bg-green-500 border-green-500" : t.status === "invoiced" ? "bg-blue-400 border-blue-400" : "bg-white border-muted-foreground"}`} />
                    {i < tranches.length - 1 && <div className="w-px h-6 bg-border mt-1" />}
                  </div>
                  <div className="flex-1 min-w-0 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{t.tranche_name}</p>
                      <Badge className={`text-xs ${trancheStatusColors[t.status]}`}>{t.status}</Badge>
                      {triggerAlert && (
                        <Badge className="text-xs bg-amber-100 text-amber-800">
                          ⚡ Invoice {triggerDays < 0 ? "trigger overdue" : `trigger in ${triggerDays}d`}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">${(t.amount || 0).toLocaleString()}</span>
                      {t.invoice_trigger_date && <span>Trigger: {format(parseISO(t.invoice_trigger_date), "MMM d, yyyy")}</span>}
                      {t.due_date && <span>Due: {format(parseISO(t.due_date), "MMM d, yyyy")}</span>}
                      {t.received_date && <span className="text-green-600">Received: {format(parseISO(t.received_date), "MMM d, yyyy")}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Description */}
      {grant.description && (
        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Description
            </p>
            <p className="text-sm leading-relaxed">{grant.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Key fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.filter(f => f.value).map((f, i) => (
          <Card key={i}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <f.icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{f.label}</p>
                <p className="font-semibold">{f.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>


    </div>
  );
}