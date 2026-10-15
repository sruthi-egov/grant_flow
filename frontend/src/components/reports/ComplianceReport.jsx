import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, parseISO, differenceInDays, isBefore, isAfter, subDays, addDays } from "date-fns";
import { SectionHeader, EmptyRow, Th, Td, KpiChip, TableWithHead, StatusBadge } from "./ReportUtils";

const today = new Date(); today.setHours(0,0,0,0);
const in14 = addDays(today, 14);
const in60 = addDays(today, 60);
const in90 = addDays(today, 90);
const ago30 = subDays(today, 30);

export default function ComplianceReport() {
  const [grants, setGrants] = useState([]);
  const [obligations, setObligations] = useState([]);
  const [mouCommitments, setMouCommitments] = useState([]);
  const [mous, setMous] = useState([]);
  const [sowDeliverables, setSowDeliverables] = useState([]);
  const [sows, setSows] = useState([]);
  const [msas, setMsas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Grant.list("-created_date", 500),
      base44.entities.GrantReportingObligation.list("due_date", 500),
      base44.entities.MouCommitment.list("due_date", 500),
      base44.entities.MOU.list("-created_date", 500),
      base44.entities.SowDeliverable.list("due_date", 500),
      base44.entities.SOW.list("-created_date", 500),
      base44.entities.MSA.list("-created_date", 500),
    ]).then(([g, ob, mc, mo, sd, s, ms]) => {
      setGrants(g); setObligations(ob); setMouCommitments(mc); setMous(mo);
      setSowDeliverables(sd); setSows(s); setMsas(ms); setLoading(false);
    });
  }, []);

  if (loading) return <p className="text-muted-foreground text-center py-12">Loading...</p>;

  const gName = id => { const g = grants.find(g=>g.id===id); return g?.title||g?.grant_name||"—"; };
  const gFunder = id => { const g = grants.find(g=>g.id===id); return g?.funder||g?.grantor||"—"; };

  // S1: Reporting obligations
  const s1 = obligations.filter(o =>
    o.status !== "Submitted" || (o.submitted_date && isAfter(parseISO(o.submitted_date), ago30))
  );

  // S2: MOU commitments (annual review type)
  const s2 = mouCommitments.filter(c =>
    c.name?.toLowerCase().includes("review") || c.name?.toLowerCase().includes("annual")
  );

  // S3: SOW deliverables (compliance / audit type)
  const s3 = sowDeliverables.filter(d =>
    d.name?.toLowerCase().includes("compliance") || d.name?.toLowerCase().includes("audit") || d.notes?.toLowerCase().includes("compliance")
  );

  // S4: Contracts requiring approval expiring within 90 days
  const s4 = [
    ...msas.filter(m => !m.archived && m.renewal_requires_approval && m.end_date && isAfter(parseISO(m.end_date), today) && isBefore(parseISO(m.end_date), in90)).map(m=>({type:"MSA",name:m.title,party:m.vendor_name,end_date:m.end_date,link:`MSADetail?id=${m.id}`})),
    ...sows.filter(s => !s.archived && s.renewal_requires_approval && s.end_date && isAfter(parseISO(s.end_date), today) && isBefore(parseISO(s.end_date), in90)).map(s=>({type:"SOW",name:s.title,party:s.vendor_name,end_date:s.end_date,link:`SOWDetail?id=${s.id}`})),
    ...mous.filter(m => !m.archived && m.renewal_requires_approval && m.end_date && isAfter(parseISO(m.end_date), today) && isBefore(parseISO(m.end_date), in90)).map(m=>({type:"MOU",name:m.title,party:m.partner_name,end_date:m.end_date,link:`MOUDetail?id=${m.id}`})),
  ];

  const allDates = [...s1.map(o=>o.due_date),...s2.map(c=>c.due_date),...s3.map(d=>d.due_date)];
  const overdueCount = allDates.filter(d=>d&&isBefore(parseISO(d),today)).length;
  const in14Count = allDates.filter(d=>{if(!d)return false;const diff=differenceInDays(parseISO(d),today);return diff>=0&&diff<=14;}).length;
  const in60Count = allDates.filter(d=>{if(!d)return false;const diff=differenceInDays(parseISO(d),today);return diff>14&&diff<=60;}).length;
  const completedQ = obligations.filter(o=>o.status==="Submitted"&&o.submitted_date&&isAfter(parseISO(o.submitted_date),subDays(today,90))).length;

  const markSubmitted = async (id) => {
    await base44.entities.GrantReportingObligation.update(id, { status: "Submitted", submitted_date: format(today, "yyyy-MM-dd") });
    const updated = await base44.entities.GrantReportingObligation.list("due_date", 500);
    setObligations(updated);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        <KpiChip value={overdueCount} label="Overdue obligations" color="red" />
        <KpiChip value={in14Count} label="Due within 14 days" color="amber" />
        <KpiChip value={in60Count} label="Due in 15–60 days" color="green" />
        <KpiChip value={completedQ} label="Completed this quarter" color="blue" />
      </div>

      {/* S1 */}
      <div>
        <SectionHeader title="Funder Reporting Deadlines" count={s1.length} />
        <TableWithHead head={<><Th>Grant Name</Th><Th>Funder</Th><Th>Obligation</Th><Th>Type</Th><Th>Due Date</Th><Th>Status</Th><Th></Th></>}>
          {s1.length===0?<EmptyRow cols={7}/>:s1.map(o=>(
            <tr key={o.id} className="hover:bg-muted/30">
              <Td className="font-medium">{gName(o.grant_id)}</Td>
              <Td className="text-muted-foreground">{gFunder(o.grant_id)}</Td>
              <Td>{o.obligation_name}</Td>
              <Td><Badge variant="outline" className="text-xs">{o.obligation_type}</Badge></Td>
              <Td className="text-muted-foreground">{o.due_date?format(parseISO(o.due_date),"d MMM yyyy"):"—"}</Td>
              <Td><StatusBadge dateStr={o.due_date}/></Td>
              <Td>{o.status!=="Submitted"&&<Button size="sm" variant="outline" className="text-xs h-7" onClick={()=>markSubmitted(o.id)}>Mark Submitted</Button>}</Td>
            </tr>
          ))}
        </TableWithHead>
      </div>

      {/* S2 */}
      <div>
        <SectionHeader title="MOU Annual Reviews" count={s2.length} />
        <TableWithHead head={<><Th>MOU Name</Th><Th>Partner</Th><Th>Review</Th><Th>Due Date</Th><Th>Status</Th><Th></Th></>}>
          {s2.length===0?<EmptyRow cols={6}/>:s2.map(c=>{
            const mou=mous.find(m=>m.id===c.mou_id);
            return <tr key={c.id} className="hover:bg-muted/30"><Td className="font-medium">{mou?.title||"—"}</Td><Td className="text-muted-foreground">{mou?.partner_name||"—"}</Td><Td>{c.name}</Td><Td className="text-muted-foreground">{c.due_date?format(parseISO(c.due_date),"d MMM yyyy"):"—"}</Td><Td><StatusBadge dateStr={c.due_date}/></Td><Td><Link to={createPageUrl(`MOUDetail?id=${c.mou_id}&tab=commitments`)}><Button size="sm" variant="outline" className="text-xs h-7">Log Complete</Button></Link></Td></tr>;
          })}
        </TableWithHead>
      </div>

      {/* S3 */}
      <div>
        <SectionHeader title="MSA & SOW Compliance Milestones" count={s3.length} />
        <TableWithHead head={<><Th>SOW Name</Th><Th>Vendor</Th><Th>Milestone</Th><Th>Due Date</Th><Th>Status</Th><Th></Th></>}>
          {s3.length===0?<EmptyRow cols={6}/>:s3.map(d=>{
            const sow=sows.find(s=>s.id===d.sow_id);
            return <tr key={d.id} className="hover:bg-muted/30"><Td className="font-medium">{sow?.title||"—"}</Td><Td className="text-muted-foreground">{sow?.vendor_name||"—"}</Td><Td>{d.name}</Td><Td className="text-muted-foreground">{d.due_date?format(parseISO(d.due_date),"d MMM yyyy"):"—"}</Td><Td><StatusBadge dateStr={d.due_date}/></Td><Td><Link to={createPageUrl(`SOWDetail?id=${d.sow_id}&tab=deliverables`)}><Button size="sm" variant="outline" className="text-xs h-7">Mark Done</Button></Link></Td></tr>;
          })}
        </TableWithHead>
      </div>

      {/* S4 */}
      <div>
        <SectionHeader title="Upcoming Renewals Requiring Approval" count={s4.length} />
        <TableWithHead head={<><Th>Type</Th><Th>Name</Th><Th>Counterparty</Th><Th>Expiry</Th><Th>Days Left</Th><Th>Action</Th></>}>
          {s4.length===0
            ? <tr><td colSpan={6} className="px-4 py-4 text-sm text-muted-foreground text-center italic">No contracts with approval requirements expiring in 90 days. Set <strong>renewal_requires_approval</strong> on contracts to enable this section.</td></tr>
            : s4.map((c,i)=>{
                const dLeft=differenceInDays(parseISO(c.end_date),today);
                return <tr key={i} className="hover:bg-muted/30"><Td><Badge variant="outline" className="text-xs">{c.type}</Badge></Td><Td className="font-medium">{c.name}</Td><Td className="text-muted-foreground">{c.party}</Td><Td className="text-muted-foreground">{format(parseISO(c.end_date),"d MMM yyyy")}</Td><Td><span className={`font-bold ${dLeft<=30?"text-red-600":"text-amber-600"}`}>{dLeft}d</span></Td><Td><Link to={createPageUrl(c.link)}><Button size="sm" variant="outline" className="text-xs h-7">Initiate Approval</Button></Link></Td></tr>;
              })
          }
        </TableWithHead>
      </div>
    </div>
  );
}