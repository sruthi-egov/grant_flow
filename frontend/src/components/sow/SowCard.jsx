import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DollarSign, Calendar, Users, ArrowRight, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, parseISO, differenceInDays } from "date-fns";

const statusColors = {
  active: "bg-green-100 text-green-700",
  draft: "bg-yellow-100 text-yellow-700",
  expired: "bg-gray-100 text-gray-600",
  terminated: "bg-red-100 text-red-700",
};

function safeParse(dateStr) {
  if (!dateStr) return null;
  try {
    const d = parseISO(dateStr);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

export default function SowCard({ sow, grantName }) {
  const endDate = safeParse(sow.end_date);
  const daysLeft = endDate ? differenceInDays(endDate, new Date()) : null;
  const expiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;
  const expired = daysLeft !== null && daysLeft < 0;

  return (
    <Card className="hover:shadow-md transition-shadow h-full">
      <Link to={createPageUrl(`SOWDetail?id=${sow.id}`)} className="block h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              {sow.sow_number && <p className="text-xs text-muted-foreground font-mono mb-1">{sow.sow_number}</p>}
              <CardTitle className="text-base leading-snug">{sow.title}</CardTitle>
            </div>
            <Badge className={`${statusColors[sow.status]} shrink-0`}>{sow.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{sow.vendor_name}</p>
          {grantName && <p className="text-xs text-primary/70">Grant: {grantName}</p>}
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-3">
            {(sow.monthly_rate || sow.total_monthly_value) > 0 && (
              <div className="flex items-center gap-1 text-sm">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="font-semibold">${(sow.monthly_rate || sow.total_monthly_value).toLocaleString()}/mo</span>
              </div>
            )}
            {sow.personnel?.length > 0 && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{sow.personnel.length} personnel</span>
              </div>
            )}
          </div>
          {endDate && (
            <div className={`flex items-center gap-1 text-xs ${expired ? "text-red-600" : expiringSoon ? "text-orange-500" : "text-muted-foreground"}`}>
              <Calendar className="w-3 h-3" />
              {expired
                ? `Expired ${format(endDate, "MMM d, yyyy")}`
                : `Expires ${format(endDate, "MMM d, yyyy")} (${daysLeft}d left)`
              }
            </div>
          )}
          <div className="flex justify-end">
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}