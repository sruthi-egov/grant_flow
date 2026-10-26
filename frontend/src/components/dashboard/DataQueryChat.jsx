import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Sparkles, AlertCircle, RotateCw, Info } from "lucide-react";

/**
 * Dashboard assistant.
 *
 * The question, the selected scope and a short conversation history are sent
 * to POST /api/assistant/ask. The backend decides what the signed-in user may
 * read, computes counts and date arithmetic from the database, and returns
 * prose plus the records it drew on.
 *
 * Previously this component assembled the context in the browser and called a
 * generic LLM endpoint that is pinned to JSON-object mode. The reply was an
 * object, which React cannot render as a child, so the whole dashboard went
 * blank. Answers are now rendered defensively as text whatever comes back.
 */

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

/** Never hand React anything but a string, whatever the API returned. */
function asText(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function DataQueryChat(props) {
  const {
    grants = [], sows = [], msas = [], mous = [], milestones = [], tranches = [],
    grantDeliverables = [], sowDeliverables = [], mouCommitments = [], msaKeyClauses = [],
  } = props;

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scope, setScope] = useState("All Data");
  const [user, setUser] = useState(null);

  // Guards against a second submit while one is in flight: `loading` alone is
  // a state update and can lag behind two fast clicks.
  const inFlight = useRef(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    api.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  // Scope buttons a non-admin may use, mirroring their module permissions.
  // The backend enforces this independently.
  const allowedScope = (scopeName) => {
    if (!user || user.role === "admin") return true;
    const allowed = user.allowed_modules || [];
    if (allowed.length === 0) return true;
    const mod = { Grants: "Grants", SOWs: "SOWs", MSAs: "MSAs", MOUs: "MOUs" }[scopeName];
    return !mod || allowed.includes(mod);
  };
  const availableScopes = SCOPES.filter(s => s === "All Data" || allowedScope(s));

  const ask = async (q) => {
    const trimmed = (q || "").trim();
    if (!trimmed || inFlight.current) return;

    inFlight.current = true;
    setError(null);
    setLoading(true);
    setMessages(prev => [...prev, { role: "user", text: trimmed }]);
    setQuestion("");

    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, text: asText(m.text) }));
      const result = await api.assistant.ask({ question: trimmed, scope, history });

      setMessages(prev => [...prev, {
        role: "assistant",
        text: asText(result?.answer),
        sources: Array.isArray(result?.sources) ? result.sources : [],
        scopeNote: result?.scope_note || null,
      }]);
    } catch (err) {
      // Keep the question so it can be retried rather than retyped, and show
      // the real reason instead of a generic fallback answer.
      setMessages(prev => prev.slice(0, -1));
      setQuestion(trimmed);
      setError(
        err?.status === 503
          ? (err?.message || "The AI service is unavailable. Check the backend's OpenAI configuration.")
          : err?.status === 429
            ? "Too many questions in a short time. Wait a moment and try again."
            : err?.status === 403
              ? "You do not have access to the data needed for that question."
              : (err?.message || "Could not get an answer. Please try again."),
      );
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  };

  const totalRecords =
    grants.length + sows.length + msas.length + mous.length + milestones.length +
    tranches.length + grantDeliverables.length + sowDeliverables.length +
    mouCommitments.length + msaKeyClauses.length;

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="w-5 h-5 text-primary" />
            GrantOS Assistant
            <span className="text-xs font-normal text-muted-foreground ml-1">
              {totalRecords} records loaded
            </span>
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Scope:</span>
            {availableScopes.map(s => (
              <button
                key={s}
                onClick={() => setScope(s)}
                disabled={loading}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
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
        {messages.length === 0 && !loading && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map(q => (
              <button
                key={q}
                type="button"
                onClick={() => ask(q)}
                disabled={loading}
                className="text-xs px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {(messages.length > 0 || loading) && (
          <div ref={scrollRef} className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}>
                  {msg.scopeNote && (
                    <p className="flex items-start gap-1.5 mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                      <Info className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{asText(msg.scopeNote)}</span>
                    </p>
                  )}

                  {/* Long answers wrap and the container scrolls; text is
                      rendered as plain text, never as HTML. */}
                  <div className="whitespace-pre-wrap break-words">{asText(msg.text)}</div>

                  {msg.sources?.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-border/60">
                      <p className="text-[11px] text-muted-foreground mb-1">Sources</p>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.sources.map(s => (
                          <Link
                            key={`${s.type}-${s.id}`}
                            to={s.url}
                            className="text-[11px] px-2 py-0.5 rounded border border-input bg-background hover:bg-muted transition-colors"
                            title={`${s.type}: ${s.name}`}
                          >
                            {s.type}: {String(s.name).slice(0, 40)}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Looking through your records…
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="break-words">{asText(error)}</p>
              {question.trim() && (
                <button
                  onClick={() => ask(question)}
                  disabled={loading}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800 disabled:opacity-50"
                >
                  <RotateCw className="w-3 h-3" /> Retry
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder={`Ask anything about ${scope === "All Data" ? "your grants, MOUs, MSAs, SOWs…" : scope + "…"}`}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(question);
              }
            }}
            disabled={loading}
          />
          <Button
            size="icon"
            onClick={() => ask(question)}
            disabled={loading || !question.trim()}
            aria-label="Send question"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        {messages.length > 0 && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            onClick={() => { setMessages([]); setError(null); }}
            disabled={loading}
          >
            Clear conversation
          </button>
        )}
      </CardContent>
    </Card>
  );
}
