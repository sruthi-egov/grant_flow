import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_WEIGHTS, PARAM_LABELS } from "@/hooks/useGrantHealthScore";
import { CheckCircle2, RefreshCw, AlertCircle, Activity } from "lucide-react";

const PARAMS = Object.keys(DEFAULT_WEIGHTS);

const SAMPLE = {
  milestone_completion: 80,
  financial_utilization: 90,
  reporting_compliance: 75,
  document_completeness: 60,
  timeline_adherence: 80,
};

export default function GrantHealthScoreConfigPanel() {
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [configRecords, setConfigRecords] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    base44.entities.GrantHealthScoreConfig.list().then(records => {
      setConfigRecords(records);
      if (records.length > 0) {
        const loaded = { ...DEFAULT_WEIGHTS };
        records.forEach(r => { if (r.parameter_key) loaded[r.parameter_key] = r.weightage; });
        setWeights(loaded);
      }
      setLoading(false);
    });
  }, []);

  const total = PARAMS.reduce((s, k) => s + (Number(weights[k]) || 0), 0);
  const isValid = total === 100;

  const handleChange = (key, val) => {
    setWeights(prev => ({ ...prev, [key]: Number(val) || 0 }));
    setError("");
  };

  const save = async () => {
    if (!isValid) { setError("Total weightage must be exactly 100%."); return; }
    setSaving(true);
    const user = await base44.auth.me().catch(() => null);
    // Upsert each parameter
    for (const key of PARAMS) {
      const existing = configRecords.find(r => r.parameter_key === key);
      const payload = {
        parameter_key: key,
        parameter_name: PARAM_LABELS[key],
        weightage: weights[key],
        is_active: true,
        updated_by: user?.email || "",
      };
      if (existing) {
        await base44.entities.GrantHealthScoreConfig.update(existing.id, payload);
      } else {
        await base44.entities.GrantHealthScoreConfig.create(payload);
      }
    }
    // Refresh records
    const refreshed = await base44.entities.GrantHealthScoreConfig.list();
    setConfigRecords(refreshed);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const resetToDefault = async () => {
    setWeights({ ...DEFAULT_WEIGHTS });
    setError("");
  };

  if (loading) return <div className="text-sm text-muted-foreground py-4">Loading configuration...</div>;

  // Live preview calculation
  const previewRows = PARAMS.map(key => {
    const sampleScore = SAMPLE[key];
    const w = Number(weights[key]) || 0;
    return { key, label: PARAM_LABELS[key], sampleScore, w, contrib: parseFloat((sampleScore * w / 100).toFixed(2)) };
  });
  const previewTotal = parseFloat(previewRows.reduce((s, r) => s + r.contrib, 0).toFixed(1));

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Grant Health Score Configuration
        </CardTitle>
        <CardDescription>
          Configure the weightage of each parameter used to calculate the Grant Health Score. Total must equal 100%.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Weight inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PARAMS.map(key => (
            <div key={key} className="space-y-1">
              <Label className="text-sm">{PARAM_LABELS[key]}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={weights[key]}
                  onChange={e => handleChange(key, e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          ))}
        </div>

        {/* Total indicator */}
        <div className={`flex items-center gap-2 p-3 rounded-lg font-medium ${isValid ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {isValid ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          Total Weightage: {total}%
          {!isValid && <span className="text-sm font-normal ml-2">— Total weightage must be exactly 100%.</span>}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={save} disabled={saving || !isValid}>
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
          <Button variant="outline" onClick={resetToDefault} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Reset to Default
          </Button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" /> Configuration saved
            </span>
          )}
        </div>

        {/* Preview section */}
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 border-b">
            <p className="text-sm font-semibold">Configuration Preview (Sample Scores)</p>
            <p className="text-xs text-muted-foreground">Shows how current weightage affects a sample calculation</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Parameter</th>
                  <th className="text-right px-4 py-2 font-medium">Sample Score</th>
                  <th className="text-right px-4 py-2 font-medium">Weightage</th>
                  <th className="text-right px-4 py-2 font-medium">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map(row => (
                  <tr key={row.key} className="border-t">
                    <td className="px-4 py-2">{row.label}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.sampleScore}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{row.w}%</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      {row.sampleScore} × {row.w}% = {row.contrib}
                    </td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="px-4 py-2" colSpan={3}>Overall Grant Health Score</td>
                  <td className="px-4 py-2 text-right tabular-nums text-primary">{previewTotal} / 100</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}