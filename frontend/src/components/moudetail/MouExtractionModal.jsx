import { useState } from "react";
import { api } from "@/api/apiClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FileText, AlertTriangle, CheckCircle2, Trash2, Plus, ScanLine } from "lucide-react";

const STEPS = { SELECT: "select", EXTRACTING: "extracting", REVIEW: "review", DONE: "done" };
const confColor = (c) => c >= 80 ? "bg-green-100 text-green-700" : c >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700";

const COMMITMENT_TYPES = ["Operational", "Legal", "Reporting", "Financial", "Confidentiality", "Governance", "Collaboration", "Other"];
const RESPONSIBLE_PARTIES = ["Both Parties", "eGov", "Partner", "Other"];
const MILESTONE_TYPES = ["Effective Date", "Term Expiry", "Reporting", "Strategic Target", "Termination", "Confidentiality", "Notice", "Other"];
const DELIVERABLE_CATS = ["Strategic", "Technical", "Reporting", "Governance", "Capacity Building", "Documentation", "Partnership", "Other"];
const CLAUSE_TYPES = ["Legal", "Commercial", "Operational", "Compliance", "Risk", "Other"];

const EXTRACT_OPTIONS = [
  { value: "all", label: "Extract All (Commitments, Deliverables, Milestones, Contacts, Key Clauses)" },
  { value: "commitments", label: "Commitments Only" },
  { value: "deliverables", label: "Deliverables Only" },
  { value: "milestones", label: "Milestones Only" },
  { value: "contacts", label: "Contacts Only" },
  { value: "key_clauses", label: "Key Clauses Only" },
];

const PROGRESS_STEPS = [
  "Finding linked PDF...",
  "Reading PDF pages...",
  "Running OCR / visual extraction...",
  "Extracting selected items...",
  "Running duplicate detection...",
  "Preparing review...",
];

