import { useState, useEffect, useMemo } from "react";
import { api } from "@/api/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, CheckCircle2, XCircle, AlertTriangle, Clock, Shield, RefreshCw, Search } from "lucide-react";
import { format, parseISO } from "date-fns";
import InvalidDocumentsTable from "@/components/documents/InvalidDocumentsTable";
import UniversalDocumentUploader from "@/components/documents/UniversalDocumentUploader";
import { useDebounce } from "@/hooks/useDebounce";
import { SkeletonTable, SkeletonKPI } from "@/components/ui/skeleton-card";

const STATUS_COLORS = {
  Valid: "bg-green-100 text-green-700",
  Invalid: "bg-red-100 text-red-700",
  Duplicate: "bg-orange-100 text-orange-700",
  PendingReview: "bg-yellow-100 text-yellow-700",
  NeedsReview: "bg-amber-100 text-amber-700",
  ForceApproved: "bg-blue-100 text-blue-700",
};

const MODULES = ["All", "Grant", "SOW", "MSA", "MOU", "Milestone", "Deliverable", "Invoice", "ReportingObligation"];
const PAGE_SIZE = 25;

export default function DocumentIntelligence() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [tab, setTab] = useState("overview");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search, 350);

  const fetchDocs = async () => {
    setLoading(true);
    const data = await api.entities.DocumentValidationLog.list("-created_date", 500);
    setDocs(data.filter(d => !d.is_deleted));
    setLoading(false);
  };

  useEffect(() => {
    api.auth.me().then(setUser).catch(() => {});
    fetchDocs();
  }, []);

  useEffect(() => { setPage(1); }, [debouncedSearch, moduleFilter, statusFilter]);

  const isAdmin = user?.role === "admin";

  const stats = useMemo(() => ({
    total: docs.length,
    valid: docs.filter(d => d.validation_status === "Valid").length,
    invalid: docs.filter(d => d.validation_status === "Invalid").length,
    duplicates: docs.filter(d => d.validation_status === "Duplicate").length,
    pending: docs.filter(d => ["PendingReview", "NeedsReview"].includes(d.validation_status)).length,
    forceApproved: docs.filter(d => d.validation_status === "ForceApproved").length,
  }), [docs]);

  const invalidDocs = useMemo(() =>
    docs.filter(d => ["Invalid", "Duplicate", "PendingReview", "NeedsReview"].includes(d.validation_status)), [docs]);

  const byModule = useMemo(() => MODULES.slice(1).reduce((acc, m) => {
    acc[m] = docs.filter(d => d.selected_module === m);
    return acc;
  }, {}), [docs]);

  const filtered = useMemo(() => docs.filter(d => {
    const s = debouncedSearch.toLowerCase();
    const matchSearch = !s || d.file_name?.toLowerCase().includes(s) || d.detected_document_type?.toLowerCase().includes(s);
    const matchModule = moduleFilter === "All" || d.selected_module === moduleFilter;
    const matchStatus = statusFilter === "All" || d.validation_status === statusFilter;
    return matchSearch && matchModule && matchStatus;
  }), [docs, debouncedSearch, moduleFilter, statusFilter]);

  const paginated = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);

  const statCards = [
    { label: "Total Documents", value: stats.total, icon: FileText, color: "text-blue-600" },
    { label: "Valid", value: stats.valid, icon: CheckCircle2, color: "text-green-600" },
    { label: "Invalid", value: stats.invalid, icon: XCircle, color: "text-red-600" },
    { label: "Duplicates", value: stats.duplicates, icon: AlertTriangle, color: "text-orange-500" },
    { label: "Pending Review", value: stats.pending, icon: Clock, color: "text-yellow-600" },
    { label: "Force Approved", value: stats.forceApproved, icon: Shield, color: "text-blue-500" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Document Intelligence</h1>
          <p className="text-muted-foreground mt-1">AI-powered validation, classification, and audit of all uploaded documents</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={fetchDocs} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {loading
          ? [1,2,3,4,5,6].map(i => <SkeletonKPI key={i} />)
          : statCards.map((s, i) => (
            <Card key={i}>
              <CardContent className="p-4 text-center">
                <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.color}`} />
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))
        }
      </div>

      <Tabs value={tab} onValueChange={t => { setTab(t); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="invalid">
            Invalid / Unclassified
            {invalidDocs.length > 0 && <Badge className="ml-2 bg-red-100 text-red-700">{invalidDocs.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="all">All Documents</TabsTrigger>
          {isAdmin && <TabsTrigger value="upload">Test Upload</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-32 rounded-xl border bg-card animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {MODULES.slice(1).map(module => {
                const moduleDocs = byModule[module] || [];
                const vCount = moduleDocs.filter(d => d.validation_status === "Valid" || d.validation_status === "ForceApproved").length;
                const iCount = moduleDocs.filter(d => d.validation_status === "Invalid").length;
                const dCount = moduleDocs.filter(d => d.validation_status === "Duplicate").length;
                return (
                  <Card key={module}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center justify-between">
                        {module} <Badge variant="outline">{moduleDocs.length} docs</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5 text-xs">
                      <div className="flex justify-between"><span className="text-green-600">✓ Valid</span><span className="font-medium">{vCount}</span></div>
                      <div className="flex justify-between"><span className="text-red-600">✗ Invalid</span><span className="font-medium">{iCount}</span></div>
                      <div className="flex justify-between"><span className="text-orange-500">⚠ Duplicate</span><span className="font-medium">{dCount}</span></div>
                      {moduleDocs.length > 0 && (
                        <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                          <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.round((vCount / moduleDocs.length) * 100)}%` }} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="invalid" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500" /> Invalid / Unclassified Documents
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {isAdmin ? "Admins can review, reclassify, force-approve, or delete." : "Contact an admin to review."}
              </p>
            </CardHeader>
            <CardContent>
              {loading ? <SkeletonTable rows={5} /> : (
                <InvalidDocumentsTable
                  docs={isAdmin ? invalidDocs : invalidDocs.filter(d => d.uploaded_by === user?.email)}
                  onRefresh={fetchDocs}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search by file name or type..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Module" /></SelectTrigger>
              <SelectContent>{MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {["All", "Valid", "Invalid", "Duplicate", "PendingReview", "NeedsReview", "ForceApproved"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!loading && <p className="text-xs text-muted-foreground">Showing {paginated.length} of {filtered.length} documents</p>}

          <Card>
            <CardContent className="p-0">
              {loading ? <SkeletonTable rows={6} /> : paginated.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No documents found.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {paginated.map(doc => (
                    <div key={doc.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{doc.file_name}</p>
                          <Badge className={STATUS_COLORS[doc.validation_status] || "bg-gray-100 text-gray-700"}>{doc.validation_status}</Badge>
                        </div>
                        <div className="flex gap-x-4 gap-y-1 flex-wrap text-xs text-muted-foreground mt-0.5">
                          <span>Module: {doc.selected_module}</span>
                          {doc.detected_document_type && <span>Type: {doc.detected_document_type}</span>}
                          {doc.confidence_score > 0 && <span>{doc.confidence_score}% confidence</span>}
                          {doc.uploaded_by && <span>By: {doc.uploaded_by}</span>}
                          {doc.created_date && <span>{format(parseISO(doc.created_date), "d MMM yyyy")}</span>}
                        </div>
                        {doc.rejection_reason && <p className="text-xs text-red-600 mt-0.5">{doc.rejection_reason}</p>}
                      </div>
                      {doc.file_url && (
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost" className="text-xs">View</Button>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {paginated.length < filtered.length && (
            <div className="text-center">
              <Button variant="outline" onClick={() => setPage(p => p + 1)}>
                Load more ({filtered.length - paginated.length} remaining)
              </Button>
            </div>
          )}
        </TabsContent>

        {isAdmin && (
          <TabsContent value="upload" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Test Document Upload</CardTitle>
                <p className="text-sm text-muted-foreground">Upload a document to test the AI validation and classification pipeline.</p>
              </CardHeader>
              <CardContent>
                <TestUploadPanel onComplete={fetchDocs} />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function TestUploadPanel({ onComplete }) {
  const [selectedModule, setSelectedModule] = useState("Grant");
  const [lastResult, setLastResult] = useState(null);
  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <label className="text-sm font-medium">Module to validate for</label>
        <Select value={selectedModule} onValueChange={setSelectedModule}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>{MODULES.slice(1).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <UniversalDocumentUploader
        selectedModule={selectedModule} linkedEntityId="" linkedEntityName="Test Upload"
        label={`Upload ${selectedModule} Document for Testing`}
        onSuccess={(result) => { setLastResult(result); onComplete(); }}
      />
      {lastResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
          <p className="font-medium text-green-700">Document validated and accepted!</p>
          <p className="text-green-600 text-xs mt-1">Detected type: {lastResult.detectedType || "—"}</p>
        </div>
      )}
    </div>
  );
}