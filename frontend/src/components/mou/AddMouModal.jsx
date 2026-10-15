import { useState } from "react";
import { api } from "@/api/apiClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import MouForm from "./MouForm";
import MouPdfUploader from "./MouPdfUploader.jsx";
import ExtractionReviewPanel from "./ExtractionReviewPanel.jsx";

export default function AddMouModal({ onClose, onSaved }) {
  const [prefill, setPrefill]            = useState(null);
  const [pdfUrl, setPdfUrl]              = useState(null);
  const [extractionResult, setExtResult] = useState(null);
  const [tab, setTab]                    = useState("pdf");
  const [saving, setSaving]              = useState(false);

  const handleExtracted = (mouFields, fileUrl, rawResult) => {
    setPdfUrl(fileUrl);
    setPrefill(mouFields);
    setExtResult(rawResult);
    setTab("review");
  };

  const handleSave = async (formData) => {
    setSaving(true);
    await api.entities.MOU.create({ ...formData, pdf_url: pdfUrl || formData.pdf_url });
    setSaving(false);
    onSaved();
  };

  const missingCount = extractionResult?.missing_fields?.length || 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Memorandum of Understanding</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="pdf">Upload PDF</TabsTrigger>
            <TabsTrigger value="review" disabled={!prefill}>
              Review Extraction
              {missingCount > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs px-1.5 py-0">{missingCount} missing</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          </TabsList>

          <TabsContent value="pdf">
            <MouPdfUploader onExtracted={handleExtracted} />
            {prefill && (
              <p className="text-sm text-green-600 mt-3 text-center">
                ✓ Extraction complete — review the data in the next tab.
              </p>
            )}
          </TabsContent>

          <TabsContent value="review">
            {prefill && extractionResult ? (
              <ExtractionReviewPanel
                mouFields={prefill}
                extractionResult={extractionResult}
                pdfUrl={pdfUrl}
                onSave={handleSave}
                onEdit={() => setTab("manual")}
                saving={saving}
              />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Upload a PDF first to review extracted data.</p>
            )}
          </TabsContent>

          <TabsContent value="manual">
            <MouForm
              initialData={prefill || {}}
              onSave={handleSave}
              onCancel={onClose}
              saving={saving}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}