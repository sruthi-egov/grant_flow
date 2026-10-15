import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronUp, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_TEMPLATES = [
  { name: "Upcoming Milestone Reminder", template_type: "milestone_upcoming", subject: "[GrantTrack] Milestone Due in {{days_remaining}} Days – {{item_title}}", body: "<p>Dear Team,</p>\n<p>Milestone <strong>{{item_title}}</strong> under <strong>{{record_title}}</strong> is due on <strong>{{due_date}}</strong> ({{days_remaining}} days remaining).</p>\n<p>Status: {{status}}{{#amount}}<br>Amount: {{currency}} {{amount}}{{/amount}}</p>\n<p><a href=\"{{app_link}}\">View in GrantTrack</a></p>" },
  { name: "Overdue Milestone Reminder", template_type: "milestone_overdue", subject: "[GrantTrack] OVERDUE Milestone – {{item_title}} ({{days_overdue}} days overdue)", body: "<p>Dear Team,</p>\n<p>Milestone <strong>{{item_title}}</strong> under <strong>{{record_title}}</strong> is <strong>{{days_overdue}} days overdue</strong> (was due {{due_date}}).</p>\n<p>Status: {{status}}</p>\n<p>Please take immediate action.</p>\n<p><a href=\"{{app_link}}\">View in GrantTrack</a></p>" },
  { name: "Upcoming Deliverable Reminder", template_type: "deliverable_upcoming", subject: "[GrantTrack] Deliverable Due in {{days_remaining}} Days – {{item_title}}", body: "<p>Dear Team,</p>\n<p>Deliverable <strong>{{item_title}}</strong> under <strong>{{record_title}}</strong> is due on <strong>{{due_date}}</strong> ({{days_remaining}} days remaining).</p>\n<p>Status: {{status}}</p>\n<p><a href=\"{{app_link}}\">View in GrantTrack</a></p>" },
  { name: "Overdue Deliverable Reminder", template_type: "deliverable_overdue", subject: "[GrantTrack] OVERDUE Deliverable – {{item_title}} ({{days_overdue}} days overdue)", body: "<p>Dear Team,</p>\n<p>Deliverable <strong>{{item_title}}</strong> under <strong>{{record_title}}</strong> is <strong>{{days_overdue}} days overdue</strong>.</p>\n<p>Status: {{status}}</p>\n<p><a href=\"{{app_link}}\">View in GrantTrack</a></p>" },
  { name: "Reporting Obligation Reminder", template_type: "reporting_upcoming", subject: "[GrantTrack] Reporting Deadline in {{days_remaining}} Days – {{item_title}}", body: "<p>Dear Team,</p>\n<p>Report <strong>{{item_title}}</strong> for grant <strong>{{record_title}}</strong> is due on <strong>{{due_date}}</strong> ({{days_remaining}} days remaining).</p>\n<p>Status: {{status}}</p>\n<p><a href=\"{{app_link}}\">View in GrantTrack</a></p>" },
  { name: "Overdue Reporting Obligation", template_type: "reporting_overdue", subject: "[GrantTrack] OVERDUE Report – {{item_title}} ({{days_overdue}} days overdue)", body: "<p>Dear Team,</p>\n<p>Report <strong>{{item_title}}</strong> for grant <strong>{{record_title}}</strong> is <strong>{{days_overdue}} days overdue</strong>.</p>\n<p>Status: {{status}}</p>\n<p><a href=\"{{app_link}}\">View in GrantTrack</a></p>" },
  { name: "Payment / Disbursement Reminder", template_type: "payment_upcoming", subject: "[GrantTrack] Payment Due in {{days_remaining}} Days – {{item_title}}", body: "<p>Dear Team,</p>\n<p>Payment <strong>{{item_title}}</strong> for <strong>{{record_title}}</strong> is due on <strong>{{due_date}}</strong> ({{days_remaining}} days remaining).</p>\n<p>Amount: {{currency}} {{amount}}<br>Status: {{status}}</p>\n<p><a href=\"{{app_link}}\">View in GrantTrack</a></p>" },
  { name: "Overdue Payment Reminder", template_type: "payment_overdue", subject: "[GrantTrack] OVERDUE Payment – {{item_title}} ({{days_overdue}} days overdue)", body: "<p>Dear Team,</p>\n<p>Payment <strong>{{item_title}}</strong> for <strong>{{record_title}}</strong> is <strong>{{days_overdue}} days overdue</strong>.</p>\n<p>Amount: {{currency}} {{amount}}<br>Status: {{status}}</p>\n<p><a href=\"{{app_link}}\">View in GrantTrack</a></p>" },
  { name: "Contract / Agreement Expiry", template_type: "contract_expiry", subject: "[GrantTrack] {{record_type}} Expiring in {{days_remaining}} Days – {{record_title}}", body: "<p>Dear Team,</p>\n<p><strong>{{record_type}}: {{record_title}}</strong> is expiring on <strong>{{due_date}}</strong> ({{days_remaining}} days remaining).</p>\n<p>Status: {{status}}</p>\n<p>Please review and take renewal action if required.</p>\n<p><a href=\"{{app_link}}\">View in GrantTrack</a></p>" },
  { name: "Document Review Reminder", template_type: "document_review", subject: "[GrantTrack] Document Pending Review – {{item_title}}", body: "<p>Dear Team,</p>\n<p>Document <strong>{{item_title}}</strong> (module: {{record_type}}) is pending review.</p>\n<p>Status: {{status}}<br>{{description}}</p>\n<p>Please review and approve or reject this document.</p>\n<p><a href=\"{{app_link}}\">View in GrantTrack</a></p>" },
];

