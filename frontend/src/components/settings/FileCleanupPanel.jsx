import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Trash2, Download, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const SCOPE_OPTIONS = [
  { value: "files_only", label: "Delete uploaded file logs only", desc: "Removes DocumentUploadLog records. Does not touch validation logs or extracted data." },
  { value: "files_and_validation_logs", label: "Uploaded files + document validation logs", desc: "Also removes DocumentValidationLog records (invalid, rejected, pending review)." },
  { value: "files_metadata_and_tables", label: "Uploaded files + metadata + extracted tables", desc: "Also clears PDF references and rate card / commercial tables from Grant, SOW, MSA, MOU records." },
  { value: "files_and_extracted_items", label: "Uploaded files + PDF-extracted deliverables & milestones", desc: "Also deletes deliverables and milestones that were originally extracted from a PDF." },
  { value: "full_file_cleanup", label: "Full file cleanup (all of the above)", desc: "Clears all upload logs, validation logs, file references, extracted tables, and PDF-extracted items." },
];

function buildBackupData(data) {
  return JSON.stringify(data, null, 2);
}

export default function FileCleanupPanel() {
  const [scope, setScope] = useState("files_only");
  const [confirmText, setConfirmText] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [backupDone, setBackupDone] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  const handleExportBackup = async () => {
    setExporting(true);
    try {
      const [grants, sows, msas, mous, uploadLogs, validationLogs, deliverables, milestones, auditLogs] = await Promise.all([
        base44.entities.Grant.list(),
        base44.entities.SOW.list(),
        base44.entities.MSA.list(),
        base44.entities.MOU.list(),
        base44.entities.DocumentUploadLog.list(),
        base44.entities.DocumentValidationLog.list(),
        base44.entities.GrantDeliverable.list(),
        base44.entities.Milestone.list(),
        base44.entities.AuditLog.list(),
      ]);
      const backup = { exported_at: new Date().toISOString(), grants, sows, msas, mous, uploadLogs, validationLogs, deliverables, milestones, auditLogs };
      const blob = new Blob([buildBackupData(backup)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `granttrack-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupDone(true);
      toast.success("Backup exported successfully. You may now proceed with cleanup.");
    } catch (err) {
      toast.error("Backup failed: " + err.message);
    }
    setExporting(false);
  };

  const handleCleanup = async () => {
    setShowDialog(false);
    setRunning(true);
    setProgress("Preparing cleanup...");
    setResult(null);
    try {
      setProgress("Deleting document logs and file references...");
      const res = await base44.functions.invoke("performFileCleanup", {
        scope,
        backup_exported: backupDone,
      });
      const stats = res.data?.stats || {};
      setResult({ success: res.data?.success, stats, errors: res.data?.errors || [] });
      if (res.data?.success) {
        toast.success("File cleanup completed successfully.");
      } else {
        toast.error("Cleanup finished with errors. Check results below.");
      }
    } catch (err) {
      toast.error("Cleanup failed: " + err.message);
      setResult({ success: false, stats: {}, errors: [err.message] });
    }
    setProgress(null);
    setRunning(false);
  };

  const canConfirm = confirmText === "DELETE FILES";

  return (
    <Card className="mt-6 border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Trash2 className="w-5 h-5" />
          Admin File Cleanup
        </CardTitle>
        <CardDescription>
          Permanently delete uploaded PDFs, document logs, and extracted metadata. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Warning banner */}
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
          <div>
            <p className="font-semibold">Danger Zone</p>
            <p>This action will permanently delete uploaded files and document metadata. Core Grant, SOW, MSA, and MOU records will NOT be deleted. User accounts, settings, and notification rules are preserved.</p>
          </div>
        </div>

        {/* Step 1: Select scope */}
        <div>
          <Label className="text-base font-semibold mb-3 block">Step 1 – Select cleanup scope</Label>
          <RadioGroup value={scope} onValueChange={setScope} className="space-y-3">
            {SCOPE_OPTIONS.map(opt => (
              <div key={opt.value} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/30 cursor-pointer">
                <RadioGroupItem value={opt.value} id={opt.value} className="mt-0.5" />
                <Label htmlFor={opt.value} className="cursor-pointer">
                  <span className="font-medium">{opt.label}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Step 2: Backup */}
        <div>
          <Label className="text-base font-semibold mb-3 block">Step 2 – Export backup (recommended)</Label>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleExportBackup} disabled={exporting}>
              {exporting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Exporting...</> : <><Download className="w-4 h-4 mr-2" />Export Backup (JSON)</>}
            </Button>
            {backupDone && (
              <span className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle2 className="w-4 h-4" /> Backup completed. You may now proceed with cleanup.
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">Exports Grants, SOWs, MSAs, MOUs, document logs, deliverables, milestones, and audit logs as a JSON file.</p>
        </div>

        {/* Step 3: Confirm */}
        <div>
          <Label className="text-base font-semibold mb-3 block">Step 3 – Confirm deletion</Label>
          <p className="text-sm text-muted-foreground mb-2">Type <strong>DELETE FILES</strong> to enable the cleanup button.</p>
          <Input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="DELETE FILES"
            className="w-56 font-mono"
          />
        </div>

        {/* Execute */}
        <div className="flex items-center gap-3 pt-2 border-t">
          <Button
            variant="destructive"
            disabled={!canConfirm || running}
            onClick={() => setShowDialog(true)}
          >
            {running ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Running cleanup...</> : <><Trash2 className="w-4 h-4 mr-2" />Execute Cleanup</>}
          </Button>
          {progress && <span className="text-sm text-muted-foreground animate-pulse">{progress}</span>}
        </div>

        {/* Result */}
        {result && (
          <div className={`p-4 rounded-lg border text-sm ${result.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
            {result.success ? (
              <>
                <p className="font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />All selected files and document metadata have been deleted successfully.</p>
                <ul className="mt-2 space-y-0.5 text-xs">
                  <li>• Upload logs deleted: <strong>{result.stats.document_logs_deleted ?? 0}</strong></li>
                  <li>• Validation logs deleted: <strong>{result.stats.validation_logs_deleted ?? 0}</strong></li>
                  <li>• Metadata tables cleared: <strong>{result.stats.metadata_cleared ?? 0}</strong></li>
                  <li>• Records updated (PDF refs cleared): <strong>{result.stats.records_updated ?? 0}</strong></li>
                  <li>• PDF-extracted items deleted: <strong>{result.stats.extracted_items_deleted ?? 0}</strong></li>
                </ul>
              </>
            ) : (
              <>
                <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Some files could not be deleted. Please review cleanup logs.</p>
                {result.errors.map((e, i) => <p key={i} className="text-xs mt-1">• {e}</p>)}
              </>
            )}
          </div>
        )}
      </CardContent>

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Confirm Permanent Deletion
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently delete uploaded file logs and document metadata based on the selected scope. <strong>This cannot be undone.</strong>
              <br /><br />
              Core Grant, SOW, MSA, and MOU records will be preserved. Users, settings, and notification rules will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-white" onClick={handleCleanup}>
              Yes, permanently delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}