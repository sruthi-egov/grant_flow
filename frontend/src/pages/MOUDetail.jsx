import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Pencil, ExternalLink, AlertTriangle, Handshake, Mail, Target, Scale, Archive, List, Package, Layers, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CommitmentsTab from "@/components/moudetail/CommitmentsTab";
import MouDeliverablesTab from "@/components/moudetail/MouDeliverablesTab";
import MouMilestonesTab from "@/components/moudetail/MouMilestonesTab";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, parseISO, differenceInDays } from "date-fns";
import { calculateDurationLabel } from "@/utils/durationHelper";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import MouForm from "@/components/mou/MouForm";
import MouContactsTab from "@/components/moudetail/MouContactsTab";
import StructuredText from "@/components/shared/StructuredText";

const statusColors = {
  active: "bg-green-100 text-green-700",
  draft: "bg-yellow-100 text-yellow-700",
  expired: "bg-gray-100 text-gray-600",
  terminated: "bg-red-100 text-red-700",
};

const partnerTypeColors = {
  government: "bg-blue-100 text-blue-700",
  ngo: "bg-purple-100 text-purple-700",
  private: "bg-orange-100 text-orange-700",
  academic: "bg-teal-100 text-teal-700",
  multilateral: "bg-indigo-100 text-indigo-700",
  other: "bg-gray-100 text-gray-600",
};

