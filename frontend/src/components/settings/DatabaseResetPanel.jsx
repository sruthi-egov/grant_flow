import { useState } from "react";
import { api } from "@/api/apiClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Database, Download, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function DatabaseResetPanel() {
  const [confirmText, setConfirmText] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [backupDone, setBackupDone] = useState(false);
  const [deleteAuditLogs, setDeleteAuditLogs] = useState(true);
  const [deleteNotifLogs, setDeleteNotifLogs] = useState(false);
  const [result, setResult] = useState(null);

  const handleExportBackup = async () => {
    setExporting(true);
    try {
      const [
        grants, sows, msas, mous,
        grantDeliverables, milestones, sowDeliverables, sowMilestones,
        reportingObligations, tranches, sowInvoices, mouCommitments,
        uploadLogs, validationLogs, auditLogs, notifLogs
      ] = await Promise.all([
        api.entities.Grant.list(),
        api.entities.SOW.list(),
        api.entities.MSA.list(),
        api.entities.MOU.list(),
        api.entities.GrantDeliverable.list(),
        api.entities.Milestone.list(),
        api.entities.SowDeliverable.list(),
        api.entities.SowMilestone.list(),
        api.entities.GrantReportingObligation.list(),
        api.entities.GrantTranche.list(),
        api.entities.SowInvoice.list(),
        api.entities.MouCommitment.list(),
        api.entities.DocumentUploadLog.list(),
        api.entities.DocumentValidationLog.list(),
        api.entities.AuditLog.list(),
        api.entities.NotificationLog.list(),
      ]);

      const backup = {
        exported_at: new Date().toISOString(),
        grants, sows, msas, mous,
        grantDeliverables, milestones, sowDeliverables, sowMilestones,
        reportingObligations, tranches, sowInvoices, mouCommitments,
        uploadLogs, validationLogs, auditLogs, notifLogs,
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `granttrack-full-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupDone(true);
      toast.success("Full backup exported. You may now proceed with the database reset.");
    } catch (err) {
      toast.error("Backup failed: " + err.message);
    }
    setExporting(false);
  };

  const handleReset = async () => {
    setShowDialog(false);
    setRunning(true);
    setResult(null);
    try {
      const res = await api.functions.invoke("performDatabaseReset", {
        backup_exported: backupDone,
        delete_audit_logs: deleteAuditLogs,
        delete_notification_logs: deleteNotifLogs,
      });
      const data = res.data || {};
      setResult(data);
      if (data.success) {
        toast.success(data.message || "Database reset completed.");
      } else {
        toast.error(data.message || "Reset failed.");
      }
    } catch (err) {
      toast.error("Reset failed: " + err.message);
      setResult({ success: false, message: err.message, deleted_counts: {}, errors: [err.message] });
    }
    setRunning(false);
  };

  const canConfirm = confirmText === "RESET DATABASE" && backupDone;

  return (
    <Card className="mt-4 border-red-400">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-700">
          <Database className="w-5 h-5" />
          Full Database Reset
        </CardTitle>
        <CardDescription>
          Permanently delete ALL business/project data. Users, settings, and notification configuration are preserved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Warning */}
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-300 rounded-lg text-sm text-red-800">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
          <div className="space-y-1">
            <p className="font-bold text-red-900">⚠ IRREVERSIBLE ACTION</p>
            <p>This will permanently delete all <strong>Grants, SOWs, MSAs, MOUs, deliverables, milestones, reporting obligations, payment schedules, invoices, uploaded files, document validation records, extracted metadata, and health score snapshots.</strong></p>
            <p className="mt-1"><strong>Preserved:</strong> User accounts, roles, AppSettings, notification rules, notification templates, email recipients, and environment settings.</p>
          </div>
        </div>

        {/* Step 1: Options */}
        <div>
          <Label className="text-base font-semibold mb-3 block">Step 1 – Additional options</Label>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <Checkbox
                id="del_audit"
                checked={deleteAuditLogs}
                onCheckedChange={setDeleteAuditLogs}
              />
              <Label htmlFor="del_audit" className="cursor-pointer">
                <span className="font-medium">Delete audit logs</span>
                <p className="text-xs text-muted-foreground">Clears all AuditLog records (action history)</p>
              </Label>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <Checkbox
                id="del_notif_logs"
                checked={deleteNotifLogs}
                onCheckedChange={setDeleteNotifLogs}
              />
              <Label htmlFor="del_notif_logs" className="cursor-pointer">
                <span className="font-medium">Delete notification send logs</span>
                <p className="text-xs text-muted-foreground">Clears NotificationLog records (email send history). Notification rules and templates are always preserved.</p>
              </Label>
            </div>
          </div>
        </div>

        {/* Step 2: Backup — REQUIRED */}
        <div>
          <Label className="text-base font-semibold mb-3 block">
            Step 2 – Export full backup <span className="text-red-600 font-bold">(required)</span>
          </Label>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleExportBackup} disabled={exporting}>
              {exporting
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Exporting...</>
                : <><Download className="w-4 h-4 mr-2" />Export Full Backup (JSON)</>}
            </Button>
            {backupDone && (
              <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Backup saved. You may now proceed.
              </span>
            )}
          </div>
          {!backupDone && (
            <p className="text-xs text-red-600 mt-2 font-medium">You must export a backup before the reset button becomes available.</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">Includes all Grants, SOWs, MSAs, MOUs, deliverables, milestones, obligations, invoices, document logs, and audit/notification logs.</p>
        </div>

        {/* Step 3: Confirm */}
        <div>
          <Label className="text-base font-semibold mb-3 block">Step 3 – Type confirmation phrase</Label>
          <p className="text-sm text-muted-foreground mb-2">Type <strong className="font-mono text-red-700">RESET DATABASE</strong> exactly to enable the reset button.</p>
          <Input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="RESET DATABASE"
            className="w-56 font-mono border-red-200 focus:border-red-400"
          />
        </div>

        {/* Execute */}
        <div className="flex items-center gap-3 pt-2 border-t border-red-100">
          <Button
            variant="destructive"
            disabled={!canConfirm || running}
            onClick={() => setShowDialog(true)}
            className="bg-red-700 hover:bg-red-800"
          >
            {running
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Resetting database...</>
              : <><Database className="w-4 h-4 mr-2" />Execute Full Database Reset</>}
          </Button>
          {!backupDone && <span className="text-xs text-red-500">Export backup first</span>}
          {backupDone && confirmText !== "RESET DATABASE" && (
            <span className="text-xs text-muted-foreground">Type the confirmation phrase above</span>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className={`p-4 rounded-lg border text-sm ${result.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
            {result.success ? (
              <>
                <p className="font-semibold flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4" />{result.message}
                </p>
                {result.deleted_counts && (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                    {Object.entries(result.deleted_counts).map(([k, v]) => v > 0 && (
                      <span key={k}>• {k.replace(/_/g, ' ')}: <strong>{v}</strong></span>
                    ))}
                  </div>
                )}
                {result.preserved && (
                  <p className="text-xs mt-2 text-green-700">✓ Users, settings, and notification config preserved.</p>
                )}
                {result.errors?.length > 0 && (
                  <div className="mt-2 text-xs text-amber-700 space-y-0.5">
                    <p className="font-medium">Warnings:</p>
                    {result.errors.map((e, i) => <p key={i}>• {e}</p>)}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{result.message}</p>
                {result.errors?.map((e, i) => <p key={i} className="text-xs mt-1">• {e}</p>)}
              </>
            )}
          </div>
        )}
      </CardContent>

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              Confirm Full Database Reset
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">This will <strong>permanently delete</strong> all Grants, SOWs, MSAs, MOUs, deliverables, milestones, reporting obligations, invoices, and all document records.</span>
              <span className="block font-semibold text-red-700">This action cannot be undone.</span>
              <span className="block">User accounts, permissions, settings, and notification configuration will be preserved.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 hover:bg-red-800 text-white"
              onClick={handleReset}
            >
              Yes, reset entire database
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}