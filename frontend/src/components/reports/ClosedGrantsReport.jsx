import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO, differenceInMonths } from "date-fns";
import { SectionHeader, EmptyRow, Th, Td, KpiChip, TableWithHead } from "./ReportUtils";

export default function ClosedGrantsReport() {
  const [grants, setGrants] = useState([]);
  const [tranches, setTranches] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  const [funderNotes, setFunderNotes] = useState({});
  const [editingFunder, setEditingFunder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Grant.list("-created_date", 500),
      base44.entities.GrantTranche.list("due_date", 500),
      base44.entities.GrantDeliverable.list("due_date", 500),
    ]).then(([g,tr,d]) => { setGrants(g); setTranches(tr); setDeliverables(d); setLoading(false); });
  }, []);

  if (loading) return <p className="text-muted-foreground text-center py-12">Loading...</p>;

  const closedGrants = grants.filter(g => g.archived || g.status === "archived" || g.status === "completed" || g.status === "cancelled");

  const rows = closedGrants.map(g => {
    const gTranches = tranches.filter(t => t.grant_id === g.id);
    const received = gTranches.filter(t => t.status === "received").reduce((s,t)=>s+(t.amount||0),0);
    const variance = (g.total_amount||0) - received;
    const gDels = deliverables.filter(d => d.grant_id === g.id);
    const doneCount = gDels.filter(d => d.status === "completed").length;
    const totalDels = gDels.length;
    const plannedDuration = g.start_date && g.end_date ? differenceInMonths(parseISO(g.end_date), parseISO(g.start_date)) : null;
    return { g, received, variance, doneCount, totalDels, plannedDuration };
  });

  const totalFundingReceived = rows.reduce((s,r) => s + r.received, 0);
  const avgDelivery = rows.length > 0 && rows.some(r=>r.totalDels>0)
    ? Math.round(rows.filter(r=>r.totalDels>0).reduce((s,r)=>s+(r.doneCount/r.totalDels)*100,0) / rows.filter(r=>r.totalDels>0).length)
    : null;

  // Group by funder for S2
  const byFunder = {};
  rows.forEach(({ g, received, doneCount, totalDels }) => {
    const funder = g.funder || g.grantor || "Unknown";
    if (!byFunder[funder]) byFunder[funder] = { grants:[], totalReceived:0, doneCount:0, totalDels:0 };
    byFunder[funder].grants.push(g);
    byFunder[funder].totalReceived += received;
    byFunder[funder].doneCount += doneCount;
    byFunder[funder].totalDels += totalDels;
  });
  const funderRows = Object.entries(byFunder).map(([funder, d]) => ({ funder, ...d }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        <KpiChip value={closedGrants.length} label="Total grants closed" color="blue" />
        <KpiChip value={`$${(totalFundingReceived/1000).toFixed(0)}k`} label="Total funding received" color="green" />
        <KpiChip value={avgDelivery !== null ? `${avgDelivery}%` : "—"} label="Avg delivery rate" color="blue" />
      </div>

      {/* S1 */}
      <div>
        <SectionHeader title="Closed Grants" count={rows.length} />
        <TableWithHead head={<><Th>Grant Name</Th><Th>Funder</Th><Th>Period</Th><Th>Total Awarded</Th><Th>Total Received</Th><Th>Variance</Th><Th>Deliverables</Th><Th>Duration</Th></>}>
          {rows.length===0?<EmptyRow cols={8}/>:rows.map(({ g, received, variance, doneCount, totalDels, plannedDuration }) => (
            <tr key={g.id} className={`hover:bg-muted/30 ${variance > 0 ? "bg-red-50/30" : ""}`}>
              <Td className="font-medium">{g.title||g.grant_name}</Td>
              <Td className="text-muted-foreground">{g.funder||g.grantor||"—"}</Td>
              <Td className="text-muted-foreground text-xs">{g.start_date&&g.end_date?`${format(parseISO(g.start_date),"MMM yy")} – ${format(parseISO(g.end_date),"MMM yy")}` :"—"}</Td>
              <Td>${(g.total_amount||0).toLocaleString()}</Td>
              <Td className="text-green-600 font-medium">${received.toLocaleString()}</Td>
              <Td><span className={variance > 0 ? "text-red-600 font-bold" : "text-green-600"}>{variance > 0 ? "−" : ""}${Math.abs(variance).toLocaleString()}</span></Td>
              <Td>{totalDels > 0 ? `${doneCount} / ${totalDels}` : "—"}</Td>
              <Td className="text-muted-foreground">{plannedDuration !== null ? `${plannedDuration}mo` : "—"}</Td>
            </tr>
          ))}
        </TableWithHead>
      </div>

      {/* S2: Lessons by Funder */}
      <div>
        <SectionHeader title="Lessons by Funder" count={funderRows.length} />
        <div className="space-y-3">
          {funderRows.length === 0 ? <p className="text-muted-foreground text-sm italic text-center py-4">No closed grants yet.</p> : funderRows.map(({ funder, grants: fGrants, totalReceived, doneCount, totalDels }) => {
            const deliveryScore = totalDels > 0 ? Math.round((doneCount/totalDels)*100) : null;
            const isEditing = editingFunder === funder;
            return (
              <div key={funder} className="border rounded-lg p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-semibold">{funder}</p>
                    <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                      <span>{fGrants.length} grant{fGrants.length!==1?"s":""}</span>
                      <span className="text-green-600 font-medium">${totalReceived.toLocaleString()} received</span>
                      {deliveryScore !== null && <span>{deliveryScore}% delivery score</span>}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={()=>setEditingFunder(isEditing?null:funder)}>
                    {isEditing?"Save":"Edit Notes"}
                  </Button>
                </div>
                {isEditing ? (
                  <textarea
                    className="w-full mt-3 text-sm border rounded-md p-2 resize-none h-20"
                    placeholder="Add funder notes, lessons learned, relationship context..."
                    value={funderNotes[funder] || ""}
                    onChange={e => setFunderNotes(n=>({...n,[funder]:e.target.value}))}
                  />
                ) : funderNotes[funder] ? (
                  <p className="mt-2 text-sm text-muted-foreground italic">{funderNotes[funder]}</p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground italic">No notes yet — click Edit Notes to add context.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}