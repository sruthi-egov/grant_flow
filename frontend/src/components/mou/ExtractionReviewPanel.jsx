/**
 * ExtractionReviewPanel
 * Shows the AI-extracted MoU data before the user saves.
 * Highlights missing fields clearly. Allows quick inline edits.
 * Does NOT re-run extraction on save.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Edit2, Save, Loader2, ExternalLink } from "lucide-react";
import RateCardTableEditor from "@/components/shared/RateCardTableEditor";

const FIELD_LABELS = {
  title:                         "MoU Title",
  partner_name:                  "Partner Organisation",
  partner_type:                  "Partner Type",
  partner_contact_name:          "Partner Contact",
  partner_signatory_name:        "Partner Signatory",
  partner_signatory_designation: "Partner Designation",
  our_contact_name:              "Our Contact",
  our_signatory_name:            "Our Signatory",
  our_signatory_designation:     "Our Designation",
  effective_date:                "Effective Date",
  end_date:                      "End Date",
  initial_term_years:            "Term (years)",
  governing_law:                 "Governing Law",
  purpose:                       "Purpose",
  scope_of_collaboration:        "Scope of Collaboration",
};

export default function ExtractionReviewPanel({ mouFields, extractionResult, pdfUrl, onSave, onEdit, saving }) {
  const [fields, setFields]     = useState({ ...mouFields });
  const [rateTables, setRateTables] = useState(mouFields?.rate_cards || []);
  const [editingKey, setEditing]= useState(null);
  const [editVal, setEditVal]   = useState("");

  const missing = extractionResult?.missing_fields || [];
  const confidence = extractionResult?.confidence_score || 0;
  const parties = extractionResult?.parties || [];
  const dpi = extractionResult?.dpi_centre_reference || {};

  const extractionStatus = confidence >= 70 ? "Extraction Complete"
    : confidence >= 20 ? "Extraction Partial"
    : "Extraction Failed";

  const startEdit = (key, val) => { setEditing(key); setEditVal(String(val ?? "")); };
  const commitEdit = () => {
    if (editingKey) setFields(f => ({ ...f, [editingKey]: editVal }));
    setEditing(null);
  };

  const handleSave = () => onSave({ ...fields, rate_cards: rateTables });

  const getStatus = (key) => {
    const val = fields[key];
    if (!val || String(val).trim() === "") return "missing";
    if (missing.includes(key)) return "partial";
    return "ok";
  };

  const statusIcon = (key) => {
    const s = getStatus(key);
    if (s === "ok") return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />;
    if (s === "partial") return <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />;
    return <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />;
  };

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={confidence >= 70 ? "default" : confidence >= 20 ? "secondary" : "destructive"}>
            {extractionStatus}
          </Badge>
          <span className="text-xs text-muted-foreground">{confidence}% confidence</span>
          {missing.length > 0 && (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              {missing.length} field{missing.length !== 1 ? "s" : ""} missing
            </Badge>
          )}
        </div>
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="w-3 h-3" /> View PDF
          </a>
        )}
      </div>

      {/* Parties summary from rich extraction */}
      {parties.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Parties Identified</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {parties.map((p, i) => (
              <div key={i} className="bg-background rounded-md border p-2.5 text-xs space-y-0.5">
                <p className="font-medium">{p.organization || p.party_name || `Party ${i + 1}`}</p>
                {p.role && <p className="text-muted-foreground">Role: {p.role}</p>}
                {p.representative_name && <p className="text-muted-foreground">Rep: {p.representative_name}</p>}
                {p.designation && <p className="text-muted-foreground">Title: {p.designation}</p>}
                {p.signature_present && <Badge variant="outline" className="text-green-600 border-green-300 text-xs">Signature present</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DPI Centre reference */}
      {dpi.is_present && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs">
          <p className="font-semibold text-blue-800 mb-0.5">DPI Centre Reference Found</p>
          {dpi.matched_text && <p className="text-blue-700">Matched: "{dpi.matched_text}"</p>}
          {dpi.role && <p className="text-blue-700">Role: {dpi.role}</p>}
        </div>
      )}

      {/* Field grid — editable */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.entries(FIELD_LABELS).map(([key, label]) => {
          const val = fields[key];
          const isEditing = editingKey === key;
          const isEmpty = !val || String(val).trim() === "";

          // For term: fall back to _term_text if years not parsed
          const displayVal = (isEmpty && key === "initial_term_years" && fields._term_text)
            ? fields._term_text
            : val;
          const isDisplayEmpty = !displayVal || String(displayVal).trim() === "";

          return (
            <div key={key} className={`rounded-md border p-2.5 text-xs ${isDisplayEmpty ? "border-red-200 bg-red-50/40" : "border-border bg-background"}`}>
              <div className="flex items-center gap-1 mb-1">
                {isDisplayEmpty ? <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                <span className="font-medium text-muted-foreground">{label}</span>
              </div>
              {isEditing ? (
                <div className="flex gap-1 mt-1">
                  <Input
                    className="h-6 text-xs"
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && commitEdit()}
                    autoFocus
                  />
                  <Button size="icon" className="h-6 w-6" onClick={commitEdit}><Save className="w-3 h-3" /></Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <span className={isDisplayEmpty ? "text-red-400 italic" : "text-foreground"}>
                    {isDisplayEmpty ? "Not extracted" : String(displayVal)}
                  </span>
                  <button onClick={() => startEdit(key, val)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Purpose / scope — full width */}
      {(fields.purpose || fields.scope_of_collaboration) && (
        <div className="space-y-2">
          {fields.purpose && (
            <div className="rounded-md border p-3 text-xs">
              <p className="font-semibold text-muted-foreground mb-1">Purpose</p>
              <p className="text-foreground">{fields.purpose}</p>
            </div>
          )}
          {fields.scope_of_collaboration && (
            <div className="rounded-md border p-3 text-xs">
              <p className="font-semibold text-muted-foreground mb-1">Scope of Collaboration</p>
              <p className="text-foreground">{fields.scope_of_collaboration}</p>
            </div>
          )}
        </div>
      )}

      {/* Missing fields list */}
      {missing.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
          <p className="font-semibold text-amber-800 mb-1">Fields not extracted ({missing.length})</p>
          <p className="text-amber-700">
            {missing.join(" · ")}
          </p>
          <p className="text-amber-600 mt-1">You can fill these in manually. Click the edit icon on any field above, or use the Manual Entry tab.</p>
        </div>
      )}

      {/* Rate Cards / Commercial Tables */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase">Rate Cards / Commercial Tables</p>
        <RateCardTableEditor
          rateTables={rateTables}
          onChange={setRateTables}
          readOnly={false}
        />
      </div>

      {/* Extraction notes */}
      {extractionResult?.extraction_notes && (
        <p className="text-xs text-muted-foreground border rounded p-2">{extractionResult.extraction_notes}</p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : "Save MoU"}
        </Button>
        <Button variant="outline" onClick={onEdit}>
          Edit Before Save
        </Button>
      </div>
    </div>
  );
}