import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import SowForm from "./SowForm";
import SowPdfUploader from "./SowPdfUploader";
import SowExtractionReviewPanel from "./SowExtractionReviewPanel";

export default function AddSowModal({ grants, onClose, onSaved }) {
  const [prefill, setPrefill]            = useState(null);
  const [pdfUrl, setPdfUrl]              = useState(null);
  const [extractionResult, setExtResult] = useState(null);
  const [tab, setTab]                    = useState("pdf");
  const [saving, setSaving]              = useState(false);

  const handleExtracted = (sowFields, fileUrl, rawResult) => {
    setPdfUrl(fileUrl);
    setPrefill(sowFields);
    setExtResult(rawResult);
    setTab("review");
  };

  const handleSave = async (formData) => {
    if (saving) return;
    setSaving(true);
    // Merge prefill (which carries all extracted _ fields) into formData
    // so no extracted field is lost when saving
    const mergedData = {
      ...prefill,
      ...formData,
      pdf_url: pdfUrl || formData.pdf_url || null,
      status: formData.status || "active",
      archived: false,
    };
    const created = await base44.entities.SOW.create(mergedData);
    setSaving(false);
    onSaved(created);
  };

  const missingCount = extractionResult?.missing_fields?.length || 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Statement of Work</DialogTitle>
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
            <SowPdfUploader onExtracted={handleExtracted} />
            {prefill && (
              <p className="text-sm text-green-600 mt-3 text-center">
                ✓ Extraction complete — review the data in the next tab.
              </p>
            )}
          </TabsContent>

          <TabsContent value="review">
            {prefill && extractionResult ? (
              <SowExtractionReviewPanel
                sowFields={prefill}
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
            <SowForm
              initialData={prefill || {}}
              grants={grants}
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