import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Ban } from "lucide-react";

export default function InvalidDocumentDialog({ open, reason, onClose }) {
  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Ban className="w-5 h-5" /> Invalid Document
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">
            This document has been flagged as <span className="font-semibold text-red-600">invalid</span> because it contains a reference to <span className="font-semibold">DPI Centre</span> as a party or internal entity.
          </p>
          {reason && (
            <p className="text-sm bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 italic">"{reason}"</p>
          )}
          <p className="text-sm font-medium">Internal DPI documents cannot be uploaded as external agreements. The document has been logged but will not be used to populate fields.</p>
          <Button className="w-full" onClick={onClose}>OK, Dismiss</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}