export default function MouExtractionModal({ open, onClose, mouId, pdfUrl, pdfName, existingData = {}, onSaved }) {
  const [step, setStep] = useState(STEPS.SELECT);
  const [extractType, setExtractType] = useState("all");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [progressIdx, setProgressIdx] = useState(0);
  const [progressTimer, setProgressTimer] = useState(null);

  // Selection state for each type
  const [selCommitments, setSelCommitments] = useState({});
  const [selDeliverables, setSelDeliverables] = useState({});
  const [selMilestones, setSelMilestones] = useState({});
  const [selContacts, setSelContacts] = useState({});
  const [selClauses, setSelClauses] = useState({});

  // Editable arrays
  const [commitments, setCommitments] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [clauses, setClauses] = useState([]);

  const handleClose = () => {
    clearInterval(progressTimer);
    setStep(STEPS.SELECT);
    setError("");
    setResult(null);
    onClose();
  };

  const startProgressCycle = () => {
    let idx = 0;
    setProgressIdx(0);
    const t = setInterval(() => {
      idx = Math.min(idx + 1, PROGRESS_STEPS.length - 1);
      setProgressIdx(idx);
    }, 3500);
    setProgressTimer(t);
    return t;
  };

  const handleExtract = async () => {
    setStep(STEPS.EXTRACTING);
    setError("");
    const t = startProgressCycle();

    try {
      const res = await api.functions.invoke("extractMouAll", {
        pdf_url: pdfUrl,
        mou_id: mouId,
        extract_type: extractType,
        existing_items: existingData,
      });
      clearInterval(t);
      const data = res?.data || res;
      if (!data?.success) throw new Error(data?.error || "Extraction failed.");

      // Enrich with _key
      const withKey = (arr, prefix) => (arr || []).map((x, i) => ({ ...x, _key: `${prefix}_${i}` }));
      const cs = withKey(data.commitments, "c");
      const ds = withKey(data.deliverables, "d");
      const ms = withKey(data.milestones, "m");
      const cts = withKey(data.contacts, "ct");
      const kcs = withKey(data.key_clauses, "kc");

      setCommitments(cs);
      setDeliverables(ds);
      setMilestones(ms);
      setContacts(cts);
      setClauses(kcs);

      const makeSel = (arr) => Object.fromEntries(arr.map(x => [x._key, !x._is_duplicate]));
      setSelCommitments(makeSel(cs));
      setSelDeliverables(makeSel(ds));
      setSelMilestones(makeSel(ms));
      setSelContacts(makeSel(cts));
      setSelClauses(makeSel(kcs));

      setResult(data);
      setStep(STEPS.REVIEW);
    } catch (e) {
      clearInterval(t);
      setError(e.message || "Extraction failed.");
      setStep(STEPS.SELECT);
    }
  };

  const updateItem = (setter, key, field, value) =>
    setter(prev => prev.map(x => x._key === key ? { ...x, [field]: value } : x));
  const removeItem = (setter, selSetter, key) => {
    setter(prev => prev.filter(x => x._key !== key));
    selSetter(prev => { const n = { ...prev }; delete n[key]; return n; });
  };
  const addBlank = (setter, selSetter, prefix, defaults) => {
    const key = `${prefix}_new_${Date.now()}`;
    setter(prev => [...prev, { _key: key, ...defaults }]);
    selSetter(prev => ({ ...prev, [key]: true }));
  };

  const totalSelected =
    Object.values(selCommitments).filter(Boolean).length +
    Object.values(selDeliverables).filter(Boolean).length +
    Object.values(selMilestones).filter(Boolean).length +
    Object.values(selContacts).filter(Boolean).length +
    Object.values(selClauses).filter(Boolean).length;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    const cleanDate = (d) => d?.trim() || undefined;
    let savedCount = 0;
    const errors = [];

    // Save commitments
    for (const c of commitments.filter(x => selCommitments[x._key] && x.title?.trim())) {
      try {
        await api.entities.MouCommitment.create({
          mou_id: mouId,
          name: c.title,
          description: c.description || "",
          commitment_type: c.commitment_type || "Operational",
          responsible_party: c.responsible_party || "Both Parties",
          source_section: c.source_section || "",
          source_clause: c.source_clause || "",
          source_page: c.source_page || "",
          extraction_confidence: c.confidence || 0,
          extracted_from_pdf: true,
          source_document_id: pdfUrl,
          notes: c.notes || "",
          status: "pending",
        });
        savedCount++;
      } catch (e) { errors.push(`Commitment: ${e.message}`); }
    }

    // Save deliverables (reuse GrantDeliverable with grant_id = mouId)
    for (const d of deliverables.filter(x => selDeliverables[x._key] && x.title?.trim())) {
      try {
        await api.entities.GrantDeliverable.create({
          grant_id: mouId,
          name: d.title,
          description: d.description || "",
          category: d.category || "Other",
          due_date: cleanDate(d.target_date || d.due_date),
          source_section: d.source_section || "",
          extraction_confidence: d.confidence || 0,
          extracted_from_pdf: true,
          source_document_id: pdfUrl,
          status: "pending",
        });
        savedCount++;
      } catch (e) { errors.push(`Deliverable: ${e.message}`); }
    }

    // Save milestones (reuse Milestone with grant_id = mouId)
    for (const m of milestones.filter(x => selMilestones[x._key] && x.title?.trim())) {
      try {
        await api.entities.Milestone.create({
          grant_id: mouId,
          title: m.title,
          description: m.description || "",
          milestone_type: m.milestone_type || "Other",
          due_date: cleanDate(m.due_date),
          source_section: m.source_section || "",
          extraction_confidence: m.confidence || 0,
          extracted_from_pdf: true,
          source_document_id: pdfUrl,
          notes: m.frequency ? `Frequency: ${m.frequency}${m.target_value ? ` | Target: ${m.target_value}` : ""}` : (m.target_value || ""),
          status: "pending",
        });
        savedCount++;
      } catch (e) { errors.push(`Milestone: ${e.message}`); }
    }

    // Save contacts (into MOU.contacts array)
    const selectedContacts = contacts.filter(x => selContacts[x._key] && x.name?.trim());
    if (selectedContacts.length > 0) {
      try {
        const mouRecord = await api.entities.MOU.get(mouId);
        const existing = mouRecord?.contacts || [];
        const newContacts = selectedContacts.map(ct => ({
          name: ct.name,
          organization: ct.organization || "",
          role: ct.role || ct.designation || "",
          email: ct.email || "",
          phone: ct.phone || "",
          extracted_from_pdf: true,
        }));
        await api.entities.MOU.update(mouId, { contacts: [...existing, ...newContacts] });
        savedCount += selectedContacts.length;
      } catch (e) { errors.push(`Contacts: ${e.message}`); }
    }

    // Save key clauses (reuse MsaKeyClause with msa_id = mouId as proxy)
    for (const kc of clauses.filter(x => selClauses[x._key] && x.clause_title?.trim())) {
      try {
        await api.entities.MsaKeyClause.create({
          msa_id: mouId,
          clause_title: kc.clause_title,
          clause_number: kc.clause_number || "",
          clause_type: kc.clause_type || "Legal",
          summary: kc.summary || "",
          risk_level: kc.risk_level || "Medium",
          obligation_owner: kc.obligation_owner || "Both",
          source_section: kc.source_section || "",
          extraction_confidence: kc.confidence || 0,
          extracted_from_pdf: true,
          source_document_id: pdfUrl,
        });
        savedCount++;
      } catch (e) { errors.push(`Key Clause: ${e.message}`); }
    }

    setSaving(false);
    if (errors.length > 0 && savedCount === 0) {
      setError(errors[0]);
      return;
    }
    setStep(STEPS.DONE);
    onSaved({ savedCount });
  };

  const showCommitments = ["all", "commitments"].includes(extractType);
  const showDeliverables = ["all", "deliverables"].includes(extractType);
  const showMilestones = ["all", "milestones"].includes(extractType);
  const showContacts = ["all", "contacts"].includes(extractType);
  const showClauses = ["all", "key_clauses"].includes(extractType);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="w-5 h-5" /> Extract from MoU PDF
          </DialogTitle>
        </DialogHeader>

        {/* SELECT */}
        {step === STEPS.SELECT && (
          <div className="space-y-4">
            {pdfUrl ? (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
                <FileText className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{pdfName || "Uploaded MoU PDF"}</p>
                  <p className="text-xs text-muted-foreground truncate">{pdfUrl}</p>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                No uploaded MoU PDF is linked to this record. Please upload a MoU PDF first.
              </div>
            )}

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
              <ScanLine className="w-3 h-3 inline mr-1" />
              <strong>Scanned PDF support:</strong> This extraction uses AI visual reading. If the PDF is scanned or image-based, OCR/visual extraction will be used automatically.
            </div>

            <div>
              <p className="text-sm font-medium mb-2">What to extract:</p>
              <Select value={extractType} onValueChange={setExtractType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXTRACT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleExtract} disabled={!pdfUrl} className="gap-2">
                <ScanLine className="w-4 h-4" /> Start Extraction
              </Button>
            </div>
          </div>
        )}

        {/* EXTRACTING */}
        {step === STEPS.EXTRACTING && (
          <div className="py-10 space-y-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="font-medium text-sm">{PROGRESS_STEPS[progressIdx]}</p>
              <p className="text-xs text-muted-foreground">This may take 30–60 seconds for scanned PDFs...</p>
            </div>
            <div className="space-y-2 max-w-sm mx-auto">
              {PROGRESS_STEPS.map((s, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs ${i <= progressIdx ? "text-foreground" : "text-muted-foreground"}`}>
                  {i < progressIdx ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" /> :
                   i === progressIdx ? <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" /> :
                   <div className="w-3 h-3 rounded-full border shrink-0" />}
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* REVIEW */}
        {step === STEPS.REVIEW && (
          <div className="space-y-6">
            {result?.extraction_notes && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                {result?.scanned_pdf_detected && <ScanLine className="w-3 h-3 shrink-0 mt-0.5" />}
                <span>{result.extraction_notes}</span>
              </div>
            )}
            {(commitments.some(x => x._is_duplicate) || deliverables.some(x => x._is_duplicate) || milestones.some(x => x._is_duplicate)) && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Possible duplicates detected — pre-deselected. Review before saving.
              </div>
            )}

            {/* COMMITMENTS */}
            {showCommitments && (
              <ReviewSection
                title="Commitments" items={commitments} selected={selCommitments}
                onSelect={setSelCommitments} onUpdate={(k, f, v) => updateItem(setCommitments, k, f, v)}
                onRemove={(k) => removeItem(setCommitments, setSelCommitments, k)}
                onAdd={() => addBlank(setCommitments, setSelCommitments, "c", { title: "", commitment_type: "Operational", responsible_party: "Both Parties", confidence: 100 })}
                columns={[
                  { field: "title", label: "Title", minWidth: 200, input: "text" },
                  { field: "commitment_type", label: "Type", minWidth: 120, input: "select", options: COMMITMENT_TYPES },
                  { field: "responsible_party", label: "Responsible", minWidth: 120, input: "select", options: RESPONSIBLE_PARTIES },
                  { field: "source_section", label: "Section", minWidth: 120, input: "text" },
                  { field: "confidence", label: "Conf.", minWidth: 60, input: "badge" },
                ]}
              />
            )}

            {/* DELIVERABLES */}
            {showDeliverables && (
              <ReviewSection
                title="Deliverables" items={deliverables} selected={selDeliverables}
                onSelect={setSelDeliverables} onUpdate={(k, f, v) => updateItem(setDeliverables, k, f, v)}
                onRemove={(k) => removeItem(setDeliverables, setSelDeliverables, k)}
                onAdd={() => addBlank(setDeliverables, setSelDeliverables, "d", { title: "", category: "Other", confidence: 100 })}
                columns={[
                  { field: "title", label: "Title", minWidth: 200, input: "text" },
                  { field: "category", label: "Category", minWidth: 120, input: "select", options: DELIVERABLE_CATS },
                  { field: "responsible_party", label: "Responsible", minWidth: 120, input: "text" },
                  { field: "source_section", label: "Section", minWidth: 120, input: "text" },
                  { field: "confidence", label: "Conf.", minWidth: 60, input: "badge" },
                ]}
              />
            )}

            {/* MILESTONES */}
            {showMilestones && (
              <ReviewSection
                title="Milestones" items={milestones} selected={selMilestones}
                onSelect={setSelMilestones} onUpdate={(k, f, v) => updateItem(setMilestones, k, f, v)}
                onRemove={(k) => removeItem(setMilestones, setSelMilestones, k)}
                onAdd={() => addBlank(setMilestones, setSelMilestones, "m", { title: "", milestone_type: "Other", confidence: 100 })}
                columns={[
                  { field: "title", label: "Title", minWidth: 200, input: "text" },
                  { field: "milestone_type", label: "Type", minWidth: 130, input: "select", options: MILESTONE_TYPES },
                  { field: "due_date", label: "Due Date", minWidth: 110, input: "date" },
                  { field: "target_value", label: "Target", minWidth: 100, input: "text" },
                  { field: "source_section", label: "Section", minWidth: 120, input: "text" },
                  { field: "confidence", label: "Conf.", minWidth: 60, input: "badge" },
                ]}
              />
            )}

            {/* CONTACTS */}
            {showContacts && (
              <ReviewSection
                title="Contacts" items={contacts} selected={selContacts}
                onSelect={setSelContacts} onUpdate={(k, f, v) => updateItem(setContacts, k, f, v)}
                onRemove={(k) => removeItem(setContacts, setSelContacts, k)}
                onAdd={() => addBlank(setContacts, setSelContacts, "ct", { name: "", organization: "", role: "" })}
                columns={[
                  { field: "name", label: "Name", minWidth: 150, input: "text" },
                  { field: "organization", label: "Organization", minWidth: 150, input: "text" },
                  { field: "role", label: "Role / Designation", minWidth: 130, input: "text" },
                  { field: "email", label: "Email", minWidth: 160, input: "text" },
                  { field: "phone", label: "Phone", minWidth: 120, input: "text" },
                ]}
              />
            )}

            {/* KEY CLAUSES */}
            {showClauses && (
              <ReviewSection
                title="Key Clauses" items={clauses} selected={selClauses}
                onSelect={setSelClauses} onUpdate={(k, f, v) => updateItem(setClauses, k, f, v)}
                onRemove={(k) => removeItem(setClauses, setSelClauses, k)}
                onAdd={() => addBlank(setClauses, setSelClauses, "kc", { clause_title: "", clause_type: "Legal", confidence: 100 })}
                columns={[
                  { field: "clause_number", label: "#", minWidth: 50, input: "text" },
                  { field: "clause_title", label: "Title", minWidth: 180, input: "text" },
                  { field: "clause_type", label: "Type", minWidth: 110, input: "select", options: CLAUSE_TYPES },
                  { field: "summary", label: "Summary", minWidth: 220, input: "text" },
                  { field: "source_section", label: "Section", minWidth: 100, input: "text" },
                  { field: "confidence", label: "Conf.", minWidth: 60, input: "badge" },
                ]}
              />
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

        {/* DONE */}
        {step === STEPS.DONE && (
          <div className="flex flex-col items-center py-10 gap-4">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <p className="font-semibold text-lg">Saved Successfully</p>
            <p className="text-sm text-muted-foreground">Items have been added to the respective tabs.</p>
            <Button onClick={handleClose}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewSection({ title, items, selected, onSelect, onUpdate, onRemove, onAdd, columns }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">{title} ({items.length} found)</h3>
        <Button size="sm" variant="outline" onClick={onAdd} className="gap-1 text-xs h-7">
          <Plus className="w-3 h-3" /> Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3 text-center">No {title.toLowerCase()} were extracted. You can add manually.</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 w-8"></th>
                {columns.map(c => <th key={c.field} className="text-left p-2 font-medium" style={{ minWidth: c.minWidth }}>{c.label}</th>)}
                <th className="p-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item._key} className={`border-t ${item._is_duplicate ? "bg-yellow-50" : ""}`}>
                  <td className="p-2">
                    <Checkbox
                      checked={!!selected[item._key]}
                      onCheckedChange={v => onSelect(prev => ({ ...prev, [item._key]: !!v }))}
                    />
                  </td>
                  {columns.map(col => (
                    <td key={col.field} className="p-1">
                      {col.input === "badge" ? (
                        <Badge className={confColor(item[col.field] || 0)}>{item[col.field] || 0}%</Badge>
                      ) : col.input === "select" ? (
                        <Select value={item[col.field] || col.options[0]} onValueChange={v => onUpdate(item._key, col.field, v)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{col.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : col.input === "date" ? (
                        <Input type="date" value={item[col.field] || ""} onChange={e => onUpdate(item._key, col.field, e.target.value)} className="h-7 text-xs" />
                      ) : (
                        <div>
                          <Input value={item[col.field] || ""} onChange={e => onUpdate(item._key, col.field, e.target.value)} className="h-7 text-xs" />
                          {item._is_duplicate && col.field === columns[1]?.field && (
                            <Badge className="bg-yellow-100 text-yellow-700 text-xs mt-0.5">Possible Duplicate</Badge>
                          )}
                        </div>
                      )}
                    </td>
                  ))}
                  <td className="p-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemove(item._key)}>
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
  );
}