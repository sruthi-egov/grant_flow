import { useState } from "react";
import { api } from "@/api/apiClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FileText, AlertTriangle, CheckCircle2, Trash2, Plus } from "lucide-react";
import { logAudit } from "@/utils/auditLogger";

const STEPS = { SELECT: "select", EXTRACTING: "extracting", REVIEW: "review", DONE: "done" };

const confidenceColor = (c) => c >= 80 ? "bg-green-100 text-green-700" : c >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700";

export default function ExtractFromPdfModal({ open, onClose, parentType, parentId, pdfUrl, pdfName, extractType = "both", existingDeliverables = [], existingMilestones = [], onSaved }) {
  const [step, setStep] = useState(STEPS.SELECT);
  const [selectedExtractType, setSelectedExtractType] = useState(extractType);
  const [extractedDeliverables, setExtractedDeliverables] = useState([]);
  const [extractedMilestones, setExtractedMilestones] = useState([]);
  const [selectedDeliverables, setSelectedDeliverables] = useState({});
  const [selectedMilestones, setSelectedMilestones] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [extractionNotes, setExtractionNotes] = useState("");

  // Reset state when modal opens
  const handleOpenChange = (isOpen) => {
    if (!isOpen) {
      // Reset for next open
      setStep(STEPS.SELECT);
      setError("");
      setExtractionNotes("");
      setExtractedDeliverables([]);
      setExtractedMilestones([]);
      onClose();
    }
  };

  const isSow = parentType === "sow";
  const isGrantLike = parentType === "grant" || parentType === "mou" || parentType === "msa";

  const handleExtract = async () => {
    setStep(STEPS.EXTRACTING);
    setError("");
    setProgressMsg("Reading uploaded PDF...");

    console.log("[Extract] Starting extraction", { parentType, parentId, pdfUrl, selectedExtractType });

    try {
      setProgressMsg("Extracting deliverables and milestones using AI...");
      const res = await api.functions.invoke("extractDeliverablesAndMilestones", {
        pdf_url: pdfUrl,
        parent_type: parentType,
        parent_id: parentId,
        extract_type: selectedExtractType,
        existing_deliverables: existingDeliverables,
        existing_milestones: existingMilestones,
      });

      console.log("[Extract] Raw function response:", res);

      // Handle both thrown errors (5xx) and returned error payloads (200 with error field)
      const data = res?.data || res;
      if (data?.error) {
        throw new Error(data.error);
      }

      setProgressMsg("Preparing review...");

      console.log("[Extract] deliverables count:", data?.deliverables?.length ?? 0);
      console.log("[Extract] milestones count:", data?.milestones?.length ?? 0);
      console.log("[Extract] extraction_notes:", data?.extraction_notes);
      setExtractionNotes(data?.extraction_notes || "");

      const delivs = (data.deliverables || []).map((d, i) => ({ ...d, _key: `d_${i}` }));
      const miles = (data.milestones || []).map((m, i) => ({ ...m, _key: `m_${i}` }));

      setExtractedDeliverables(delivs);
      setExtractedMilestones(miles);

      // Pre-select non-duplicates
      const ds = {};
      delivs.forEach(d => { ds[d._key] = !d._is_duplicate; });
      setSelectedDeliverables(ds);

      const ms = {};
      miles.forEach(m => { ms[m._key] = !m._is_duplicate; });
      setSelectedMilestones(ms);

      setStep(STEPS.REVIEW);
    } catch (e) {
      console.error("[Extract] Extraction failed:", e);
      setError(e.message || "Extraction failed. Please try again.");
      setStep(STEPS.SELECT);
    }
  };

  const updateDeliverable = (key, field, value) => {
    setExtractedDeliverables(prev => prev.map(d => d._key === key ? { ...d, [field]: value } : d));
  };

  const updateMilestone = (key, field, value) => {
    setExtractedMilestones(prev => prev.map(m => m._key === key ? { ...m, [field]: value } : m));
  };

  const removeDeliverable = (key) => setExtractedDeliverables(prev => prev.filter(d => d._key !== key));
  const removeMilestone = (key) => setExtractedMilestones(prev => prev.filter(m => m._key !== key));

  const addBlankDeliverable = () => {
    const key = `d_new_${Date.now()}`;
    setExtractedDeliverables(prev => [...prev, { _key: key, title: "", description: "", category: "Other", source_section: "", due_date: "", confidence: 100 }]);
    setSelectedDeliverables(prev => ({ ...prev, [key]: true }));
  };

  const addBlankMilestone = () => {
    const key = `m_new_${Date.now()}`;
    setExtractedMilestones(prev => [...prev, { _key: key, title: "", description: "", milestone_type: "Payment", due_date: "", percentage: "", amount: null, currency: "USD", confidence: 100 }]);
    setSelectedMilestones(prev => ({ ...prev, [key]: true }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    let savedD = 0, savedM = 0;
    const errors = [];

    // Helper: strip empty string dates to avoid DB validation errors
    const cleanDate = (d) => (d && d.trim()) ? d.trim() : undefined;

    // Save selected deliverables
    if (selectedExtractType !== "milestones") {
      const toSave = extractedDeliverables.filter(d => selectedDeliverables[d._key] && d.title?.trim());
      console.log("[Save] Saving deliverables:", toSave.length, "parentType:", parentType, "parentId:", parentId);
      for (const d of toSave) {
        const record = {
          name: d.title,
          description: d.description || "",
          category: d.category || "Other",
          due_date: cleanDate(d.due_date),
          acceptance_criteria: d.acceptance_criteria || "",
          priority: d.priority || "Medium",
          source_section: d.source_section || "",
          extraction_confidence: d.confidence || 0,
          extracted_from_pdf: true,
          source_document_id: pdfUrl,
          status: "pending",
        };
        try {
          if (isSow) {
            await api.entities.SowDeliverable.create({ ...record, sow_id: parentId });
          } else {
            await api.entities.GrantDeliverable.create({ ...record, grant_id: parentId });
          }
          savedD++;
        } catch (e) {
          console.error("[Save] Deliverable create failed:", e, record);
          errors.push(`Deliverable "${d.title}": ${e.message}`);
        }
      }
    }

    // Save selected milestones
    if (selectedExtractType !== "deliverables") {
      const toSave = extractedMilestones.filter(m => selectedMilestones[m._key] && m.title?.trim());
      console.log("[Save] Saving milestones:", toSave.length, "parentType:", parentType, "parentId:", parentId);
      for (const m of toSave) {
        const record = {
          title: m.title,
          description: m.description || "",
          milestone_type: m.milestone_type || "Payment",
          due_date: cleanDate(m.due_date),
          percentage: m.percentage || "",
          amount: m.amount ? parseFloat(m.amount) : null,
          currency: m.currency || "USD",
          acceptance_criteria: m.acceptance_criteria || "",
          source_section: m.source_section || "",
          extraction_confidence: m.confidence || 0,
          extracted_from_pdf: true,
          source_document_id: pdfUrl,
          status: "pending",
        };
        try {
          if (isSow) {
            await api.entities.SowMilestone.create({ ...record, sow_id: parentId });
          } else {
            await api.entities.Milestone.create({ ...record, grant_id: parentId });
          }
          savedM++;
        } catch (e) {
          console.error("[Save] Milestone create failed:", e, record);
          errors.push(`Milestone "${m.title}": ${e.message}`);
        }
      }
    }

    setSaving(false);

    if (errors.length > 0 && savedD === 0 && savedM === 0) {
      setError(`Save failed: ${errors[0]}. Check permissions or try again.`);
      return;
    }

    try {
      await logAudit({
        action_type: "pdf_extraction_saved",
        entity_type: parentType?.toUpperCase() || "Grant",
        entity_id: parentId,
        description: `Extracted from PDF: ${savedD} deliverables, ${savedM} milestones saved. File: ${pdfName || pdfUrl}`,
        status: "success",
      });
    } catch {}

    console.log("[Save] Done. savedD:", savedD, "savedM:", savedM, "errors:", errors.length);
    setStep(STEPS.DONE);
    onSaved({ deliverables: savedD, milestones: savedM });
  };

  const hasDuplicates = extractedDeliverables.some(d => d._is_duplicate) || extractedMilestones.some(m => m._is_duplicate);
  const totalSelected = Object.values(selectedDeliverables).filter(Boolean).length + Object.values(selectedMilestones).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" /> Extract from Uploaded PDF
          </DialogTitle>
        </DialogHeader>

        {/* SELECT STEP */}
        {step === STEPS.SELECT && (
          <div className="space-y-4">
            {pdfUrl ? (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
                <FileText className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{pdfName || "Uploaded PDF"}</p>
                  <p className="text-xs text-muted-foreground truncate">{pdfUrl}</p>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                No PDF is linked to this record. Please upload a PDF first.
              </div>
            )}

            <div>
              <p className="text-sm font-medium mb-2">What to extract:</p>
              <Select value={selectedExtractType} onValueChange={setSelectedExtractType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Deliverables & Milestones</SelectItem>
                  <SelectItem value="deliverables">Deliverables Only</SelectItem>
                  <SelectItem value="milestones">Milestones Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleExtract} disabled={!pdfUrl} className="gap-2">
                <FileText className="w-4 h-4" /> Start Extraction
              </Button>
            </div>
          </div>
        )}

        {/* EXTRACTING STEP */}
        {step === STEPS.EXTRACTING && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-sm font-medium">{progressMsg}</p>
            <p className="text-xs text-muted-foreground">This may take 20–40 seconds...</p>
          </div>
        )}

        {/* REVIEW STEP */}
        {step === STEPS.REVIEW && (
          <div className="space-y-6">
            {extractionNotes && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                <span className="font-medium shrink-0">AI Notes:</span>
                <span>{extractionNotes}</span>
              </div>
            )}
            {hasDuplicates && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Some extracted items may already exist. Duplicates are pre-deselected — review before saving.
              </div>
            )}

            {/* DELIVERABLES TABLE */}
            {(selectedExtractType === "both" || selectedExtractType === "deliverables") && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">Deliverables ({extractedDeliverables.length} found)</h3>
                  <Button size="sm" variant="outline" onClick={addBlankDeliverable} className="gap-1 text-xs h-7">
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                </div>
                {extractedDeliverables.length === 0 ? (
                  <div className="py-4 text-center space-y-1">
                    <p className="text-sm text-muted-foreground">No deliverables were extracted from this PDF.</p>
                    <p className="text-xs text-muted-foreground">You can add them manually using the + Add button above, or go back and retry.</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-2 w-8"></th>
                          <th className="text-left p-2 font-medium min-w-[200px]">Title</th>
                          <th className="text-left p-2 font-medium min-w-[100px]">Category</th>
                          <th className="text-left p-2 font-medium min-w-[100px]">Due Date</th>
                          <th className="text-left p-2 font-medium min-w-[120px]">Source Section</th>
                          <th className="text-left p-2 font-medium w-16">Conf.</th>
                          <th className="p-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {extractedDeliverables.map(d => (
                          <tr key={d._key} className={`border-t ${d._is_duplicate ? "bg-yellow-50" : ""}`}>
                            <td className="p-2">
                              <Checkbox
                                checked={!!selectedDeliverables[d._key]}
                                onCheckedChange={v => setSelectedDeliverables(prev => ({ ...prev, [d._key]: !!v }))}
                              />
                            </td>
                            <td className="p-2">
                              <div className="space-y-1">
                                <Input
                                  value={d.title || ""}
                                  onChange={e => updateDeliverable(d._key, "title", e.target.value)}
                                  className="h-7 text-xs"
                                  placeholder="Title"
                                />
                                {d._is_duplicate && <Badge className="bg-yellow-100 text-yellow-700 text-xs">Possible Duplicate</Badge>}
                              </div>
                            </td>
                            <td className="p-2">
                              <Select value={d.category || "Other"} onValueChange={v => updateDeliverable(d._key, "category", v)}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["Technical","Documentation","Support","Training","Configuration","Deployment","Reporting","Other"].map(c => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-2">
                              <Input type="date" value={d.due_date || ""} onChange={e => updateDeliverable(d._key, "due_date", e.target.value)} className="h-7 text-xs" />
                            </td>
                            <td className="p-2">
                              <Input value={d.source_section || ""} onChange={e => updateDeliverable(d._key, "source_section", e.target.value)} className="h-7 text-xs" placeholder="Section" />
                            </td>
                            <td className="p-2">
                              <Badge className={confidenceColor(d.confidence || 0)}>{d.confidence || 0}%</Badge>
                            </td>
                            <td className="p-2">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeDeliverable(d._key)}>
                                <Trash2 className="w-3 h-3 text-red-400" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* MILESTONES TABLE */}
            {(selectedExtractType === "both" || selectedExtractType === "milestones") && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">Milestones ({extractedMilestones.length} found)</h3>
                  <Button size="sm" variant="outline" onClick={addBlankMilestone} className="gap-1 text-xs h-7">
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                </div>
                {extractedMilestones.length === 0 ? (
                  <div className="py-4 text-center space-y-1">
                    <p className="text-sm text-muted-foreground">No milestones were extracted from this PDF.</p>
                    <p className="text-xs text-muted-foreground">You can add them manually using the + Add button above, or go back and retry.</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-2 w-8"></th>
                          <th className="text-left p-2 font-medium min-w-[180px]">Title</th>
                          <th className="text-left p-2 font-medium min-w-[100px]">Type</th>
                          <th className="text-left p-2 font-medium min-w-[100px]">Due Date</th>
                          <th className="text-left p-2 font-medium w-16">%</th>
                          <th className="text-left p-2 font-medium w-24">Amount</th>
                          <th className="text-left p-2 font-medium w-16">CCY</th>
                          <th className="text-left p-2 font-medium w-16">Conf.</th>
                          <th className="p-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {extractedMilestones.map(m => (
                          <tr key={m._key} className={`border-t ${m._is_duplicate ? "bg-yellow-50" : ""}`}>
                            <td className="p-2">
                              <Checkbox
                                checked={!!selectedMilestones[m._key]}
                                onCheckedChange={v => setSelectedMilestones(prev => ({ ...prev, [m._key]: !!v }))}
                              />
                            </td>
                            <td className="p-2">
                              <div className="space-y-1">
                                <Input value={m.title || ""} onChange={e => updateMilestone(m._key, "title", e.target.value)} className="h-7 text-xs" placeholder="Title" />
                                {m._is_duplicate && <Badge className="bg-yellow-100 text-yellow-700 text-xs">Possible Duplicate</Badge>}
                              </div>
                            </td>
                            <td className="p-2">
                              <Select value={m.milestone_type || "Payment"} onValueChange={v => updateMilestone(m._key, "milestone_type", v)}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {(isSow ? ["Payment","Delivery","Review","Release","Support","Documentation","Other"] : ["Payment","Reporting","Program","Compliance","Audit","Review","Other"]).map(t => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-2">
                              <Input type="date" value={m.due_date || ""} onChange={e => updateMilestone(m._key, "due_date", e.target.value)} className="h-7 text-xs" />
                            </td>
                            <td className="p-2">
                              <Input value={m.percentage || ""} onChange={e => updateMilestone(m._key, "percentage", e.target.value)} className="h-7 text-xs" placeholder="20%" />
                            </td>
                            <td className="p-2">
                              <Input type="number" value={m.amount || ""} onChange={e => updateMilestone(m._key, "amount", e.target.value)} className="h-7 text-xs" placeholder="0" />
                            </td>
                            <td className="p-2">
                              <Input value={m.currency || "USD"} onChange={e => updateMilestone(m._key, "currency", e.target.value)} className="h-7 text-xs" />
                            </td>
                            <td className="p-2">
                              <Badge className={confidenceColor(m.confidence || 0)}>{m.confidence || 0}%</Badge>
                            </td>
                            <td className="p-2">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeMilestone(m._key)}>
                                <Trash2 className="w-3 h-3 text-red-400" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertTriangle className="w-4 h-4" /> {error}
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t">
              <p className="text-sm text-muted-foreground">{totalSelected} item(s) selected to save</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(STEPS.SELECT)}>Back</Button>
                <Button onClick={handleSave} disabled={saving || totalSelected === 0} className="gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save {totalSelected} Item(s)
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* DONE STEP */}
        {step === STEPS.DONE && (
          <div className="flex flex-col items-center py-10 gap-4">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <p className="font-semibold text-lg">Saved Successfully</p>
            <p className="text-sm text-muted-foreground">Items have been added to the respective tabs.</p>
            <Button onClick={onClose}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}