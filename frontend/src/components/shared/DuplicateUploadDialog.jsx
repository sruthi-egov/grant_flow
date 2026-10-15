import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function DuplicateUploadDialog({ open, existingRecord, onCancel, onUploadAnyway }) {
  return (
    <Dialog open={open} onOpenChange={open => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            <AlertTriangle className="w-5 h-5" /> Duplicate Document Detected
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">
            This document appears to have already been uploaded.
            {existingRecord?.file_name && (
              <span className="block mt-1 font-medium text-foreground">"{existingRecord.file_name}"</span>
            )}
            {existingRecord?.uploaded_by && (
              <span className="block text-xs mt-1">Uploaded by: {existingRecord.uploaded_by}</span>
            )}
          </p>
          <p className="text-sm font-medium">Do you still want to upload it again?</p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
            <Button className="flex-1 bg-orange-600 hover:bg-orange-700 text-white" onClick={onUploadAnyway}>
              Upload Anyway
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}