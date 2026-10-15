/**
 * Invalid / Unclassified Documents table with admin actions:
 * Review, Reclassify, Force Approve, Delete
 */
import { useState } from "react";
import { api } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ExternalLink, Eye, RefreshCw, CheckCircle2, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { logAudit } from "@/utils/auditLogger";

const STATUS_COLORS = {
  Valid: "bg-green-100 text-green-700",
  Invalid: "bg-red-100 text-red-700",
  Duplicate: "bg-orange-100 text-orange-700",
  PendingReview: "bg-yellow-100 text-yellow-700",
  NeedsReview: "bg-amber-100 text-amber-700",
  ForceApproved: "bg-blue-100 text-blue-700",
};

const MODULES = ["Grant", "SOW", "MSA", "MOU", "Milestone", "Deliverable", "Invoice", "ReportingObligation"];

export default function InvalidDocumentsTable({ docs, onRefresh }) {
  const [reviewDoc, setReviewDoc] = useState(null);
  const [reclassifyDoc, setReclassifyDoc] = useState(null);
  const [forceApproveDoc, setForceApproveDoc] = useState(null);
  const [newModule, setNewModule] = useState("");
  const [forceReason, setForceReason] = useState("");
  const [saving, setSaving] = useState(false);

  const user = async () => api.auth.me().catch(() => null);

  const handleForceApprove = async () => {
    if (!forceApproveDoc) return;
    setSaving(true);
    const u = await user();
    await api.entities.DocumentValidationLog.update(forceApproveDoc.id, {
      validation_status: "ForceApproved",
      review_action: "force_approved",
      force_approved_reason: forceReason,
      reviewed_by: u?.email || "",
      reviewed_date: new Date().toISOString(),
    });
    await logAudit({
      action_type: "document_force_approved",
      entity_type: forceApproveDoc.selected_module,
      entity_id: forceApproveDoc.id,
      entity_name: forceApproveDoc.file_name,
      description: `Document "${forceApproveDoc.file_name}" force approved. Reason: ${forceReason}`,
    });
    setSaving(false);
    setForceApproveDoc(null);
    setForceReason("");
    onRefresh();
  };

  const handleReclassify = async () => {
    if (!reclassifyDoc || !newModule) return;
    setSaving(true);
    const u = await user();
    await api.entities.DocumentValidationLog.update(reclassifyDoc.id, {
      selected_module: newModule,
      validation_status: "PendingReview",
      review_action: "reclassified",
      reclassified_to: newModule,
      reviewed_by: u?.email || "",
      reviewed_date: new Date().toISOString(),
    });
    await logAudit({
      action_type: "document_reclassified",
      entity_type: newModule,
      entity_id: reclassifyDoc.id,
      entity_name: reclassifyDoc.file_name,
      old_value: reclassifyDoc.selected_module,
      new_value: newModule,
      description: `Document "${reclassifyDoc.file_name}" reclassified from ${reclassifyDoc.selected_module} to ${newModule}`,
    });
    setSaving(false);
    setReclassifyDoc(null);
    setNewModule("");
    onRefresh();
  };

  const handleDelete = async (doc) => {
    if (!confirm(`Delete document "${doc.file_name}"? This cannot be undone.`)) return;
    await api.entities.DocumentValidationLog.delete(doc.id);
    await logAudit({
      action_type: "document_deleted",
      entity_type: doc.selected_module,
      entity_id: doc.id,
      entity_name: doc.file_name,
      description: `Document "${doc.file_name}" deleted from validation log.`,
    });
    onRefresh();
  };

  if (docs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
        <p className="font-medium">No invalid documents</p>
        <p className="text-sm mt-1">All uploaded documents have passed validation.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {docs.map(doc => (
        <div key={doc.id} className="border rounded-lg p-4 space-y-3 bg-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm truncate">{doc.file_name}</p>
                <Badge className={STATUS_COLORS[doc.validation_status] || "bg-gray-100 text-gray-700"}>
                  {doc.validation_status}
                </Badge>
                {doc.detected_document_type && (
                  <Badge variant="outline" className="text-xs">{doc.detected_document_type}</Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                <span>Module: <strong>{doc.selected_module}</strong></span>
                {doc.uploaded_by && <span>By: {doc.uploaded_by}</span>}
                {doc.created_date && <span>{format(parseISO(doc.created_date), "d MMM yyyy, HH:mm")}</span>}
                {doc.confidence_score > 0 && <span>Confidence: {doc.confidence_score}%</span>}
              </div>
              {doc.rejection_reason && (
                <p className="text-xs text-red-600 mt-1">Reason: {doc.rejection_reason}</p>
              )}
              {doc.extracted_metadata?.validation_reason && (
                <p className="text-xs text-muted-foreground mt-0.5">{doc.extracted_metadata.validation_reason}</p>
              )}
            </div>
            <div className="flex gap-2 flex-wrap shrink-0">
              <Button size="sm" variant="ghost" onClick={() => setReviewDoc(doc)}>
                <Eye className="w-4 h-4 mr-1" /> Review
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setReclassifyDoc(doc); setNewModule(doc.selected_module); }}>
                <RefreshCw className="w-4 h-4 mr-1" /> Reclassify
              </Button>
              <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={() => { setForceApproveDoc(doc); setForceReason(""); }}>
                <CheckCircle2 className="w-4 h-4 mr-1" /> Force Approve
              </Button>
              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => handleDelete(doc)}>
                <Trash2 className="w-4 h-4" />
              </Button>
              {doc.file_url && (
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="ghost"><ExternalLink className="w-4 h-4" /></Button>
                </a>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Review dialog */}
      <Dialog open={!!reviewDoc} onOpenChange={o => !o && setReviewDoc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Document Review</DialogTitle></DialogHeader>
          {reviewDoc && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><p className="text-muted-foreground">File Name</p><p className="font-medium">{reviewDoc.file_name}</p></div>
                <div><p className="text-muted-foreground">Module</p><p className="font-medium">{reviewDoc.selected_module}</p></div>
                <div><p className="text-muted-foreground">Detected Type</p><p className="font-medium">{reviewDoc.detected_document_type || "—"}</p></div>
                <div><p className="text-muted-foreground">Confidence</p><p className="font-medium">{reviewDoc.confidence_score || 0}%</p></div>
                <div><p className="text-muted-foreground">Status</p><Badge className={STATUS_COLORS[reviewDoc.validation_status]}>{reviewDoc.validation_status}</Badge></div>
                <div><p className="text-muted-foreground">Uploaded By</p><p>{reviewDoc.uploaded_by || "—"}</p></div>
              </div>
              {reviewDoc.rejection_reason && (
                <div className="bg-red-50 rounded p-2">
                  <p className="text-muted-foreground text-xs mb-1">Rejection Reason</p>
                  <p className="text-red-700">{reviewDoc.rejection_reason}</p>
                </div>
              )}
              {reviewDoc.extracted_metadata && Object.keys(reviewDoc.extracted_metadata).filter(k => reviewDoc.extracted_metadata[k]).length > 0 && (
                <div className="bg-muted/40 rounded p-3 space-y-1">
                  <p className="font-medium mb-2">Extracted Metadata</p>
                  {Object.entries(reviewDoc.extracted_metadata).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="grid grid-cols-2 gap-1 text-xs">
                      <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                      <span className="font-medium">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
              {reviewDoc.file_url && (
                <a href={reviewDoc.file_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full gap-2"><ExternalLink className="w-4 h-4" /> Open Document</Button>
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reclassify dialog */}
      <Dialog open={!!reclassifyDoc} onOpenChange={o => !o && setReclassifyDoc(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reclassify Document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Select the correct module for "{reclassifyDoc?.file_name}"</p>
            <div>
              <Label>New Module</Label>
              <Select value={newModule} onValueChange={setNewModule}>
                <SelectTrigger><SelectValue placeholder="Select module..." /></SelectTrigger>
                <SelectContent>
                  {MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setReclassifyDoc(null)}>Cancel</Button>
            <Button onClick={handleReclassify} disabled={saving || !newModule}>
              {saving ? "Saving..." : "Reclassify"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Approve dialog */}
      <Dialog open={!!forceApproveDoc} onOpenChange={o => !o && setForceApproveDoc(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-blue-600">Force Approve Document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will approve "{forceApproveDoc?.file_name}" even though it failed validation.
            </p>
            <div>
              <Label>Reason for Force Approval *</Label>
              <Textarea
                rows={3}
                placeholder="Explain why this document should be approved..."
                value={forceReason}
                onChange={e => setForceReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setForceApproveDoc(null)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleForceApprove} disabled={saving || !forceReason.trim()}>
              {saving ? "Saving..." : "Force Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}