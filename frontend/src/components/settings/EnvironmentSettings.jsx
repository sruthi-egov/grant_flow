import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Globe, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";

export default function EnvironmentSettings({ settingsId, onSaved }) {
  const [envName, setEnvName] = useState("production");
  const [labelEnabled, setLabelEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localId, setLocalId] = useState(settingsId);

  useEffect(() => {
    api.entities.AppSettings.list().then(s => {
      if (s.length > 0) {
        setEnvName(s[0].environment_name || "production");
        setLabelEnabled(s[0].environment_label_enabled || false);
        setLocalId(s[0].id);
      }
    });
  }, [settingsId]);

  const save = async () => {
    setSaving(true);
    const data = { environment_name: envName, environment_label_enabled: labelEnabled };
    if (localId) {
      await api.entities.AppSettings.update(localId, data);
    } else {
      const created = await api.entities.AppSettings.create({ ...data, notifications_enabled: false, days_before: 7 });
      setLocalId(created.id);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    toast.success("Environment settings saved");
    if (onSaved) onSaved();
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          Environment Settings
        </CardTitle>
        <CardDescription>
          Label this app as Staging or Production. Useful when running duplicate apps for safe testing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
          <div>
            <p className="font-semibold">Staging / Production Approach</p>
            <p className="text-xs mt-1">This label is cosmetic — it only controls the banner shown in the app header. Environments are separated by <strong>deployment</strong>: run a second instance with its own <code>DATABASE_URL</code> and upload volume (a separate Docker Compose project locally, or a separate Kubernetes namespace). Each instance then has a fully isolated database and document store.</p>
          </div>
        </div>

        <div>
          <Label className="font-semibold mb-3 block">Environment type</Label>
          <RadioGroup value={envName} onValueChange={setEnvName} className="flex gap-6">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="production" id="env_prod" />
              <Label htmlFor="env_prod" className="cursor-pointer">
                <span className="font-medium text-green-700">Production</span>
                <p className="text-xs text-muted-foreground">Live data, real recipients</p>
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="staging" id="env_staging" />
              <Label htmlFor="env_staging" className="cursor-pointer">
                <span className="font-medium text-amber-700">Staging</span>
                <p className="text-xs text-muted-foreground">Test data, test recipients only</p>
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg">
          <div>
            <p className="font-medium">Show environment badge in header</p>
            <p className="text-sm text-muted-foreground">Displays a coloured STAGING / PRODUCTION badge in the top navigation bar</p>
          </div>
          <Switch checked={labelEnabled} onCheckedChange={setLabelEnabled} />
        </div>

        <div className="flex items-center gap-3 pt-2 border-t">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save Environment Settings"}
          </Button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" /> Saved
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}