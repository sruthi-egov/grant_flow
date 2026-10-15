import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Search, Loader2, FileText, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import ExtractionProgressModal from "./ExtractionProgressModal";

const CLAUSE_TYPES = ["All", "Commercial", "Legal", "Operational", "Compliance", "Risk", "Other"];

const riskColors = {
  High: "bg-red-100 text-red-700 border-red-200",
  Medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Low: "bg-green-100 text-green-700 border-green-200",
};

const typeColors = {
  Commercial: "bg-blue-100 text-blue-700",
  Legal: "bg-purple-100 text-purple-700",
  Operational: "bg-orange-100 text-orange-700",
  Compliance: "bg-teal-100 text-teal-700",
  Risk: "bg-red-100 text-red-700",
  Other: "bg-gray-100 text-gray-700",
};

function ClauseModal({ clause, msaId, onClose, onSaved }) {
  const [form, setForm] = useState({
    clause_title: "",
    clause_type: "Legal",
    clause_number: "",
    summary: "",
    full_text: "",
    risk_level: "Medium",
    obligation_owner: "",
    notice_period_days: "",
    amount_or_cap: "",
    source_section: "",
    notes: "",
    ...clause,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.clause_title) return;
    setSaving(true);
    const data = { ...form, msa_id: msaId, extracted_from_pdf: clause?.extracted_from_pdf || false };
    if (clause?.id) await base44.entities.MsaKeyClause.update(clause.id, data);
    else await base44.entities.MsaKeyClause.create(data);
    setSaving(false);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{clause?.id ? "Edit" : "Add"} Key Clause</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Clause Title *</Label><Input value={form.clause_title} onChange={e => set("clause_title", e.target.value)} /></div>
            <div>
              <Label>Clause Type</Label>
              <Select value={form.clause_type} onValueChange={v => set("clause_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["Commercial","Legal","Operational","Compliance","Risk","Other"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Risk Level</Label>
              <Select value={form.risk_level} onValueChange={v => set("risk_level", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["Low","Medium","High"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Clause Number</Label><Input placeholder="e.g. Clause 5.2" value={form.clause_number || ""} onChange={e => set("clause_number", e.target.value)} /></div>
            <div><Label>Obligation Owner</Label><Input placeholder="Vendor / Client / Both" value={form.obligation_owner || ""} onChange={e => set("obligation_owner", e.target.value)} /></div>
            <div><Label>Notice Period (days)</Label><Input value={form.notice_period_days || ""} onChange={e => set("notice_period_days", e.target.value)} /></div>
            <div><Label>Amount / Cap</Label><Input value={form.amount_or_cap || ""} onChange={e => set("amount_or_cap", e.target.value)} /></div>
            <div className="col-span-2"><Label>Source Section</Label><Input placeholder="e.g. Section 7 – Payment Terms" value={form.source_section || ""} onChange={e => set("source_section", e.target.value)} /></div>
          </div>
          <div><Label>Summary *</Label><Textarea rows={3} value={form.summary || ""} onChange={e => set("summary", e.target.value)} /></div>
          <div><Label>Full Text (from agreement)</Label><Textarea rows={5} value={form.full_text || ""} onChange={e => set("full_text", e.target.value)} /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes || ""} onChange={e => set("notes", e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.clause_title}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClauseCard({ clause, isAdmin, onEdit, onDelete }) {
  const [showFull, setShowFull] = useState(false);

  return (
    <Card className="border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <p className="font-semibold text-sm">{clause.clause_title || clause.clause_name}</p>
              {clause.clause_number && <span className="text-xs text-muted-foreground font-mono">({clause.clause_number || clause.clause_reference})</span>}
              {clause.clause_type && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[clause.clause_type] || "bg-gray-100 text-gray-700"}`}>{clause.clause_type}</span>
              )}
              {clause.risk_level && (
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${riskColors[clause.risk_level] || "bg-gray-100 text-gray-700"}`}>
                  {clause.risk_level === "High" && <AlertTriangle className="w-3 h-3 inline mr-0.5" />}
                  {clause.risk_level} Risk
                </span>
              )}
              {clause.extracted_from_pdf && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">AI Extracted</span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs mb-2">
              {clause.obligation_owner && <div><span className="text-muted-foreground">Owner: </span><span className="font-medium">{clause.obligation_owner}</span></div>}
              {clause.notice_period_days && <div><span className="text-muted-foreground">Notice: </span><span className="font-medium">{clause.notice_period_days} days</span></div>}
              {clause.amount_or_cap && <div><span className="text-muted-foreground">Cap/Amount: </span><span className="font-medium">{clause.amount_or_cap}</span></div>}
              {clause.source_section && <div className="col-span-2"><span className="text-muted-foreground">Source: </span><span className="font-medium">{clause.source_section}</span></div>}
            </div>

            {clause.summary && <p className="text-sm text-muted-foreground">{clause.summary}</p>}

            {clause.full_text && (
              <div className="mt-2">
                <button onClick={() => setShowFull(v => !v)} className="text-xs text-primary flex items-center gap-1 hover:underline">
                  {showFull ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showFull ? "Hide Full Text" : "View Full Text"}
                </button>
                {showFull && (
                  <div className="mt-2 p-3 bg-muted/40 rounded-md text-xs text-muted-foreground whitespace-pre-line border">
                    {clause.full_text}
                  </div>
                )}
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" onClick={() => onEdit(clause)}><Pencil className="w-3 h-3" /></Button>
              <Button variant="ghost" size="icon" onClick={() => onDelete(clause.id)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ExtractionReviewModal({ extracted, existingClauses, msaId, onClose, onSaved }) {
  const [selected, setSelected] = useState(() =>
    extracted.map((c, i) => {
      const isDup = existingClauses.some(e =>
        (e.clause_title || e.clause_name || "").toLowerCase() === (c.clause_title || "").toLowerCase()
      );
      return { ...c, _selected: !isDup, _isDup: isDup, _idx: i };
    })
  );
  const [saving, setSaving] = useState(false);

  const toggle = (idx) => setSelected(s => s.map(c => c._idx === idx ? { ...c, _selected: !c._selected } : c));

  const handleSave = async () => {
    setSaving(true);
    const toSave = selected.filter(c => c._selected);
    for (const clause of toSave) {
      const { _selected, _isDup, _idx, ...data } = clause;
      await base44.entities.MsaKeyClause.create({ ...data, msa_id: msaId, extracted_from_pdf: true });
    }
    setSaving(false);
    onSaved();
  };

  const selectedCount = selected.filter(c => c._selected).length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Extracted Key Clauses ({extracted.length} found)</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-3">Uncheck any clauses you don't want to save. Possible duplicates are pre-unchecked.</p>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {selected.map(clause => (
            <div key={clause._idx} className={`flex items-start gap-3 p-3 rounded-lg border ${clause._isDup ? "bg-yellow-50 border-yellow-200" : "bg-background"}`}>
              <Checkbox checked={clause._selected} onCheckedChange={() => toggle(clause._idx)} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-medium text-sm">{clause.clause_title}</span>
                  {clause.clause_number && <span className="text-xs text-muted-foreground font-mono">({clause.clause_number})</span>}
                  {clause.clause_type && <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[clause.clause_type] || "bg-gray-100 text-gray-700"}`}>{clause.clause_type}</span>}
                  {clause.risk_level && <span className={`text-xs px-2 py-0.5 rounded-full border ${riskColors[clause.risk_level] || ""}`}>{clause.risk_level} Risk</span>}
                  {clause._isDup && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-300">⚠ Possible Duplicate</span>}
                </div>
                {clause.summary && <p className="text-xs text-muted-foreground">{clause.summary}</p>}
                {clause.source_section && <p className="text-xs text-muted-foreground mt-0.5">Source: {clause.source_section}</p>}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center pt-3 border-t">
          <p className="text-sm text-muted-foreground">{selectedCount} of {extracted.length} selected</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || selectedCount === 0}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Save {selectedCount} Clause{selectedCount !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function KeyClausesTab({ msaId, isAdmin, msaPdfUrl }) {
  const [clauses, setClauses] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [extracting, setExtracting] = useState(false);
  const [extractedClauses, setExtractedClauses] = useState(null);
  const [extractError, setExtractError] = useState("");
  const [progressStep, setProgressStep] = useState("find_pdf");
  const [progressStatus, setProgressStatus] = useState("idle"); // idle | running | error

  const fetchData = async () => {
    const data = await base44.entities.MsaKeyClause.filter({ msa_id: msaId });
    setClauses(data);
  };

  useEffect(() => { fetchData(); }, [msaId]);

  const handleDelete = async (id) => {
    await base44.entities.MsaKeyClause.delete(id);
    fetchData();
  };

  const runExtraction = async () => {
    if (!msaPdfUrl) {
      setExtractError("No uploaded agreement is linked to this MSA. Please upload an agreement first.");
      return;
    }
    setExtracting(true);
    setExtractError("");
    setProgressStatus("running");
    setProgressStep("find_pdf");

    // Simulate step progression while the API runs
    const stepTimer1 = setTimeout(() => setProgressStep("reading"), 1500);
    const stepTimer2 = setTimeout(() => setProgressStep("extracting"), 4000);

    try {
      const res = await base44.functions.invoke("extractMsaServicesAndKeyClauses", {
        pdf_url: msaPdfUrl,
        msa_id: msaId,
        extract_type: "key_clauses"
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      const data = res.data;
      if (data?.success === false || data?.error) {
        setProgressStatus("error");
        setExtractError(data?.message || data?.error || "Extraction failed.");
      } else if (data?.key_clauses?.length > 0) {
        setProgressStep("preparing");
        setTimeout(() => {
          setProgressStatus("idle");
          setExtracting(false);
          setExtractedClauses(data.key_clauses);
        }, 600);
        return;
      } else {
        setProgressStatus("error");
        setExtractError(
          data?.extraction_notes ||
          "No key clauses were detected in the document. Try adding clauses manually."
        );
      }
    } catch (err) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setProgressStatus("error");
      setExtractError("Extraction request failed. Please retry.");
    }
    setExtracting(false);
  };

  const handleExtract = () => runExtraction();
  const handleCloseProgress = () => {
    setProgressStatus("idle");
    setExtracting(false);
  };

  const filtered = clauses.filter(c => {
    const matchType = typeFilter === "All" || c.clause_type === typeFilter;
    const term = search.toLowerCase();
    const matchSearch = !term || (c.clause_title || c.clause_name || "").toLowerCase().includes(term) || (c.summary || "").toLowerCase().includes(term);
    return matchType && matchSearch;
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input className="pl-8 h-9 w-52" placeholder="Search clauses…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1 flex-wrap">
            {CLAUSE_TYPES.map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${typeFilter === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <Button size="sm" variant="outline" onClick={handleExtract} disabled={extracting} className="gap-1">
                {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {clauses.length > 0 ? "Re-extract from PDF" : "Extract from PDF"}
              </Button>
              <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1">
                <Plus className="w-4 h-4" /> Add Clause
              </Button>
            </>
          )}
        </div>
      </div>

      {extractError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {extractError}
        </div>
      )}

      {clauses.length === 0 && !extracting && (
        <div className="text-center py-14 text-muted-foreground border-2 border-dashed rounded-lg">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium mb-1 text-foreground">No key clauses extracted yet.</p>
          <p className="text-xs max-w-xs mx-auto mb-4">
            Extract key commercial, legal, operational, compliance, and risk clauses from the uploaded agreement.
          </p>
          {isAdmin && msaPdfUrl && (
            <Button size="sm" onClick={handleExtract} className="gap-1">
              <FileText className="w-4 h-4" /> Extract from Uploaded Agreement
            </Button>
          )}
          {isAdmin && !msaPdfUrl && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 inline-block">
              Upload an MSA agreement PDF first, then extract key clauses.
            </p>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(c => (
            <ClauseCard
              key={c.id}
              clause={c}
              isAdmin={isAdmin}
              onEdit={setEditing}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {clauses.length > 0 && filtered.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">No clauses match your search/filter.</p>
      )}

      {(showAdd || editing) && (
        <ClauseModal
          clause={editing}
          msaId={msaId}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); fetchData(); }}
        />
      )}

      {extractedClauses && (
        <ExtractionReviewModal
          extracted={extractedClauses}
          existingClauses={clauses}
          msaId={msaId}
          onClose={() => setExtractedClauses(null)}
          onSaved={() => { setExtractedClauses(null); fetchData(); }}
        />
      )}

      <ExtractionProgressModal
        open={progressStatus !== "idle"}
        activeStep={progressStep}
        status={progressStatus}
        errorMessage={extractError}
        onClose={handleCloseProgress}
        onRetry={() => { setProgressStatus("idle"); setTimeout(runExtraction, 100); }}
      />
    </div>
  );
}