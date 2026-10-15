import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Paperclip } from "lucide-react";
import React from "react";
import UniversalDocumentUploader from "@/components/documents/UniversalDocumentUploader";
import { format, parseISO } from "date-fns";

const statusColors = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
};

function InvoiceModal({ invoice, sowId, onClose, onSaved }) {
  const [form, setForm] = useState({
    invoice_number: "", period: "", amount: "", invoice_date: "", due_date: "", paid_date: "", status: "draft", notes: "",
    ...invoice
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    const data = { ...form, sow_id: sowId, amount: parseFloat(form.amount) || 0 };
    if (invoice?.id) await base44.entities.SowInvoice.update(invoice.id, data);
    else await base44.entities.SowInvoice.create(data);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{invoice?.id ? "Edit" : "Add"} Invoice</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Invoice Number</Label><Input placeholder="INV-001" value={form.invoice_number || ""} onChange={e => set("invoice_number", e.target.value)} /></div>
            <div><Label>Period</Label><Input placeholder="e.g. March 2026" value={form.period || ""} onChange={e => set("period", e.target.value)} /></div>
          </div>
          <div><Label>Amount ($)</Label><Input type="number" value={form.amount} onChange={e => set("amount", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Invoice Date</Label><Input type="date" value={form.invoice_date || ""} onChange={e => set("invoice_date", e.target.value)} /></div>
            <div><Label>Due Date</Label><Input type="date" value={form.due_date || ""} onChange={e => set("due_date", e.target.value)} /></div>
            <div><Label>Paid Date</Label><Input type="date" value={form.paid_date || ""} onChange={e => set("paid_date", e.target.value)} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Notes</Label><Input value={form.notes || ""} onChange={e => set("notes", e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SowInvoicesTab({ sowId, isAdmin }) {
  const [invoices, setInvoices] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [uploadingFor, setUploadingFor] = useState(null);

  const fetchData = async () => {
    const data = await base44.entities.SowInvoice.filter({ sow_id: sowId }, "-invoice_date");
    setInvoices(data);
  };

  useEffect(() => { fetchData(); }, [sowId]);

  const total = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.amount || 0), 0);
  const outstanding = invoices.filter(i => i.status !== "paid" && i.status !== "draft").reduce((s, i) => s + (i.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          <div className="text-sm"><span className="text-muted-foreground">Paid: </span><span className="font-semibold text-green-600">${total.toLocaleString()}</span></div>
          <div className="text-sm"><span className="text-muted-foreground">Outstanding: </span><span className="font-semibold text-orange-600">${outstanding.toLocaleString()}</span></div>
        </div>
        {isAdmin && <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1"><Plus className="w-4 h-4" /> Add Invoice</Button>}
      </div>

      {invoices.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">No invoices added yet.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Invoice</th>
                <th className="text-left p-3 font-medium">Period</th>
                <th className="text-right p-3 font-medium">Amount</th>
                <th className="text-left p-3 font-medium">Invoiced</th>
                <th className="text-left p-3 font-medium">Due</th>
                <th className="text-left p-3 font-medium">Paid</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <React.Fragment key={inv.id}>
                  <tr className="border-t">
                    <td className="p-3 font-mono text-xs">{inv.invoice_number || "—"}</td>
                    <td className="p-3">{inv.period || "—"}</td>
                    <td className="p-3 text-right font-semibold">${(inv.amount || 0).toLocaleString()}</td>
                    <td className="p-3 text-muted-foreground">{inv.invoice_date ? format(parseISO(inv.invoice_date), "MMM d") : "—"}</td>
                    <td className="p-3 text-muted-foreground">{inv.due_date ? format(parseISO(inv.due_date), "MMM d") : "—"}</td>
                    <td className="p-3 text-muted-foreground">{inv.paid_date ? format(parseISO(inv.paid_date), "MMM d") : "—"}</td>
                    <td className="p-3"><Badge className={statusColors[inv.status]}>{inv.status}</Badge></td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" title="Attach invoice PDF"
                          onClick={() => setUploadingFor(uploadingFor === inv.id ? null : inv.id)}>
                          <Paperclip className={`w-3 h-3 ${uploadingFor === inv.id ? "text-primary" : "text-muted-foreground"}`} />
                        </Button>
                        {isAdmin && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => setEditing(inv)}><Pencil className="w-3 h-3" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => base44.entities.SowInvoice.delete(inv.id).then(fetchData)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {uploadingFor === inv.id && (
                    <tr className="border-t bg-muted/20">
                      <td colSpan={8} className="p-3">
                        <UniversalDocumentUploader
                          selectedModule="Invoice"
                          linkedEntityId={inv.id}
                          linkedEntityName={inv.invoice_number || inv.period || "Invoice"}
                          label="Attach Invoice PDF"
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
        <InvoiceModal invoice={editing} sowId={sowId} onClose={() => { setShowAdd(false); setEditing(null); }} onSaved={() => { setShowAdd(false); setEditing(null); fetchData(); }} />
      )}
    </div>
  );
}