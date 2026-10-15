import React, { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Paperclip, Sparkles } from "lucide-react";
import { format, parseISO } from "date-fns";
import UniversalDocumentUploader from "@/components/documents/UniversalDocumentUploader";
import ExtractFromPdfModal from "@/components/extraction/ExtractFromPdfModal";

const statusColors = {
  pending: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
};

function DeliverableModal({ deliverable, grantId, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "", phase: "", description: "", category: "Other", due_date: "", status: "pending", notes: "",
    ...deliverable
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    const data = { ...form, grant_id: grantId };
    if (deliverable?.id) await api.entities.GrantDeliverable.update(deliverable.id, data);
    else await api.entities.GrantDeliverable.create(data);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{deliverable?.id ? "Edit" : "Add"} Deliverable</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} /></div>
          <div><Label>Phase / Workstream</Label><Input placeholder="e.g. Phase 1" value={form.phase || ""} onChange={e => set("phase", e.target.value)} /></div>
          <div><Label>Description</Label><Textarea rows={2} value={form.description || ""} onChange={e => set("description", e.target.value)} /></div>
          <div>
            <Label>Category</Label>
            <Select value={form.category || "Other"} onValueChange={v => set("category", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Program","Financial","Reporting","Compliance","Documentation","Technical","Other"].map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Due Date</Label><Input type="date" value={form.due_date || ""} onChange={e => set("due_date", e.target.value)} /></div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes || ""} onChange={e => set("notes", e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function GrantDeliverablesTab({ grantId, pdfUrl, isAdmin }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [uploadingFor, setUploadingFor] = useState(null);
  const [showExtract, setShowExtract] = useState(false);

  const fetchData = async () => {
    if (!grantId) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.entities.GrantDeliverable.filter({ grant_id: grantId }, "due_date");
      setItems(data || []);
    } catch (e) {
      setError("Unable to load deliverables. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [grantId]);

  const handleDelete = async (id) => {
    await api.entities.GrantDeliverable.delete(id);
    fetchData();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowExtract(true)} className="gap-1">
          <Sparkles className="w-4 h-4" /> {items.length > 0 ? "Extract More from PDF" : "Extract from PDF"}
        </Button>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1">
            <Plus className="w-4 h-4" /> Add Deliverable
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-10 text-sm text-muted-foreground">Loading deliverables…</div>
      ) : error ? (
        <div className="text-center py-10 space-y-2">
          <p className="text-sm text-red-600">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 space-y-3">
          <p className="text-muted-foreground text-sm">No deliverables added yet.</p>
          <Button variant="outline" onClick={() => setShowExtract(true)} className="gap-2">
            <Sparkles className="w-4 h-4" /> Extract from Uploaded PDF
          </Button>
          {isAdmin && (
            <div><Button variant="ghost" size="sm" onClick={() => setShowAdd(true)} className="text-muted-foreground gap-1"><Plus className="w-3 h-3" /> Add Deliverable Manually</Button></div>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Deliverable</th>
                <th className="text-left p-3 font-medium">Phase</th>
                <th className="text-left p-3 font-medium">Category</th>
                <th className="text-left p-3 font-medium">Due Date</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(d => (
                <React.Fragment key={d.id}>
                  <tr className="border-t">
                    <td className="p-3">
                     <p className="font-medium">{d.name || d.title || "Untitled Deliverable"}</p>
                     {d.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.description}</p>}
                    </td>
                    <td className="p-3 text-muted-foreground">{d.phase || "—"}</td>
                    <td className="p-3 text-muted-foreground text-xs">{d.category || "—"}</td>
                    <td className="p-3 text-muted-foreground">{d.due_date ? format(parseISO(d.due_date), "MMM d, yyyy") : "—"}</td>
                    <td className="p-3"><Badge className={statusColors[d.status]}>{d.status?.replace("_", " ")}</Badge></td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" title="Attach document"
                          onClick={() => setUploadingFor(uploadingFor === d.id ? null : d.id)}>
                          <Paperclip className={`w-3 h-3 ${uploadingFor === d.id ? "text-primary" : "text-muted-foreground"}`} />
                        </Button>
                        {isAdmin && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => setEditing(d)}><Pencil className="w-3 h-3" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(d.id)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {uploadingFor === d.id && (
                    <tr className="border-t bg-muted/20">
                      <td colSpan={6} className="p-3">
                        <UniversalDocumentUploader
                          selectedModule="Deliverable"
                          linkedEntityId={d.id}
                          linkedEntityName={d.name}
                          label="Attach Deliverable Document"
                          onSuccess={() => setUploadingFor(null)}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(showAdd || editing) && (
        <DeliverableModal
          deliverable={editing}
          grantId={grantId}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); fetchData(); }}
        />
      )}

      {showExtract && (
        <ExtractFromPdfModal
          open={showExtract}
          onClose={() => setShowExtract(false)}
          parentType="grant"
          parentId={grantId}
          pdfUrl={pdfUrl}
          pdfName="Grant PDF"
          extractType="deliverables"
          existingDeliverables={items}
          onSaved={() => { setShowExtract(false); fetchData(); }}
        />
      )}
    </div>
  );
}