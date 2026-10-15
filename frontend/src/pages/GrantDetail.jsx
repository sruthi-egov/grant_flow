import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, DollarSign, Calendar, Users, FileText, Bell, GitBranch, Layers, Package, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import GrantOverview from "@/components/grantdetail/GrantOverview";
import MilestonesTab from "@/components/grantdetail/MilestonesTab";
import TranchesTab from "@/components/grantdetail/TranchesTab.jsx";
import GrantDeliverablesTab from "@/components/grantdetail/GrantDeliverablesTab";
import ReportingTab from "@/components/grantdetail/ReportingTab";
import ContactsTab from "@/components/grantdetail/ContactsTab";
import NotificationsTab from "@/components/grantdetail/NotificationsTab";
import EditGrantModal from "@/components/grants/EditGrantModal";
import TimelineTab from "@/components/grantdetail/TimelineTab";

const statusColors = {
  active: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-gray-100 text-gray-600",
};

export default function GrantDetail() {
  const params = new URLSearchParams(window.location.search);
  const grantId = params.get("id");

  const [grant, setGrant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    if (grantId) {
      base44.entities.Grant.filter({ id: grantId }).then(data => {
        setGrant(data[0] || null);
        setLoading(false);
      });
    }
  }, [grantId]);

  const refetch = async () => {
    const data = await base44.entities.Grant.filter({ id: grantId });
    setGrant(data[0] || null);
  };

  const isAdmin = user?.role === "admin";

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!grant) return <div className="p-6 text-muted-foreground">Grant not found.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to={createPageUrl("Grants")}>
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{grant.title || grant.grant_name}</h1>
            <Badge className={statusColors[grant.status]}>{grant.status}</Badge>
          </div>
          {(grant.funder || grant.grantor) && <p className="text-muted-foreground text-sm mt-1">{grant.funder || grant.grantor}</p>}
        </div>
        {grant.pdf_url && (
          <a href={grant.pdf_url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="w-4 h-4" /> Agreement
            </Button>
          </a>
        )}
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setShowEdit(true)} className="gap-2">
            <Pencil className="w-4 h-4" /> Edit
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="overview" className="gap-2"><FileText className="w-4 h-4" />Overview</TabsTrigger>
          <TabsTrigger value="tranches" className="gap-2"><DollarSign className="w-4 h-4" />Tranches</TabsTrigger>
          <TabsTrigger value="deliverables" className="gap-2"><Package className="w-4 h-4" />Deliverables</TabsTrigger>
          <TabsTrigger value="milestones" className="gap-2"><Layers className="w-4 h-4" />Milestones</TabsTrigger>
          <TabsTrigger value="reporting" className="gap-2"><Calendar className="w-4 h-4" />Reporting</TabsTrigger>
          <TabsTrigger value="contacts" className="gap-2"><Users className="w-4 h-4" />Contacts</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2"><Bell className="w-4 h-4" />Notifications</TabsTrigger>
          <TabsTrigger value="timeline" className="gap-2"><GitBranch className="w-4 h-4" />Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <GrantOverview grant={grant} />
        </TabsContent>
        <TabsContent value="tranches">
          <TranchesTab grantId={grant.id} grant={grant} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="deliverables">
          <GrantDeliverablesTab grantId={grant.id} pdfUrl={grant.pdf_url} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="milestones">
          <MilestonesTab grantId={grant.id} pdfUrl={grant.pdf_url} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="reporting">
          <ReportingTab grantId={grant.id} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="contacts">
          <ContactsTab grant={grant} onUpdate={refetch} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsTab grant={grant} onUpdate={refetch} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineTab grantId={grant.id} />
        </TabsContent>
      </Tabs>

      {showEdit && (
        <EditGrantModal
          grant={grant}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); refetch(); }}
        />
      )}
    </div>
  );
}