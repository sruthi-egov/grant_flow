import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Pencil, ExternalLink, AlertTriangle, Building2, Mail, FileText, Scale, Archive, List } from "lucide-react";
import ScopeOfServicesSection from "@/components/msadetail/ScopeOfServicesSection";
import MsaContactsTab from "@/components/msadetail/MsaContactsTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import KeyClausesTab from "@/components/msadetail/KeyClausesTab";
import { Users } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, parseISO, differenceInDays } from "date-fns";
import { calculateDurationLabel } from "@/utils/durationHelper";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import MsaForm from "@/components/msa/MsaForm";

const statusColors = {
  active: "bg-green-100 text-green-700",
  draft: "bg-yellow-100 text-yellow-700",
  expired: "bg-gray-100 text-gray-600",
  terminated: "bg-red-100 text-red-700",
};

export default function MSADetail() {
  const params = new URLSearchParams(window.location.search);
  const msaId = params.get("id");

  const [msa, setMsa] = useState(null);
  const [linkedSows, setLinkedSows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    api.auth.me().then(setUser).catch(() => {});
    if (msaId) fetchData();
  }, [msaId]);

  const fetchData = async () => {
    const [data, sows] = await Promise.all([
      api.entities.MSA.filter({ id: msaId }),
      api.entities.SOW.filter({ msa_id: msaId }),
    ]);
    setMsa(data[0] || null);
    setLinkedSows(sows);
    setLoading(false);
  };

  const handleSave = async (formData) => {
    await api.entities.MSA.update(msa.id, formData);
    setShowEdit(false);
    fetchData();
  };

  const handleArchive = async () => {
    await api.entities.MSA.update(msa.id, { archived: true });
    window.location.href = createPageUrl("MSAs");
  };

  const isAdmin = user?.role === "admin";

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!msa) return <div className="p-6 text-muted-foreground">MSA not found.</div>;

  const daysLeft = msa.end_date ? differenceInDays(parseISO(msa.end_date), new Date()) : null;
  const expiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 60;
  const expired = daysLeft !== null && daysLeft < 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to={createPageUrl("MSAs")}>
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{msa.title}</h1>
            <Badge className={statusColors[msa.status]}>{msa.status}</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">{msa.vendor_name}</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowEdit(true)} className="gap-2">
              <Pencil className="w-4 h-4" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={handleArchive} className="gap-2 text-muted-foreground">
              <Archive className="w-4 h-4" /> Archive
            </Button>
          </div>
        )}
      </div>

      {/* Expiry alert */}
      {(expiringSoon || expired) && (
        <div className={`flex items-center gap-3 p-4 rounded-lg mb-6 ${expired ? "bg-red-50 border border-red-200" : "bg-orange-50 border border-orange-200"}`}>
          <AlertTriangle className={`w-5 h-5 shrink-0 ${expired ? "text-red-600" : "text-orange-500"}`} />
          <p className={`text-sm font-medium ${expired ? "text-red-700" : "text-orange-700"}`}>
            {expired
              ? `This MSA expired on ${format(parseISO(msa.end_date), "MMMM d, yyyy")}. Please renew or renegotiate.`
              : `This MSA expires in ${daysLeft} days (${format(parseISO(msa.end_date), "MMMM d, yyyy")}). Consider renewing before expiry.`
            }
          </p>
        </div>
      )}

      <Tabs defaultValue="details">
        <TabsList className="mb-6">
          <TabsTrigger value="details"><FileText className="w-4 h-4 mr-1" />Details</TabsTrigger>
          <TabsTrigger value="contacts"><Users className="w-4 h-4 mr-1" />Contacts</TabsTrigger>
          <TabsTrigger value="clauses"><List className="w-4 h-4 mr-1" />Key Clauses</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          <ScopeOfServicesSection msa={msa} isAdmin={isAdmin} onServicesUpdated={fetchData} />

          {msa.key_terms && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Scale className="w-4 h-4" /> Key Terms & Conditions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{msa.key_terms}</p>
              </CardContent>
            </Card>
          )}

          {/* Linked SOWs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-4 h-4" /> Linked Statements of Work
              </CardTitle>
            </CardHeader>
            <CardContent>
              {linkedSows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No SOWs linked to this MSA yet.</p>
              ) : (
                <div className="space-y-2">
                  {linkedSows.map(sow => (
                    <Link key={sow.id} to={createPageUrl(`SOWDetail?id=${sow.id}`)}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors">
                      <div>
                        <p className="text-sm font-medium">{sow.title}</p>
                        <p className="text-xs text-muted-foreground">{sow.sow_number} · {sow.status}</p>
                      </div>
                      {sow.total_monthly_value > 0 && (
                        <span className="text-sm font-semibold">${sow.total_monthly_value.toLocaleString()}/mo</span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {msa.notes && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Notes</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{msa.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Agreement Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {msa.msa_number && <div className="flex justify-between"><span className="text-muted-foreground">MSA Number</span><span className="font-medium">{msa.msa_number}</span></div>}
              {msa.effective_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Effective Date</span>
                  <span className="font-medium">{format(parseISO(msa.effective_date), "MMM d, yyyy")}</span>
                </div>
              )}
              {(() => {
                const termLabel = calculateDurationLabel(msa.effective_date, msa.end_date);
                if (termLabel && termLabel !== "—") {
                  return (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Initial Term</span>
                      <span className="font-medium">{termLabel}</span>
                    </div>
                  );
                }
                if (msa.initial_term_years) {
                  return (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Initial Term</span>
                      <span className="font-medium">{msa.initial_term_years} year{msa.initial_term_years === 1 ? "" : "s"}</span>
                    </div>
                  );
                }
                return null;
              })()}
              {msa.end_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">End Date</span>
                  <span className={`font-medium ${expired ? "text-red-600" : expiringSoon ? "text-orange-600" : ""}`}>
                    {format(parseISO(msa.end_date), "MMM d, yyyy")}
                  </span>
                </div>
              )}
              {daysLeft !== null && !expired && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Days Remaining</span>
                  <span className={`font-bold ${expiringSoon ? "text-orange-600" : "text-green-600"}`}>{daysLeft}</span>
                </div>
              )}
              {msa.governing_law && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Governing Law</span><span className="font-medium text-right">{msa.governing_law}</span></div>}
              {msa.notice_period && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Notice Period</span><span className="font-medium text-right">{msa.notice_period}</span></div>}
              {msa.liability_cap && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Liability Cap</span><span className="font-medium text-right">{msa.liability_cap}</span></div>}
              {msa.ip_ownership && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">IP Ownership</span><span className="font-medium text-right">{msa.ip_ownership}</span></div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Service Provider</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">{msa.vendor_name}</p>
                  {msa.vendor_address && <p className="text-xs text-muted-foreground mt-0.5">{msa.vendor_address}</p>}
                </div>
              </div>
              {msa.vendor_contact_name && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">Contact:</span>
                  <span className="text-xs">{msa.vendor_contact_name}</span>
                </div>
              )}
              {msa.vendor_contact_email && (
                <a href={`mailto:${msa.vendor_contact_email}`} className="flex items-center gap-2 text-primary hover:underline text-xs">
                  <Mail className="w-3 h-3" /> {msa.vendor_contact_email}
                </a>
              )}
            </CardContent>
          </Card>

          {msa.our_contact_name && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Our Contact</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-medium">{msa.our_contact_name}</p>
                {msa.our_contact_email && (
                  <a href={`mailto:${msa.our_contact_email}`} className="flex items-center gap-2 text-primary hover:underline text-xs">
                    <Mail className="w-3 h-3" /> {msa.our_contact_email}
                  </a>
                )}
              </CardContent>
            </Card>
          )}

          {msa.pdf_url && (
            <Card>
              <CardContent className="p-4">
                <a href={msa.pdf_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full gap-2">
                    <ExternalLink className="w-4 h-4" /> View MSA PDF
                  </Button>
                </a>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

        </TabsContent>
        <TabsContent value="contacts">
          <MsaContactsTab msa={msa} onUpdate={fetchData} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="clauses">
          <KeyClausesTab msaId={msa.id} isAdmin={isAdmin} msaPdfUrl={msa.pdf_url} />
        </TabsContent>
      </Tabs>

      {showEdit && (
        <Dialog open onOpenChange={() => setShowEdit(false)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>Edit MSA</DialogTitle></DialogHeader>
            <MsaForm initialData={msa} onSave={handleSave} onCancel={() => setShowEdit(false)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}