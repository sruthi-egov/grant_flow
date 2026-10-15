import { useState, useEffect, useMemo } from "react";
import { api } from "@/api/apiClient";
import { addMonths, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, differenceInDays, parseISO } from "date-fns";
import { FileText, ScrollText, ClipboardList, Handshake, DollarSign, AlertCircle, TrendingUp, ArrowRight } from "lucide-react";
import ActionRequiredFeed from "@/components/dashboard/ActionRequiredFeed";
import DataQueryChat from "@/components/dashboard/DataQueryChat";
import DocumentIntelligenceSummary from "@/components/documents/DocumentIntelligenceSummary";
import { SkeletonKPI } from "@/components/ui/skeleton-card";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [periodOffset, setPeriodOffset] = useState(0);

  useEffect(() => {
    Promise.all([
      api.entities.Grant.list("-created_date", 200),
      api.entities.Milestone.list("due_date", 200),
      api.entities.ReportingDeadline.list("due_date", 200),
      api.entities.SOW.list("-created_date", 200),
      api.entities.MSA.list("-created_date", 200),
      api.entities.MOU.list("-created_date", 200),
      api.entities.GrantTranche.list("due_date", 500),
      api.entities.GrantDeliverable.list("due_date", 500),
      api.entities.SowDeliverable.list("due_date", 500),
      api.entities.MouCommitment.list("due_date", 500),
      api.entities.GrantReportingObligation.list("due_date", 200),
      api.entities.DocumentUploadLog.list("-created_date", 500),
      // Extra entities for chatbot
      api.entities.SowMilestone.list("due_date", 500).catch(() => []),
      api.entities.MsaKeyClause.list("-created_date", 500).catch(() => []),
    ]).then(([grants, milestones, deadlines, sows, msas, mous, tranches,
      grantDeliverables, sowDeliverables, mouCommitments, obligations, uploadLogs,
      sowMilestones, msaKeyClauses]) => {
      setData({ grants, milestones, deadlines, sows, msas, mous, tranches, grantDeliverables, sowDeliverables, mouCommitments, obligations, uploadLogs, sowMilestones, msaKeyClauses });
      setLoading(false);
    });
  }, []);

  const today = new Date();
  const selectedPeriod = addMonths(today, periodOffset);
  const periodStart = startOfMonth(selectedPeriod);
  const periodEnd = endOfMonth(selectedPeriod);

  const derived = useMemo(() => {
    if (!data) return { activeGrants: [], activeSows: [], activeMsas: [], activeMous: [], totalFunding: 0, totalFundingReceived: 0, totalMonthlySpend: 0, actionCount: 0 };
    const { grants, sows, msas, mous, tranches, milestones, grantDeliverables, sowDeliverables, mouCommitments } = data;

    const activeGrants = grants.filter(g => g.status === "active" && !g.archived);
    const activeSows = sows.filter(s => s.status === "active" && !s.archived);
    const activeMsas = msas.filter(m => m.status === "active" && !m.archived);
    const activeMous = mous.filter(m => m.status === "active" && !m.archived);
    const totalFunding = activeGrants.reduce((s, g) => s + (g.total_amount || 0), 0);
    const totalFundingReceived =
      tranches.filter(t => t.status === "received").reduce((s, t) => s + (t.amount || 0), 0);
    const totalMonthlySpend = activeSows.reduce((sum, s) => sum + (s.monthly_rate || s.total_monthly_value || 0), 0);

    let actionCount = 0;
    tranches.forEach(t => {
      if (t.invoice_trigger_date && !t.invoice_date && t.status !== "invoiced" && t.status !== "received") {
        if (differenceInDays(parseISO(t.invoice_trigger_date), today) <= 7) actionCount++;
      }
      if (t.due_date && t.status !== "invoiced" && t.status !== "received") {
        if (differenceInDays(parseISO(t.due_date), today) < 0) actionCount++;
      }
    });
    [...grantDeliverables, ...sowDeliverables].forEach(d => {
      if (d.due_date && d.status !== "completed" && differenceInDays(parseISO(d.due_date), today) < 0) actionCount++;
    });
    milestones.forEach(m => {
      if (m.due_date && m.status !== "paid" && differenceInDays(parseISO(m.due_date), today) < 0) actionCount++;
    });
    mouCommitments.forEach(c => {
      if (c.due_date && c.status !== "completed" && differenceInDays(parseISO(c.due_date), today) <= 14) actionCount++;
    });

    return { activeGrants, activeSows, activeMsas, activeMous, totalFunding, totalFundingReceived, totalMonthlySpend, actionCount };
  }, [data]);

  const { upcomingMilestones, upcomingDeadlines } = useMemo(() => {
    if (!data) return { upcomingMilestones: [], upcomingDeadlines: [] };
    return {
      upcomingMilestones: data.milestones
        .filter(m => m.due_date && isWithinInterval(parseISO(m.due_date), { start: periodStart, end: periodEnd }))
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
        .slice(0, 5),
      upcomingDeadlines: data.deadlines
        .filter(d => d.due_date && isWithinInterval(parseISO(d.due_date), { start: periodStart, end: periodEnd }))
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
        .slice(0, 5),
    };
  }, [data, periodStart, periodEnd]);

  const grantMap = useMemo(() => {
    if (!data) return {};
    return Object.fromEntries(data.grants.map(g => [g.id, g.title || g.grant_name || "—"]));
  }, [data]);

  const getGrantName = (id) => grantMap[id] || "—";

  const getDaysLabel = (dateStr) => {
    const diff = differenceInDays(parseISO(dateStr), today);
    if (diff < 0) return <span className="text-red-500 font-medium">Overdue</span>;
    if (diff === 0) return <span className="text-orange-500 font-medium">Today</span>;
    return <span className="text-muted-foreground">in {diff}d</span>;
  };

  const { activeGrants, activeSows, activeMsas, activeMous, totalFunding, totalFundingReceived, totalMonthlySpend, actionCount } = derived;

  const kpis = [
    { label: "Active Grants", value: activeGrants.length, icon: FileText, color: "text-blue-600", sub: `$${(totalFunding / 1000).toFixed(0)}k total` },
    { label: "Funding Received", value: `$${(totalFundingReceived / 1000).toFixed(0)}k`, icon: TrendingUp, color: "text-green-600", sub: "from tranches" },
    { label: "Active SOWs", value: activeSows.length, icon: ClipboardList, color: "text-purple-600", sub: `$${(totalMonthlySpend / 1000).toFixed(0)}k/mo` },
    { label: "Active MSAs", value: activeMsas.length, icon: ScrollText, color: "text-indigo-600", sub: "agreements" },
    { label: "Active MOUs", value: activeMous.length, icon: Handshake, color: "text-teal-600", sub: "partnerships" },
    { label: "Actions Required", value: actionCount, icon: AlertCircle, color: actionCount > 0 ? "text-red-600" : "text-green-600", sub: actionCount > 0 ? "need attention" : "all clear" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of grants, contracts, and live action items</p>
        </div>
        <div className="shrink-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Period</p>
          <select
            value={periodOffset}
            onChange={e => setPeriodOffset(Number(e.target.value))}
            className="text-sm font-semibold border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {Array.from({ length: 13 }, (_, i) => {
              const offset = -i;
              const label = format(addMonths(today, offset), "MMM yyyy") + (offset === 0 ? " (Current)" : "");
              return <option key={offset} value={offset}>{label}</option>;
            })}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonKPI key={i} />)
          : kpis.map((k, i) => (
            <Card key={i} className={k.label === "Actions Required" && actionCount > 0 ? "border-red-200 bg-red-50/40" : ""}>
              <CardContent className="p-4 text-center">
                <k.icon className={`w-5 h-5 mx-auto mb-1 ${k.color}`} />
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">{k.label}</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">{k.sub}</p>
              </CardContent>
            </Card>
          ))
        }
      </div>

      {/* Main 2-col */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="lg:row-span-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className={`w-4 h-4 ${actionCount > 0 ? "text-red-500" : "text-green-500"}`} /> Action Required
            </CardTitle>
            {actionCount > 0 && <Badge className="bg-red-100 text-red-700">{actionCount} item{actionCount > 1 ? "s" : ""}</Badge>}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2 py-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />)}</div>
            ) : (
              <ActionRequiredFeed
                grants={data?.grants || []} milestones={data?.milestones || []} tranches={data?.tranches || []}
                grantDeliverables={data?.grantDeliverables || []} sowDeliverables={data?.sowDeliverables || []}
                sows={data?.sows || []} msas={data?.msas || []} mous={data?.mous || []} mouCommitments={data?.mouCommitments || []}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><FileText className="w-4 h-4 text-primary" /> Grants</CardTitle>
            <Link to={createPageUrl("Grants")}><Button variant="ghost" size="sm" className="gap-1 text-xs">All <ArrowRight className="w-3 h-3" /></Button></Link>
          </CardHeader>
          <CardContent className="space-y-1">
            {loading
              ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 rounded-lg bg-muted/50 animate-pulse" />)}</div>
              : activeGrants.slice(0, 4).length === 0
              ? <p className="text-sm text-muted-foreground">No active grants.</p>
              : activeGrants.slice(0, 4).map(g => {
                  const gTranches = (data?.tranches || []).filter(t => t.grant_id === g.id);
                  const gMilestones = (data?.milestones || []).filter(m => m.grant_id === g.id);
                  const received = gTranches.filter(t => t.status === "received").reduce((s, t) => s + (t.amount || 0), 0);
                  const total = g.total_amount || 0;
                  const pct = total > 0 ? Math.min(100, Math.round(received / total * 100)) : 0;
                  return (
                    <Link key={g.id} to={createPageUrl(`GrantDetail?id=${g.id}`)}>
                      <div className="p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium truncate">{g.title || g.grant_name}</p>
                          <span className="text-xs text-green-600 font-semibold shrink-0 ml-2">{pct}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">${received.toLocaleString()} / ${total.toLocaleString()}</p>
                      </div>
                    </Link>
                  );
                })
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><DollarSign className="w-4 h-4 text-primary" /> Upcoming Milestones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading
              ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />)}</div>
              : upcomingMilestones.length === 0
              ? <p className="text-sm text-muted-foreground">No upcoming milestone payments.</p>
              : upcomingMilestones.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-2.5 bg-muted/40 rounded-lg">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{m.title}</p>
                      <p className="text-xs text-muted-foreground">{getGrantName(m.grant_id)} · Due {format(parseISO(m.due_date), "d MMM yyyy")}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="font-semibold text-sm">${(m.amount || 0).toLocaleString()}</p>
                      <p className="text-xs">{getDaysLabel(m.due_date)}</p>
                    </div>
                  </div>
                ))
            }
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {[
          { title: "SOWs", icon: ClipboardList, items: activeSows, link: "SOWs", detailLink: "SOWDetail", nameKey: "title", subKey: "vendor_name", dateKey: "end_date", warnDays: 30 },
          { title: "MSAs", icon: ScrollText, items: activeMsas, link: "MSAs", detailLink: "MSADetail", nameKey: "title", subKey: "vendor_name", dateKey: "end_date", warnDays: 60 },
          { title: "MOUs", icon: Handshake, items: activeMous, link: "MOUs", detailLink: "MOUDetail", nameKey: "title", subKey: "partner_name", dateKey: "end_date", warnDays: 60 },
        ].map(({ title, icon: Icon, items, link, detailLink, nameKey, subKey, dateKey, warnDays }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-sm"><Icon className="w-4 h-4 text-primary" /> {title}</CardTitle>
              <Link to={createPageUrl(link)}><Button variant="ghost" size="sm" className="text-xs gap-1">All <ArrowRight className="w-3 h-3" /></Button></Link>
            </CardHeader>
            <CardContent className="space-y-1">
              {loading ? <div className="h-20 bg-muted/50 rounded animate-pulse" /> :
                items.slice(0, 4).map(item => {
                  const dLeft = item[dateKey] ? differenceInDays(parseISO(item[dateKey]), today) : null;
                  return (
                    <Link key={item.id} to={createPageUrl(`${detailLink}?id=${item.id}`)}>
                      <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item[nameKey]}</p>
                          <p className="text-xs text-muted-foreground truncate">{item[subKey]}</p>
                        </div>
                        {dLeft !== null && <p className={`text-xs font-medium shrink-0 ml-2 ${dLeft <= warnDays ? "text-orange-500" : "text-muted-foreground"}`}>{dLeft}d</p>}
                      </div>
                    </Link>
                  );
                })
              }
              {!loading && items.length === 0 && <p className="text-sm text-muted-foreground">No active {title}.</p>}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm"><FileText className="w-4 h-4 text-primary" /> Reporting Deadlines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? <div className="h-20 bg-muted/50 rounded animate-pulse" /> :
              upcomingDeadlines.length === 0
              ? <p className="text-sm text-muted-foreground">No upcoming deadlines.</p>
              : upcomingDeadlines.map(d => (
                  <div key={d.id} className="flex items-center justify-between p-2 bg-muted/40 rounded-lg">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{d.report_type}</p>
                      <p className="text-xs text-muted-foreground">{getGrantName(d.grant_id)}</p>
                    </div>
                    <p className="text-xs shrink-0 ml-2">{getDaysLabel(d.due_date)}</p>
                  </div>
                ))
            }
          </CardContent>
        </Card>
      </div>

      {!loading && (
        <DocumentIntelligenceSummary />
      )}

      {!loading && (
        <>
          <DataQueryChat
          grants={data?.grants || []}
          milestones={data?.milestones || []}
          deadlines={data?.deadlines || []}
          sows={data?.sows || []}
          msas={data?.msas || []}
          mous={data?.mous || []}
          tranches={data?.tranches || []}
          grantDeliverables={data?.grantDeliverables || []}
          sowDeliverables={data?.sowDeliverables || []}
          sowMilestones={data?.sowMilestones || []}
          mouCommitments={data?.mouCommitments || []}
          msaKeyClauses={data?.msaKeyClauses || []}
          obligations={data?.obligations || []}
          uploadLogs={data?.uploadLogs || []}
        />
        </>
      )}
    </div>
  );
}