export default function MOUDetail() {
  const params = new URLSearchParams(window.location.search);
  const mouId = params.get("id");

  const [mou, setMou] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    api.auth.me().then(setUser).catch(() => {});
    if (mouId) fetchData();
  }, [mouId]);

  const fetchData = async () => {
    const data = await api.entities.MOU.filter({ id: mouId });
    setMou(data[0] || null);
    setLoading(false);
  };

  const handleSave = async (formData) => {
    await api.entities.MOU.update(mou.id, formData);
    setShowEdit(false);
    fetchData();
  };

  const handleArchive = async () => {
    await api.entities.MOU.update(mou.id, { archived: true });
    window.location.href = createPageUrl("MOUs");
  };

  const isAdmin = user?.role === "admin";

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!mou) return <div className="p-6 text-muted-foreground">MOU not found.</div>;

  const safeDate = (str) => { try { const d = parseISO(str); return isNaN(d.getTime()) ? null : d; } catch { return null; } };
  const endDate = mou.end_date ? safeDate(mou.end_date) : null;
  const effectiveDate = mou.effective_date ? safeDate(mou.effective_date) : null;
  const daysLeft = endDate ? differenceInDays(endDate, new Date()) : null;
  const expiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 60;
  const expired = daysLeft !== null && daysLeft < 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to={createPageUrl("MOUs")}>
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{mou.title}</h1>
            <Badge className={statusColors[mou.status]}>{mou.status}</Badge>
            {mou.partner_type && (
              <Badge className={partnerTypeColors[mou.partner_type]}>{mou.partner_type}</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-1">{mou.partner_name}</p>
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

      {(expiringSoon || expired) && (
        <div className={`flex items-center gap-3 p-4 rounded-lg mb-6 ${expired ? "bg-red-50 border border-red-200" : "bg-orange-50 border border-orange-200"}`}>
          <AlertTriangle className={`w-5 h-5 shrink-0 ${expired ? "text-red-600" : "text-orange-500"}`} />
          <p className={`text-sm font-medium ${expired ? "text-red-700" : "text-orange-700"}`}>
            {expired
              ? `This MOU expired on ${endDate ? format(endDate, "MMMM d, yyyy") : ""}. Please review and renew if needed.`
              : `This MOU expires in ${daysLeft} days (${endDate ? format(endDate, "MMMM d, yyyy") : ""}). Consider renewing soon.`
            }
          </p>
        </div>
      )}

      <Tabs defaultValue="details">
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="details"><Handshake className="w-4 h-4 mr-1" />Details</TabsTrigger>
          <TabsTrigger value="commitments"><List className="w-4 h-4 mr-1" />Commitments</TabsTrigger>
          <TabsTrigger value="deliverables"><Package className="w-4 h-4 mr-1" />Deliverables</TabsTrigger>
          <TabsTrigger value="milestones"><Layers className="w-4 h-4 mr-1" />Milestones</TabsTrigger>
          <TabsTrigger value="contacts"><Users className="w-4 h-4 mr-1" />Contacts</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {mou.purpose && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Purpose & Background</CardTitle></CardHeader>
              <CardContent>
                <StructuredText text={mou.purpose} />
              </CardContent>
            </Card>
          )}

          {mou.scope_of_collaboration && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="w-4 h-4" /> Scope of Collaboration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StructuredText text={mou.scope_of_collaboration} />
              </CardContent>
            </Card>
          )}

          {mou.notes && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Notes</CardTitle></CardHeader>
              <CardContent>
                <StructuredText text={mou.notes} />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Agreement Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {effectiveDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Effective Date</span>
                  <span className="font-medium">{format(effectiveDate, "MMM d, yyyy")}</span>
                </div>
              )}
              {(() => {
                const termLabel = calculateDurationLabel(mou.effective_date, mou.end_date);
                if (termLabel && termLabel !== "—") {
                  return (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Initial Term</span>
                      <span className="font-medium">{termLabel}</span>
                    </div>
                  );
                }
                if (mou.initial_term_years) {
                  return (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Initial Term</span>
                      <span className="font-medium">{mou.initial_term_years} year{mou.initial_term_years === 1 ? "" : "s"}</span>
                    </div>
                  );
                }
                return null;
              })()}
              {endDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">End Date</span>
                  <span className={`font-medium ${expired ? "text-red-600" : expiringSoon ? "text-orange-600" : ""}`}>
                    {format(endDate, "MMM d, yyyy")}
                  </span>
                </div>
              )}
              {daysLeft !== null && !expired && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Days Remaining</span>
                  <span className={`font-bold ${expiringSoon ? "text-orange-600" : "text-green-600"}`}>{daysLeft}</span>
                </div>
              )}
              {mou.governing_law && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0 flex items-center gap-1"><Scale className="w-3 h-3" />Governing Law</span>
                  <span className="font-medium text-right">{mou.governing_law}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Partner</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Handshake className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">{mou.partner_name}</p>
                  {mou.partner_address && <p className="text-xs text-muted-foreground mt-0.5">{mou.partner_address}</p>}
                </div>
              </div>
              {mou.partner_signatory_name && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Signed by: </span>
                  <span>{mou.partner_signatory_name}{mou.partner_signatory_designation ? `, ${mou.partner_signatory_designation}` : ""}</span>
                </div>
              )}
              {mou.partner_contact_email && (
                <a href={`mailto:${mou.partner_contact_email}`} className="flex items-center gap-2 text-primary hover:underline text-xs">
                  <Mail className="w-3 h-3" /> {mou.partner_contact_email}
                </a>
              )}
            </CardContent>
          </Card>

          {mou.our_signatory_name && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Our Signatory</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-medium">{mou.our_signatory_name}</p>
                {mou.our_signatory_designation && <p className="text-xs text-muted-foreground">{mou.our_signatory_designation}</p>}
                {mou.our_contact_email && (
                  <a href={`mailto:${mou.our_contact_email}`} className="flex items-center gap-2 text-primary hover:underline text-xs">
                    <Mail className="w-3 h-3" /> {mou.our_contact_email}
                  </a>
                )}
              </CardContent>
            </Card>
          )}

          {mou.pdf_url && (
            <Card>
              <CardContent className="p-4">
                <a href={mou.pdf_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full gap-2">
                    <ExternalLink className="w-4 h-4" /> View MOU PDF
                  </Button>
                </a>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

        </TabsContent>

        <TabsContent value="commitments">
          <CommitmentsTab mouId={mou.id} pdfUrl={mou.pdf_url} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="deliverables">
          <MouDeliverablesTab mouId={mou.id} pdfUrl={mou.pdf_url} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="milestones">
          <MouMilestonesTab mouId={mou.id} pdfUrl={mou.pdf_url} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="contacts">
          <MouContactsTab mou={mou} pdfUrl={mou.pdf_url} isAdmin={isAdmin} onUpdate={fetchData} />
        </TabsContent>
      </Tabs>

      {showEdit && (
        <Dialog open onOpenChange={() => setShowEdit(false)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>Edit MOU</DialogTitle></DialogHeader>
            <MouForm initialData={mou} onSave={handleSave} onCancel={() => setShowEdit(false)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}