import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, FileSearch, Loader2, Trash2, Plus, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

const CONTACT_TYPES = ["Signatory", "Notice Contact", "Finance Contact", "Reporting Contact", "Grant Manager", "Project Manager", "Legal Contact", "Organization Contact", "Other"];

// Step 1: PDF selection modal
function PdfSelectStep({ grantId, grantPdfUrl, onSelect, onClose }) {
  const [pdfs, setPdfs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPdfs = async () => {
      const sources = [];
      if (grantPdfUrl) {
        sources.push({ file_url: grantPdfUrl, file_name: "Grant Agreement PDF", source: "grant.pdf_url", uploaded_date: null, validation_status: "Linked" });
      }
      try {
        const logs = await api.entities.DocumentUploadLog.filter({ entity_id: grantId, entity_type: "Grant" });
        logs.forEach(l => {
          if (l.file_url && !sources.find(s => s.file_url === l.file_url)) {
            sources.push({ file_url: l.file_url, file_name: l.file_name, source: "DocumentUploadLog", uploaded_date: l.created_date, uploaded_by: l.uploaded_by, validation_status: "Uploaded" });
          }
        });
      } catch {}
      try {
        const vlogs = await api.entities.DocumentValidationLog.filter({ linked_entity_id: grantId });
        vlogs.forEach(l => {
          if (l.file_url && !l.is_deleted && !sources.find(s => s.file_url === l.file_url)) {
            sources.push({ file_url: l.file_url, file_name: l.file_name, source: "DocumentValidationLog", uploaded_date: l.created_date, uploaded_by: l.uploaded_by, validation_status: l.validation_status || "Unknown", doc_type: l.detected_document_type });
          }
        });
      } catch {}
      setPdfs(sources);
      setLoading(false);
    };
    fetchPdfs();
  }, [grantId, grantPdfUrl]);

  if (loading) return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent><div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></DialogContent>
    </Dialog>
  );

  if (pdfs.length === 0) return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Extract Contacts from PDF</DialogTitle></DialogHeader>
        <div className="py-6 text-center text-muted-foreground">
          <FileSearch className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No PDF is linked to this Grant.</p>
          <p className="text-sm mt-1">Please upload a grant agreement PDF first.</p>
        </div>
        <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
      </DialogContent>
    </Dialog>
  );

  if (pdfs.length === 1) {
    // Auto-select if only one
    onSelect(pdfs[0]);
    return null;
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Select PDF to Extract Contacts From</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {pdfs.map((pdf, i) => (
            <div key={i} className="border rounded-lg p-3 hover:bg-muted/40 cursor-pointer flex items-start justify-between gap-3" onClick={() => onSelect(pdf)}>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{pdf.file_name}</p>
                <div className="flex gap-2 flex-wrap mt-1">
                  {pdf.doc_type && <Badge variant="outline" className="text-xs">{pdf.doc_type}</Badge>}
                  <Badge className={pdf.validation_status === "Valid" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"} variant="outline">{pdf.validation_status}</Badge>
                  {pdf.uploaded_date && <span className="text-xs text-muted-foreground">{format(new Date(pdf.uploaded_date), "MMM d, yyyy")}</span>}
                  {pdf.uploaded_by && <span className="text-xs text-muted-foreground">by {pdf.uploaded_by}</span>}
                </div>
              </div>
              <Button size="sm" variant="outline">Select</Button>
            </div>
          ))}
        </div>
        <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Cancel</Button></div>
      </DialogContent>
    </Dialog>
  );
}

