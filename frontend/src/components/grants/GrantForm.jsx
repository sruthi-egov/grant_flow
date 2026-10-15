import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function GrantForm({ initialData, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: "",
    funder: "",
    grant_number: "",
    description: "",
    total_amount: "",
    start_date: "",
    end_date: "",
    status: "active",
    reporting_cycle: "",
    notification_days_before: 7,
    ...initialData,
  });
  const [saving, setSaving] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      ...form,
      total_amount: form.total_amount ? parseFloat(form.total_amount) : 0,
      notification_days_before: parseInt(form.notification_days_before) || 7,
    });
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Grant Title *</Label>
          <Input required value={form.title} onChange={e => set("title", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Funder / Funding Organization</Label>
          <Input value={form.funder} onChange={e => set("funder", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Grant Number</Label>
          <Input value={form.grant_number} onChange={e => set("grant_number", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Total Grant Amount ($)</Label>
          <Input type="number" min="0" value={form.total_amount} onChange={e => set("total_amount", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Start Date</Label>
          <Input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>End Date</Label>
          <Input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Reporting Cycle</Label>
          <Select value={form.reporting_cycle || ""} onValueChange={v => set("reporting_cycle", v)}>
            <SelectTrigger><SelectValue placeholder="Select cycle" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="bi-annual">Bi-Annual</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
              <SelectItem value="ad-hoc">Ad-hoc</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Notify contacts X days before due dates</Label>
          <Input type="number" min="1" value={form.notification_days_before} onChange={e => set("notification_days_before", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Textarea rows={3} value={form.description} onChange={e => set("description", e.target.value)} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Grant"}</Button>
      </div>
    </form>
  );
}