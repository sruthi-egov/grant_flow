import { useState, useEffect, useMemo } from "react";
import { api } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileText } from "lucide-react";
import SowCard from "@/components/sow/SowCard";
import AddSowModal from "@/components/sow/AddSowModal";
import { useDebounce } from "@/hooks/useDebounce";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { usePermissions, canUploadPDF } from "@/hooks/useCanUploadPdf";

export default function SOWs() {
  const [sows, setSows] = useState([]);
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const debouncedSearch = useDebounce(search, 350);
  const [showAdd, setShowAdd] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    api.auth.me().then(setUser).catch(() => {});
    fetchData();
  }, []);

  const fetchData = async () => {
    const [s, g] = await Promise.all([
      api.entities.SOW.list("-created_date", 200),
      api.entities.Grant.list("-created_date", 100),
    ]);
    setSows(s);
    setGrants(g);
    setLoading(false);
  };

  const handleSowSaved = async (newSow) => {
    setShowAdd(false);
    // Optimistically prepend the new SoW if we have it, then refetch to sync
    if (newSow?.id) {
      setSows(prev => [newSow, ...prev.filter(s => s.id !== newSow.id)]);
    }
    // Refetch in background to get server-authoritative list
    fetchData();
  };

  const { permissions } = usePermissions();
  const isAdmin = (user?.role || "").toLowerCase() === "admin";
  const canUploadSOWs = canUploadPDF(permissions, "SOWs");

  const grantName = (grantId) => {
    const g = grants.find(g => g.id === grantId);
    return g ? (g.title || g.grant_name) : null;
  };

  const filtered = useMemo(() => sows.filter(s => {
    if (s.archived) return false;
    const q = debouncedSearch.toLowerCase();
    const matchSearch = !q ||
      s.title?.toLowerCase().includes(q) ||
      s.vendor_name?.toLowerCase().includes(q) ||
      s.sow_number?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    return matchSearch && matchStatus;
  }), [sows, debouncedSearch, statusFilter]);

  const activeCost = sows
    .filter(s => s.status === "active")
    .reduce((sum, s) => sum + (s.monthly_rate || s.total_monthly_value || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Statements of Work</h1>
          <p className="text-muted-foreground mt-1">
            {sows.filter(s => s.status === "active").length} active &middot; <span className="text-green-700 font-medium">${activeCost.toLocaleString()}/mo</span> total spend
          </p>
        </div>
        {(isAdmin || canUploadSOWs) && (
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add SOW
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search SOWs..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No SOWs found.</p>
          {(isAdmin || canUploadSOWs) && (
            <Button className="mt-4 gap-2" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4" /> Add your first SOW
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(sow => (
            <SowCard key={sow.id} sow={sow} grantName={grantName(sow.grant_id)} />
          ))}
        </div>
      )}

      {showAdd && (
        <AddSowModal
          grants={grants.filter(g => !g.archived)}
          onClose={() => setShowAdd(false)}
          onSaved={handleSowSaved}
        />
      )}
    </div>
  );
}