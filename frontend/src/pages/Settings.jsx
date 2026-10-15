import { useState, useEffect } from "react";
import AdditionalRecipientsManager from "@/components/settings/AdditionalRecipientsManager";
import NotificationRulesManager from "@/components/settings/NotificationRulesManager";
import NotificationTemplatesManager from "@/components/settings/NotificationTemplatesManager";
import NotificationLogsViewer from "@/components/settings/NotificationLogsViewer";
import TestEmailDialog from "@/components/settings/TestEmailDialog";
import { api } from "@/api/apiClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bell, CheckCircle2, Mail, FileText, Send, Loader2, Info, AlertTriangle, Users, Calendar, Settings2 } from "lucide-react";
import DocumentUploadLogViewer from "@/components/shared/DocumentUploadLogViewer";
import FileCleanupPanel from "@/components/settings/FileCleanupPanel";
import CleanupLogsViewer from "@/components/settings/CleanupLogsViewer";
import EnvironmentSettings from "@/components/settings/EnvironmentSettings";
import DatabaseResetPanel from "@/components/settings/DatabaseResetPanel";
import { toast } from "sonner";

export default function Settings() {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [settingsId, setSettingsId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [showToggleWarning, setShowToggleWarning] = useState(false);
  const [pendingToggleValue, setPendingToggleValue] = useState(false);

  useEffect(() => {
    api.auth.me().then(setUser).catch(() => {});
    api.entities.AppSettings.list().then(s => {
      if (s.length > 0) {
        setSettings({ notifications_enabled: s[0].notifications_enabled ?? false, days_before: s[0].days_before ?? 7 });
        setSettingsId(s[0].id);
      } else {
        setSettings({ notifications_enabled: false, days_before: 7 });
      }
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      if (settingsId) {
        await api.entities.AppSettings.update(settingsId, settings);
      } else {
        const created = await api.entities.AppSettings.create(settings);
        setSettingsId(created.id);
      }
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      localStorage.removeItem("notif_last_check");
      toast.success("Settings saved");
    } catch (err) {
      setSaving(false);
      toast.error("Failed to save: " + err.message);
    }
  };

  const handleToggleChange = (v) => {
    if (!v && settings.notifications_enabled) {
      // Turning OFF — show warning
      setPendingToggleValue(v);
      setShowToggleWarning(true);
    } else {
      setSettings(s => ({ ...s, notifications_enabled: v }));
    }
  };

  const confirmToggleOff = () => {
    setSettings(s => ({ ...s, notifications_enabled: pendingToggleValue }));
    setShowToggleWarning(false);
  };

  if (!settings) return <div className="p-6 text-muted-foreground">Loading...</div>;

  const isAdmin = user?.role === "admin";

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your GrantOS preferences</p>
      </div>

      {/* ─── Unified Email Notifications Section ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Email Notifications
          </CardTitle>
          <CardDescription>
            Manage automated email reminders for milestones, payments, reporting deadlines, and contract expiry.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Informational message */}
          <div className="flex items-start gap-3 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <span>
              Contacts assigned to an individual record will always receive notifications related to that record.
              The recipients added below are optional and will receive notifications across all applicable records.
            </span>
          </div>

          {/* Notification Status */}
          <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium">Additional Recipient Notifications</p>
              <p className="text-sm text-muted-foreground">
                {settings.notifications_enabled
                  ? "Active — additional recipients and scheduled reminders are enabled."
                  : "Inactive — only mandatory record contacts receive notifications."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${settings.notifications_enabled ? "text-green-600" : "text-muted-foreground"}`}>
                {settings.notifications_enabled ? "Active" : "Inactive"}
              </span>
              <Switch
                checked={settings.notifications_enabled}
                onCheckedChange={handleToggleChange}
              />
            </div>
          </div>

          {/* Mandatory Record Contacts info (read-only) */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-indigo-500" />
              <p className="font-medium text-sm">Mandatory Record Contacts</p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">Automatic</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Contacts added to each Grant, SOW, MSA, and MOU record are automatically included as mandatory notification recipients.
              They cannot be excluded from relevant notifications while they remain active on the record.
              Manage these contacts from their respective record pages, not here.
            </p>
          </div>

          {/* Additional Notification Recipients */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="w-4 h-4 text-teal-500" />
              <p className="font-medium text-sm">Additional Notification Recipients</p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">Optional</span>
            </div>
            <AdditionalRecipientsManager settingsId={settingsId} />
          </div>

          {/* Reminder Schedule */}
          <div className={settings.notifications_enabled ? "" : "opacity-50 pointer-events-none"}>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-primary" />
              <Label>Reminder Schedule</Label>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Default number of days before a due date to send reminders. Individual reminder schedules are configured in Notification Rules below.
            </p>
            <Input
              type="number"
              min={1}
              max={90}
              value={settings.days_before}
              onChange={e => setSettings(s => ({ ...s, days_before: parseInt(e.target.value) || 7 }))}
              className="w-28"
            />
          </div>

          {/* Notification Events */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Settings2 className="w-4 h-4 text-primary" />
              <p className="font-medium text-sm">Notification Events</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              The following event types trigger notifications: Milestone due date, Deliverable due date, Reporting deadline, Payment due date, Contract expiry, and Document review.
              Configure exact reminder days and overdue frequency in the Notification Rules section below.
            </p>
            <div className="flex flex-wrap gap-2">
              {["Milestone Due", "Deliverable Due", "Reporting Deadline", "Payment Due", "Contract Expiry", "Document Review"].map(ev => (
                <span key={ev} className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground border">{ev}</span>
              ))}
            </div>
          </div>

          {/* Save + Test */}
          <div className="flex items-center gap-3 pt-2 border-t">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle2 className="w-4 h-4" /> Settings saved
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => setShowTestDialog(true)}
              variant="outline"
              size="sm"
            >
              <Send className="w-4 h-4 mr-2" /> Send Test Email
            </Button>
            <p className="text-xs text-muted-foreground">Preview recipients and send a marked test email.</p>
          </div>

          <div className="flex items-start gap-3 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
            <Calendar className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              The scheduler runs automatically at 9:00 AM Asia/Kolkata daily. Mandatory record contacts always receive notifications regardless of the toggle above.
              The toggle controls only additional recipient delivery and scheduling.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Test Email Dialog */}
      <TestEmailDialog open={showTestDialog} onClose={() => setShowTestDialog(false)} user={user} />

      {/* Toggle Off Warning */}
      <AlertDialog open={showToggleWarning} onOpenChange={setShowToggleWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Turn Off Additional Recipient Notifications?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will stop scheduled email reminders to additional notification recipients.
              <strong> Mandatory record contacts will continue to receive notifications</strong> for their assigned records.
              Are you sure you want to turn off additional recipient notifications?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowToggleWarning(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggleOff}>Turn Off</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Notification Rules — admin only */}
      {isAdmin && <NotificationRulesManager />}

      {/* Email Templates — admin only */}
      {isAdmin && <NotificationTemplatesManager />}

      {/* Notification History — admin only */}
      {isAdmin && <NotificationLogsViewer />}

      {/* Document Upload Log */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4" /> Document Upload Log
          </CardTitle>
          <CardDescription>All uploaded PDFs classified by DPI relevance.</CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentUploadLogViewer />
        </CardContent>
      </Card>

      {/* Environment Settings — admin only */}
      {isAdmin && <EnvironmentSettings settingsId={settingsId} />}

      {/* Admin Cleanup — admin only */}
      {isAdmin && (
        <>
          <div className="mt-8 mb-2">
            <h2 className="text-lg font-semibold text-destructive">Admin Cleanup</h2>
            <p className="text-sm text-muted-foreground">Danger zone: permanently remove data. Use with caution.</p>
          </div>
          <FileCleanupPanel />
          <DatabaseResetPanel />
          <CleanupLogsViewer />
        </>
      )}
    </div>
  );
}