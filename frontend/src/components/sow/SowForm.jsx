import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Plus, Trash2, CalendarIcon } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { cn } from "@/lib/utils";

const empty = {
  sow_number: "", title: "", vendor_name: "", vendor_email: "",
  description: "", start_date: "", end_date: "", status: "active",
  monthly_rate: "", total_value: "", payment_day: "", advance_amount: "", notes: "", personnel: []
};

function DatePickerField({ label, value, onChange, placeholder = "Select date", optional = false, className }) {
  const parsed = value ? (() => { try { const d = parseISO(value); return isValid(d) ? d : null; } catch { return null; } })() : null;
  return (
    <div className={cn("space-y-1", className)}>
      <Label>{label}{optional && <span className="text-muted-foreground font-normal text-xs ml-1">(Optional)</span>}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("w-full justify-start text-left font-normal h-9", !parsed && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            {parsed ? format(parsed, "dd MMM yyyy") : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={parsed || undefined}
            onSelect={(date) => onChange(date ? format(date, "yyyy-MM-dd") : "")}
            initialFocus
          />
          {optional && value && (
            <div className="border-t p-2">
              <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => onChange("")}>
                Clear date
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function buildPayload(form) {
  const payload = {
    sow_number:     form.sow_number     || null,
    title:          form.title,
    vendor_name:    form.vendor_name,
    vendor_email:   form.vendor_email   || null,
    description:    form.description    || null,
    start_date:     form.start_date     || null,
    end_date:       form.end_date       || null,
    status:         form.status         || "active",
    notes:          form.notes          || null,
    grant_id:       form.grant_id       || null,
    msa_id:         form.msa_id         || null,
    personnel:      form.personnel      || [],
    // Preserve all extracted table arrays — never drop on edit
    rate_cards:              Array.isArray(form.rate_cards)              ? form.rate_cards              : [],
    commercial_tables:       Array.isArray(form.commercial_tables)       ? form.commercial_tables       : [],
    payment_schedule_tables: Array.isArray(form.payment_schedule_tables) ? form.payment_schedule_tables : [],
    normalized_rate_items:   Array.isArray(form.normalized_rate_items)   ? form.normalized_rate_items   : [],
    // Optional numerics — null if empty/invalid
    monthly_rate:   form.monthly_rate !== "" && form.monthly_rate !== null && form.monthly_rate !== undefined
                      ? (parseFloat(form.monthly_rate) >= 0 ? parseFloat(form.monthly_rate) : null)
                      : null,
    total_value:    form.total_value !== "" && form.total_value !== null
                      ? (parseFloat(form.total_value) || null)
                      : null,
    advance_amount: form.advance_amount !== "" && form.advance_amount !== null
                      ? (parseFloat(form.advance_amount) || null)
                      : null,
    payment_day:    form.payment_day !== "" && form.payment_day !== null && form.payment_day !== undefined
                      ? (parseInt(form.payment_day) || null)
                      : null,
  };
  return payload;
}

export default function SowForm({ initialData, grants = [], msas = [], onSave, onCancel, saving: externalSaving }) {
  const [form, setForm]     = useState({ ...empty, ...initialData });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const isSaving = externalSaving || saving;
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: null })); };

  const updatePersonnel = (idx, key, val) => {
    const updated = form.personnel.map((p, i) => i === idx ? { ...p, [key]: val } : p);
    const total = updated.reduce((s, p) => s + (parseFloat(p.rate_per_month) || 0), 0);
    setForm(f => ({ ...f, personnel: updated, monthly_rate: total > 0 ? total : f.monthly_rate }));
  };

  const addPersonnel = () => {
    setForm(f => ({ ...f, personnel: [...(f.personnel || []), { name: "", rate_per_month: "", allocation_percent: 100, role: "" }] }));
  };

  const removePersonnel = (idx) => {
    const updated = form.personnel.filter((_, i) => i !== idx);
    const total = updated.reduce((s, p) => s + (parseFloat(p.rate_per_month) || 0), 0);
    setForm(f => ({ ...f, personnel: updated, monthly_rate: total > 0 ? total : "" }));
  };

  const validate = () => {
    const errs = {};
    if (!form.title?.trim())       errs.title = "Title is required.";
    if (!form.vendor_name?.trim()) errs.vendor_name = "Vendor name is required.";
    // Date cross-validation
    if (form.start_date && form.end_date && form.start_date > form.end_date) {
      errs.start_date = "Start Date cannot be after End Date.";
      errs.end_date   = "End Date cannot be before Start Date.";
    }
    // Optional numerics — only validate if entered
    if (form.monthly_rate !== "" && form.monthly_rate !== null && form.monthly_rate !== undefined) {
      const mr = parseFloat(form.monthly_rate);
      if (isNaN(mr))  errs.monthly_rate = "Monthly Rate must be a valid number.";
      else if (mr < 0) errs.monthly_rate = "Monthly Rate cannot be negative.";
    }
    if (form.payment_day !== "" && form.payment_day !== null && form.payment_day !== undefined) {
      const pd = parseInt(form.payment_day);
      if (isNaN(pd) || pd < 1 || pd > 31) errs.payment_day = "Payment Day must be between 1 and 31.";
    }
    return errs;
  };

  const handleSave = async () => {
    if (isSaving) return;
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSaving(true);
    const payload = buildPayload(form);
    await onSave(payload);
    setSaving(false);
  };

  const paymentDayOptions = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>SOW Number</Label>
          <Input placeholder="e.g. SOW-01" value={form.sow_number || ""} onChange={e => set("sow_number", e.target.value)} />
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
      </div>

      <div className="space-y-1">
        <Label>Title *</Label>
        <Input placeholder="Short title of the SOW" value={form.title || ""} onChange={e => set("title", e.target.value)} />
        {errors.title && <p className="text-xs text-red-500">{errors.title}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Vendor / Service Provider *</Label>
          <Input placeholder="Company name" value={form.vendor_name || ""} onChange={e => set("vendor_name", e.target.value)} />
          {errors.vendor_name && <p className="text-xs text-red-500">{errors.vendor_name}</p>}
        </div>
        <div className="space-y-1">
          <Label>Finance Email</Label>
          <Input placeholder="finance@vendor.com" value={form.vendor_email || ""} onChange={e => set("vendor_email", e.target.value)} />
        </div>
      </div>

      {grants.length > 0 && (
        <div className="space-y-1">
          <Label>Linked Grant</Label>
          <Select value={form.grant_id || ""} onValueChange={v => set("grant_id", v)}>
            <SelectTrigger><SelectValue placeholder="Select a grant (optional)" /></SelectTrigger>
            <SelectContent>
              {grants.map(g => <SelectItem key={g.id} value={g.id}>{g.title || g.grant_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {msas.length > 0 && (
        <div className="space-y-1">
          <Label>Linked MSA</Label>
          <Select value={form.msa_id || ""} onValueChange={v => set("msa_id", v)}>
            <SelectTrigger><SelectValue placeholder="Select an MSA (optional)" /></SelectTrigger>
            <SelectContent>
              {msas.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <DatePickerField
          label="Start Date"
          value={form.start_date || ""}
          onChange={v => set("start_date", v)}
          optional
        />
        <DatePickerField
          label="End Date"
          value={form.end_date || ""}
          onChange={v => set("end_date", v)}
          optional
        />
      </div>
      {(errors.start_date || errors.end_date) && (
        <p className="text-xs text-red-500 -mt-2">{errors.start_date || errors.end_date}</p>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Monthly Rate (USD) <span className="text-muted-foreground font-normal text-xs">(Optional)</span></Label>
          <Input
            type="number"
            min="0"
            placeholder="e.g. 5000"
            value={form.monthly_rate ?? ""}
            onChange={e => set("monthly_rate", e.target.value)}
          />
          {errors.monthly_rate && <p className="text-xs text-red-500">{errors.monthly_rate}</p>}
          <p className="text-xs text-muted-foreground">Optional. Enter only if the SoW has a fixed monthly rate.</p>
        </div>
        <div className="space-y-1">
          <Label>Total Value (USD)</Label>
          <Input type="number" placeholder="0" value={form.total_value ?? ""} onChange={e => set("total_value", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Payment Day of Month <span className="text-muted-foreground font-normal text-xs">(Optional)</span></Label>
          <Select
            value={form.payment_day ? String(form.payment_day) : ""}
            onValueChange={v => set("payment_day", v === "__clear__" ? "" : v)}
          >
            <SelectTrigger><SelectValue placeholder="Select payment day" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__clear__"><span className="text-muted-foreground">— Clear —</span></SelectItem>
              {paymentDayOptions.map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          {errors.payment_day && <p className="text-xs text-red-500">{errors.payment_day}</p>}
          <p className="text-xs text-muted-foreground">Optional. Select the day payment is usually due.</p>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Advance Amount (USD)</Label>
        <Input type="number" placeholder="0" value={form.advance_amount ?? ""} onChange={e => set("advance_amount", e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label>Description of Services</Label>
        <Textarea rows={3} value={form.description || ""} onChange={e => set("description", e.target.value)} />
      </div>

      {/* Personnel Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Personnel & Rates</Label>
          <Button type="button" variant="outline" size="sm" onClick={addPersonnel} className="gap-1">
            <Plus className="w-3 h-3" /> Add Person
          </Button>
        </div>
        {(form.personnel || []).length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Name</th>
                  <th className="text-left p-2 font-medium">Role</th>
                  <th className="text-right p-2 font-medium">Rate/Month (USD)</th>
                  <th className="text-right p-2 font-medium">Alloc %</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {(form.personnel || []).map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1"><Input className="h-7 text-xs" value={p.name} onChange={e => updatePersonnel(i, "name", e.target.value)} /></td>
                    <td className="p-1"><Input className="h-7 text-xs" value={p.role || ""} onChange={e => updatePersonnel(i, "role", e.target.value)} /></td>
                    <td className="p-1"><Input className="h-7 text-xs text-right" type="number" value={p.rate_per_month} onChange={e => updatePersonnel(i, "rate_per_month", e.target.value)} /></td>
                    <td className="p-1"><Input className="h-7 text-xs text-right w-16" type="number" value={p.allocation_percent} onChange={e => updatePersonnel(i, "allocation_percent", e.target.value)} /></td>
                    <td className="p-1 text-center"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePersonnel(i)}><Trash2 className="w-3 h-3 text-destructive" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label>Notes / Payment Terms</Label>
        <Textarea rows={2} value={form.notes || ""} onChange={e => set("notes", e.target.value)} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>Cancel</Button>
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isSaving ? "Saving…" : "Save SOW"}
        </Button>
      </div>
    </div>
  );
}