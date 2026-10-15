import { useState } from "react";
import { api } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, User, Mail, Phone, Building2, Bell } from "lucide-react";

function ContactModal({ contact, onClose, onSave }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "", organization: "", contact_type: "", is_active: true, ...contact });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{contact ? "Edit" : "Add"} Contact</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email || ""} onChange={e => set("email", e.target.value)} placeholder="Required for notifications" /></div>
          <div><Label>Phone</Label><Input value={form.phone || ""} onChange={e => set("phone", e.target.value)} /></div>
          <div><Label>Role / Title</Label><Input value={form.role || ""} onChange={e => set("role", e.target.value)} /></div>
          <div><Label>Organization</Label><Input value={form.organization || ""} onChange={e => set("organization", e.target.value)} /></div>
          <div><Label>Contact Type</Label><Input value={form.contact_type || ""} onChange={e => set("contact_type", e.target.value)} placeholder="e.g. Vendor Contact, Project Manager" /></div>
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Only active contacts receive email notifications</p>
            </div>
            <Switch checked={form.is_active !== false} onCheckedChange={v => set("is_active", v)} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave(form)} disabled={!form.name?.trim()}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SowContactsTab({ sow, onUpdate, isAdmin }) {
  const [editing, setEditing] = useState(null);
  const contacts = sow.contacts || [];

  const save = async (updated) => {
    await api.entities.SOW.update(sow.id, { contacts: updated });
    onUpdate();
    setEditing(null);
  };

  const handleAdd = (contact) => save([...contacts, contact]);
  const handleEdit = (idx, contact) => save(contacts.map((c, i) => i === idx ? contact : c));
  const handleDelete = (idx) => save(contacts.filter((_, i) => i !== idx));

  const activeCount = contacts.filter(c => c.is_active !== false).length;
  const withEmailCount = contacts.filter(c => c.email && c.is_active !== false).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          {contacts.length} contact(s) · {activeCount} active · {withEmailCount} with email (will receive notifications)
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setEditing(-1)} className="gap-1">
            <Plus className="w-4 h-4" /> Add Contact
          </Button>
        )}
      </div>

      <div className="flex items-start gap-3 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <Bell className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <span>Active contacts with a valid email address automatically receive email notifications for this SOW. This cannot be disabled per-contact without deactivating the contact.</span>
      </div>

      {contacts.length === 0 ? (
        <div className="border border-dashed rounded-lg py-12 text-center">
          <p className="text-muted-foreground text-sm">No contacts added yet.</p>
          {isAdmin && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(-1)} className="gap-1 mt-3">
              <Plus className="w-4 h-4" /> Add Manually
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {contacts.map((c, i) => {
            const isActive = c.is_active !== false;
            return (
              <Card key={i} className={isActive ? "" : "opacity-60"}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span className="font-semibold truncate">{c.name}</span>
                        {!isActive && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                      </div>
                      {(c.role || c.contact_type) && <p className="text-xs text-muted-foreground">{c.role || c.contact_type}</p>}
                      {c.organization && <p className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="w-3 h-3 shrink-0" />{c.organization}</p>}
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="text-xs text-primary flex items-center gap-1 hover:underline">
                          <Mail className="w-3 h-3 shrink-0" />{c.email}
                        </a>
                      ) : (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <Mail className="w-3 h-3" /> No email — will not receive notifications
                        </p>
                      )}
                      {c.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3 shrink-0" />{c.phone}</p>}
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(i)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(i)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editing !== null && (
        <ContactModal
          contact={editing === -1 ? null : contacts[editing]}
          onClose={() => setEditing(null)}
          onSave={(c) => editing === -1 ? handleAdd(c) : handleEdit(editing, c)}
        />
      )}
    </div>
  );
}