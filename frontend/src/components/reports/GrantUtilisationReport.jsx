import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, differenceInMonths } from "date-fns";
import { SectionHeader, EmptyRow, Th, Td, KpiChip, TableWithHead } from "./ReportUtils";

function utilisationStatus(pctUsed, startDate, endDate) {
  if (!startDate || !endDate) return { label: "On Track", color: "bg-green-100 text-green-700" };
  const today = new Date();
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const totalMonths = differenceInMonths(end, start) || 1;
  const elapsedMonths = Math.max(0, differenceInMonths(today, start));
  const expectedPct = Math.min(100, (elapsedMonths / totalMonths) * 100);
  if (pctUsed < expectedPct - 20) return { label: "Under-utilising", color: "bg-amber-100 text-amber-700" };
  if (pctUsed > expectedPct + 10) return { label: "Over-utilising", color: "bg-red-100 text-red-700" };
  return { label: "On Track", color: "bg-green-100 text-green-700" };
}

export default function GrantUtilisationReport() {
  const [grants, setGrants] = useState([]);
  const [tranches, setTranches] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Grant.list("-created_date", 500),
      base44.entities.GrantTranche.list("due_date", 500),
      base44.entities.GrantDeliverable.list("due_date", 500),
    ]).then(([g, tr, d]) => { setGrants(g); setTranches(tr); setDeliverables(d); setLoading(false); });
  }, []);

  if (loading) return <p className="text-muted-foreground text-center py-12">Loading...</p>;

  const activeGrants = grants.filter(g => g.status === "active" && !g.archived);
  const archivedGrants = grants.filter(g => g.archived || g.status === "archived" || g.status === "completed");

  const rows = activeGrants.map(g => {
    const gTranches = tranches.filter(t => t.grant_id === g.id);
    const invoiced = gTranches.filter(t => ["invoiced","received"].includes(t.status)).reduce((s,t)=>s+(t.amount||0),0);
    const received = gTranches.filter(t => t.status === "received").reduce((s,t)=>s+(t.amount||0),0);
    const total = g.total_amount || 0;
    const remaining = total - received;
    const pctUsed = total > 0 ? Math.round((invoiced / total) * 100) : 0;
    const status = utilisationStatus(pctUsed, g.start_date, g.end_date);
    const monthsLeft = g.end_date ? Math.max(0, differenceInMonths(parseISO(g.end_date), new Date())) : null;
    return { g, invoiced, received, remaining, pctUsed, status, monthsLeft };
  });

  const totalBudget = activeGrants.reduce((s, g) => s + (g.total_amount || 0), 0);
  const totalInvoiced = rows.reduce((s, r) => s + r.invoiced, 0);
  const avgPct = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.pctUsed, 0) / rows.length) : 0;

  // Future tranches
  const today = new Date(); today.setHours(0,0,0,0);
  const futureTranches = tranches
    .filter(t => !t.received_date && t.status !== "received")
    .sort((a,b) => new Date(a.due_date) - new Date(b.due_date));

  const archivedRows = archivedGrants.map(g => {
    const gTranches = tranches.filter(t => t.grant_id === g.id);
    const received = gTranches.filter(t => t.status === "received").reduce((s,t)=>s+(t.amount||0),0);
    const gDels = deliverables.filter(d => d.grant_id === g.id);
    const doneCount = gDels.filter(d => d.status === "completed").length;
    return { g, received, variance: (g.total_amount||0) - received, doneCount, total: gDels.length };
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        <KpiChip value={activeGrants.length} label="Active grants" color="blue" />
        <KpiChip value={`$${(totalBudget/1000).toFixed(0)}k`} label="Total budget" color="green" />
        <KpiChip value={`$${(totalInvoiced/1000).toFixed(0)}k`} label="Total invoiced" color="amber" />
        <KpiChip value={`${avgPct}%`} label="Avg utilisation" color="blue" />
      </div>

      {/* S1 */}
      <div>
        <SectionHeader title="Utilisation by Grant" count={rows.length} />
        <TableWithHead head={<><Th>Grant Name</Th><Th>Funder</Th><Th>Total</Th><Th>Invoiced</Th><Th>Received</Th><Th>Remaining</Th><Th>% Utilised</Th><Th>Months Left</Th><Th>Status</Th></>}>
          {rows.length === 0 ? <EmptyRow cols={9} /> : rows.map(({ g, invoiced, received, remaining, pctUsed, status, monthsLeft }) => (
            <tr key={g.id} className="hover:bg-muted/30">
              <Td className="font-medium">{g.title || g.grant_name}</Td>
              <Td className="text-muted-foreground">{g.funder || g.grantor || "—"}</Td>
              <Td>${(g.total_amount||0).toLocaleString()}</Td>
              <Td>${invoiced.toLocaleString()}</Td>
              <Td className="text-green-600">${received.toLocaleString()}</Td>
              <Td>${remaining.toLocaleString()}</Td>
              <Td>
                <div className="flex items-center gap-2">
                  <div className="w-16 bg-muted rounded-full h-1.5"><div className="bg-green-500 h-1.5 rounded-full" style={{width:`${pctUsed}%`}}/></div>
                  <span className="text-xs font-medium">{pctUsed}%</span>
                </div>
              </Td>
              <Td>{monthsLeft !== null ? `${monthsLeft}mo` : "—"}</Td>
              <Td><Badge className={`text-xs ${status.color}`}>{status.label}</Badge></Td>
            </tr>
          ))}
        </TableWithHead>
      </div>

      {/* S2 */}
      <div>
        <SectionHeader title="Future Tranche Schedule" count={futureTranches.length} />
        <TableWithHead head={<><Th>Grant Name</Th><Th>Tranche</Th><Th>Amount</Th><Th>Due Date</Th><Th>Trigger Date</Th><Th>Status</Th></>}>
          {futureTranches.length === 0 ? <EmptyRow cols={6} /> : futureTranches.map(t => {
            const g = grants.find(g=>g.id===t.grant_id);
            return (
              <tr key={t.id} className="hover:bg-muted/30">
                <Td className="font-medium">{g?.title||g?.grant_name||"—"}</Td>
                <Td>{t.tranche_name}</Td>
                <Td className="font-semibold">${(t.amount||0).toLocaleString()}</Td>
                <Td className="text-muted-foreground">{t.due_date?format(parseISO(t.due_date),"d MMM yyyy"):"—"}</Td>
                <Td className="text-muted-foreground">{t.invoice_trigger_date?format(parseISO(t.invoice_trigger_date),"d MMM yyyy"):"—"}</Td>
                <Td><Badge className="bg-yellow-100 text-yellow-700 text-xs">{t.status}</Badge></Td>
              </tr>
            );
          })}
        </TableWithHead>
      </div>

      {/* S3 */}
      <div>
        <SectionHeader title="Archived Grants Summary" count={archivedRows.length} />
        <TableWithHead head={<><Th>Grant Name</Th><Th>Funder</Th><Th>Total Awarded</Th><Th>Total Received</Th><Th>Variance</Th><Th>Deliverables Met</Th></>}>
          {archivedRows.length === 0 ? <EmptyRow cols={6} /> : archivedRows.map(({ g, received, variance, doneCount, total }) => (
            <tr key={g.id} className="hover:bg-muted/30">
              <Td className="font-medium">{g.title || g.grant_name}</Td>
              <Td className="text-muted-foreground">{g.funder||g.grantor||"—"}</Td>
              <Td>${(g.total_amount||0).toLocaleString()}</Td>
              <Td className="text-green-600">${received.toLocaleString()}</Td>
              <Td><span className={variance > 0 ? "text-red-600 font-medium" : "text-green-600"}>{variance > 0 ? "-" : ""}${Math.abs(variance).toLocaleString()}</span></Td>
              <Td>{total > 0 ? `${doneCount} / ${total}` : "—"}</Td>
            </tr>
          ))}
        </TableWithHead>
      </div>
    </div>
  );
}