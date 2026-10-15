import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const empty = {
  title: "", vendor_name: "", msa_number: "", vendor_address: "", vendor_contact_name: "",
  vendor_contact_email: "", our_contact_name: "", our_contact_email: "",
  effective_date: "", end_date: "", initial_term_years: "", governing_law: "",
  auto_renew: false, notice_period: "", liability_cap: "", ip_ownership: "",
  description: "", key_terms: "", notes: "", status: "active"
};

export default function MsaForm({ initialData, onSave, onCancel }) {
  const [form, setForm] = useState({ ...empty, ...initialData });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    await onSave({ ...form, initial_term_years: parseFloat(form.initial_term_years) || null });
    setSaving(false);
  };

  return (
    <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1 col-span-2">
          <Label>Title *</Label>
          <Input placeholder="e.g. MSA with BAO Systems" value={form.title} onChange={e => set("title", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>MSA Number</Label>
          <Input placeholder="e.g. MSA-2024-001" value={form.msa_number || ""} onChange={e => set("msa_number", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Governing Law</Label>
          <Input placeholder="e.g. English law" value={form.governing_law} onChange={e => set("governing_law", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Notice Period</Label>
          <Input placeholder="e.g. 30 days" value={form.notice_period || ""} onChange={e => set("notice_period", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Liability Cap</Label>
          <Input placeholder="e.g. 12 months fees" value={form.liability_cap || ""} onChange={e => set("liability_cap", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>IP Ownership</Label>
          <Input placeholder="e.g. Client owns all IP" value={form.ip_ownership || ""} onChange={e => set("ip_ownership", e.target.value)} />
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <p className="text-sm font-semibold text-muted-foreground">Service Provider (Second Party)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label>Company Name *</Label>
            <Input value={form.vendor_name} onChange={e => set("vendor_name", e.target.value)} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>Address</Label>
            <Input value={form.vendor_address} onChange={e => set("vendor_address", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Contact Name</Label>
            <Input value={form.vendor_contact_name} onChange={e => set("vendor_contact_name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Contact Email</Label>
            <Input type="email" value={form.vendor_contact_email} onChange={e => set("vendor_contact_email", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <p className="text-sm font-semibold text-muted-foreground">Our Party (First Party)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Signatory Name</Label>
            <Input value={form.our_contact_name} onChange={e => set("our_contact_name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Finance/Contact Email</Label>
            <Input type="email" value={form.our_contact_email} onChange={e => set("our_contact_email", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Effective Date</Label>
          <Input type="date" value={form.effective_date} onChange={e => set("effective_date", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Initial Term (years)</Label>
          <Input type="number" placeholder="3" value={form.initial_term_years} onChange={e => set("initial_term_years", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>End Date</Label>
          <Input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Description of Services</Label>
        <Textarea rows={3} value={form.description} onChange={e => set("description", e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label>Key Terms Summary</Label>
        <Textarea rows={4} placeholder="Payment terms, liability cap, notice period, IP ownership, confidentiality, termination conditions..." value={form.key_terms} onChange={e => set("key_terms", e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save MSA
        </Button>
      </div>
    </div>
  );
}