const PLACEHOLDER_HINT = "{{record_type}} {{record_title}} {{item_title}} {{due_date}} {{days_remaining}} {{days_overdue}} {{status}} {{amount}} {{currency}} {{app_link}} {{description}}";

export default function NotificationTemplatesManager() {
  const [templates, setTemplates] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    api.entities.NotificationTemplate.list().then(dbTemplates => {
      if (dbTemplates.length === 0) {
        setTemplates(DEFAULT_TEMPLATES.map(t => ({ ...t, _isNew: true, is_active: true })));
      } else {
        setTemplates(dbTemplates);
      }
      setInitialized(true);
    });
  }, []);

  const update = (idx, field, value) => {
    setTemplates(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  };

  const save = async () => {
    setSaving(true);
    for (const tmpl of templates) {
      const data = { name: tmpl.name, template_type: tmpl.template_type, subject: tmpl.subject, body: tmpl.body, is_active: tmpl.is_active ?? true };
      if (tmpl._isNew || !tmpl.id) {
        await api.entities.NotificationTemplate.create(data);
      } else {
        await api.entities.NotificationTemplate.update(tmpl.id, data);
      }
    }
    const dbTemplates = await api.entities.NotificationTemplate.list();
    setTemplates(dbTemplates);
    setSaving(false);
    toast.success("Templates saved");
  };

  if (!initialized) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Email Templates
        </CardTitle>
        <CardDescription>
          Customize the subject and body for each notification type. Supported placeholders: <span className="font-mono text-xs">{PLACEHOLDER_HINT}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {templates.map((tmpl, idx) => (
          <div key={idx} className="border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
              onClick={() => setExpanded(expanded === idx ? null : idx)}
            >
              <span>{tmpl.name}</span>
              {expanded === idx ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expanded === idx && (
              <div className="px-4 pb-4 space-y-3 border-t bg-muted/20">
                <div className="pt-3">
                  <Label className="text-xs">Subject</Label>
                  <Input
                    value={tmpl.subject}
                    onChange={e => update(idx, 'subject', e.target.value)}
                    className="mt-1 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Body (HTML)</Label>
                  <Textarea
                    value={tmpl.body}
                    onChange={e => update(idx, 'body', e.target.value)}
                    className="mt-1 text-sm font-mono min-h-32"
                  />
                </div>
              </div>
            )}
          </div>
        ))}

        <div className="flex items-center gap-3 pt-3 border-t">
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? "Saving..." : "Save Templates"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}