import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { differenceInDays, parseISO, format } from "date-fns";
import { AlertTriangle, Clock, FileWarning, RefreshCw, Bell, ChevronRight, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const today = new Date();

function diff(dateStr) {
  return differenceInDays(parseISO(dateStr), today);
}

function ActionItem({ icon: Icon, color, label, sub, link, badge, badgeColor }) {
  const inner = (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${color} hover:opacity-90 transition-opacity cursor-pointer`}>
      <Icon className="w-4 h-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug truncate">{label}</p>
        {sub && <p className="text-xs opacity-75 truncate mt-0.5">{sub}</p>}
      </div>
      {badge && <Badge className={`${badgeColor} shrink-0 text-xs`}>{badge}</Badge>}
      <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />
    </div>
  );
  return link ? <Link to={createPageUrl(link)}>{inner}</Link> : inner;
}

export default function ActionRequiredFeed({ grants, milestones = [], tranches, grantDeliverables, sowDeliverables, sows, msas, mous, mouCommitments }) {
  const items = [];

  // 1. Invoice trigger alerts (≤7 days, invoice not yet raised)
  tranches.forEach(t => {
    if (!t.invoice_trigger_date || t.invoice_date || t.status === "invoiced" || t.status === "received") return;
    const d = diff(t.invoice_trigger_date);
    if (d <= 7) {
      const grant = grants.find(g => g.id === t.grant_id);
      items.push({
        priority: d < 0 ? 0 : 1,
        el: (
          <ActionItem
            key={`trigger-${t.id}`}
            icon={Bell}
            color={d < 0 ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"}
            label={`Raise invoice: ${t.tranche_name}`}
            sub={`${grant?.title || grant?.grant_name || "Grant"} · $${(t.amount || 0).toLocaleString()}`}
            link={`GrantDetail?id=${t.grant_id}&tab=tranches`}
            badge={d < 0 ? "OVERDUE" : d === 0 ? "TODAY" : `${d}d`}
            badgeColor={d < 0 ? "bg-red-600 text-white" : "bg-amber-500 text-white"}
          />
        )
      });
    }
  });

  // 2. Overdue tranches (past due_date, not invoiced/received)
  tranches.forEach(t => {
    if (!t.due_date || t.status === "invoiced" || t.status === "received") return;
    const d = diff(t.due_date);
    if (d < 0) {
      const grant = grants.find(g => g.id === t.grant_id);
      items.push({
        priority: 0,
        el: (
          <ActionItem
            key={`tranche-${t.id}`}
            icon={AlertTriangle}
            color="bg-red-50 border-red-200 text-red-800"
            label={`Overdue tranche: ${t.tranche_name}`}
            sub={`${grant?.title || grant?.grant_name || "Grant"} · $${(t.amount || 0).toLocaleString()} · Due ${format(parseISO(t.due_date), "MMM d")}`}
            link={`GrantDetail?id=${t.grant_id}&tab=tranches`}
            badge={`${Math.abs(d)}d late`}
            badgeColor="bg-red-600 text-white"
          />
        )
      });
    }
  });

  // 3. Overdue milestones
  milestones.forEach(m => {
    if (!m.due_date || m.status === "paid") return;
    const days = diff(m.due_date);
    if (days < 0) {
      const grant = grants.find(g => g.id === m.grant_id);
      items.push({
        priority: 0,
        el: (
          <ActionItem
            key={`ms-${m.id}`}
            icon={DollarSign}
            color="bg-red-50 border-red-200 text-red-800"
            label={`Overdue milestone: ${m.title}`}
            sub={`${grant?.title || grant?.grant_name || "Grant"} · $${(m.amount || 0).toLocaleString()} · Due ${format(parseISO(m.due_date), "MMM d")}`}
            link={`GrantDetail?id=${m.grant_id}&tab=milestones`}
            badge={`${Math.abs(days)}d late`}
            badgeColor="bg-red-600 text-white"
          />
        )
      });
    }
  });

  // 4. Overdue grant deliverables
  grantDeliverables.forEach(d => {
    if (!d.due_date || d.status === "completed") return;
    const days = diff(d.due_date);
    if (days < 0) {
      const grant = grants.find(g => g.id === d.grant_id);
      items.push({
        priority: 0,
        el: (
          <ActionItem
            key={`gdel-${d.id}`}
            icon={FileWarning}
            color="bg-red-50 border-red-200 text-red-800"
            label={`Overdue deliverable: ${d.name}`}
            sub={`${grant?.title || grant?.grant_name || "Grant"} · Due ${format(parseISO(d.due_date), "MMM d")}`}
            link={`GrantDetail?id=${d.grant_id}&tab=deliverables`}
            badge={`${Math.abs(days)}d late`}
            badgeColor="bg-red-600 text-white"
          />
        )
      });
    }
  });

  // 4. Overdue SOW deliverables
  sowDeliverables.forEach(d => {
    if (!d.due_date || d.status === "completed") return;
    const days = diff(d.due_date);
    if (days < 0) {
      const sow = sows.find(s => s.id === d.sow_id);
      items.push({
        priority: 0,
        el: (
          <ActionItem
            key={`sdel-${d.id}`}
            icon={FileWarning}
            color="bg-red-50 border-red-200 text-red-800"
            label={`SOW deliverable overdue: ${d.name}`}
            sub={`${sow?.title || "SOW"} · Due ${format(parseISO(d.due_date), "MMM d")}`}
            link={`SOWDetail?id=${d.sow_id}&tab=deliverables`}
            badge={`${Math.abs(days)}d late`}
            badgeColor="bg-red-600 text-white"
          />
        )
      });
    }
  });

  // 5. Contracts expiring within 90 days
  const contractSources = [
    ...sows.filter(s => !s.archived && s.status === "active" && s.end_date).map(s => ({ type: "SOW", label: s.title, sub: s.vendor_name, end_date: s.end_date, link: `SOWDetail?id=${s.id}` })),
    ...msas.filter(m => !m.archived && m.status === "active" && m.end_date).map(m => ({ type: "MSA", label: m.title, sub: m.vendor_name, end_date: m.end_date, link: `MSADetail?id=${m.id}` })),
    ...mous.filter(m => !m.archived && m.status === "active" && m.end_date).map(m => ({ type: "MOU", label: m.title, sub: m.partner_name, end_date: m.end_date, link: `MOUDetail?id=${m.id}` })),
    ...grants.filter(g => !g.archived && g.status === "active" && g.end_date).map(g => ({ type: "Grant", label: g.title || g.grant_name, sub: g.funder || g.grantor, end_date: g.end_date, link: `GrantDetail?id=${g.id}` })),
  ];
  contractSources.forEach(c => {
    const d = diff(c.end_date);
    if (d >= 0 && d <= 90) {
      items.push({
        priority: d <= 30 ? 1 : 2,
        el: (
          <ActionItem
            key={`exp-${c.link}`}
            icon={Clock}
            color={d <= 30 ? "bg-orange-50 border-orange-200 text-orange-800" : "bg-yellow-50 border-yellow-200 text-yellow-800"}
            label={`${c.type} expiring: ${c.label}`}
            sub={c.sub}
            link={c.link}
            badge={`${d}d left`}
            badgeColor={d <= 30 ? "bg-orange-500 text-white" : "bg-yellow-500 text-white"}
          />
        )
      });
    }
  });

  // 6. MOU reviews due (review_cycle check — flag MOUs where review is overdue)
  mouCommitments.forEach(c => {
    if (!c.due_date || c.status === "completed") return;
    const days = diff(c.due_date);
    if (days <= 14) {
      const mou = mous.find(m => m.id === c.mou_id);
      items.push({
        priority: days < 0 ? 0 : 1,
        el: (
          <ActionItem
            key={`moucom-${c.id}`}
            icon={RefreshCw}
            color={days < 0 ? "bg-red-50 border-red-200 text-red-800" : "bg-blue-50 border-blue-200 text-blue-800"}
            label={`MOU commitment: ${c.name}`}
            sub={`${mou?.title || "MOU"} · ${days < 0 ? "Overdue" : `Due ${format(parseISO(c.due_date), "MMM d")}`}`}
            link={`MOUDetail?id=${c.mou_id}&tab=commitments`}
            badge={days < 0 ? `${Math.abs(days)}d late` : `${days}d`}
            badgeColor={days < 0 ? "bg-red-600 text-white" : "bg-blue-500 text-white"}
          />
        )
      });
    }
  });

  // Sort by priority (0 = urgent first)
  items.sort((a, b) => a.priority - b.priority);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-3">
          <span className="text-green-600 text-lg">✓</span>
        </div>
        <p className="text-sm font-medium text-green-700">All clear — no actions required</p>
        <p className="text-xs text-muted-foreground mt-1">No overdue items or expiring contracts</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => <div key={i}>{item.el}</div>)}
    </div>
  );
}