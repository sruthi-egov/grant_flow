import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import { format, parseISO } from "date-fns";
import MouExtractionModal from "./MouExtractionModal";

const statusColors = {
  pending: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
};

function Modal({ item, mouId, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "", description: "", category: "Other", due_date: "", status: "pending", notes: "",
    ...item
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    // reuse GrantDeliverable entity but linked via grant_id = mouId with a note
    const data = { ...form, grant_id: mouId };
    if (item?.id) await api.entities.GrantDeliverable.update(item.id, data);
    else await api.entities.GrantDeliverable.create(data);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{item?.id ? "Edit" : "Add"} Deliverable</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} /></div>
          <div><Label>Description</Label><Textarea rows={2} value={form.description || ""} onChange={e => set("description", e.target.value)} /></div>
          <div>
            <Label>Category</Label>
            <Select value={form.category || "Other"} onValueChange={v => set("category", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Program","Technical","Reporting","Compliance","Documentation","Governance","Implementation","Other"].map(c => (
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

export default function MouDeliverablesTab({ mouId, pdfUrl, isAdmin }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showExtract, setShowExtract] = useState(false);

  const fetchData = async () => {
    // GrantDeliverable is reused for MOU deliverables (grant_id = mouId)
    const data = await api.entities.GrantDeliverable.filter({ grant_id: mouId }, "due_date");
    setItems(data);
  };

  useEffect(() => { fetchData(); }, [mouId]);

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

      {items.length === 0 ? (
        <div className="text-center py-10 space-y-3">
          <p className="text-muted-foreground text-sm">No deliverables added yet.</p>
          <Button variant="outline" onClick={() => setShowExtract(true)} className="gap-2">
            <Sparkles className="w-4 h-4" /> Extract from Uploaded PDF
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
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Deliverable</th>
                <th className="text-left p-3 font-medium">Category</th>
                <th className="text-left p-3 font-medium">Due Date</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(d => (
                <tr key={d.id} className="border-t">
                  <td className="p-3">
                    <p className="font-medium">{d.name}</p>
                    {d.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.description}</p>}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{d.category || "—"}</td>
                  <td className="p-3 text-muted-foreground">{d.due_date?.trim() ? (() => { try { return format(parseISO(d.due_date), "MMM d, yyyy"); } catch { return d.due_date; } })() : "—"}</td>
                  <td className="p-3"><Badge className={statusColors[d.status]}>{d.status?.replace("_", " ")}</Badge></td>
                  <td className="p-3">
                    {isAdmin && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(d)}><Pencil className="w-3 h-3" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => api.entities.GrantDeliverable.delete(d.id).then(fetchData)}>
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(showAdd || editing) && (
        <Modal item={editing} mouId={mouId} onClose={() => { setShowAdd(false); setEditing(null); }} onSaved={() => { setShowAdd(false); setEditing(null); fetchData(); }} />
      )}

      {showExtract && (
        <MouExtractionModal
          open={showExtract}
          onClose={() => setShowExtract(false)}
          mouId={mouId}
          pdfUrl={pdfUrl}
          pdfName="MoU PDF"
          existingData={{ deliverables: items }}
          onSaved={() => { setShowExtract(false); fetchData(); }}
        />
      )}
    </div>
  );
}