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
import { Plus, Pencil, Trash2, Calendar, Paperclip } from "lucide-react";
import UniversalDocumentUploader from "@/components/documents/UniversalDocumentUploader";
import { format, parseISO } from "date-fns";

const statusColors = {
  upcoming: "bg-blue-100 text-blue-700",
  submitted: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
};

function ReportModal({ deadline, grantId, onClose, onSaved }) {
  const [form, setForm] = useState({
    report_type: "", due_date: "", status: "upcoming", notes: "",
    ...deadline
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    const data = { ...form, grant_id: grantId };
    if (deadline?.id) {
      await base44.entities.ReportingDeadline.update(deadline.id, data);
    } else {
      await base44.entities.ReportingDeadline.create(data);
    }
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{deadline?.id ? "Edit" : "Add"} Reporting Deadline</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Report Type *</Label><Input placeholder="e.g. Quarterly Report" value={form.report_type} onChange={e => set("report_type", e.target.value)} /></div>
          <div><Label>Due Date *</Label><Input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} /></div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ReportingTab({ grantId, isAdmin }) {
  const [deadlines, setDeadlines] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [uploadingFor, setUploadingFor] = useState(null);

  const fetch = async () => {
    const data = await base44.entities.ReportingDeadline.filter({ grant_id: grantId }, "due_date");
    setDeadlines(data);
  };

  useEffect(() => { fetch(); }, [grantId]);

  const handleDelete = async (id) => {
    await base44.entities.ReportingDeadline.delete(id);
    fetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {isAdmin && (
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1">
            <Plus className="w-4 h-4" /> Add Deadline
          </Button>
        )}
      </div>

      {deadlines.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">No reporting deadlines added yet.</p>
      ) : (
        <div className="space-y-2">
          {deadlines.map(d => (
            <Card key={d.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-medium">{d.report_type}</p>
                    <p className="text-xs text-muted-foreground">{d.due_date ? format(parseISO(d.due_date), "MMM d, yyyy") : "—"}</p>
                    {d.notes && <p className="text-xs text-muted-foreground mt-1">{d.notes}</p>}
                  </div>
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <div className="flex items-center gap-2">
                    <Badge className={statusColors[d.status]}>{d.status}</Badge>
                    <Button variant="ghost" size="icon" title="Attach document"
                      onClick={() => setUploadingFor(uploadingFor === d.id ? null : d.id)}>
                      <Paperclip className={`w-4 h-4 ${uploadingFor === d.id ? "text-primary" : "text-muted-foreground"}`} />
                    </Button>
                    {isAdmin && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => setEditing(d)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(d.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                      </>
                    )}
                  </div>
                  {uploadingFor === d.id && (
                    <UniversalDocumentUploader
                      selectedModule="ReportingObligation"
                      linkedEntityId={d.id}
                      linkedEntityName={d.report_type}
                      label="Attach Report Document"
                      onSuccess={() => setUploadingFor(null)}
                      className="w-full mt-1"
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(showAdd || editing) && (
        <ReportModal
          deadline={editing}
          grantId={grantId}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); fetch(); }}
        />
      )}
    </div>
  );
}