import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Handshake } from "lucide-react";
import MouCard from "@/components/mou/MouCard";
import AddMouModal from "@/components/mou/AddMouModal.jsx";
import { usePermissions, canUploadPDF } from "@/hooks/useCanUploadPdf";

export default function MOUs() {
  const [mous, setMous] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    api.auth.me().then(setUser).catch(() => {});
    fetchData();
  }, []);

  const fetchData = async () => {
    const data = await api.entities.MOU.list("-created_date", 100);
    setMous(data);
    setLoading(false);
  };

  const { permissions } = usePermissions();
  const isAdmin = (user?.role || "").toLowerCase() === "admin";
  const canUploadMOUs = canUploadPDF(permissions, "MOUs");

  const filtered = mous.filter(m => {
    if (m.archived) return false;
    const matchSearch = !search ||
      m.title?.toLowerCase().includes(search.toLowerCase()) ||
      m.partner_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || m.status === statusFilter;
    const matchType = typeFilter === "all" || m.partner_type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Memoranda of Understanding</h1>
          <p className="text-muted-foreground mt-1">
            {mous.filter(m => m.status === "active").length} active &middot; {mous.length} total
          </p>
        </div>
        {(isAdmin || canUploadMOUs) && (
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add MOU
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search MOUs..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Partner Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="government">Government</SelectItem>
            <SelectItem value="ngo">NGO</SelectItem>
            <SelectItem value="private">Private</SelectItem>
            <SelectItem value="academic">Academic</SelectItem>
            <SelectItem value="multilateral">Multilateral</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-center py-16">Loading MOUs...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Handshake className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No MOUs found.</p>
          {(isAdmin || canUploadMOUs) && (
            <Button className="mt-4 gap-2" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4" /> Add your first MOU
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(mou => (
            <MouCard key={mou.id} mou={mou} />
          ))}
        </div>
      )}

      {showAdd && (
        <AddMouModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchData(); }} />
      )}
    </div>
  );
}