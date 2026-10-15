import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, parseISO, differenceInDays, addMonths, isAfter, isBefore } from "date-fns";
import { SectionHeader, EmptyRow, Th, Td, TableWithHead } from "./ReportUtils";

const today = new Date(); today.setHours(0,0,0,0);
const windowEnd = addMonths(today, 24);
const windowDuration = differenceInDays(windowEnd, today);

const typeColors = { MSA: "bg-blue-400", SOW: "bg-purple-400", MOU: "bg-teal-400", Grant: "bg-green-500" };
const typeBadgeColors = { MSA: "bg-blue-100 text-blue-700", SOW: "bg-purple-100 text-purple-700", MOU: "bg-teal-100 text-teal-700", Grant: "bg-green-100 text-green-700" };

function GanttBar({ name, type, start, end, link }) {
  if (!start || !end) return null;
  const s = parseISO(start);
  const e = parseISO(end);
  const startOff = Math.max(0, differenceInDays(s, today));
  const endOff = Math.min(windowDuration, differenceInDays(e, today));
  if (endOff < 0) return null;
  const leftPct = (startOff / windowDuration) * 100;
  const widthPct = Math.max(0.5, ((endOff - startOff) / windowDuration) * 100);
  const expiringSoon = differenceInDays(e, today) <= 90 && differenceInDays(e, today) >= 0;

  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="w-36 shrink-0 text-xs text-right truncate text-muted-foreground">{name}</div>
      <div className="flex-1 relative h-6">
        <div className="absolute inset-0 flex">
          <div style={{ width: `${leftPct}%` }} />
          <div
            className={`h-5 rounded ${typeColors[type]} opacity-80 relative`}
            style={{ width: `${widthPct}%` }}
            title={`${name}: ${format(s,"d MMM yy")} – ${format(e,"d MMM yy")}`}
          >
            {expiringSoon && <div className="absolute right-0 inset-y-0 w-1.5 bg-red-500 rounded-r" />}
          </div>
        </div>
        {/* Today line */}
        <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-gray-400 z-10" style={{ left: "0%" }} />
      </div>
    </div>
  );
}

