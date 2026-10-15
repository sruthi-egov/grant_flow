import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, User, Mail, Phone, Building2, Sparkles, Bell } from "lucide-react";
import MouExtractionModal from "./MouExtractionModal";

function ContactModal({ contact, onClose, onSave }) {
  const [form, setForm] = useState({ name: "", organization: "", role: "", email: "", phone: "", address: "", contact_type: "", is_active: true, ...contact });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{contact ? "Edit" : "Add"} Contact</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} /></div>
          <div><Label>Organization</Label><Input value={form.organization || ""} onChange={e => set("organization", e.target.value)} /></div>
          <div><Label>Role / Designation</Label><Input value={form.role || ""} onChange={e => set("role", e.target.value)} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email || ""} onChange={e => set("email", e.target.value)} placeholder="Required for notifications" /></div>
          <div><Label>Phone</Label><Input value={form.phone || ""} onChange={e => set("phone", e.target.value)} /></div>
          <div><Label>Address</Label><Input value={form.address || ""} onChange={e => set("address", e.target.value)} /></div>
          <div><Label>Contact Type</Label><Input value={form.contact_type || ""} onChange={e => set("contact_type", e.target.value)} placeholder="e.g. Partner Contact, Our Contact" /></div>
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

export default function MouContactsTab({ mou, pdfUrl, isAdmin, onUpdate }) {
  const [editing, setEditing] = useState(null);
  const [showExtract, setShowExtract] = useState(false);
  const contacts = mou.contacts || [];

  const save = async (updated) => {
    await base44.entities.MOU.update(mou.id, { contacts: updated });
    onUpdate();
    setEditing(null);
  };

  const handleAdd = (c) => save([...contacts, c]);
  const handleEdit = (idx, c) => save(contacts.map((x, i) => i === idx ? c : x));
  const handleDelete = (idx) => save(contacts.filter((_, i) => i !== idx));

  const activeCount = contacts.filter(c => c.is_active !== false).length;
  const withEmailCount = contacts.filter(c => c.email && c.is_active !== false).length;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          {contacts.length} contact(s) · {activeCount} active · {withEmailCount} with email (will receive notifications)
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setShowExtract(true)} className="gap-1">
            <Sparkles className="w-4 h-4" /> {contacts.length > 0 ? "Extract More from PDF" : "Extract Contacts from PDF"}
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={() => setEditing(-1)} className="gap-1">
              <Plus className="w-4 h-4" /> Add Manually
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <Bell className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <span>Active contacts with a valid email address automatically receive email notifications for this MOU. This cannot be disabled per-contact without deactivating the contact.</span>
      </div>

      {contacts.length === 0 ? (
        <div className="border border-dashed rounded-lg py-12 text-center space-y-3">
          <p className="text-muted-foreground text-sm">No contacts added yet.</p>
          <div className="flex gap-2 justify-center flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setShowExtract(true)} className="gap-1">
              <Sparkles className="w-4 h-4" /> Extract Contacts from Uploaded PDF
            </Button>
            {isAdmin && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(-1)} className="gap-1">
                <Plus className="w-4 h-4" /> Add Manually
              </Button>
            )}
          </div>
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
                      <div className="flex items-center gap-1">
                        <User className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span className="font-semibold text-sm">{c.name}</span>
                        {!isActive && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                      </div>
                      {c.role && <p className="text-xs text-muted-foreground">{c.role}</p>}
                      {c.organization && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Building2 className="w-3 h-3 shrink-0" />{c.organization}
                        </p>
                      )}
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="text-xs text-primary flex items-center gap-1 hover:underline">
                          <Mail className="w-3 h-3 shrink-0" />{c.email}
                        </a>
                      ) : (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <Mail className="w-3 h-3" />No email — will not receive notifications
                        </p>
                      )}
                      {c.phone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3 shrink-0" />{c.phone}
                        </p>
                      )}
                      {c.address && <p className="text-xs text-muted-foreground mt-1">{c.address}</p>}
                      {c.extracted_from_pdf && <span className="text-xs text-primary/60 italic">Extracted from PDF</span>}
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(i)}><Pencil className="w-3 h-3" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(i)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
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

      {showExtract && (
        <MouExtractionModal
          open={showExtract}
          onClose={() => setShowExtract(false)}
          mouId={mou.id}
          pdfUrl={pdfUrl}
          pdfName="MoU PDF"
          existingData={{ contacts }}
          onSaved={() => { setShowExtract(false); onUpdate(); }}
        />
      )}
    </div>
  );
}