import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, addDays, parseISO, differenceInDays, isAfter, isBefore, isEqual } from "date-fns";
import { SectionHeader, EmptyRow, Th, Td, KpiChip, TableWithHead, StatusBadge } from "./ReportUtils";

const today = new Date(); today.setHours(0, 0, 0, 0);
const in28 = addDays(today, 28);
const in90 = addDays(today, 90);

function inWindow(dateStr, from, to) {
  if (!dateStr) return false;
  const d = parseISO(dateStr);
  return (isAfter(d, from) || isEqual(d, from)) && (isBefore(d, to) || isEqual(d, to));
}
function isOverdue(dateStr, status) {
  if (!dateStr || ["completed","received","paid"].includes(status)) return false;
  return isBefore(parseISO(dateStr), today);
}

export default function Next4WeeksReport() {
  const [data, setData] = useState({ grants:[], tranches:[], gd:[], sows:[], si:[], sd:[], msas:[], mous:[], mc:[], loading:true });

  useEffect(() => {
    Promise.all([
      base44.entities.Grant.list("-created_date", 500),
      base44.entities.GrantTranche.list("due_date", 500),
      base44.entities.GrantDeliverable.list("due_date", 500),
      base44.entities.SOW.list("-created_date", 500),
      base44.entities.SowInvoice.list("due_date", 500),
      base44.entities.SowDeliverable.list("due_date", 500),
      base44.entities.MSA.list("-created_date", 500),
      base44.entities.MOU.list("-created_date", 500),
      base44.entities.MouCommitment.list("due_date", 500),
    ]).then(([grants,tranches,gd,sows,si,sd,msas,mous,mc]) =>
      setData({ grants,tranches,gd,sows,si,sd,msas,mous,mc,loading:false })
    );
  }, []);

  if (data.loading) return <p className="text-muted-foreground text-center py-12">Loading...</p>;

  const { grants, tranches, gd, sows, si, sd, msas, mous, mc } = data;
  const gName = id => { const g = grants.find(g=>g.id===id); return g?.title||g?.grant_name||"—"; };
  const gFunder = id => { const g = grants.find(g=>g.id===id); return g?.funder||g?.grantor||"—"; };
  const sName = id => sows.find(s=>s.id===id)?.title||"—";
  const sVendor = id => sows.find(s=>s.id===id)?.vendor_name||"—";
  const mName = id => mous.find(m=>m.id===id)?.title||"—";
  const mPartner = id => mous.find(m=>m.id===id)?.partner_name||"—";

  const s1 = tranches.filter(t => inWindow(t.due_date,today,in28)||isOverdue(t.due_date,t.status));
  const s2 = gd.filter(d => inWindow(d.due_date,today,in28)||isOverdue(d.due_date,d.status));
  const s3 = [
    ...si.filter(i=>inWindow(i.due_date,today,in28)||isOverdue(i.due_date,i.status)).map(i=>({...i,_type:"Invoice"})),
    ...sd.filter(d=>inWindow(d.due_date,today,in28)||isOverdue(d.due_date,d.status)).map(d=>({...d,_type:"Deliverable"})),
  ].sort((a,b)=>new Date(a.due_date)-new Date(b.due_date));
  const s4 = mc.filter(c=>inWindow(c.due_date,today,in28)||isOverdue(c.due_date,c.status));
  const s5 = [
    ...msas.filter(m=>!m.archived&&inWindow(m.end_date,today,in90)).map(m=>({type:"MSA",name:m.title,party:m.vendor_name,end_date:m.end_date,link:`MSADetail?id=${m.id}`})),
    ...sows.filter(s=>!s.archived&&inWindow(s.end_date,today,in90)).map(s=>({type:"SOW",name:s.title,party:s.vendor_name,end_date:s.end_date,link:`SOWDetail?id=${s.id}`})),
    ...mous.filter(m=>!m.archived&&inWindow(m.end_date,today,in90)).map(m=>({type:"MOU",name:m.title,party:m.partner_name,end_date:m.end_date,link:`MOUDetail?id=${m.id}`})),
  ].sort((a,b)=>new Date(a.end_date)-new Date(b.end_date));

  const allDated = [...s1.map(t=>t.due_date),...s2.map(d=>d.due_date),...s3.map(i=>i.due_date),...s4.map(c=>c.due_date)];
  const overdueCount = allDated.filter(d=>d&&isBefore(parseISO(d),today)).length;
  const soon7 = allDated.filter(d=>{if(!d)return false;const diff=differenceInDays(parseISO(d),today);return diff>=0&&diff<=7;}).length;
  const soon28 = allDated.filter(d=>{if(!d)return false;const diff=differenceInDays(parseISO(d),today);return diff>7&&diff<=28;}).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        <KpiChip value={overdueCount} label="Overdue items" color="red" />
        <KpiChip value={soon7} label="Due within 7 days" color="amber" />
        <KpiChip value={soon28} label="Due in 8–28 days" color="green" />
        <KpiChip value={s5.length} label="Contracts expiring in 90d" color="blue" />
      </div>

      {/* S1 */}
      <div>
        <SectionHeader title="Grants: Tranches & Invoices Due" count={s1.length} />
        <TableWithHead head={<><Th>Grant Name</Th><Th>Funder</Th><Th>Tranche</Th><Th>Amount</Th><Th>Due Date</Th><Th>Status</Th><Th></Th></>}>
          {s1.length===0?<EmptyRow cols={7}/>:s1.map(t=>(
            <tr key={t.id} className="hover:bg-muted/30"><Td className="font-medium">{gName(t.grant_id)}</Td><Td className="text-muted-foreground">{gFunder(t.grant_id)}</Td><Td>{t.tranche_name}</Td><Td className="font-semibold">${(t.amount||0).toLocaleString()}</Td><Td className="text-muted-foreground">{t.due_date?format(parseISO(t.due_date),"d MMM yyyy"):"—"}</Td><Td><StatusBadge dateStr={t.due_date}/></Td><Td><Link to={createPageUrl(`GrantDetail?id=${t.grant_id}&tab=tranches`)}><Button size="sm" variant="outline" className="text-xs h-7">Raise Invoice</Button></Link></Td></tr>
          ))}
        </TableWithHead>
      </div>

      {/* S2 */}
      <div>
        <SectionHeader title="Grants: Deliverables Due" count={s2.length} />
        <TableWithHead head={<><Th>Grant Name</Th><Th>Deliverable</Th><Th>Phase</Th><Th>Due Date</Th><Th>Status</Th><Th></Th></>}>
          {s2.length===0?<EmptyRow cols={6}/>:s2.map(d=>(
            <tr key={d.id} className="hover:bg-muted/30"><Td className="font-medium">{gName(d.grant_id)}</Td><Td>{d.name}</Td><Td className="text-muted-foreground">{d.phase||"—"}</Td><Td className="text-muted-foreground">{d.due_date?format(parseISO(d.due_date),"d MMM yyyy"):"—"}</Td><Td><StatusBadge dateStr={d.due_date}/></Td><Td><Link to={createPageUrl(`GrantDetail?id=${d.grant_id}&tab=deliverables`)}><Button size="sm" variant="outline" className="text-xs h-7">Mark Done</Button></Link></Td></tr>
          ))}
        </TableWithHead>
      </div>

      {/* S3 */}
      <div>
        <SectionHeader title="SOWs: Invoices & Deliverables Due" count={s3.length} />
        <TableWithHead head={<><Th>SOW Name</Th><Th>Vendor</Th><Th>Type</Th><Th>Description</Th><Th>Amount</Th><Th>Due Date</Th><Th>Status</Th><Th></Th></>}>
          {s3.length===0?<EmptyRow cols={8}/>:s3.map(item=>(
            <tr key={`${item._type}-${item.id}`} className="hover:bg-muted/30"><Td className="font-medium">{sName(item.sow_id)}</Td><Td className="text-muted-foreground">{sVendor(item.sow_id)}</Td><Td><Badge variant="outline" className="text-xs">{item._type}</Badge></Td><Td>{item._type==="Invoice"?(item.period||item.invoice_number||"Invoice"):item.name}</Td><Td className="font-semibold">{item._type==="Invoice"&&item.amount?`$${item.amount.toLocaleString()}`:"—"}</Td><Td className="text-muted-foreground">{item.due_date?format(parseISO(item.due_date),"d MMM yyyy"):"—"}</Td><Td><StatusBadge dateStr={item.due_date}/></Td><Td><Link to={createPageUrl(`SOWDetail?id=${item.sow_id}&tab=${item._type==="Invoice"?"invoices":"deliverables"}`)}><Button size="sm" variant="outline" className="text-xs h-7">{item._type==="Invoice"?"Raise Invoice":"Mark Done"}</Button></Link></Td></tr>
          ))}
        </TableWithHead>
      </div>

      {/* S4 */}
      <div>
        <SectionHeader title="MOUs: Commitments & Reviews Due" count={s4.length} />
        <TableWithHead head={<><Th>MOU Name</Th><Th>Partner</Th><Th>Commitment</Th><Th>Due Date</Th><Th>Status</Th><Th></Th></>}>
          {s4.length===0?<EmptyRow cols={6}/>:s4.map(c=>(
            <tr key={c.id} className="hover:bg-muted/30"><Td className="font-medium">{mName(c.mou_id)}</Td><Td className="text-muted-foreground">{mPartner(c.mou_id)}</Td><Td>{c.name}</Td><Td className="text-muted-foreground">{c.due_date?format(parseISO(c.due_date),"d MMM yyyy"):"—"}</Td><Td><StatusBadge dateStr={c.due_date}/></Td><Td><Link to={createPageUrl(`MOUDetail?id=${c.mou_id}&tab=commitments`)}><Button size="sm" variant="outline" className="text-xs h-7">Log Complete</Button></Link></Td></tr>
          ))}
        </TableWithHead>
      </div>

      {/* S5 */}
      <div>
        <SectionHeader title="Contracts Expiring Within 90 Days" count={s5.length} />
        <TableWithHead head={<><Th>Type</Th><Th>Name</Th><Th>Counterparty</Th><Th>Expiry Date</Th><Th>Days Remaining</Th><Th></Th></>}>
          {s5.length===0?<EmptyRow cols={6}/>:s5.map((c,i)=>{
            const dLeft=differenceInDays(parseISO(c.end_date),today);
            return <tr key={i} className="hover:bg-muted/30"><Td><Badge variant="outline" className="text-xs">{c.type}</Badge></Td><Td className="font-medium">{c.name}</Td><Td className="text-muted-foreground">{c.party}</Td><Td className="text-muted-foreground">{format(parseISO(c.end_date),"d MMM yyyy")}</Td><Td><span className={`font-semibold ${dLeft<=30?"text-red-600":dLeft<=60?"text-amber-600":"text-muted-foreground"}`}>{dLeft}d</span></Td><Td><Link to={createPageUrl(c.link)}><Button size="sm" variant="outline" className="text-xs h-7">Initiate Renewal</Button></Link></Td></tr>;
          })}
        </TableWithHead>
      </div>
    </div>
  );
}