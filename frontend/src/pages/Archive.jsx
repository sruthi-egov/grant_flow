import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArchiveRestore, FileText, ClipboardList, ScrollText, Handshake } from "lucide-react";
import { format, parseISO } from "date-fns";

const statusColors = {
  active: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-gray-100 text-gray-600",
  expired: "bg-gray-100 text-gray-600",
  draft: "bg-yellow-100 text-yellow-700",
  terminated: "bg-red-100 text-red-700",
};

function ArchiveCard({ label, children, onRestore }) {
  return (
    <Card className="opacity-80">
      <CardContent className="p-4 space-y-2">
        {children}
        <Button variant="outline" size="sm" className="w-full gap-2 mt-2" onClick={onRestore}>
          <ArchiveRestore className="w-4 h-4" /> Restore {label}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Archive() {
  const [grants, setGrants] = useState([]);
  const [sows, setSows] = useState([]);
  const [msas, setMsas] = useState([]);
  const [mous, setMous] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    const [g, s, m, mo] = await Promise.all([
      base44.entities.Grant.filter({ archived: true }, "-updated_date", 100),
      base44.entities.SOW.filter({ archived: true }, "-updated_date", 100),
      base44.entities.MSA.filter({ archived: true }, "-updated_date", 100),
      base44.entities.MOU.filter({ archived: true }, "-updated_date", 100),
    ]);
    setGrants(g); setSows(s); setMsas(m); setMous(mo);
    setLoading(false);
  };

  const restore = async (entity, id, setter) => {
    await base44.entities[entity].update(id, { archived: false });
    setter(prev => prev.filter(x => x.id !== id));
  };

  const total = grants.length + sows.length + msas.length + mous.length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Archive</h1>
        <p className="text-muted-foreground mt-1">{total} archived item{total !== 1 ? "s" : ""} — available for reference</p>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-center py-16">Loading...</div>
      ) : (
        <Tabs defaultValue="grants">
          <TabsList className="mb-6">
            <TabsTrigger value="grants" className="gap-2">
              <FileText className="w-4 h-4" /> Grants ({grants.length})
            </TabsTrigger>
            <TabsTrigger value="sows" className="gap-2">
              <ClipboardList className="w-4 h-4" /> SOWs ({sows.length})
            </TabsTrigger>
            <TabsTrigger value="msas" className="gap-2">
              <ScrollText className="w-4 h-4" /> MSAs ({msas.length})
            </TabsTrigger>
            <TabsTrigger value="mous" className="gap-2">
              <Handshake className="w-4 h-4" /> MOUs ({mous.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="grants">
            {grants.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No archived grants.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {grants.map(g => (
                  <ArchiveCard key={g.id} label="Grant" onRestore={() => restore("Grant", g.id, setGrants)}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm leading-snug">{g.title || g.grant_name}</p>
                      <Badge className={`${statusColors[g.status]} shrink-0 text-xs`}>{g.status}</Badge>
                    </div>
                    {(g.funder || g.grantor) && <p className="text-xs text-muted-foreground">{g.funder || g.grantor}</p>}
                    {g.total_amount > 0 && <p className="text-sm font-medium text-green-700">${g.total_amount.toLocaleString()}</p>}
                    {g.end_date && <p className="text-xs text-muted-foreground">Ends {format(parseISO(g.end_date), "MMM d, yyyy")}</p>}
                  </ArchiveCard>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="sows">
            {sows.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No archived SOWs.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {sows.map(s => (
                  <ArchiveCard key={s.id} label="SOW" onRestore={() => restore("SOW", s.id, setSows)}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm leading-snug">{s.title}</p>
                      <Badge className={`${statusColors[s.status]} shrink-0 text-xs`}>{s.status}</Badge>
                    </div>
                    {s.vendor_name && <p className="text-xs text-muted-foreground">{s.vendor_name}</p>}
                    {s.total_monthly_value > 0 && <p className="text-sm font-medium">${s.total_monthly_value.toLocaleString()}/mo</p>}
                    {s.end_date && <p className="text-xs text-muted-foreground">Ended {format(parseISO(s.end_date), "MMM d, yyyy")}</p>}
                  </ArchiveCard>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="msas">
            {msas.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No archived MSAs.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {msas.map(m => (
                  <ArchiveCard key={m.id} label="MSA" onRestore={() => restore("MSA", m.id, setMsas)}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm leading-snug">{m.title}</p>
                      <Badge className={`${statusColors[m.status]} shrink-0 text-xs`}>{m.status}</Badge>
                    </div>
                    {m.vendor_name && <p className="text-xs text-muted-foreground">{m.vendor_name}</p>}
                    {m.end_date && <p className="text-xs text-muted-foreground">Ended {format(parseISO(m.end_date), "MMM d, yyyy")}</p>}
                  </ArchiveCard>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="mous">
            {mous.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No archived MOUs.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {mous.map(m => (
                  <ArchiveCard key={m.id} label="MOU" onRestore={() => restore("MOU", m.id, setMous)}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm leading-snug">{m.title}</p>
                      <Badge className={`${statusColors[m.status]} shrink-0 text-xs`}>{m.status}</Badge>
                    </div>
                    {m.partner_name && <p className="text-xs text-muted-foreground">{m.partner_name}</p>}
                    {m.end_date && <p className="text-xs text-muted-foreground">Ended {format(parseISO(m.end_date), "MMM d, yyyy")}</p>}
                  </ArchiveCard>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}