import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileText } from "lucide-react";
import MsaCard from "@/components/msa/MsaCard";
import AddMsaModal from "@/components/msa/AddMsaModal";
import { usePermissions, canUploadPDF } from "@/hooks/useCanUploadPdf";

export default function MSAs() {
  const [msas, setMsas] = useState([]);
  const [sows, setSows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    fetchData();
  }, []);

  const fetchData = async () => {
    const [m, s] = await Promise.all([
      base44.entities.MSA.list("-created_date", 100),
      base44.entities.SOW.list("-created_date", 200),
    ]);
    setMsas(m);
    setSows(s);
    setLoading(false);
  };

  const { permissions } = usePermissions();
  const isAdmin = (user?.role || "").toLowerCase() === "admin";
  const canUploadMSAs = canUploadPDF(permissions, "MSAs");

  const sowCountForMsa = (msaId) => sows.filter(s => s.msa_id === msaId).length;

  const filtered = msas.filter(m => {
    if (m.archived) return false;
    const matchSearch = !search ||
      m.title?.toLowerCase().includes(search.toLowerCase()) ||
      m.vendor_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || m.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Master Services Agreements</h1>
          <p className="text-muted-foreground mt-1">
            {msas.filter(m => m.status === "active").length} active &middot; {msas.length} total
          </p>
        </div>
        {(isAdmin || canUploadMSAs) && (
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add MSA
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search MSAs..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-center py-16">Loading MSAs...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No MSAs found.</p>
          {(isAdmin || canUploadMSAs) && (
            <Button className="mt-4 gap-2" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4" /> Add your first MSA
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(msa => (
            <MsaCard key={msa.id} msa={msa} linkedSowCount={sowCountForMsa(msa.id)} />
          ))}
        </div>
      )}

      {showAdd && (
        <AddMsaModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchData(); }} />
      )}
    </div>
  );
}