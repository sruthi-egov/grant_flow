import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FilePlus } from "lucide-react";
import MsaForm from "./MsaForm";
import MsaPdfUploader from "./MsaPdfUploader";

export default function AddMsaModal({ onClose, onSaved }) {
  const [tab, setTab]         = useState("pdf");
  const [prefill, setPrefill] = useState(null);
  const [pdfUrl, setPdfUrl]   = useState(null);

  const handleExtracted = (formFields, fileUrl) => {
    setPdfUrl(fileUrl);
    setPrefill(formFields);
    setTab("manual");
  };

  const handleSave = async (formData) => {
    await base44.entities.MSA.create({
      ...formData,
      pdf_url: pdfUrl || formData.pdf_url || "",
    });
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Master Services Agreement</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="pdf" className="flex-1 gap-2">
              <Upload className="w-4 h-4" /> Upload PDF
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex-1 gap-2">
              <FilePlus className="w-4 h-4" /> Enter Manually
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pdf">
            <MsaPdfUploader onExtracted={handleExtracted} />
            {prefill && (
              <p className="text-sm text-green-600 mt-3">✓ Data extracted — switch to "Enter Manually" to review and save.</p>
            )}
          </TabsContent>

          <TabsContent value="manual">
            <MsaForm initialData={prefill || {}} onSave={handleSave} onCancel={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}