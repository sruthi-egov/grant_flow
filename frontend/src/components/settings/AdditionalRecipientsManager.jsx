import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Plus, Trash2, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdditionalRecipientsManager({ settingsId, onSettingsChange }) {
  const [emails, setEmails] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localSettingsId, setLocalSettingsId] = useState(settingsId);
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    api.entities.AppSettings.list().then(s => {
      if (s.length > 0) {
        setEmails(s[0].alert_emails || []);
        setLocalSettingsId(s[0].id);
      }
    });
  }, []);

  const addEmail = () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) { setValidationError("Email cannot be empty"); return; }
    if (!EMAIL_RE.test(trimmed)) { setValidationError("Invalid email format"); return; }
    if (emails.includes(trimmed)) { setValidationError("This email is already in the list"); return; }
    setEmails(prev => [...prev, trimmed]);
    setNewEmail("");
    setValidationError("");
  };

  const removeEmail = (email) => {
    setEmails(prev => prev.filter(e => e !== email));
    setValidationError("");
  };

  const save = async () => {
    setSaving(true);
    try {
      if (localSettingsId) {
        await api.entities.AppSettings.update(localSettingsId, { alert_emails: emails });
      } else {
        const created = await api.entities.AppSettings.create({ alert_emails: emails, notifications_enabled: false, days_before: 7 });
        setLocalSettingsId(created.id);
      }
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      if (onSettingsChange) onSettingsChange();
      toast.success("Additional recipients saved");
    } catch (err) {
      setSaving(false);
      toast.error("Failed to save: " + err.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <span>
          Contacts assigned to an individual record will always receive notifications related to that record.
          The recipients added below are optional and will receive notifications across all applicable records.
        </span>
      </div>

      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="name@example.com"
          value={newEmail}
          onChange={e => { setNewEmail(e.target.value); setValidationError(""); }}
          onKeyDown={e => e.key === "Enter" && addEmail()}
          className="flex-1"
        />
        <Button onClick={addEmail} variant="outline" size="icon">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {validationError && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {validationError}
        </p>
      )}

      {emails.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No additional recipients configured. Only record contacts will receive notifications.</p>
      ) : (
        <ul className="space-y-2">
          {emails.map(email => (
            <li key={email} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg text-sm">
              <span className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                {email}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeEmail(email)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3 pt-2 border-t">
        <Button onClick={save} disabled={saving} size="sm">
          {saving ? "Saving..." : "Save Recipients"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle2 className="w-4 h-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}