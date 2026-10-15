import { useState } from "react";
import { api } from "@/api/apiClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FilePlus } from "lucide-react";
import GrantForm from "./GrantForm";
import GrantPdfUploader from "./GrantPdfUploader";

export default function AddGrantModal({ onClose, onSaved }) {
  const [tab, setTab]         = useState("pdf");
  const [prefill, setPrefill] = useState(null);
  const [pdfUrl, setPdfUrl]   = useState(null);

  const handleExtracted = (formFields, fileUrl) => {
    setPdfUrl(fileUrl);
    setPrefill(formFields);
    setTab("manual");
  };

  const handleSave = async (formData) => {
    await api.entities.Grant.create({
      ...formData,
      pdf_url: pdfUrl || formData.pdf_url || "",
    });
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Grant</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="mt-2">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="pdf" className="flex-1 gap-2">
              <Upload className="w-4 h-4" /> Upload PDF
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex-1 gap-2">
              <FilePlus className="w-4 h-4" /> Enter Manually
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pdf">
            <GrantPdfUploader onExtracted={handleExtracted} />
            {prefill && (
              <p className="text-sm text-green-600 mt-3">✓ Data extracted — switch to "Enter Manually" to review and save.</p>
            )}
          </TabsContent>

          <TabsContent value="manual">
            <GrantForm initialData={prefill || {}} onSave={handleSave} onCancel={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}