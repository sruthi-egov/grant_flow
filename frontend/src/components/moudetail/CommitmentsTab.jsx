import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import MouExtractionModal from "./MouExtractionModal";

const statusColors = {
  pending: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
};

const typeColors = {
  Operational: "bg-blue-50 text-blue-700",
  Legal: "bg-purple-50 text-purple-700",
  Reporting: "bg-teal-50 text-teal-700",
  Financial: "bg-green-50 text-green-700",
  Confidentiality: "bg-gray-100 text-gray-700",
  Governance: "bg-indigo-50 text-indigo-700",
  Collaboration: "bg-orange-50 text-orange-700",
  Other: "bg-muted text-muted-foreground",
};

const COMMITMENT_TYPES = ["Operational", "Legal", "Reporting", "Financial", "Confidentiality", "Governance", "Collaboration", "Other"];
const RESPONSIBLE_PARTIES = ["Both Parties", "eGov", "Partner", "Other"];

function CommitmentModal({ item, mouId, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "", description: "", commitment_type: "Operational", responsible_party: "Both Parties",
    due_date: "", frequency: "", status: "pending", source_section: "", notes: "",
    ...item
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    const data = { ...form, mou_id: mouId };
    if (item?.id) await base44.entities.MouCommitment.update(item.id, data);
    else await base44.entities.MouCommitment.create(data);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{item?.id ? "Edit" : "Add"} Commitment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} /></div>
          <div><Label>Description</Label><Textarea rows={2} value={form.description || ""} onChange={e => set("description", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.commitment_type} onValueChange={v => set("commitment_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COMMITMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Responsible Party</Label>
              <Select value={form.responsible_party} onValueChange={v => set("responsible_party", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RESPONSIBLE_PARTIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Due Date</Label><Input type="date" value={form.due_date || ""} onChange={e => set("due_date", e.target.value)} /></div>
            <div><Label>Frequency</Label><Input placeholder="e.g. Yearly" value={form.frequency || ""} onChange={e => set("frequency", e.target.value)} /></div>
          </div>
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
          <div><Label>Source Section</Label><Input value={form.source_section || ""} onChange={e => set("source_section", e.target.value)} /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes || ""} onChange={e => set("notes", e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name?.trim()}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CommitmentsTab({ mouId, pdfUrl, isAdmin }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showExtract, setShowExtract] = useState(false);

  const fetchData = async () => {
    const data = await base44.entities.MouCommitment.filter({ mou_id: mouId });
    setItems(data);
  };

  useEffect(() => { fetchData(); }, [mouId]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => setShowExtract(true)} className="gap-1">
          <Sparkles className="w-4 h-4" /> {items.length > 0 ? "Extract More from PDF" : "Extract from PDF"}
        </Button>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1">
            <Plus className="w-4 h-4" /> Add Commitment
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-10 space-y-3 border border-dashed rounded-lg">
          <p className="text-muted-foreground text-sm">No commitments extracted yet.</p>
          <Button variant="outline" onClick={() => setShowExtract(true)} className="gap-2">
            <Sparkles className="w-4 h-4" /> Extract Commitments from Uploaded PDF
          </Button>
          {isAdmin && (
            <div>
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)} className="text-muted-foreground gap-1">
                <Plus className="w-3 h-3" /> Add Manually
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(c => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-medium text-sm">{c.name}</p>
                      {c.commitment_type && (
                        <Badge className={`text-xs ${typeColors[c.commitment_type] || typeColors.Other}`}>{c.commitment_type}</Badge>
                      )}
                      <Badge className={`text-xs ${statusColors[c.status]}`}>{c.status?.replace("_", " ")}</Badge>
                    </div>
                    {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                    <div className="flex gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                      {c.responsible_party && <span>Responsible: <span className="font-medium">{c.responsible_party}</span></span>}
                      {c.frequency && <span>Frequency: {c.frequency}</span>}
                      {c.source_section && <span className="italic">{c.source_section}</span>}
                      {c.extracted_from_pdf && <span className="text-primary/60">• Extracted from PDF</span>}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(c)}><Pencil className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => base44.entities.MouCommitment.delete(c.id).then(fetchData)}>
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(showAdd || editing) && (
        <CommitmentModal
          item={editing}
          mouId={mouId}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); fetchData(); }}
        />
      )}

      {showExtract && (
        <MouExtractionModal
          open={showExtract}
          onClose={() => setShowExtract(false)}
          mouId={mouId}
          pdfUrl={pdfUrl}
          pdfName="MoU PDF"
          existingData={{ commitments: items }}
          onSaved={() => { setShowExtract(false); fetchData(); }}
        />
      )}
    </div>
  );
}