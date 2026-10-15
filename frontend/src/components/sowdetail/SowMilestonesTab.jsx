import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2, DollarSign, Sparkles } from "lucide-react";
import { format, parseISO } from "date-fns";
import ExtractFromPdfModal from "@/components/extraction/ExtractFromPdfModal";

const statusColors = {
  pending: "bg-yellow-100 text-yellow-700",
  invoiced: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
};

function MilestoneModal({ milestone, sowId, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: "", description: "", milestone_type: "Payment", due_date: "", percentage: "", amount: "", currency: "USD", status: "pending", acceptance_criteria: "", notes: "",
    ...milestone
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    const data = { ...form, sow_id: sowId, amount: form.amount ? parseFloat(form.amount) : null };
    if (milestone?.id) await base44.entities.SowMilestone.update(milestone.id, data);
    else await base44.entities.SowMilestone.create(data);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{milestone?.id ? "Edit" : "Add"} Milestone</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title *</Label><Input value={form.title} onChange={e => set("title", e.target.value)} /></div>
          <div>
            <Label>Type</Label>
            <Select value={form.milestone_type} onValueChange={v => set("milestone_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Payment","Delivery","Review","Release","Support","Documentation","Other"].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Percentage</Label><Input placeholder="20%" value={form.percentage || ""} onChange={e => set("percentage", e.target.value)} /></div>
            <div><Label>Amount</Label><Input type="number" value={form.amount || ""} onChange={e => set("amount", e.target.value)} /></div>
            <div><Label>Currency</Label><Input value={form.currency || "USD"} onChange={e => set("currency", e.target.value)} /></div>
          </div>
          <div><Label>Due Date</Label><Input type="date" value={form.due_date || ""} onChange={e => set("due_date", e.target.value)} /></div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="invoiced">Invoiced</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
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

export default function SowMilestonesTab({ sowId, pdfUrl, isAdmin }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showExtract, setShowExtract] = useState(false);

  const fetchData = async () => {
    const data = await base44.entities.SowMilestone.filter({ sow_id: sowId }, "due_date");
    setItems(data);
  };

  useEffect(() => { fetchData(); }, [sowId]);

  const total = items.reduce((s, m) => s + (m.amount || 0), 0);
  const paid = items.filter(m => m.status === "paid").reduce((s, m) => s + (m.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-4">
          {total > 0 && <div className="text-sm"><span className="text-muted-foreground">Total: </span><span className="font-semibold">${total.toLocaleString()}</span></div>}
          {paid > 0 && <div className="text-sm"><span className="text-muted-foreground">Paid: </span><span className="font-semibold text-green-600">${paid.toLocaleString()}</span></div>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowExtract(true)} className="gap-1">
            <Sparkles className="w-4 h-4" /> {items.length > 0 ? "Extract More from PDF" : "Extract from PDF"}
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1">
              <Plus className="w-4 h-4" /> Add Milestone
            </Button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-10 space-y-3">
          <p className="text-muted-foreground text-sm">No milestones added yet.</p>
          <Button variant="outline" onClick={() => setShowExtract(true)} className="gap-2">
            <Sparkles className="w-4 h-4" /> Extract from Uploaded PDF
          </Button>
          {isAdmin && (
            <div><Button variant="ghost" size="sm" onClick={() => setShowAdd(true)} className="text-muted-foreground gap-1"><Plus className="w-3 h-3" /> Add Milestone Manually</Button></div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(m => (
            <Card key={m.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <DollarSign className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">{m.title}</p>
                      {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                      <div className="flex gap-3 mt-1 flex-wrap">
                        {m.milestone_type && <Badge variant="outline" className="text-xs">{m.milestone_type}</Badge>}
                        {m.percentage && <span className="text-xs text-muted-foreground">{m.percentage}</span>}
                        {m.due_date && <p className="text-xs text-muted-foreground">Due: {format(parseISO(m.due_date), "MMM d, yyyy")}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      {m.amount > 0 && <p className="font-semibold text-sm">{m.currency || "USD"} {m.amount.toLocaleString()}</p>}
                      <Badge className={statusColors[m.status]}>{m.status}</Badge>
                    </div>
                    {isAdmin && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => setEditing(m)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => base44.entities.SowMilestone.delete(m.id).then(fetchData)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(showAdd || editing) && (
        <MilestoneModal milestone={editing} sowId={sowId} onClose={() => { setShowAdd(false); setEditing(null); }} onSaved={() => { setShowAdd(false); setEditing(null); fetchData(); }} />
      )}

      {showExtract && (
        <ExtractFromPdfModal
          open={showExtract}
          onClose={() => setShowExtract(false)}
          parentType="sow"
          parentId={sowId}
          pdfUrl={pdfUrl}
          pdfName="SOW PDF"
          extractType="milestones"
          existingMilestones={items}
          onSaved={() => { setShowExtract(false); fetchData(); }}
        />
      )}
    </div>
  );
}