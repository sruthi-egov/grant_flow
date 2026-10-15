import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const empty = {
  title: "", partner_name: "", mou_number: "", partner_type: "government", partner_address: "",
  partner_contact_name: "", partner_contact_email: "",
  partner_signatory_name: "", partner_signatory_designation: "",
  our_contact_name: "", our_contact_email: "",
  our_signatory_name: "", our_signatory_designation: "",
  signed_date: "", effective_date: "", end_date: "", initial_term_years: "",
  review_cycle: "", governing_law: "", purpose: "", scope_of_collaboration: "", notes: "", status: "active"
};

export default function MouForm({ initialData, onSave, onCancel, saving: externalSaving }) {
  const [form, setForm] = useState({ ...empty, ...initialData });
  const [localSaving, setLocalSaving] = useState(false);
  const saving = externalSaving !== undefined ? externalSaving : localSaving;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (externalSaving !== undefined) {
      // parent controls saving state
      await onSave({ ...form, initial_term_years: parseFloat(form.initial_term_years) || null });
    } else {
      setLocalSaving(true);
      await onSave({ ...form, initial_term_years: parseFloat(form.initial_term_years) || null });
      setLocalSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1 col-span-2">
          <Label>Title *</Label>
          <Input placeholder="e.g. MOU with DPI Centre Ltd" value={form.title} onChange={e => set("title", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>MOU Number</Label>
          <Input placeholder="e.g. MOU-2024-001" value={form.mou_number || ""} onChange={e => set("mou_number", e.target.value)} />
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
          <Input placeholder="e.g. Laws of India" value={form.governing_law} onChange={e => set("governing_law", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Review Cycle</Label>
          <Select value={form.review_cycle || ""} onValueChange={v => set("review_cycle", v)}>
            <SelectTrigger><SelectValue placeholder="Select cycle" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="6 months">6 Months</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
              <SelectItem value="bi-annual">Bi-Annual</SelectItem>
              <SelectItem value="as needed">As Needed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <p className="text-sm font-semibold text-muted-foreground">Partner Organisation</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Organisation Name *</Label>
            <Input value={form.partner_name} onChange={e => set("partner_name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Partner Type</Label>
            <Select value={form.partner_type} onValueChange={v => set("partner_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="government">Government</SelectItem>
                <SelectItem value="ngo">NGO</SelectItem>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="academic">Academic</SelectItem>
                <SelectItem value="multilateral">Multilateral</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 col-span-2">
            <Label>Address</Label>
            <Input value={form.partner_address} onChange={e => set("partner_address", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Signatory Name</Label>
            <Input value={form.partner_signatory_name} onChange={e => set("partner_signatory_name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Signatory Designation</Label>
            <Input value={form.partner_signatory_designation} onChange={e => set("partner_signatory_designation", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Contact Name</Label>
            <Input value={form.partner_contact_name} onChange={e => set("partner_contact_name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Contact Email</Label>
            <Input type="email" value={form.partner_contact_email} onChange={e => set("partner_contact_email", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <p className="text-sm font-semibold text-muted-foreground">Our Party</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Signatory Name</Label>
            <Input value={form.our_signatory_name} onChange={e => set("our_signatory_name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Signatory Designation</Label>
            <Input value={form.our_signatory_designation} onChange={e => set("our_signatory_designation", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Contact Name</Label>
            <Input value={form.our_contact_name} onChange={e => set("our_contact_name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Contact Email</Label>
            <Input type="email" value={form.our_contact_email} onChange={e => set("our_contact_email", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="space-y-1">
          <Label>Signed Date</Label>
          <Input type="date" value={form.signed_date || ""} onChange={e => set("signed_date", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Effective Date</Label>
          <Input type="date" value={form.effective_date} onChange={e => set("effective_date", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Initial Term (years)</Label>
          <Input type="number" placeholder="5" value={form.initial_term_years} onChange={e => set("initial_term_years", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>End Date</Label>
          <Input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Purpose & Background</Label>
        <Textarea rows={3} value={form.purpose} onChange={e => set("purpose", e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label>Scope of Collaboration</Label>
        <Textarea rows={4} placeholder="Key activities, strategic goals, areas of joint work..." value={form.scope_of_collaboration} onChange={e => set("scope_of_collaboration", e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save MOU
        </Button>
      </div>
    </div>
  );
}