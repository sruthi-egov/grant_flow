import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, ArrowRight, Handshake } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, parseISO, differenceInDays } from "date-fns";

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

export default function MouCard({ mou }) {
  const safeDate = (str) => { try { const d = parseISO(str); return isNaN(d) ? null : d; } catch { return null; } };
  const endDate = mou.end_date ? safeDate(mou.end_date) : null;
  const effectiveDate = mou.effective_date ? safeDate(mou.effective_date) : null;
  const daysLeft = endDate ? differenceInDays(endDate, new Date()) : null;
  const expiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 60;
  const expired = daysLeft !== null && daysLeft < 0;

  return (
    <Card className="hover:shadow-md transition-shadow h-full">
      <Link to={createPageUrl(`MOUDetail?id=${mou.id}`)} className="block h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">{mou.title}</CardTitle>
            <Badge className={`${statusColors[mou.status]} shrink-0`}>{mou.status}</Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Handshake className="w-3 h-3" />
              {mou.partner_name}
            </div>
            {mou.partner_type && (
              <Badge className={`${partnerTypeColors[mou.partner_type]} text-xs`}>{mou.partner_type}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {mou.purpose && (
            <p className="text-xs text-muted-foreground line-clamp-2">{mou.purpose}</p>
          )}
          <div className="flex flex-wrap gap-3">
            {effectiveDate && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span>From {format(effectiveDate, "MMM d, yyyy")}</span>
              </div>
            )}
            {endDate && (
              <div className={`flex items-center gap-1 text-xs ${expired ? "text-red-600" : expiringSoon ? "text-orange-500" : "text-muted-foreground"}`}>
                <Calendar className="w-3 h-3" />
                <span>{expired ? "Expired" : "Until"} {format(endDate, "MMM d, yyyy")}</span>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}