import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, Mail, Send, CheckCircle, Loader2 } from "lucide-react";

export default function NotificationsTab({ grant, onUpdate, isAdmin }) {
  const [days, setDays] = useState(grant.notification_days_before || 7);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const contacts = grant.contacts || [];

  const saveDays = async () => {
    setSaving(true);
    await base44.entities.Grant.update(grant.id, { notification_days_before: parseInt(days) });
    await onUpdate();
    setSaving(false);
  };

  const sendTestNotification = async () => {
    if (contacts.length === 0) return;
    setSending(true);

    for (const contact of contacts.filter(c => c.email)) {
      await base44.integrations.Core.SendEmail({
        to: contact.email,
        subject: `Reminder: Upcoming deadlines for ${grant.grant_name}`,
        body: `Dear ${contact.name || "Contact"},\n\nThis is a reminder that there are upcoming deadlines for the grant "${grant.grant_name}" (${grant.grantor || ""}).\n\nYou will receive notifications ${days} days before each milestone payment and reporting deadline.\n\nGrant Details:\n- Total Amount: $${(grant.total_amount || 0).toLocaleString()}\n- Period: ${grant.start_date || "—"} to ${grant.end_date || "—"}\n\nPlease log in to the GrantTrack system to view full details.\n\nBest regards,\nGrantTrack`
      });
    }

    setSending(false);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Notification Settings</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Contacts assigned to this grant will automatically receive email reminders before milestone payment due dates and reporting deadlines.
          </p>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label>Send notification X days before due date</Label>
              <Input
                type="number"
                min="1"
                className="w-24"
                value={days}
                onChange={e => setDays(e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            {isAdmin && (
              <Button onClick={saveDays} disabled={saving} variant="outline">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Notification Recipients</h3>
          </div>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts assigned to this grant. Add contacts in the Contacts tab to enable email notifications.</p>
          ) : (
            <div className="space-y-2">
              {contacts.filter(c => c.email).map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">— {c.email}</span>
                </div>
              ))}
              {contacts.filter(c => !c.email).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {contacts.filter(c => !c.email).length} contact(s) have no email address and won't receive notifications.
                </p>
              )}
            </div>
          )}

          {contacts.some(c => c.email) && isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={sendTestNotification}
              disabled={sending || sent}
              className="gap-2"
            >
              {sent ? (
                <><CheckCircle className="w-4 h-4 text-green-600" /> Sent!</>
              ) : sending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
              ) : (
                <><Send className="w-4 h-4" /> Send Test Notification</>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}