// Step 2: Review extracted contacts
function ReviewStep({ contacts, onSave, onBack, onClose }) {
  const [rows, setRows] = useState(
    contacts.map((c, i) => ({ ...c, _id: i, _selected: !c.possible_duplicate }))
  );
  const [saving, setSaving] = useState(false);

  const setField = (id, field, val) => setRows(r => r.map(row => row._id === id ? { ...row, [field]: val } : row));
  const toggleSelect = (id) => setRows(r => r.map(row => row._id === id ? { ...row, _selected: !row._selected } : row));
  const deleteRow = (id) => setRows(r => r.filter(row => row._id !== id));
  const addRow = () => setRows(r => [...r, { _id: Date.now(), _selected: true, name: "", email: "", phone: "", role_title: "", organization: "", contact_type: "", address: "", source_section: "Manual", confidence: 1 }]);

  const selected = rows.filter(r => r._selected);

  const handleSave = async () => {
    setSaving(true);
    const toSave = selected.map(({ _id, _selected, possible_duplicate, ...rest }) => rest);
    await onSave(toSave);
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Review Extracted Contacts ({contacts.length} found)</DialogTitle>
        </DialogHeader>
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="p-2 w-8"></th>
                <th className="p-2">Name</th>
                <th className="p-2">Email</th>
                <th className="p-2">Phone</th>
                <th className="p-2">Role / Title</th>
                <th className="p-2">Organization</th>
                <th className="p-2">Type</th>
                <th className="p-2">Source</th>
                <th className="p-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row._id} className={`border-t ${row.possible_duplicate ? "bg-amber-50" : ""}`}>
                  <td className="p-2">
                    <Checkbox checked={row._selected} onCheckedChange={() => toggleSelect(row._id)} />
                  </td>
                  <td className="p-2">
                    <Input className="h-7 text-xs" value={row.name || ""} onChange={e => setField(row._id, "name", e.target.value)} />
                    {row.possible_duplicate && <span className="text-amber-600 text-xs flex items-center gap-1 mt-0.5"><AlertTriangle className="w-3 h-3" />Possible duplicate</span>}
                  </td>
                  <td className="p-2"><Input className="h-7 text-xs" value={row.email || ""} onChange={e => setField(row._id, "email", e.target.value)} /></td>
                  <td className="p-2"><Input className="h-7 text-xs" value={row.phone || ""} onChange={e => setField(row._id, "phone", e.target.value)} /></td>
                  <td className="p-2"><Input className="h-7 text-xs" value={row.role_title || ""} onChange={e => setField(row._id, "role_title", e.target.value)} /></td>
                  <td className="p-2"><Input className="h-7 text-xs" value={row.organization || ""} onChange={e => setField(row._id, "organization", e.target.value)} /></td>
                  <td className="p-2 min-w-[140px]">
                    <Select value={row.contact_type || ""} onValueChange={v => setField(row._id, "contact_type", v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Type..." /></SelectTrigger>
                      <SelectContent>{CONTACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="p-2 text-muted-foreground max-w-[120px] truncate">{row.source_section || "—"}</td>
                  <td className="p-2">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteRow(row._id)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between pt-3 border-t gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={addRow} className="gap-1 text-xs"><Plus className="w-3 h-3" />Add Row</Button>
            <span className="text-xs text-muted-foreground">{selected.length} of {rows.length} selected</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onBack}>Back</Button>
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || selected.length === 0} className="gap-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save {selected.length} Contact{selected.length !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ContactExtractModal({ grantId, grantPdfUrl, existingContacts, onClose, onSaved }) {
  const [step, setStep] = useState("select"); // select | extracting | review
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [extracted, setExtracted] = useState([]);
  const [extractionNotes, setExtractionNotes] = useState("");
  const [error, setError] = useState(null);

  const handlePdfSelect = async (pdf) => {
    setSelectedPdf(pdf);
    setStep("extracting");
    setError(null);
    try {
      const res = await api.functions.invoke("extractGrantContacts", {
        pdf_url: pdf.file_url,
        parent_id: grantId,
        existing_contacts: existingContacts
      });
      const data = res.data;
      if (data.error) { setError(data.error); setStep("select"); return; }
      setExtracted(data.contacts || []);
      setExtractionNotes(data.extraction_notes || "");
      if ((data.contacts || []).length === 0) {
        setError(data.extraction_notes || "No contacts were detected in this PDF.");
        setStep("select");
        return;
      }
      setStep("review");
    } catch (e) {
      setError(e.message || "Extraction failed. Please try again.");
      setStep("select");
    }
  };

  const handleSave = async (contacts) => {
    // Map extracted fields to the format Grant.contacts uses (name, email, phone, role, organization)
    const mapped = contacts.map(c => ({
      name: c.name || "",
      email: c.email || "",
      phone: c.phone || "",
      role: c.role_title || "",
      organization: c.organization || "",
      contact_type: c.contact_type || "",
      address: c.address || "",
      source_section: c.source_section || "",
      notes: c.notes || "",
      extracted_from_pdf: true
    }));

    const updatedContacts = [...existingContacts, ...mapped];
    await api.entities.Grant.update(grantId, { contacts: updatedContacts });

    // Audit log
    try {
      await api.entities.AuditLog.create({
        action_type: "contacts_saved_from_pdf",
        entity_type: "Grant",
        entity_id: grantId,
        description: `Saved ${mapped.length} contacts extracted from PDF: ${selectedPdf?.file_name}`,
        status: "success"
      });
    } catch {}

    onSaved();
  };

  if (step === "extracting") return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Extracting contacts from PDF...</p>
          <p className="text-sm text-muted-foreground text-center max-w-xs">Reading the full document including notices, signature blocks, and contact sections.</p>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (step === "select" && error) return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Extraction Result</DialogTitle></DialogHeader>
        <div className="py-4 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 mx-auto text-amber-500" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setError(null); setStep("select"); }}>Try Another PDF</Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (step === "review") return (
    <ReviewStep
      contacts={extracted}
      onSave={handleSave}
      onBack={() => { setStep("select"); setExtracted([]); }}
      onClose={onClose}
    />
  );

  return (
    <PdfSelectStep
      grantId={grantId}
      grantPdfUrl={grantPdfUrl}
      onSelect={handlePdfSelect}
      onClose={onClose}
    />
  );
}