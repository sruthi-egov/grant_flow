import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Settings2, Plus, X } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_RULES = [
  { name: "Milestone Due Reminder", trigger_type: "milestone_due", reminder_days_before: [15, 7, 1, 0], overdue_frequency_days: 7, is_enabled: true, template_type_upcoming: "milestone_upcoming", template_type_overdue: "milestone_overdue" },
  { name: "Deliverable Due Reminder", trigger_type: "deliverable_due", reminder_days_before: [7, 1, 0], overdue_frequency_days: 7, is_enabled: true, template_type_upcoming: "deliverable_upcoming", template_type_overdue: "deliverable_overdue" },
  { name: "Reporting Obligation Reminder", trigger_type: "reporting_due", reminder_days_before: [15, 7, 0], overdue_frequency_days: 7, is_enabled: true, template_type_upcoming: "reporting_upcoming", template_type_overdue: "reporting_overdue" },
  { name: "Payment / Disbursement Reminder", trigger_type: "payment_due", reminder_days_before: [7, 0], overdue_frequency_days: 7, is_enabled: true, template_type_upcoming: "payment_upcoming", template_type_overdue: "payment_overdue" },
  { name: "Contract / Agreement Expiry", trigger_type: "contract_expiry", reminder_days_before: [30, 15, 7], overdue_frequency_days: 0, is_enabled: true, template_type_upcoming: "contract_expiry", template_type_overdue: "contract_expiry" },
  { name: "Document Review Reminder", trigger_type: "document_review", reminder_days_before: [], overdue_frequency_days: 7, is_enabled: true, template_type_upcoming: "document_review", template_type_overdue: "document_review" },
];

export default function NotificationRulesManager() {
  const [rules, setRules] = useState([]);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    api.entities.NotificationRule.list().then(dbRules => {
      if (dbRules.length === 0) {
        setRules(DEFAULT_RULES.map(r => ({ ...r, _isNew: true })));
      } else {
        setRules(dbRules);
      }
      setInitialized(true);
    });
  }, []);

  const updateRule = (idx, field, value) => {
    setRules(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addDay = (idx, dayStr) => {
    const day = parseInt(dayStr);
    if (isNaN(day) || day < 0) return;
    setRules(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const existing = r.reminder_days_before || [];
      if (existing.includes(day)) return r;
      return { ...r, reminder_days_before: [...existing, day].sort((a, b) => b - a) };
    }));
  };

  const removeDay = (idx, day) => {
    setRules(prev => prev.map((r, i) => i === idx ? { ...r, reminder_days_before: (r.reminder_days_before || []).filter(d => d !== day) } : r));
  };

  const save = async () => {
    setSaving(true);
    for (const rule of rules) {
      const data = { name: rule.name, trigger_type: rule.trigger_type, reminder_days_before: rule.reminder_days_before, overdue_frequency_days: rule.overdue_frequency_days, is_enabled: rule.is_enabled, template_type_upcoming: rule.template_type_upcoming, template_type_overdue: rule.template_type_overdue };
      if (rule._isNew || !rule.id) {
        await api.entities.NotificationRule.create(data);
      } else {
        await api.entities.NotificationRule.update(rule.id, data);
      }
    }
    // Reload from DB
    const dbRules = await api.entities.NotificationRule.list();
    setRules(dbRules);
    setSaving(false);
    toast.success("Notification rules saved");
  };

  if (!initialized) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-primary" />
          Notification Rules
        </CardTitle>
        <CardDescription>Configure when reminders are sent for each event type.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rules.map((rule, idx) => (
          <div key={idx} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">{rule.name}</p>
              <Switch
                checked={rule.is_enabled}
                onCheckedChange={v => updateRule(idx, 'is_enabled', v)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Reminder Days Before Due Date</Label>
                <div className="flex flex-wrap gap-1 mt-1 mb-2 min-h-6">
                  {(rule.reminder_days_before || []).map(d => (
                    <Badge key={d} variant="secondary" className="gap-1 text-xs">
                      {d === 0 ? 'On due date' : `${d}d before`}
                      <button onClick={() => removeDay(idx, d)}>
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    placeholder="e.g. 7"
                    className="w-24 h-7 text-xs"
                    onKeyDown={e => { if (e.key === 'Enter') { addDay(idx, e.target.value); e.target.value = ''; } }}
                  />
                  <Button variant="outline" size="sm" className="h-7 text-xs px-2"
                    onClick={e => { const input = e.target.closest('.flex').querySelector('input'); addDay(idx, input.value); input.value = ''; }}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Enter days and press Enter or +</p>
              </div>

              {rule.trigger_type !== 'contract_expiry' && (
                <div>
                  <Label className="text-xs">Overdue Reminder Every (days)</Label>
                  <p className="text-xs text-muted-foreground mb-1">0 = disabled</p>
                  <Input
                    type="number"
                    min={0}
                    value={rule.overdue_frequency_days ?? 7}
                    onChange={e => updateRule(idx, 'overdue_frequency_days', parseInt(e.target.value) || 0)}
                    className="w-24 h-7 text-xs"
                  />
                </div>
              )}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-3 pt-2 border-t">
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? "Saving..." : "Save Rules"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}