export default function ContractLifecycleReport() {
  const [sows, setSows] = useState([]);
  const [msas, setMsas] = useState([]);
  const [mous, setMous] = useState([]);
  const [grants, setGrants] = useState([]);
  const [sortBy, setSortBy] = useState("end_date");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.SOW.list("-created_date", 500),
      base44.entities.MSA.list("-created_date", 500),
      base44.entities.MOU.list("-created_date", 500),
      base44.entities.Grant.list("-created_date", 500),
    ]).then(([s,ms,mo,g]) => { setSows(s); setMsas(ms); setMous(mo); setGrants(g); setLoading(false); });
  }, []);

  if (loading) return <p className="text-muted-foreground text-center py-12">Loading...</p>;

  const activeContracts = [
    ...msas.filter(m=>!m.archived&&["active","draft"].includes(m.status)).map(m=>({type:"MSA",name:m.title,party:m.vendor_name,start:m.effective_date,end:m.end_date,status:m.status,id:m.id})),
    ...sows.filter(s=>!s.archived&&["active","draft"].includes(s.status)).map(s=>({type:"SOW",name:s.title,party:s.vendor_name,start:s.start_date,end:s.end_date,status:s.status,id:s.id})),
    ...mous.filter(m=>!m.archived&&["active","draft"].includes(m.status)).map(m=>({type:"MOU",name:m.title,party:m.partner_name,start:m.effective_date,end:m.end_date,status:m.status,id:m.id})),
    ...grants.filter(g=>!g.archived&&g.status==="active").map(g=>({type:"Grant",name:g.title||g.grant_name,party:g.funder||g.grantor,start:g.start_date,end:g.end_date,status:g.status,id:g.id})),
  ];

  // Coverage gaps: SOWs whose msa_id MSA expires before SOW
  const gaps = sows.filter(s => s.msa_id && s.end_date).map(s => {
    const msa = msas.find(m => m.id === s.msa_id);
    if (!msa || !msa.end_date) return null;
    const msaExpiry = parseISO(msa.end_date);
    const sowExpiry = parseISO(s.end_date);
    if (isBefore(msaExpiry, sowExpiry)) {
      const gapDays = differenceInDays(sowExpiry, msaExpiry);
      return { sow: s, msa, gapDays };
    }
    return null;
  }).filter(Boolean);

  const sorted = [...activeContracts].sort((a, b) => {
    if (!a.end || !b.end) return 0;
    return sortBy === "end_date" ? new Date(a.end) - new Date(b.end) : a.type.localeCompare(b.type);
  });

  const monthLabels = [0,3,6,9,12,15,18,21,24].map(m => ({
    label: format(addMonths(today, m), "MMM yy"),
    pct: (m / 24) * 100,
  }));

  return (
    <div className="space-y-8">
      {/* S1: Gantt */}
      <div>
        <SectionHeader title="Contract Timeline (24-Month View)" count={activeContracts.length} />
        <div className="border rounded-lg p-4 overflow-x-auto">
          {/* Month labels */}
          <div className="flex mb-3">
            <div className="w-36 shrink-0" />
            <div className="flex-1 relative h-4">
              {monthLabels.map(({ label, pct }) => (
                <span key={label} className="absolute text-xs text-muted-foreground" style={{ left: `${pct}%`, transform: "translateX(-50%)" }}>{label}</span>
              ))}
            </div>
          </div>
          <div className="flex gap-3 mb-3 text-xs">
            {Object.entries(typeColors).map(([type, color]) => (
              <span key={type} className="flex items-center gap-1">
                <span className={`w-3 h-3 rounded inline-block ${color}`} /> {type}
              </span>
            ))}
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block bg-red-500" /> Expiring soon</span>
          </div>
          {activeContracts.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">No active contracts to display.</p>
          ) : (
            activeContracts.map((c, i) => <GanttBar key={i} {...c} start={c.start} end={c.end} />)
          )}
        </div>
      </div>

      {/* S2: Coverage gaps */}
      <div>
        <SectionHeader title="MSA Coverage Gaps" count={gaps.length} />
        <TableWithHead head={<><Th>SOW Name</Th><Th>SOW End Date</Th><Th>Linked MSA</Th><Th>MSA Expiry</Th><Th>Gap Duration</Th><Th>Action</Th></>}>
          {gaps.length === 0 ? <tr><td colSpan={6} className="px-4 py-4 text-sm text-muted-foreground text-center italic">No coverage gaps found — all linked MSAs cover their SOWs.</td></tr>
            : gaps.map(({ sow, msa, gapDays }) => (
              <tr key={sow.id} className="hover:bg-muted/30 bg-red-50/30">
                <Td className="font-medium text-red-700">{sow.title}</Td>
                <Td>{sow.end_date?format(parseISO(sow.end_date),"d MMM yyyy"):"—"}</Td>
                <Td>{msa.title}</Td>
                <Td className="text-red-600">{format(parseISO(msa.end_date),"d MMM yyyy")}</Td>
                <Td><span className="text-red-600 font-bold">{gapDays}d uncovered</span></Td>
                <Td><Link to={createPageUrl(`MSADetail?id=${msa.id}`)}><Button size="sm" variant="outline" className="text-xs h-7">Renew MSA</Button></Link></Td>
              </tr>
            ))
          }
        </TableWithHead>
      </div>

      {/* S3: Flat table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionHeader title="All Contracts" count={sorted.length} />
          <div className="flex gap-2 text-xs">
            <button onClick={()=>setSortBy("end_date")} className={`px-3 py-1 rounded border ${sortBy==="end_date"?"bg-primary text-primary-foreground":""}`}>Sort by Expiry</button>
            <button onClick={()=>setSortBy("type")} className={`px-3 py-1 rounded border ${sortBy==="type"?"bg-primary text-primary-foreground":""}`}>Sort by Type</button>
          </div>
        </div>
        <TableWithHead head={<><Th>Type</Th><Th>Name</Th><Th>Counterparty</Th><Th>Start</Th><Th>End</Th><Th>Days Remaining</Th><Th>Status</Th></>}>
          {sorted.length===0?<EmptyRow cols={7}/>:sorted.map((c,i)=>{
            const dLeft = c.end ? differenceInDays(parseISO(c.end), today) : null;
            return <tr key={i} className="hover:bg-muted/30">
              <Td><span className={`text-xs px-2 py-0.5 rounded font-medium ${typeBadgeColors[c.type]}`}>{c.type}</span></Td>
              <Td className="font-medium">{c.name}</Td>
              <Td className="text-muted-foreground">{c.party}</Td>
              <Td className="text-muted-foreground">{c.start?format(parseISO(c.start),"d MMM yy"):"—"}</Td>
              <Td className="text-muted-foreground">{c.end?format(parseISO(c.end),"d MMM yy"):"—"}</Td>
              <Td>{dLeft!==null?<span className={`font-semibold ${dLeft<0?"text-red-600":dLeft<=90?"text-amber-600":"text-muted-foreground"}`}>{dLeft<0?"Expired":dLeft+"d"}</span>:"—"}</Td>
              <Td><span className={`text-xs px-2 py-0.5 rounded font-medium ${c.status==="active"?"bg-green-100 text-green-700":"bg-gray-100 text-gray-600"}`}>{c.status}</span></Td>
            </tr>;
          })}
        </TableWithHead>
      </div>
    </div>
  );
}