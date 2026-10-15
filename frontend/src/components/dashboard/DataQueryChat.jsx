import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Loader2, Sparkles } from "lucide-react";

const SCOPES = ["All Data", "Grants", "SOWs", "MSAs", "MOUs", "Deliverables", "Milestones", "Tranches", "Contacts", "Documents"];

const SUGGESTED_QUESTIONS = [
  "Which grants are ending in the next 30 days?",
  "Which deliverables are overdue?",
  "What are the key clauses in any MSA?",
  "Which SoWs are expiring soon?",
  "What commitments are in the MoUs?",
  "Which tranches are pending?",
  "Show all contacts from MoUs.",
  "Which records have missing end dates?",
];

function fmt(v) { return v || "—"; }
function fmtAmt(v) { return v != null ? `$${Number(v).toLocaleString()}` : "—"; }

function buildContext(scope, props) {
  const {
    grants = [], milestones = [], deadlines = [], sows = [], msas = [], mous = [],
    tranches = [], grantDeliverables = [], sowDeliverables = [], sowMilestones = [],
    mouCommitments = [], msaKeyClauses = [], obligations = [], uploadLogs = [],
  } = props;

  const sections = [];
  const include = (name) => scope === "All Data" || scope === name;

  if (include("Grants")) {
    sections.push(`GRANTS (${grants.length} records):
${grants.map(g =>
  `- "${fmt(g.title || g.grant_name)}" | Funder: ${fmt(g.funder)} | #${fmt(g.grant_number)} | Status: ${fmt(g.status)} | Amount: ${fmtAmt(g.total_amount)} | Start: ${fmt(g.start_date)} | End: ${fmt(g.end_date)}`
).join("\n") || "None"}`);
  }

  if (include("MSAs")) {
    sections.push(`MSAs (${msas.length} records):
${msas.map(m =>
  `- "${fmt(m.title)}" | Vendor: ${fmt(m.vendor_name)} | #${fmt(m.msa_number)} | Status: ${fmt(m.status)} | Effective: ${fmt(m.effective_date)} | End: ${fmt(m.end_date)} | Governing Law: ${fmt(m.governing_law)} | Notice Period: ${fmt(m.notice_period)} | Auto-renew: ${m.auto_renew ? "Yes" : "No"} | Liability Cap: ${fmt(m.liability_cap)} | IP: ${fmt(m.ip_ownership)}`
).join("\n") || "None"}`);

    if (msaKeyClauses.length > 0) {
      const msaMap = Object.fromEntries(msas.map(m => [m.id, m.title]));
      sections.push(`MSA KEY CLAUSES (${msaKeyClauses.length} records):
${msaKeyClauses.map(c =>
  `- MSA: "${fmt(msaMap[c.msa_id])}" | Clause: ${fmt(c.clause_title)} | Type: ${fmt(c.clause_type)} | Risk: ${fmt(c.risk_level)} | Ref: ${fmt(c.clause_number || c.clause_reference)} | Summary: ${fmt(c.summary)}`
).join("\n")}`);
    }

    // Structured services from MSA records
    const msasWithServices = msas.filter(m => m.structured_services?.length > 0);
    if (msasWithServices.length > 0) {
      sections.push(`MSA SCOPE OF SERVICES:
${msasWithServices.map(m =>
  `- MSA: "${fmt(m.title)}" has ${m.structured_services.length} service(s): ${m.structured_services.map(s => s.service_category || s.description).filter(Boolean).join("; ")}`
).join("\n")}`);
    }
  }

  if (include("MOUs")) {
    sections.push(`MOUs (${mous.length} records):
${mous.map(m =>
  `- "${fmt(m.title)}" | Partner: ${fmt(m.partner_name)} | Type: ${fmt(m.partner_type)} | #${fmt(m.mou_number)} | Status: ${fmt(m.status)} | Effective: ${fmt(m.effective_date)} | End: ${fmt(m.end_date)} | Purpose: ${fmt(m.purpose)} | Scope: ${fmt(m.scope_of_collaboration)} | Governing Law: ${fmt(m.governing_law)}`
).join("\n") || "None"}`);

    if (mouCommitments.length > 0) {
      const mouMap = Object.fromEntries(mous.map(m => [m.id, m.title]));
      sections.push(`MOU COMMITMENTS (${mouCommitments.length} records):
${mouCommitments.map(c =>
  `- MOU: "${fmt(mouMap[c.mou_id])}" | Commitment: ${fmt(c.name)} | Type: ${fmt(c.commitment_type)} | Party: ${fmt(c.responsible_party)} | Status: ${fmt(c.status)} | Due: ${fmt(c.due_date)} | Frequency: ${fmt(c.frequency)}`
).join("\n")}`);
    }

    // MOU contacts stored in mou.contacts array
    const mousWithContacts = mous.filter(m => m.contacts?.length > 0);
    if (mousWithContacts.length > 0) {
      sections.push(`MOU CONTACTS:
${mousWithContacts.map(m =>
  m.contacts.map(c =>
    `- MOU: "${fmt(m.title)}" | Name: ${fmt(c.name)} | Org: ${fmt(c.organization)} | Role: ${fmt(c.role)} | Email: ${fmt(c.email)} | Phone: ${fmt(c.phone)}`
  ).join("\n")
).join("\n")}`);
    }
  }

  if (include("SOWs")) {
    sections.push(`SOWs (${sows.length} records):
${sows.map(s =>
  `- "${fmt(s.title)}" | Vendor: ${fmt(s.vendor_name)} | #${fmt(s.sow_number)} | Status: ${fmt(s.status)} | Start: ${fmt(s.start_date)} | End: ${fmt(s.end_date)} | Monthly Rate: ${fmtAmt(s.monthly_rate)} | Total Value: ${fmtAmt(s.total_value)} | Payment Day: ${fmt(s.payment_day)}`
).join("\n") || "None"}`);

    // Rate cards from SOW records
    const sowsWithRateCards = sows.filter(s => s.rate_cards?.length > 0);
    if (sowsWithRateCards.length > 0) {
      sections.push(`SOW RATE CARDS:
${sowsWithRateCards.map(s =>
  `- SOW: "${fmt(s.title)}" has ${s.rate_cards.length} rate card table(s): ${s.rate_cards.map(r => r.table_title || r.table_type).filter(Boolean).join("; ")}`
).join("\n")}`);
    }
  }

  if (include("Milestones")) {
    const grantMap = Object.fromEntries(grants.map(g => [g.id, g.title || g.grant_name]));
    const sowMap = Object.fromEntries(sows.map(s => [s.id, s.title]));
    sections.push(`GRANT MILESTONES (${milestones.length} records):
${milestones.map(m =>
  `- Grant: "${fmt(grantMap[m.grant_id])}" | ${fmt(m.title)} | Amount: ${fmtAmt(m.amount)} | Due: ${fmt(m.due_date)} | Status: ${fmt(m.status)} | Type: ${fmt(m.milestone_type)}`
).join("\n") || "None"}`);

    if (sowMilestones.length > 0) {
      sections.push(`SOW MILESTONES (${sowMilestones.length} records):
${sowMilestones.map(m =>
  `- SOW: "${fmt(sowMap[m.sow_id])}" | ${fmt(m.title)} | Amount: ${fmtAmt(m.amount)} | Due: ${fmt(m.due_date)} | Status: ${fmt(m.status)}`
).join("\n")}`);
    }
  }

  if (include("Tranches")) {
    const grantMap = Object.fromEntries(grants.map(g => [g.id, g.title || g.grant_name]));
    sections.push(`GRANT TRANCHES (${tranches.length} records):
${tranches.map(t =>
  `- Grant: "${fmt(grantMap[t.grant_id])}" | ${fmt(t.title || t.tranche_name)} | Amount: ${fmtAmt(t.amount)} | Due: ${fmt(t.due_date)} | Status: ${fmt(t.status)} | Trigger: ${fmt(t.invoice_trigger_date)} | Received: ${fmt(t.received_date)}`
).join("\n") || "None"}`);
  }

  if (include("Deliverables")) {
    const grantMap = Object.fromEntries(grants.map(g => [g.id, g.title || g.grant_name]));
    const sowMap = Object.fromEntries(sows.map(s => [s.id, s.title]));
    sections.push(`GRANT DELIVERABLES (${grantDeliverables.length} records):
${grantDeliverables.map(d =>
  `- Grant: "${fmt(grantMap[d.grant_id])}" | ${fmt(d.name)} | Due: ${fmt(d.due_date)} | Status: ${fmt(d.status)} | Category: ${fmt(d.category)}`
).join("\n") || "None"}`);

    if (sowDeliverables.length > 0) {
      sections.push(`SOW DELIVERABLES (${sowDeliverables.length} records):
${sowDeliverables.map(d =>
  `- SOW: "${fmt(sowMap[d.sow_id])}" | ${fmt(d.name)} | Due: ${fmt(d.due_date)} | Status: ${fmt(d.status)} | Category: ${fmt(d.category)}`
).join("\n")}`);
    }
  }

  if (include("Grants") || include("All Data")) {
    if (obligations.length > 0) {
      const grantMap = Object.fromEntries(grants.map(g => [g.id, g.title || g.grant_name]));
      sections.push(`REPORTING OBLIGATIONS (${obligations.length} records):
${obligations.map(o =>
  `- Grant: "${fmt(grantMap[o.grant_id])}" | ${fmt(o.report_type || o.title)} | Due: ${fmt(o.due_date)} | Frequency: ${fmt(o.frequency)} | Status: ${fmt(o.status)}`
).join("\n")}`);
    }

    if (deadlines.length > 0) {
      const grantMap = Object.fromEntries(grants.map(g => [g.id, g.title || g.grant_name]));
      sections.push(`REPORTING DEADLINES (${deadlines.length} records):
${deadlines.map(d =>
  `- Grant: "${fmt(grantMap[d.grant_id])}" | ${fmt(d.report_type)} | Due: ${fmt(d.due_date)} | Status: ${fmt(d.status)}`
).join("\n")}`);
    }
  }

  if (include("Documents")) {
    sections.push(`UPLOADED DOCUMENTS (${uploadLogs.length} records):
${uploadLogs.slice(0, 100).map(u =>
  `- "${fmt(u.file_name)}" | Module: ${fmt(u.entity_type)} | Entity: ${fmt(u.entity_name)} | DPI Relevant: ${u.is_dpi_relevant ? "Yes" : "No"} | Duplicate: ${u.is_duplicate ? "Yes" : "No"} | Invalid: ${u.is_invalid ? "Yes" : "No"}`
).join("\n") || "None"}`);
  }

  return sections.join("\n\n");
}

export default function DataQueryChat(props) {
  const {
    grants = [], milestones = [], deadlines = [], sows = [], msas = [], mous = [],
    tranches = [], grantDeliverables = [], sowDeliverables = [], sowMilestones = [],
    mouCommitments = [], msaKeyClauses = [], obligations = [], uploadLogs = [],
  } = props;

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState("All Data");
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  // Respect module permissions for non-admins
  const allowedScope = (scopeName) => {
    if (!user || user.role === "admin") return true;
    const allowed = user.allowed_modules || [];
    if (allowed.length === 0) return true; // no restrictions set
    const moduleMap = { Grants: "Grants", SOWs: "SOWs", MSAs: "MSAs", MOUs: "MOUs" };
    const mod = moduleMap[scopeName];
    return !mod || allowed.includes(mod);
  };

  const availableScopes = SCOPES.filter(s => s === "All Data" || allowedScope(s));

  const ask = async (q) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    setMessages(prev => [...prev, { role: "user", text: trimmed }]);
    setQuestion("");
    setLoading(true);

    const today = new Date().toISOString().split("T")[0];

    // Filter props by allowed modules for non-admins
    const filteredProps = { ...props };
    if (user && user.role !== "admin" && user.allowed_modules?.length > 0) {
      const allowed = user.allowed_modules;
      if (!allowed.includes("SOWs")) { filteredProps.sows = []; filteredProps.sowDeliverables = []; filteredProps.sowMilestones = []; }
      if (!allowed.includes("MSAs")) { filteredProps.msas = []; filteredProps.msaKeyClauses = []; }
      if (!allowed.includes("MOUs")) { filteredProps.mous = []; filteredProps.mouCommitments = []; }
      if (!allowed.includes("Grants")) { filteredProps.grants = []; filteredProps.milestones = []; filteredProps.tranches = []; filteredProps.grantDeliverables = []; }
    }

    const context = buildContext(scope, filteredProps);

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are GrantOS, a comprehensive contract and grants management assistant. Answer the user's question concisely and specifically using ONLY the data provided below. Be specific with names, amounts, dates, and statuses. Format dates as "Month Day, Year". If calculating totals, show the breakdown. If the requested data is not in the context, say so clearly.

Today's date: ${today}
Active scope filter: ${scope}

DATA:
${context}

User question: ${trimmed}`,
    });

    setMessages(prev => [...prev, { role: "assistant", text: result }]);
    setLoading(false);
  };

  const totalRecords = grants.length + sows.length + msas.length + mous.length + milestones.length + tranches.length + grantDeliverables.length + sowDeliverables.length + mouCommitments.length + msaKeyClauses.length;

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="w-5 h-5 text-primary" />
            GrantOS Assistant
            <span className="text-xs font-normal text-muted-foreground ml-1">{totalRecords} records loaded</span>
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Scope:</span>
            {availableScopes.map(s => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  scope === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-input text-muted-foreground hover:bg-muted"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => ask(q)}
                className="text-xs px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {messages.length > 0 && (
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder={`Ask anything about ${scope === "All Data" ? "your grants, MOUs, MSAs, SOWs…" : scope + "…"}`}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !loading && ask(question)}
            disabled={loading}
          />
          <Button size="icon" onClick={() => ask(question)} disabled={loading || !question.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        {messages.length > 0 && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setMessages([])}
          >
            Clear conversation
          </button>
        )}
      </CardContent>
    </Card>
  );
}