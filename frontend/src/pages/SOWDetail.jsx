import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Pencil, FileText, AlertTriangle, Archive, Package, Receipt, Layers, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SowDeliverablesTab from "@/components/sowdetail/SowDeliverablesTab";
import SowMilestonesTab from "@/components/sowdetail/SowMilestonesTab";
import SowInvoicesTab from "@/components/sowdetail/SowInvoicesTab";
import SowRateCardsTab from "@/components/sowdetail/SowRateCardsTab";
import SowOverviewTab from "@/components/sowdetail/SowOverviewTab";
import SowContactsTab from "@/components/sowdetail/SowContactsTab";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, parseISO, differenceInDays } from "date-fns";
import { calculateDurationLabel } from "@/utils/durationHelper";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SowForm from "@/components/sow/SowForm";

const statusColors = {
  active: "bg-green-100 text-green-700",
  draft: "bg-yellow-100 text-yellow-700",
  expired: "bg-gray-100 text-gray-600",
  terminated: "bg-red-100 text-red-700",
};

export default function SOWDetail() {
  const params = new URLSearchParams(window.location.search);
  const sowId = params.get("id");

  const [sow, setSow] = useState(null);
  const [grant, setGrant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    if (sowId) fetchSow();
  }, [sowId]);

  const fetchSow = async () => {
    const data = await base44.entities.SOW.filter({ id: sowId });
    const s = data[0];
    setSow(s || null);
    if (s?.grant_id) {
      const grants = await base44.entities.Grant.filter({ id: s.grant_id });
      setGrant(grants[0] || null);
    }
    setLoading(false);
  };

  const handleSave = async (formData) => {
    await base44.entities.SOW.update(sow.id, formData);
    setShowEdit(false);
    fetchSow();
  };

  const handleArchive = async () => {
    await base44.entities.SOW.update(sow.id, { archived: true });
    window.location.href = createPageUrl("SOWs");
  };

  const isAdmin = user?.role?.toLowerCase() === "admin";

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!sow) return <div className="p-6 text-muted-foreground">SOW not found.</div>;

  const safeDate = (str) => { try { const d = parseISO(str); return isNaN(d.getTime()) ? null : d; } catch { return null; } };
  const endDate   = sow.end_date   ? safeDate(sow.end_date)   : null;
  const startDate = sow.start_date ? safeDate(sow.start_date) : null;
  const daysLeft = endDate ? differenceInDays(endDate, new Date()) : null;
  const expiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;
  const expired = daysLeft !== null && daysLeft < 0;


  // Aggregate all extracted table arrays
  const rateTables            = Array.isArray(sow.rate_cards)              ? sow.rate_cards              : [];
  const commercialTables      = Array.isArray(sow.commercial_tables)       ? sow.commercial_tables       : [];
  const paymentScheduleTables = Array.isArray(sow.payment_schedule_tables) ? sow.payment_schedule_tables : [];
  const allTables             = [...rateTables, ...commercialTables, ...paymentScheduleTables];
  const totalTableCount       = allTables.length;
  const hasRateTables         = totalTableCount > 0;

  const tableTypeMatch = (t, keyword) =>
    (t.table_type || "").toLowerCase().includes(keyword) ||
    (t.table_title || "").toLowerCase().includes(keyword);

  const hasHourlyRates  = allTables.some(t => tableTypeMatch(t, "hourly"));
  const hasMonthlyRates = allTables.some(t => tableTypeMatch(t, "monthly"));

  // Total contract value: explicit _total_contract_value string first (preserves "USD 39,790")
  const rawTotalValue = sow._total_contract_value || "";
  let totalContractValue = sow.total_value || null;
  if (!totalContractValue && hasRateTables) {
    outer: for (const table of allTables) {
      if (!table.rows) continue;
      for (const row of table.rows) {
        if (Array.isArray(row)) continue;
        const vals = Object.entries(row);
        const isTotal = vals.some(([k]) => k.toLowerCase().includes("total") || k.toLowerCase().includes("grand"));
        if (isTotal) {
          const totalEntry = vals.find(([k, v]) =>
            (k.toLowerCase().includes("total") || k.toLowerCase().includes("cost") || k.toLowerCase().includes("amount")) &&
            v && String(v).trim() !== "" && String(v).trim() !== "At Actuals" && String(v).trim() !== "-"
          );
          if (totalEntry) {
            const raw = String(totalEntry[1]).replace(/[^0-9.]/g, "");
            const parsed = parseFloat(raw);
            if (!isNaN(parsed) && parsed > 0) { totalContractValue = parsed; break outer; }
          }
        }
      }
    }
  }

  let totalValueDisplay = "—";
  if (rawTotalValue) {
    const currency = sow._currency || "";
    totalValueDisplay = (currency && !rawTotalValue.toUpperCase().includes(currency.toUpperCase()))
      ? `${currency} ${rawTotalValue}`
      : rawTotalValue;
  } else if (totalContractValue) {
    totalValueDisplay = typeof totalContractValue === "number"
      ? `$${totalContractValue.toLocaleString()}`
      : totalContractValue;
  } else if (hasRateTables) {
    totalValueDisplay = "See rate card";
  }

  // Personnel: structured array or extracted text
  const personnelText = sow._personnel_assigned || "";
  let personnelCount = sow.personnel?.length || 0;
  if (personnelCount === 0 && hasRateTables) {
    const roles = new Set();
    const skipWords = ["total", "infra", "grand", "subtotal", "overhead"];
    for (const table of allTables) {
      if (!table.rows) continue;
      for (const row of table.rows) {
        if (Array.isArray(row)) continue;
        const roleKey = Object.keys(row).find(k =>
          k.toLowerCase().includes("role") || k.toLowerCase() === "resource" || k.toLowerCase() === "position"
        );
        if (roleKey && row[roleKey]) {
          const val = String(row[roleKey]).trim().toLowerCase();
          if (!skipWords.some(w => val.includes(w))) roles.add(val);
        }
      }
    }
    personnelCount = roles.size;
  }
  const personnelDisplay = personnelText
    ? personnelText
    : personnelCount > 0 ? String(personnelCount) : "—";

  // Duration: prefer extracted text, then calculate from dates using shared helper
  const durationText = sow._duration_or_term || "";
  const durationDisplay = durationText || calculateDurationLabel(sow.start_date, sow.end_date) || "—";

  // Monthly rate display — only show if explicitly set; never show $0
  const monthlyRate = sow.monthly_rate || sow.total_monthly_value || 0;
  let monthlyRateDisplay = "—";
  if (monthlyRate > 0) {
    monthlyRateDisplay = `$${monthlyRate.toLocaleString()}`;
  } else if (hasMonthlyRates) {
    monthlyRateDisplay = "In rate card";
  } else if (hasHourlyRates) {
    monthlyRateDisplay = "Hourly rates";
  } else if (hasRateTables) {
    monthlyRateDisplay = "See rate card";
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to={createPageUrl("SOWs")}>
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            {sow.sow_number && <span className="text-xs font-mono text-muted-foreground">{sow.sow_number}</span>}
            <h1 className="text-2xl font-bold">{sow.title}</h1>
            <Badge className={statusColors[sow.status]}>{sow.status}</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">{sow.vendor_name}</p>
          {grant && (
            <Link to={createPageUrl(`GrantDetail?id=${grant.id}`)} className="text-xs text-primary hover:underline">
              Grant: {grant.title || grant.grant_name} →
            </Link>
          )}
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
          <AlertTriangle className={`w-5 h-5 ${expired ? "text-red-600" : "text-orange-500"}`} />
          <p className={`text-sm font-medium ${expired ? "text-red-700" : "text-orange-700"}`}>
            {expired
              ? `This SOW expired on ${endDate ? format(endDate, "MMMM d, yyyy") : ""}. Please review and renew.`
              : `This SOW expires in ${daysLeft} days (${endDate ? format(endDate, "MMMM d, yyyy") : ""}). Consider renewing soon.`
            }
          </p>
        </div>
      )}

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Monthly Rate</p>
            <p className={`font-bold ${monthlyRateDisplay.length > 6 ? "text-sm mt-1" : "text-xl"}`}>{monthlyRateDisplay}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Personnel</p>
            <p className={`font-bold leading-snug ${personnelDisplay.length > 8 ? "text-xs mt-1" : "text-xl"}`}>{personnelDisplay}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className={`font-bold ${durationDisplay.length > 8 ? "text-sm mt-1" : "text-xl"}`}>{durationDisplay}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Contract Value</p>
            <p className={`font-bold ${totalValueDisplay.length > 10 ? "text-sm mt-1" : "text-xl"}`}>{totalValueDisplay}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6">
          <TabsTrigger value="overview"><FileText className="w-4 h-4 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="ratecards">
            Rate Cards
            {hasRateTables && <Badge className="ml-1.5 text-xs px-1.5 py-0 bg-blue-100 text-blue-700">{totalTableCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="deliverables"><Package className="w-4 h-4 mr-1" />Deliverables</TabsTrigger>
          <TabsTrigger value="milestones"><Layers className="w-4 h-4 mr-1" />Milestones</TabsTrigger>
          <TabsTrigger value="invoices"><Receipt className="w-4 h-4 mr-1" />Invoices</TabsTrigger>
          <TabsTrigger value="contacts"><Users className="w-4 h-4 mr-1" />Contacts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <SowOverviewTab
            sow={sow}
            startDate={startDate}
            endDate={endDate}
            daysLeft={daysLeft}
            expired={expired}
            expiringSoon={expiringSoon}
            personnelText={personnelText}
            durationText={durationText}
            totalValueDisplay={totalValueDisplay}
          />
        </TabsContent>

        <TabsContent value="ratecards">
          <SowRateCardsTab sow={sow} />
        </TabsContent>

        <TabsContent value="deliverables">
          <SowDeliverablesTab sowId={sow.id} pdfUrl={sow.pdf_url} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="milestones">
          <SowMilestonesTab sowId={sow.id} pdfUrl={sow.pdf_url} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="invoices">
          <SowInvoicesTab sowId={sow.id} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="contacts">
          <SowContactsTab sow={sow} onUpdate={fetchSow} isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>

      {showEdit && (
        <Dialog open onOpenChange={() => setShowEdit(false)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>Edit SOW</DialogTitle></DialogHeader>
            <SowForm initialData={sow} grants={[]} onSave={handleSave} onCancel={() => setShowEdit(false)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}