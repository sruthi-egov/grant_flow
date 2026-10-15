import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, FileText, Loader2, CheckCircle2, ChevronDown, ChevronUp, Info } from "lucide-react";
import { toast } from "sonner";

// ── Editable tranche row ─────────────────────────────────────────────────────
function TrancheRow({ tranche, selected, onToggle, onChange }) {
  const [expanded, setExpanded] = useState(false);
  const t = tranche;

  const set = (k, v) => onChange({ ...t, [k]: v });

  return (
    <div className={`border rounded-lg mb-2 ${t._is_duplicate ? "border-amber-300 bg-amber-50" : "border-border bg-white"}`}>
      <div className="flex items-center gap-3 p-3">
        <Checkbox checked={selected} onCheckedChange={onToggle} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate max-w-xs">{t.tranche_name || "—"}</span>
            {t.amount && <span className="text-sm font-semibold text-green-700">{t.currency || "USD"} {Number(t.amount).toLocaleString()}</span>}
            {t.percentage && <Badge variant="outline" className="text-xs">{t.percentage}</Badge>}
            {t._is_duplicate && <Badge className="bg-amber-100 text-amber-800 text-xs border border-amber-300">Possible Duplicate</Badge>}
            {t.confidence && <Badge variant="outline" className="text-xs text-muted-foreground">{t.confidence}% conf</Badge>}
          </div>
          <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
            {t.due_date && <span>Due: {t.due_date}</span>}
            {t.invoice_trigger_date && <span>Invoice trigger: {t.invoice_trigger_date}</span>}
            {t.trigger_condition && <span>Condition: {t.trigger_condition}</span>}
            {t.source_section && <span>From: {t.source_section}</span>}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setExpanded(x => !x)}>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t pt-3 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">Tranche Name *</Label>
            <Input value={t.tranche_name || ""} onChange={e => set("tranche_name", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Amount</Label>
            <Input type="number" value={t.amount || ""} onChange={e => set("amount", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Currency</Label>
            <Input value={t.currency || "USD"} onChange={e => set("currency", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Invoice Trigger Date ⚡</Label>
            <Input type="date" value={t.invoice_trigger_date || ""} onChange={e => set("invoice_trigger_date", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Due Date (Milestone)</Label>
            <Input type="date" value={t.due_date || ""} onChange={e => set("due_date", e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Trigger Condition</Label>
            <Input value={t.trigger_condition || ""} onChange={e => set("trigger_condition", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Percentage</Label>
            <Input value={t.percentage || ""} onChange={e => set("percentage", e.target.value)} placeholder="e.g. 20%" className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={t.status || "pending"} onValueChange={v => set("status", v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="invoiced">Invoiced</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Input value={t.notes || ""} onChange={e => set("notes", e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── PDF selector ─────────────────────────────────────────────────────────────
function PdfSelector({ grantId, grantPdfUrl, onSelect }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDocs = async () => {
      const results = [];
      // From DocumentUploadLog
      try {
        const logs = await api.entities.DocumentUploadLog.filter({ entity_type: "Grant", entity_id: grantId });
        logs.forEach(l => l.file_url && results.push({ url: l.file_url, name: l.file_name || "Uploaded PDF", date: l.created_date, source: "Document Log" }));
      } catch {}
      // From DocumentValidationLog
      try {
        const vlogs = await api.entities.DocumentValidationLog.filter({ linked_entity_id: grantId });
        vlogs.forEach(l => l.file_url && results.push({ url: l.file_url, name: l.file_name || "Validated PDF", date: l.created_date, source: "Validation Log", status: l.validation_status }));
      } catch {}
      // From grant.pdf_url directly
      if (grantPdfUrl && !results.find(r => r.url === grantPdfUrl)) {
        results.push({ url: grantPdfUrl, name: "Grant Agreement PDF", date: null, source: "Grant Record" });
      }
      setDocs(results);
      setLoading(false);
      // Auto-select if only one
      if (results.length === 1) onSelect(results[0]);
    };
    fetchDocs();
  }, [grantId, grantPdfUrl]);

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" /> Finding linked PDFs...</div>;

  if (docs.length === 0) return (
    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      No PDF is linked to this Grant. Please upload a grant agreement PDF first.
    </div>
  );

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Select PDF to extract tranches from:</Label>
      {docs.map((doc, i) => (
        <button key={i} onClick={() => onSelect(doc)}
          className="w-full text-left flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/40 transition-colors">
          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{doc.name}</p>
            <p className="text-xs text-muted-foreground">{doc.source}{doc.status ? ` · ${doc.status}` : ""}{doc.date ? ` · ${doc.date?.split("T")[0]}` : ""}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────
export default function TranchePdfExtractModal({ grantId, grantPdfUrl, existingTranches, onClose, onSaved }) {
  const [step, setStep] = useState("select"); // select | extracting | review
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [extractedTranches, setExtractedTranches] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [extractionNotes, setExtractionNotes] = useState("");
  const [totalContractValue, setTotalContractValue] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSelectPdf = async (pdf) => {
    setSelectedPdf(pdf);
    setStep("extracting");
    try {
      const res = await api.functions.invoke("extractGrantTranches", {
        pdf_url: pdf.url,
        grant_id: grantId,
        existing_tranches: existingTranches,
      });
      const data = res.data || {};
      const tranches = (data.tranches || []).map((t, i) => ({ ...t, _key: t._key || `t_${i}` }));
      setExtractedTranches(tranches);
      setExtractionNotes(data.extraction_notes || "");
      setTotalContractValue(data.total_contract_value || null);
      // Pre-select all non-duplicates
      const preSelected = new Set(tranches.filter(t => !t._is_duplicate).map(t => t._key));
      setSelectedKeys(preSelected);
      setStep("review");
    } catch (err) {
      toast.error("Extraction failed: " + err.message);
      setStep("select");
    }
  };

  const handleToggle = (key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleChange = (key, updated) => {
    setExtractedTranches(prev => prev.map(t => t._key === key ? updated : t));
  };

  const handleSave = async () => {
    const toSave = extractedTranches.filter(t => selectedKeys.has(t._key));
    if (toSave.length === 0) { toast.error("No tranches selected."); return; }
    setSaving(true);
    let saved = 0;
    for (const t of toSave) {
      try {
        await api.entities.GrantTranche.create({
          grant_id: grantId,
          tranche_name: t.tranche_name || "Extracted Tranche",
          amount: t.amount ? parseFloat(t.amount) : undefined,
          invoice_trigger_date: t.invoice_trigger_date || undefined,
          due_date: t.due_date || undefined,
          status: t.status || "pending",
          notes: [t.notes, t.trigger_condition ? `Trigger: ${t.trigger_condition}` : "", t.source_section ? `Source: ${t.source_section}` : ""].filter(Boolean).join(" | ") || undefined,
          extracted_from_pdf: true,
        });
        saved++;
      } catch (err) {
        toast.error(`Failed to save tranche "${t.tranche_name}": ${err.message}`);
      }
    }

    // Audit log (non-critical)
    try {
      await api.entities.AuditLog.create({
        action_type: "tranche_extraction",
        entity_type: "Grant",
        entity_id: grantId,
        description: `Extracted ${saved} tranches from PDF "${selectedPdf?.name}". ${toSave.length - saved > 0 ? `${toSave.length - saved} failed.` : ""}`,
        status: saved === toSave.length ? "success" : "warning",
      });
    } catch {}

    setSaving(false);
    if (saved > 0) {
      toast.success(`${saved} tranche${saved !== 1 ? "s" : ""} saved successfully.`);
      onSaved();
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            {step === "select" && "Select PDF to Extract Tranches"}
            {step === "extracting" && "Extracting Tranches from PDF..."}
            {step === "review" && "Review Extracted Tranches"}
          </DialogTitle>
        </DialogHeader>

        {/* Step: Select PDF */}
        {step === "select" && (
          <PdfSelector grantId={grantId} grantPdfUrl={grantPdfUrl} onSelect={handleSelectPdf} />
        )}

        {/* Step: Extracting */}
        {step === "extracting" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <div>
              <p className="font-medium">Analyzing PDF for payment schedules...</p>
              <p className="text-sm text-muted-foreground mt-1">Searching for tranche, disbursement, and payment tables in <strong>{selectedPdf?.name}</strong></p>
              <p className="text-xs text-muted-foreground mt-1">This may take 20–40 seconds.</p>
            </div>
          </div>
        )}

        {/* Step: Review */}
        {step === "review" && (
          <div className="space-y-4">
            {/* Extraction notes */}
            {extractionNotes && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p>{extractionNotes}</p>
                  {totalContractValue && <p className="mt-1 font-medium">Total contract value: {extractedTranches[0]?.currency || "USD"} {Number(totalContractValue).toLocaleString()}</p>}
                </div>
              </div>
            )}

            {extractedTranches.length === 0 ? (
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">No tranches found in this PDF.</p>
                  <p className="text-xs mt-1">{extractionNotes || "The PDF may not contain a structured payment schedule. Please use manual entry."}</p>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => setStep("select")}>Try Another PDF</Button>
                    <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    <strong>{extractedTranches.length}</strong> tranche{extractedTranches.length !== 1 ? "s" : ""} found · <strong>{selectedKeys.size}</strong> selected
                    {extractedTranches.some(t => t._is_duplicate) && <span className="text-amber-600 ml-2">· {extractedTranches.filter(t => t._is_duplicate).length} possible duplicate(s)</span>}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => setSelectedKeys(new Set(extractedTranches.map(t => t._key)))}>Select All</Button>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => setSelectedKeys(new Set())}>Deselect All</Button>
                  </div>
                </div>

                <div className="max-h-[50vh] overflow-y-auto pr-1">
                  {extractedTranches.map(t => (
                    <TrancheRow
                      key={t._key}
                      tranche={t}
                      selected={selectedKeys.has(t._key)}
                      onToggle={() => handleToggle(t._key)}
                      onChange={updated => handleChange(t._key, updated)}
                    />
                  ))}
                </div>

                <div className="flex justify-between items-center pt-2 border-t">
                  <Button variant="outline" size="sm" onClick={() => setStep("select")}>Try Another PDF</Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving || selectedKeys.size === 0}>
                      {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : <><CheckCircle2 className="w-4 h-4 mr-2" />Save {selectedKeys.size} Tranche{selectedKeys.size !== 1 ? "s" : ""}</>}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}