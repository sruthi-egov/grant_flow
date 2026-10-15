import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, differenceInDays, getMonth, getYear } from "date-fns";
import { SectionHeader, EmptyRow, Th, Td, KpiChip, TableWithHead } from "./ReportUtils";

export default function FinancialHealthReport() {
  const [grants, setGrants] = useState([]);
  const [tranches, setTranches] = useState([]);
  const [sows, setSows] = useState([]);
  const [sowInvoices, setSowInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Grant.list("-created_date", 500),
      base44.entities.GrantTranche.list("due_date", 500),
      base44.entities.SOW.list("-created_date", 500),
      base44.entities.SowInvoice.list("due_date", 500),
    ]).then(([g, tr, s, si]) => {
      setGrants(g); setTranches(tr); setSows(s); setSowInvoices(si); setLoading(false);
    });
  }, []);

  if (loading) return <p className="text-muted-foreground text-center py-12">Loading...</p>;

  const activeGrants = grants.filter(g => g.status === "active" && !g.archived);
  const activeSows = sows.filter(s => s.status === "active" && !s.archived);

  const totalFunding = activeGrants.reduce((s, g) => s + (g.total_amount || 0), 0);
  const totalMonthlySOW = activeSows.reduce((s, sw) => s + (sw.monthly_rate || sw.total_monthly_value || 0), 0);

  // Outstanding tranches = invoiced but not received
  const outstandingTranches = tranches.filter(t => t.status === "invoiced");
  const totalOutstanding = outstandingTranches.reduce((s, t) => s + (t.amount || 0), 0);
  // Outstanding SOW invoices = sent but not paid
  const outstandingSOWInv = sowInvoices.filter(i => i.status === "sent");
  const totalOutstandingSOW = outstandingSOWInv.reduce((s, i) => s + (i.amount || 0), 0);
  const totalOutstandingAll = totalOutstanding + totalOutstandingSOW;

  // Net position
  // Remaining grant funding = total - received
  const totalReceived = tranches.filter(t => t.status === "received").reduce((s, t) => s + (t.amount || 0), 0);
  const netPosition = totalFunding - totalReceived - totalMonthlySOW * 12; // rough annual committed

  // Section 1: Grant Income vs SOW Spend
  const s1 = activeGrants.map(g => {
    const gTranches = tranches.filter(t => t.grant_id === g.id);
    const invoiced = gTranches.filter(t => ["invoiced","received"].includes(t.status)).reduce((s, t) => s + (t.amount || 0), 0);
    const received = gTranches.filter(t => t.status === "received").reduce((s, t) => s + (t.amount || 0), 0);
    const outstanding = invoiced - received;
    const total = g.total_amount || 0;
    const remaining = total - received;
    // Find linked SOWs via grant_id
    const linkedSOWSpend = activeSows.filter(s => s.grant_id === g.id).reduce((sum, s) => sum + (s.monthly_rate || s.total_monthly_value || 0), 0);
    const monthsCover = linkedSOWSpend > 0 ? (remaining / linkedSOWSpend).toFixed(1) : "∞";
    const lowCover = linkedSOWSpend > 0 && remaining / linkedSOWSpend < 3;
    return { g, invoiced, received, outstanding, remaining, linkedSOWSpend, monthsCover, lowCover };
  });

  // Section 2: Cash flow next 3 months
  const today = new Date();
  const months = [0, 1, 2].map(offset => {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    return { label: format(d, "MMMM yyyy"), month: d.getMonth(), year: d.getFullYear() };
  });

  const cashflow = months.map(({ label, month, year }) => {
    const inflows = tranches
      .filter(t => t.due_date && getMonth(parseISO(t.due_date)) === month && getYear(parseISO(t.due_date)) === year && t.status !== "received")
      .reduce((s, t) => s + (t.amount || 0), 0);
    const outflows = sowInvoices
      .filter(i => i.due_date && getMonth(parseISO(i.due_date)) === month && getYear(parseISO(i.due_date)) === year && i.status !== "paid")
      .reduce((s, i) => s + (i.amount || 0), 0);
    return { label, inflows, outflows, net: inflows - outflows };
  });

  // Section 3: Outstanding invoices (raised not received)
  const s3grant = outstandingTranches.map(t => ({
    _type: "Grant", name: grants.find(g => g.id === t.grant_id)?.title || "—",
    invoice_number: "—", amount: t.amount || 0,
    invoice_date: t.invoice_date, days: t.invoice_date ? differenceInDays(today, parseISO(t.invoice_date)) : null
  }));
  const s3sow = outstandingSOWInv.map(i => ({
    _type: "SOW", name: sows.find(s => s.id === i.sow_id)?.title || "—",
    invoice_number: i.invoice_number || "—", amount: i.amount || 0,
    invoice_date: i.invoice_date, days: i.invoice_date ? differenceInDays(today, parseISO(i.invoice_date)) : null
  }));
  const s3 = [...s3grant, ...s3sow];

  return (
    <div className="space-y-8">
      {/* KPI bar */}
      <div className="flex flex-wrap gap-3">
        <KpiChip value={`$${(totalFunding/1000).toFixed(0)}k`} label="Total Active Grant Funding" color="green" />
        <KpiChip value={`$${(totalMonthlySOW/1000).toFixed(0)}k/mo`} label="Committed SOW Spend" color="orange" />
        <KpiChip value={`$${(totalOutstandingAll/1000).toFixed(0)}k`} label="Outstanding Invoices" color="amber" />
        <KpiChip value={`${netPosition >= 0 ? "+" : ""}$${(netPosition/1000).toFixed(0)}k`} label="Net Position" color={netPosition >= 0 ? "green" : "red"} />
      </div>

      {/* S1 */}
      <div>
        <SectionHeader title="Grant Income vs SOW Spend" count={s1.length} />
        <TableWithHead head={<><Th>Grant Name</Th><Th>Total Grant</Th><Th>Invoiced</Th><Th>Received</Th><Th>Outstanding</Th><Th>Linked SOW/mo</Th><Th>Months Cover</Th></>}>
          {s1.length === 0 ? <EmptyRow cols={7} /> : s1.map(({ g, invoiced, received, outstanding, linkedSOWSpend, monthsCover, lowCover }) => (
            <tr key={g.id} className="hover:bg-muted/30">
              <Td className="font-medium">{g.title || g.grant_name}</Td>
              <Td>${(g.total_amount||0).toLocaleString()}</Td>
              <Td>${invoiced.toLocaleString()}</Td>
              <Td className="text-green-600 font-medium">${received.toLocaleString()}</Td>
              <Td className="text-amber-600">${outstanding.toLocaleString()}</Td>
              <Td>${linkedSOWSpend.toLocaleString()}</Td>
              <Td><span className={lowCover ? "text-red-600 font-bold" : "font-medium"}>{monthsCover}</span></Td>
            </tr>
          ))}
        </TableWithHead>
      </div>

      {/* S2 Cash flow */}
      <div>
        <SectionHeader title="Projected Cash Flow (Next 3 Months)" count={3} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cashflow.map(({ label, inflows, outflows, net }) => (
            <div key={label} className="border rounded-lg p-4 space-y-3">
              <p className="font-semibold text-sm">{label}</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Expected Inflows</span><span className="text-green-600 font-medium">${inflows.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Expected Outflows</span><span className="text-red-500 font-medium">${outflows.toLocaleString()}</span></div>
                <div className="flex justify-between border-t pt-2"><span className="font-semibold">Net</span><span className={`font-bold ${net >= 0 ? "text-green-600" : "text-red-600"}`}>{net >= 0 ? "+" : ""}${net.toLocaleString()}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* S3 */}
      <div>
        <SectionHeader title="Outstanding Invoices" count={s3.length} />
        <TableWithHead head={<><Th>Type</Th><Th>Name</Th><Th>Invoice #</Th><Th>Amount</Th><Th>Invoice Date</Th><Th>Days Outstanding</Th><Th>Status</Th></>}>
          {s3.length === 0 ? <EmptyRow cols={7} /> : s3.map((item, i) => (
            <tr key={i} className="hover:bg-muted/30">
              <Td><Badge variant="outline" className="text-xs">{item._type}</Badge></Td>
              <Td className="font-medium">{item.name}</Td>
              <Td className="text-muted-foreground font-mono text-xs">{item.invoice_number}</Td>
              <Td className="font-semibold">${item.amount.toLocaleString()}</Td>
              <Td className="text-muted-foreground">{item.invoice_date ? format(parseISO(item.invoice_date), "d MMM yyyy") : "—"}</Td>
              <Td><span className={item.days > 30 ? "text-red-600 font-bold" : ""}>{item.days !== null ? `${item.days}d` : "—"}</span></Td>
              <Td>{item.days > 30 ? <Badge className="bg-red-100 text-red-700">Overdue</Badge> : <Badge className="bg-amber-100 text-amber-700">Awaiting</Badge>}</Td>
            </tr>
          ))}
        </TableWithHead>
      </div>
    </div>
  );
}