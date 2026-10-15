import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { SectionHeader, EmptyRow, Th, Td, KpiChip, TableWithHead } from "./ReportUtils";

function riskFlag(exposure, msaCount, sowCount) {
  if (exposure > 200000 || (msaCount === 1 && sowCount > 1)) return { label: "High", color: "bg-red-100 text-red-700" };
  if (exposure >= 50000) return { label: "Medium", color: "bg-amber-100 text-amber-700" };
  return { label: "Low", color: "bg-green-100 text-green-700" };
}

export default function CounterpartyExposureReport() {
  const [grants, setGrants] = useState([]);
  const [sows, setSows] = useState([]);
  const [msas, setMsas] = useState([]);
  const [mous, setMous] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Grant.list("-created_date", 500),
      base44.entities.SOW.list("-created_date", 500),
      base44.entities.MSA.list("-created_date", 500),
      base44.entities.MOU.list("-created_date", 500),
    ]).then(([g,s,ms,mo]) => { setGrants(g); setSows(s); setMsas(ms); setMous(mo); setLoading(false); });
  }, []);

  if (loading) return <p className="text-muted-foreground text-center py-12">Loading...</p>;

  // Group by counterparty name
  const counterparties = {};
  const addCP = (name, type, item) => {
    if (!name) return;
    const key = name.trim().toLowerCase();
    if (!counterparties[key]) counterparties[key] = { name: name.trim(), msas:[], sows:[], mous:[], grants:[], items:[] };
    counterparties[key][type].push(item);
    counterparties[key].items.push({ type, item });
  };

  grants.filter(g=>!g.archived&&g.status==="active").forEach(g => addCP(g.funder||g.grantor, "grants", g));
  sows.filter(s=>!s.archived&&s.status==="active").forEach(s => addCP(s.vendor_name, "sows", s));
  msas.filter(m=>!m.archived&&m.status==="active").forEach(m => addCP(m.vendor_name, "msas", m));
  mous.filter(m=>!m.archived&&m.status==="active").forEach(m => addCP(m.partner_name, "mous", m));

  const rows = Object.values(counterparties).map(cp => {
    const totalExposure = cp.sows.reduce((s,sw)=>(s+(sw.total_value||sw.monthly_rate*12||0)),0)
      + cp.grants.reduce((s,g)=>(s+(g.total_amount||0)),0);
    const earliestExpiry = [...cp.sows.map(s=>s.end_date),...cp.msas.map(m=>m.end_date),...cp.mous.map(m=>m.end_date)]
      .filter(Boolean).sort()[0];
    const flag = riskFlag(totalExposure, cp.msas.length, cp.sows.length);
    const totalContracts = cp.msas.length + cp.sows.length + cp.mous.length + cp.grants.length;
    return { ...cp, totalExposure, earliestExpiry, flag, totalContracts };
  }).sort((a,b) => b.totalExposure - a.totalExposure);

  const totalCPs = rows.length;
  const largestExposure = rows.length > 0 ? rows[0] : null;
  const multipleAgreements = rows.filter(r => r.totalContracts >= 2).length;
  const totalContractValue = rows.reduce((s,r) => s + r.totalExposure, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        <KpiChip value={totalCPs} label="Counterparties with active contracts" color="blue" />
        <KpiChip value={largestExposure ? `$${(largestExposure.totalExposure/1000).toFixed(0)}k` : "—"} label={`Largest: ${largestExposure?.name||"—"}`} color="orange" />
        <KpiChip value={multipleAgreements} label="With 2+ active agreements" color="amber" />
        <KpiChip value={`$${(totalContractValue/1000).toFixed(0)}k`} label="Total active contract value" color="green" />
      </div>

      {/* S1 */}
      <div>
        <SectionHeader title="Exposure by Counterparty" count={rows.length} />
        <div className="text-xs text-muted-foreground mb-2 italic">Click a row to see individual contracts</div>
        <TableWithHead head={<><Th>Counterparty</Th><Th>MSAs</Th><Th>SOWs</Th><Th>MOUs</Th><Th>Grants</Th><Th>Total Exposure</Th><Th>Earliest Expiry</Th><Th>Risk</Th></>}>
          {rows.length===0?<EmptyRow cols={8}/>:rows.map(r=>(
            <>
              <tr key={r.name} className={`hover:bg-muted/30 cursor-pointer ${expanded===r.name?"bg-muted/40":""}`} onClick={()=>setExpanded(expanded===r.name?null:r.name)}>
                <Td className="font-semibold">{r.name}</Td>
                <Td className="text-center">{r.msas.length}</Td>
                <Td className="text-center">{r.sows.length}</Td>
                <Td className="text-center">{r.mous.length}</Td>
                <Td className="text-center">{r.grants.length}</Td>
                <Td className="font-bold">${r.totalExposure.toLocaleString()}</Td>
                <Td className="text-muted-foreground">{r.earliestExpiry?format(parseISO(r.earliestExpiry),"d MMM yyyy"):"—"}</Td>
                <Td><Badge className={`text-xs ${r.flag.color}`}>{r.flag.label}</Badge></Td>
              </tr>
              {expanded===r.name&&(
                <tr key={`${r.name}-expanded`}><td colSpan={8} className="px-4 py-3 bg-muted/20">
                  <table className="w-full text-xs"><thead className="text-muted-foreground"><tr><th className="text-left pb-1">Type</th><th className="text-left pb-1">Name</th><th className="text-left pb-1">Value</th><th className="text-left pb-1">Start</th><th className="text-left pb-1">End</th><th className="text-left pb-1">Status</th></tr></thead>
                  <tbody className="divide-y">
                    {r.items.map(({type, item},i)=>(
                      <tr key={i}><td className="py-1 pr-3"><Badge variant="outline" className="text-xs">{type.slice(0,-1).toUpperCase()}</Badge></td><td className="py-1 pr-3 font-medium">{item.title||item.grant_name||"—"}</td><td className="py-1 pr-3">{item.total_amount||item.total_value?`$${(item.total_amount||item.total_value||0).toLocaleString()}`:"—"}</td><td className="py-1 pr-3 text-muted-foreground">{item.start_date||item.effective_date?format(parseISO(item.start_date||item.effective_date),"d MMM yy"):"—"}</td><td className="py-1 pr-3 text-muted-foreground">{item.end_date?format(parseISO(item.end_date),"d MMM yy"):"—"}</td><td className="py-1"><Badge className={item.status==="active"?"bg-green-100 text-green-700 text-xs":"bg-gray-100 text-gray-600 text-xs"}>{item.status||"—"}</Badge></td></tr>
                    ))}
                  </tbody></table>
                </td></tr>
              )}
            </>
          ))}
        </TableWithHead>
      </div>
    </div>
  );
}