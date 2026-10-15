import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import RateCardTableEditor from "@/components/shared/RateCardTableEditor";

const FIELD_LABELS = {
  title:                       "SoW Title",
  vendor_name:                 "Vendor / Service Provider",
  vendor_email:                "Vendor Email",
  sow_number:                  "SoW / Work Order Number",
  start_date:                  "Start Date",
  end_date:                    "End Date",
  _duration_or_term:           "Term / Duration",
  _client_organisation:        "Client Organisation",
  _client_contact_name:        "Client Contact",
  _scope_of_work:              "Scope of Work",
  _objectives:                 "Objectives",
  _payment_terms:              "Payment Terms",
  _total_contract_value:       "Contract Value",
  _currency:                   "Currency",
  _vendor_signatory_name:      "Vendor Signatory",
  _vendor_signatory_designation: "Vendor Designation",
  _client_signatory_name:      "Client Signatory",
  _client_signatory_designation: "Client Designation",
  _governing_law:              "Governing Law",
  _linked_grant:               "Linked Grant / Project",
};

function extractionStatus(score) {
  if (score >= 80) return { label: "Extraction Complete", color: "bg-green-100 text-green-700" };
  if (score >= 40) return { label: "Extraction Partial",  color: "bg-yellow-100 text-yellow-700" };
  if (score >= 1)  return { label: "Needs Review",        color: "bg-orange-100 text-orange-700" };
  return              { label: "Extraction Failed",      color: "bg-red-100 text-red-700" };
}

function ArrayDisplay({ value }) {
  if (!Array.isArray(value) || value.length === 0) return <span className="text-muted-foreground text-xs italic">None extracted</span>;
  return (
    <ul className="list-disc list-inside space-y-0.5">
      {value.map((item, i) => (
        <li key={i} className="text-xs text-foreground">
          {typeof item === "string" ? item : JSON.stringify(item)}
        </li>
      ))}
    </ul>
  );
}

export default function SowExtractionReviewPanel({ sowFields, extractionResult, pdfUrl, onSave, onEdit, saving }) {
  const [fields, setFields] = useState(sowFields || {});
  const [rateTables, setRateTables] = useState(sowFields?.rate_cards || []);
  const score  = extractionResult?.confidence_score || 0;
  const status = extractionStatus(score);
  const missing = extractionResult?.missing_fields || [];

  const set = (k, v) => setFields(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    // Strip internal _ prefixed display fields before saving
    const toSave = {};
    Object.entries(fields).forEach(([k, v]) => {
      if (!k.startsWith("_")) toSave[k] = v;
    });
    // Always persist all table arrays — use edited rate tables (user may have modified them)
    toSave.rate_cards = rateTables;
    // Preserve any additional table arrays from extraction result
    toSave.commercial_tables = extractionResult?.commercial_tables || [];
    toSave.payment_schedule_tables = extractionResult?.payment_schedule_tables || [];
    toSave.normalized_rate_items = extractionResult?.normalized_rate_items || [];
    onSave(toSave);
  };

  // Scalar fields for inline editing
  const scalarFields = Object.entries(FIELD_LABELS).filter(([k]) =>
    k !== "_deliverables" && k !== "_milestones" && k !== "_scope_of_work" && k !== "_objectives" && k !== "_payment_terms"
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {score >= 40 ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          )}
          <div>
            <p className="text-sm font-semibold">Extraction Review</p>
            <p className="text-xs text-muted-foreground">Review extracted fields and correct any errors before saving</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={status.color}>{status.label}</Badge>
          <Badge variant="outline" className="text-xs">{score}% confidence</Badge>
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1 text-xs"><ExternalLink className="w-3 h-3" />View PDF</Button>
            </a>
          )}
        </div>
      </div>

      {missing.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          <strong>Missing fields:</strong> {missing.join(", ")}
        </div>
      )}

      {/* Editable scalar fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {scalarFields.map(([key, label]) => {
          const val = fields[key] || "";
          const isEmpty = !val || (typeof val === "string" && !val.trim());
          return (
            <div key={key} className={`space-y-1 ${isEmpty ? "opacity-70" : ""}`}>
              <Label className="text-xs flex items-center gap-1">
                {label}
                {isEmpty && <span className="text-amber-500 font-normal">(not extracted)</span>}
              </Label>
              <Input
                value={val}
                onChange={e => set(key, e.target.value)}
                placeholder={`Enter ${label.toLowerCase()}…`}
                className="h-8 text-xs"
              />
            </div>
          );
        })}
      </div>

      {/* Multi-line fields */}
      {[
        { key: "_scope_of_work", label: "Scope of Work" },
        { key: "_objectives",    label: "Objectives" },
        { key: "_payment_terms", label: "Payment Terms" },
      ].map(({ key, label }) => (
        <div key={key} className="space-y-1">
          <Label className="text-xs">{label}</Label>
          <Textarea
            rows={3}
            value={fields[key] || ""}
            onChange={e => set(key, e.target.value)}
            placeholder={`Enter ${label.toLowerCase()}…`}
            className="text-xs"
          />
        </div>
      ))}

      {/* Arrays */}
      {[
        { key: "_deliverables", label: "Deliverables" },
        { key: "_milestones",   label: "Milestones" },
      ].map(({ key, label }) => (
        <div key={key} className="space-y-1">
          <Label className="text-xs">{label}</Label>
          <div className="border rounded-md p-2 bg-muted/30 min-h-[40px]">
            <ArrayDisplay value={fields[key]} />
          </div>
        </div>
      ))}

      {/* Rate Cards / Commercial Tables */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Rate Cards / Commercial Tables</Label>
        <RateCardTableEditor
          rateTables={rateTables}
          onChange={setRateTables}
          readOnly={false}
        />
      </div>

      {/* Extraction notes */}
      {extractionResult?.extraction_notes && (
        <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground">
          <strong>Extraction notes:</strong> {extractionResult.extraction_notes}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" size="sm" onClick={onEdit}>Edit Manually</Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          {saving ? "Saving…" : "Save SoW"}
        </Button>
      </div>
    </div>
  );
}