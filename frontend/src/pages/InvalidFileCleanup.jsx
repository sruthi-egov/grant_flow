import { useState, useEffect, useMemo } from "react";
import { api } from "@/api/apiClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Trash2, RefreshCw, Eye, CheckCircle2, ExternalLink, ShieldAlert, Search, XCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { logAudit } from "@/utils/auditLogger";
import { toast } from "sonner";

const SAFE_STATUSES = ["Valid", "ForceApproved"];
const DELETABLE_STATUSES = ["Invalid", "Duplicate", "PendingReview", "NeedsReview"];

const STATUS_COLORS = {
  Invalid: "bg-red-100 text-red-700",
  Duplicate: "bg-orange-100 text-orange-700",
  PendingReview: "bg-yellow-100 text-yellow-700",
  NeedsReview: "bg-amber-100 text-amber-700",
};

const MODULES = ["All", "Grant", "SOW", "MSA", "MOU", "Milestone", "Deliverable", "Invoice", "ReportingObligation"];

const DELETION_REASONS = [
  "Irrelevant document",
  "Invalid upload",
  "Duplicate document",
  "Uploaded by mistake",
  "Failed validation",
  "Test file",
  "Other",
];

export default function InvalidFileCleanup() {
  const [user, setUser] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [includeNeedsReview, setIncludeNeedsReview] = useState(false);

  // Modals
  const [reviewDoc, setReviewDoc] = useState(null);
  const [deleteDoc, setDeleteDoc] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const fetchDocs = async () => {
    setLoading(true);
    const all = await api.entities.DocumentValidationLog.list("-created_date", 500);
    // Exclude soft-deleted and safe-status docs
    const filtered = all.filter(d =>
      !d.is_deleted &&
      !SAFE_STATUSES.includes(d.validation_status)
    );
    setDocs(filtered);
    setLoading(false);
  };

  useEffect(() => {
    api.auth.me().then(setUser).catch(() => setUser({}));
    fetchDocs();
  }, []);

  const isAdmin = user?.role === "admin";

  const visibleDocs = useMemo(() => {
    let list = docs;
    if (!includeNeedsReview) list = list.filter(d => d.validation_status !== "NeedsReview");
    if (statusFilter !== "All") list = list.filter(d => d.validation_status === statusFilter);
    if (moduleFilter !== "All") list = list.filter(d => d.selected_module === moduleFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(d =>
        d.file_name?.toLowerCase().includes(s) ||
        d.rejection_reason?.toLowerCase().includes(s) ||
        d.uploaded_by?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [docs, statusFilter, moduleFilter, search, includeNeedsReview]);

  const allPageSelected = visibleDocs.length > 0 && visibleDocs.every(d => selected.includes(d.id));

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelected(sel => sel.filter(id => !visibleDocs.find(d => d.id === id)));
    } else {
      setSelected(sel => [...new Set([...sel, ...visibleDocs.map(d => d.id)])]);
    }
  };

  const toggleOne = (id) => {
    setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  };

  const effectiveDeletionReason = deletionReason === "Other" ? customReason : deletionReason;

  const isSafeToDelete = (doc) => {
    if (SAFE_STATUSES.includes(doc.validation_status)) return false;
    if (doc.linked_entity_id) return false;
    return true;
  };

  const doDeleteSingle = async () => {
    if (!deleteDoc || !isAdmin) return;
    if (!isSafeToDelete(deleteDoc)) {
      toast.error("This file cannot be deleted because it is linked to an active record or marked as valid.");
      setDeleteDoc(null);
      return;
    }
    setDeleting(true);
    await api.entities.DocumentValidationLog.update(deleteDoc.id, {
      is_deleted: true,
      deleted_by: user.email,
      deleted_date: new Date().toISOString(),
      deletion_reason: effectiveDeletionReason || "Admin discard",
      deletion_type: "invalid_file_cleanup",
      deleted_from_section: "Invalid / Irrelevant File Cleanup",
    });
    await logAudit({
      action_type: "document_deleted",
      entity_type: deleteDoc.selected_module,
      entity_id: deleteDoc.id,
      entity_name: deleteDoc.file_name,
      description: `Admin discarded invalid file "${deleteDoc.file_name}" from Invalid / Irrelevant File Cleanup. Status: ${deleteDoc.validation_status}. Reason: ${effectiveDeletionReason || "Admin discard"}`,
    });
    setDeleting(false);
    setDeleteDoc(null);
    setDeletionReason("");
    setCustomReason("");
    toast.success("File deleted successfully.");
    fetchDocs();
  };

  const doDeleteBulk = async () => {
    if (!isAdmin) return;
    setDeleting(true);
    const selectedDocs = docs.filter(d => selected.includes(d.id));
    const eligible = selectedDocs.filter(isSafeToDelete);
    const skipped = selectedDocs.length - eligible.length;

    await Promise.all(eligible.map(doc =>
      api.entities.DocumentValidationLog.update(doc.id, {
        is_deleted: true,
        deleted_by: user.email,
        deleted_date: new Date().toISOString(),
        deletion_reason: effectiveDeletionReason || "Bulk admin discard",
        deletion_type: "invalid_file_cleanup",
        deleted_from_section: "Invalid / Irrelevant File Cleanup",
      })
    ));

    if (eligible.length > 0) {
      await logAudit({
        action_type: "document_deleted",
        entity_type: "Bulk",
        entity_name: `${eligible.length} files`,
        description: `Admin deleted ${eligible.length} invalid files through bulk cleanup. ${skipped > 0 ? `${skipped} files skipped (valid/linked).` : ""} Reason: ${effectiveDeletionReason || "Bulk admin discard"}`,
      });
    }

    setDeleting(false);
    setBulkDeleteOpen(false);
    setSelected([]);
    setDeletionReason("");
    setCustomReason("");

    if (skipped > 0) {
      toast.warning(`Deleted ${eligible.length} files. ${skipped} skipped (valid or linked).`);
    } else {
      toast.success(`Deleted ${eligible.length} files successfully.`);
    }
    fetchDocs();
  };

  if (user === null) return <div className="p-6 text-muted-foreground">Loading...</div>;

  if (!isAdmin) {
    return (
      <div className="p-10 flex flex-col items-center justify-center gap-4 text-center">
        <ShieldAlert className="w-12 h-12 text-red-400" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trash2 className="w-6 h-6 text-red-500" /> Invalid / Irrelevant File Cleanup
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Review and permanently discard invalid, rejected, duplicate, or unclassified files.
            Valid and linked files are protected.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchDocs} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search by file name, reason, or uploader..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="Invalid">Invalid</SelectItem>
                <SelectItem value="Duplicate">Duplicate</SelectItem>
                <SelectItem value="PendingReview">Pending Review</SelectItem>
                {includeNeedsReview && <SelectItem value="NeedsReview">Needs Review</SelectItem>}
              </SelectContent>
            </Select>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Module" /></SelectTrigger>
              <SelectContent>
                {MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="needsReview"
              checked={includeNeedsReview}
              onCheckedChange={setIncludeNeedsReview}
            />
            <label htmlFor="needsReview" className="cursor-pointer text-muted-foreground">
              Include <span className="text-amber-700 font-medium">Needs Review</span> files
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selected.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <span className="text-sm font-medium text-red-700">{selected.length} file(s) selected</span>
          <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)} className="gap-2">
            <Trash2 className="w-4 h-4" /> Delete Selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear Selection</Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-3 opacity-40" />
              <p>Loading invalid and irrelevant files…</p>
            </div>
          ) : visibleDocs.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
              <p className="font-medium">No invalid or irrelevant files found.</p>
              <p className="text-sm mt-1">All documents have passed validation or have already been cleaned up.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="py-3 px-4 w-10">
                      <Checkbox checked={allPageSelected} onCheckedChange={toggleSelectAll} />
                    </th>
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground">File Name</th>
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground">Status</th>
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground">Module</th>
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground hidden md:table-cell">Uploaded By</th>
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground hidden lg:table-cell">Date</th>
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground hidden lg:table-cell">Confidence</th>
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground">Reason</th>
                    <th className="py-3 px-4 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleDocs.map(doc => (
                    <tr key={doc.id} className={`hover:bg-muted/20 transition-colors ${selected.includes(doc.id) ? "bg-red-50/50" : ""}`}>
                      <td className="py-3 px-4">
                        <Checkbox checked={selected.includes(doc.id)} onCheckedChange={() => toggleOne(doc.id)} />
                      </td>
                      <td className="py-3 px-4 max-w-[220px]">
                        <p className="font-medium truncate" title={doc.file_name}>{doc.file_name}</p>
                        {doc.detected_document_type && (
                          <p className="text-xs text-muted-foreground truncate">{doc.detected_document_type}</p>
                        )}
                        {doc.linked_entity_name && (
                          <p className="text-xs text-blue-600">Linked: {doc.linked_entity_name}</p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={STATUS_COLORS[doc.validation_status] || "bg-gray-100 text-gray-700"}>
                          {doc.validation_status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-xs">{doc.selected_module}</Badge>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground hidden md:table-cell text-xs">{doc.uploaded_by || "—"}</td>
                      <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell text-xs whitespace-nowrap">
                        {doc.created_date ? format(parseISO(doc.created_date), "d MMM yyyy") : "—"}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell text-xs">
                        {doc.confidence_score > 0 ? `${doc.confidence_score}%` : "—"}
                      </td>
                      <td className="py-3 px-4 max-w-[200px]">
                        <p className="text-xs text-red-600 truncate" title={doc.rejection_reason}>
                          {doc.rejection_reason || "—"}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setReviewDoc(doc)} title="View Details">
                            <Eye className="w-4 h-4" />
                          </Button>
                          {doc.file_url && (
                            <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Open file">
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </a>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 hover:text-red-700"
                            onClick={() => { setDeleteDoc(doc); setDeletionReason(""); setCustomReason(""); }}
                            title="Discard / Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Showing {visibleDocs.length} file(s) · Valid and force-approved files are never shown here.
      </p>

      {/* Review Dialog */}
      <Dialog open={!!reviewDoc} onOpenChange={o => !o && setReviewDoc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>File Details</DialogTitle></DialogHeader>
          {reviewDoc && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-muted-foreground text-xs">File Name</p><p className="font-medium break-all">{reviewDoc.file_name}</p></div>
                <div><p className="text-muted-foreground text-xs">Status</p><Badge className={STATUS_COLORS[reviewDoc.validation_status] || "bg-gray-100 text-gray-700"}>{reviewDoc.validation_status}</Badge></div>
                <div><p className="text-muted-foreground text-xs">Module</p><p>{reviewDoc.selected_module}</p></div>
                <div><p className="text-muted-foreground text-xs">Detected Type</p><p>{reviewDoc.detected_document_type || "—"}</p></div>
                <div><p className="text-muted-foreground text-xs">Uploaded By</p><p>{reviewDoc.uploaded_by || "—"}</p></div>
                <div><p className="text-muted-foreground text-xs">Confidence</p><p>{reviewDoc.confidence_score || 0}%</p></div>
                <div><p className="text-muted-foreground text-xs">Uploaded Date</p><p>{reviewDoc.created_date ? format(parseISO(reviewDoc.created_date), "d MMM yyyy, HH:mm") : "—"}</p></div>
                {reviewDoc.linked_entity_name && (
                  <div><p className="text-muted-foreground text-xs">Linked To</p><p className="text-blue-600">{reviewDoc.linked_entity_name}</p></div>
                )}
              </div>
              {reviewDoc.rejection_reason && (
                <div className="bg-red-50 rounded p-2 text-xs">
                  <p className="text-muted-foreground mb-1">Rejection Reason</p>
                  <p className="text-red-700">{reviewDoc.rejection_reason}</p>
                </div>
              )}
              {reviewDoc.extracted_metadata?.validation_reason && (
                <div className="bg-muted/40 rounded p-2 text-xs">
                  <p className="text-muted-foreground mb-1">AI Validation Note</p>
                  <p>{reviewDoc.extracted_metadata.validation_reason}</p>
                </div>
              )}
              {reviewDoc.file_url && (
                <a href={reviewDoc.file_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full gap-2 mt-2"><ExternalLink className="w-4 h-4" /> Open Document</Button>
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Single Delete Confirmation Dialog */}
      <Dialog open={!!deleteDoc} onOpenChange={o => !o && setDeleteDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" /> Delete File
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteDoc && (
            <div className="space-y-4 text-sm">
              <div className="bg-muted/40 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between"><span className="text-muted-foreground">File Name</span><span className="font-medium text-right max-w-[60%] truncate">{deleteDoc.file_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge className={STATUS_COLORS[deleteDoc.validation_status] || "bg-gray-100 text-gray-700"}>{deleteDoc.validation_status}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Module</span><span>{deleteDoc.selected_module}</span></div>
                {deleteDoc.rejection_reason && <div className="flex justify-between gap-4"><span className="text-muted-foreground shrink-0">Reason</span><span className="text-red-600 text-right">{deleteDoc.rejection_reason}</span></div>}
              </div>

              <div className="space-y-2">
                <Label>Deletion Reason</Label>
                <Select value={deletionReason} onValueChange={setDeletionReason}>
                  <SelectTrigger><SelectValue placeholder="Select a reason..." /></SelectTrigger>
                  <SelectContent>
                    {DELETION_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                {deletionReason === "Other" && (
                  <Textarea
                    rows={2}
                    placeholder="Describe the reason..."
                    value={customReason}
                    onChange={e => setCustomReason(e.target.value)}
                  />
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteDoc(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doDeleteSingle} disabled={deleting || !deletionReason}>
              {deleting ? "Deleting..." : "Delete File"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={o => !o && setBulkDeleteOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" /> Bulk Delete Files
            </DialogTitle>
            <DialogDescription>
              You are about to delete <strong>{selected.length}</strong> invalid or irrelevant files. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              Only invalid, rejected, duplicate, or unclassified files will be deleted. Valid or linked files will be skipped automatically.
            </div>
            <div className="space-y-2">
              <Label>Deletion Reason</Label>
              <Select value={deletionReason} onValueChange={setDeletionReason}>
                <SelectTrigger><SelectValue placeholder="Select a reason..." /></SelectTrigger>
                <SelectContent>
                  {DELETION_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              {deletionReason === "Other" && (
                <Textarea
                  rows={2}
                  placeholder="Describe the reason..."
                  value={customReason}
                  onChange={e => setCustomReason(e.target.value)}
                />
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={doDeleteBulk} disabled={deleting || !deletionReason}>
              {deleting ? "Deleting..." : `Delete ${selected.length} File(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}