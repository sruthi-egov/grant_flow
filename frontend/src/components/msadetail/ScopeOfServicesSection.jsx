import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp, Layers, Loader2, FileText, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";

function parseDescriptionIntoServices(text) {
  if (!text) return [];
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const services = [];

  const numbered = lines.filter(l => /^(\d+[\.\)]|[-•*])\s/.test(l));
  if (numbered.length >= 2) {
    for (const line of numbered) {
      const cleaned = line.replace(/^(\d+[\.\)]|[-•*])\s*/, "").trim();
      const colonIdx = cleaned.indexOf(":");
      if (colonIdx > 0 && colonIdx < 60) {
        services.push({
          service_category: cleaned.slice(0, colonIdx).trim(),
          description: cleaned.slice(colonIdx + 1).trim(),
          bullet_points: [],
          limitations_or_notes: "",
          source_section: "Description of Services",
        });
      } else {
        services.push({
          service_category: cleaned,
          description: "",
          bullet_points: [],
          limitations_or_notes: "",
          source_section: "Description of Services",
        });
      }
    }
    return services;
  }

  return [{
    service_category: "Scope of Services",
    description: text,
    bullet_points: [],
    limitations_or_notes: "",
    source_section: "Description of Services",
  }];
}

function ExtractionReviewModal({ extracted, onClose, onSave }) {
  const [selected, setSelected] = useState(extracted.map((s, i) => ({ ...s, _selected: true, _idx: i })));
  const [saving, setSaving] = useState(false);

  const toggle = (idx) => setSelected(s => s.map(c => c._idx === idx ? { ...c, _selected: !c._selected } : c));

  const handleSave = async () => {
    setSaving(true);
    const toSave = selected.filter(c => c._selected).map(({ _selected, _idx, ...rest }) => rest);
    await onSave(toSave);
    setSaving(false);
  };

  const selectedCount = selected.filter(c => c._selected).length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Review Extracted Services ({extracted.length} found)</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground mb-3">Uncheck any services you don't want to save.</p>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {selected.map(svc => (
            <div key={svc._idx} className="flex items-start gap-3 p-3 rounded-lg border bg-background">
              <Checkbox checked={svc._selected} onCheckedChange={() => toggle(svc._idx)} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{svc.service_category}</p>
                {svc.description && <p className="text-xs text-muted-foreground mt-0.5">{svc.description}</p>}
                {svc.responsibility && svc.responsibility !== "—" && (
                  <p className="text-xs text-muted-foreground mt-0.5">Owner: {svc.responsibility}</p>
                )}
                {svc.limitations_or_notes && (
                  <p className="text-xs text-orange-700 bg-orange-50 rounded px-2 py-0.5 mt-1 inline-block">{svc.limitations_or_notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center pt-3 border-t">
          <p className="text-sm text-muted-foreground">{selectedCount} of {extracted.length} selected</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || selectedCount === 0}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Save {selectedCount} Service{selectedCount !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ServiceCard({ svc, index }) {
  const bullets = Array.isArray(svc.bullet_points) && svc.bullet_points.length > 0
    ? svc.bullet_points
    : svc.description
      ? svc.description.split(/[.;]/).map(s => s.trim()).filter(s => s.length > 10)
      : [];

  return (
    <div className="flex gap-3 py-3 border-b last:border-0">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm mb-1">{svc.service_category}</p>
        {bullets.length > 0 ? (
          <ul className="space-y-0.5">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-muted-foreground shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        ) : svc.description ? (
          <p className="text-xs text-muted-foreground">{svc.description}</p>
        ) : null}
        {svc.limitations_or_notes && (
          <div className="mt-1.5 flex items-start gap-1.5 text-xs text-orange-700 bg-orange-50 rounded px-2 py-1">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
            {svc.limitations_or_notes}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScopeOfServicesSection({ msa, isAdmin, onServicesUpdated }) {
  const [showRaw, setShowRaw] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [reviewServices, setReviewServices] = useState(null);

  const structuredServices = msa.structured_services && msa.structured_services.length > 0
    ? msa.structured_services
    : null;

  const parsedServices = !structuredServices && msa.description
    ? parseDescriptionIntoServices(msa.description)
    : null;

  const displayServices = structuredServices || parsedServices;

  const handleExtract = async () => {
    if (!msa.pdf_url) {
      setExtractError("No uploaded agreement is linked to this MSA. Please upload an agreement first.");
      return;
    }
    setExtracting(true);
    setExtractError("");
    const res = await base44.functions.invoke("extractMsaServicesAndKeyClauses", {
      pdf_url: msa.pdf_url,
      msa_id: msa.id,
    });
    setExtracting(false);
    if (res.data?.error) {
      setExtractError(res.data.error);
    } else if (res.data?.structured_services?.length > 0) {
      setReviewServices(res.data.structured_services);
    } else {
      setExtractError("No structured services were detected. " + (res.data?.extraction_notes || ""));
    }
  };

  const handleSaveServices = async (services) => {
    await base44.entities.MSA.update(msa.id, { structured_services: services });
    setReviewServices(null);
    if (onServicesUpdated) onServicesUpdated();
  };

  if (!displayServices && !msa.description) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="w-4 h-4" /> Scope of Services
          </CardTitle>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={handleExtract} disabled={extracting} className="gap-1 text-xs">
              {extracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
              {structuredServices ? "Re-extract Services" : "Extract Structured Services"}
            </Button>
          )}
        </div>
        {!structuredServices && parsedServices && (
          <p className="text-xs text-muted-foreground mt-1">Parsed from description — extract from PDF for better accuracy.</p>
        )}
        {structuredServices && (
          <Badge variant="outline" className="text-xs w-fit bg-blue-50 text-blue-600 border-blue-200">AI Extracted</Badge>
        )}
      </CardHeader>
      <CardContent>
        {extractError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-3">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {extractError}
          </div>
        )}

        {displayServices && displayServices.length > 0 && (
          <div className="divide-y divide-border">
            {displayServices.map((svc, i) => (
              <ServiceCard key={i} svc={svc} index={i} />
            ))}
          </div>
        )}

        {msa.description && (
          <div className="mt-3">
            <button
              onClick={() => setShowRaw(v => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showRaw ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showRaw ? "Hide" : "View"} Original Extracted Text
            </button>
            {showRaw && (
              <div className="mt-2 p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground whitespace-pre-line border">
                {msa.description}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {reviewServices && (
        <ExtractionReviewModal
          extracted={reviewServices}
          onClose={() => setReviewServices(null)}
          onSave={handleSaveServices}
        />
      )}
    </Card>
  );
}