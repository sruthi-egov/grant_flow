/**
 * Universal Document Uploader
 * Handles upload, AI validation, classification, duplicate detection for any module.
 */
import { useState, useRef } from "react";
import { api } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { processDocumentUpload } from "@/utils/documentValidator";
import { usePermissions, canUploadPDF } from "@/hooks/useCanUploadPdf";

const STATUS_LABELS = {
  Valid: { label: "Valid", cls: "bg-green-100 text-green-700" },
  Invalid: { label: "Invalid", cls: "bg-red-100 text-red-700" },
  Duplicate: { label: "Duplicate", cls: "bg-orange-100 text-orange-700" },
  PendingReview: { label: "Pending Review", cls: "bg-yellow-100 text-yellow-700" },
  ForceApproved: { label: "Force Approved", cls: "bg-blue-100 text-blue-700" },
};

export default function UniversalDocumentUploader({
  selectedModule,       // "Grant" | "SOW" | "MSA" | "MOU" | "Milestone" | "Deliverable" | "Invoice" | "ReportingObligation"
  linkedEntityId,       // ID of the parent record
  linkedEntityName,     // Display name of the parent record
  onSuccess,            // called with { fileUrl, metadata, detectedType } on valid upload
  label,                // Button/area label override
  className,
}) {
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [result, setResult] = useState(null); // last validation result
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingFileUrl, setPendingFileUrl] = useState(null);
  const inputRef = useRef();
  const { permissions, checkingPermission } = usePermissions();

  const runProcess = async (file, fileUrl, skipDuplicateCheck = false) => {
    setLoading(true);
    setLoadingMsg("Validating & classifying document...");
    setResult(null);

    const res = await processDocumentUpload({
      file,
      fileUrl,
      selectedModule,
      linkedEntityId,
      linkedEntityName,
    });

    setLoading(false);
    setLoadingMsg("");
    setResult(res);

    if (res.isDuplicate && !skipDuplicateCheck) {
      setPendingFile(file);
      setPendingFileUrl(fileUrl);
      setShowDuplicateDialog(true);
      return;
    }

    if (res.isValid) {
      onSuccess?.({ fileUrl, metadata: res.metadata, detectedType: res.detectedType, validationLog: res.validationLog });
    }

    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!canUploadPDF(permissions, selectedModule)) {
      setResult({ isValid: false, rejectionReason: "You do not have permission to upload PDFs in this module." });
      return;
    }

    setLoading(true);
    setLoadingMsg("Uploading document...");
    const { file_url } = await api.integrations.Core.UploadFile({ file });

    await runProcess(file, file_url, false);
  };

  const handleProceedDuplicate = async () => {
    setShowDuplicateDialog(false);
    if (pendingFile && pendingFileUrl) {
      await runProcess(pendingFile, pendingFileUrl, true);
    }
    setPendingFile(null);
    setPendingFileUrl(null);
  };

  if (checkingPermission) return null;
  if (!canUploadPDF(permissions, selectedModule)) return null;

  const displayLabel = label || `Upload ${selectedModule} Document`;

  return (
    <div className={className}>
      {/* Duplicate warning dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={o => !o && setShowDuplicateDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="w-5 h-5" /> Duplicate Document Detected
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This document appears to be a duplicate of an existing upload.
            {result?.existingDuplicate?.file_name && (
              <span className="block mt-1 font-medium text-foreground">"{result.existingDuplicate.file_name}"</span>
            )}
          </p>
          <p className="text-sm font-medium mt-2">Do you still want to continue?</p>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => { setShowDuplicateDialog(false); setPendingFile(null); setPendingFileUrl(null); }}>
              Cancel
            </Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleProceedDuplicate}>
              Upload Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload area */}
      <div
        className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => !loading && inputRef.current?.click()}
      >
        {loading ? (
          <>
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">{loadingMsg}</p>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-muted-foreground" />
            <p className="font-medium text-sm">{displayLabel}</p>
            <p className="text-xs text-muted-foreground">PDF — AI will validate and classify automatically</p>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />

      {/* Validation result feedback */}
      {result && !loading && (
        <div className={`mt-3 rounded-lg border p-3 text-sm ${result.isValid ? "bg-green-50 border-green-200" : result.isDuplicate ? "bg-orange-50 border-orange-200" : "bg-red-50 border-red-200"}`}>
          <div className="flex items-center gap-2 mb-1">
            {result.isValid
              ? <CheckCircle2 className="w-4 h-4 text-green-600" />
              : result.isDuplicate
              ? <AlertTriangle className="w-4 h-4 text-orange-500" />
              : <XCircle className="w-4 h-4 text-red-600" />}
            <Badge className={result.isValid ? "bg-green-100 text-green-700" : result.isDuplicate ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}>
              {result.isValid ? "Valid" : result.isDuplicate ? "Duplicate" : "Invalid"}
            </Badge>
            {result.detectedType && <span className="text-muted-foreground">· Detected: <strong>{result.detectedType}</strong></span>}
            {result.confidenceScore > 0 && <span className="text-muted-foreground ml-auto">{result.confidenceScore}% confidence</span>}
          </div>
          {result.isValid
            ? <p className="text-green-700">{result.validationReason}</p>
            : <p className="text-red-600 mt-1">{result.rejectionReason || result.validationReason || "Document did not pass validation."}</p>
          }
          {!result.isValid && !result.isDuplicate && (
            <p className="text-xs text-muted-foreground mt-1">
              This document has been moved to the <strong>Invalid / Unclassified Documents</strong> section for admin review.
            </p>
          )}
        </div>
      )}
    </div>
  );
}