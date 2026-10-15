import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Send, Loader2, CheckCircle2, XCircle, AlertTriangle, Users, Mail, Eye } from "lucide-react";
import { toast } from "sonner";

const RECORD_TYPES = [
  { value: "Grant", label: "Grant" },
  { value: "SOW", label: "SOW" },
  { value: "MSA", label: "MSA" },
  { value: "MOU", label: "MOU" },
];

const EVENT_TYPES = [
  { value: "milestone_upcoming", label: "Milestone Due" },
  { value: "milestone_overdue", label: "Overdue Milestone" },
  { value: "deliverable_upcoming", label: "Deliverable Due" },
  { value: "reporting_upcoming", label: "Reporting Deadline" },
  { value: "payment_upcoming", label: "Payment Due" },
  { value: "contract_expiry", label: "Contract Expiry" },
  { value: "document_review", label: "Document Review" },
];

export default function TestEmailDialog({ open, onClose, user }) {
  const [recordType, setRecordType] = useState("Grant");
  const [records, setRecords] = useState([]);
  const [recordId, setRecordId] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [eventType, setEventType] = useState("milestone_upcoming");
  const [testDueDate, setTestDueDate] = useState("");
  const [sendToMeOnly, setSendToMeOnly] = useState(true);
  const [sendToRecipients, setSendToRecipients] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [result, setResult] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!open) return;
    setRecordId("");
    setResult(null);
    setRecordSearch("");
    setLoadingRecords(true);
    const entityMap = { Grant: "Grant", SOW: "SOW", MSA: "MSA", MOU: "MOU" };
    api.entities[entityMap[recordType]].list().then(recs => {
      setRecords(recs.filter(r => !r.archived));
      setLoadingRecords(false);
    }).catch(() => setLoadingRecords(false));
  }, [open, recordType]);

  const filteredRecords = records.filter(r => {
    if (!recordSearch) return true;
    const title = (r.title || r.name || "").toLowerCase();
    return title.includes(recordSearch.toLowerCase());
  });

  const handleSend = async () => {
    if (!recordId) { toast.error("Please select a record"); return; }
    if (sendToRecipients && !isAdmin) { toast.error("Only admins can send to all recipients"); return; }
    if (sendToRecipients) { setShowConfirm(true); return; }
    doSend();
  };

  const doSend = async () => {
    setLoading(true);
    setShowConfirm(false);
    try {
      const res = await api.functions.invoke("sendTestNotification", {
        record_type: recordType,
        record_id: recordId,
        event_type: eventType,
        test_due_date: testDueDate || null,
        send_to_me_only: sendToMeOnly,
        send_to_recipients: sendToRecipients
      });
      setResult(res.data);
      if (res.data?.failed > 0) {
        toast.warning(`Test: ${res.data.sent} sent, ${res.data.failed} failed`);
      } else {
        toast.success(`Test email sent to ${res.data?.sent || 0} recipient(s)`);
      }
    } catch (err) {
      toast.error("Failed to send test: " + err.message);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Send Test Email Notification
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Record Type */}
          <div>
            <Label>Record Type</Label>
            <Select value={recordType} onValueChange={v => { setRecordType(v); setRecordId(""); }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RECORD_TYPES.map(rt => <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Record Selector */}
          <div>
            <Label>Search and Select Record</Label>
            <Input
              placeholder="Search by title..."
              value={recordSearch}
              onChange={e => setRecordSearch(e.target.value)}
              className="mt-1 mb-2"
            />
            {loadingRecords ? (
              <p className="text-sm text-muted-foreground">Loading records...</p>
            ) : (
              <div className="border rounded-lg max-h-40 overflow-y-auto">
                {filteredRecords.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3 text-center">No records found</p>
                ) : (
                  filteredRecords.slice(0, 20).map(r => (
                    <button
                      key={r.id}
                      onClick={() => setRecordId(r.id)}
                      className={`w-full text-left p-2 text-sm hover:bg-muted/50 border-b last:border-0 ${recordId === r.id ? "bg-primary/10 font-medium" : ""}`}
                    >
                      {r.title || r.name || "Untitled"}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Event Type */}
          <div>
            <Label>Notification / Event Type</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map(et => <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Test Due Date */}
          <div>
            <Label>Test Due Date (optional)</Label>
            <Input type="date" value={testDueDate} onChange={e => setTestDueDate(e.target.value)} className="mt-1 w-48" />
            <p className="text-xs text-muted-foreground mt-1">Defaults to today if not set. Does not modify any real due dates.</p>
          </div>

          {/* Send Options */}
          <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={sendToMeOnly} onChange={() => { setSendToMeOnly(true); setSendToRecipients(false); }} />
              <span className="text-sm font-medium">Send test only to me ({user?.email})</span>
              <Badge variant="secondary" className="text-xs">Default</Badge>
            </label>
            <label className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : "opacity-50 cursor-not-allowed"}`}>
              <input
                type="radio"
                checked={sendToRecipients}
                disabled={!isAdmin}
                onChange={() => { if (isAdmin) { setSendToMeOnly(false); setSendToRecipients(true); } }}
              />
              <span className="text-sm font-medium">Send to previewed recipients</span>
              {!isAdmin && <Badge variant="outline" className="text-xs">Admin only</Badge>}
            </label>
          </div>

          {/* Results */}
          {result && (
            <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
              <div className="flex items-center gap-2">
                {result.failed === 0 ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : result.sent > 0 ? (
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                <p className="font-medium text-sm">
                  {result.sent} sent, {result.failed} failed
                </p>
              </div>

              {/* Recipient Preview */}
              {result.recipient_preview && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold flex items-center gap-1"><Users className="w-3 h-3" /> Recipient Resolution</p>
                  {result.recipient_preview.mandatory_contacts?.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Mandatory Record Contacts:</p>
                      {result.recipient_preview.mandatory_contacts.map((c, i) => (
                        <div key={i} className="text-xs flex items-center gap-2 ml-3 mb-1">
                          <Mail className="w-3 h-3 text-muted-foreground" />
                          <span>{c.name || "Unknown"}</span>
                          <span className="text-muted-foreground">{c.email || "(no email)"}</span>
                          {c.is_active === false && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                        </div>
                      ))}
                    </div>
                  )}
                  {result.recipient_preview.valid_recipients?.length > 0 && (
                    <div>
                      <p className="text-xs text-green-600 mb-1">Valid Recipients ({result.recipient_preview.valid_recipients.length}):</p>
                      {result.recipient_preview.valid_recipients.map((r, i) => (
                        <div key={i} className="text-xs flex items-center gap-2 ml-3 mb-1">
                          <Mail className="w-3 h-3 text-green-600" />
                          <span>{r.email}</span>
                          <Badge variant="secondary" className="text-xs">{r.source}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  {result.recipient_preview.invalid_or_excluded?.length > 0 && (
                    <div>
                      <p className="text-xs text-red-600 mb-1">Invalid / Excluded:</p>
                      {result.recipient_preview.invalid_or_excluded.map((r, i) => (
                        <div key={i} className="text-xs text-red-600 ml-3 mb-1">
                          {r.email || r.name || "Unknown"} — {r.reason}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Delivery Results */}
              {result.results?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1">Delivery Results:</p>
                  {result.results.map((r, i) => (
                    <div key={i} className="text-xs flex items-center gap-2 ml-3 mb-1">
                      {r.status === "sent" ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <XCircle className="w-3 h-3 text-red-600" />}
                      <span>{r.email}</span>
                      <Badge variant={r.status === "sent" ? "secondary" : "destructive"} className="text-xs">{r.status}</Badge>
                      {r.error && <span className="text-red-600">{r.error}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Email Preview Note */}
          <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
            <Eye className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <span>Test emails are marked [TEST] in subject and body. They do not modify actual due dates, reminder history, or record status. A test audit log is stored.</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleSend} disabled={loading || !recordId}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Sending...</> : <><Send className="w-4 h-4 mr-2" />Send Test Email</>}
          </Button>
        </DialogFooter>

        {/* Confirmation dialog for send to recipients */}
        {showConfirm && (
          <Dialog open onOpenChange={setShowConfirm}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Confirm Send to All Recipients
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This will send a test email to all previewed recipients (record contacts and additional recipients).
                Are you sure you want to proceed?
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
                <Button onClick={doSend}>Confirm & Send</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}