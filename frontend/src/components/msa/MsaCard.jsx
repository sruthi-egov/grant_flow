import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, ArrowRight, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, parseISO, differenceInDays } from "date-fns";

const statusColors = {
  active: "bg-green-100 text-green-700",
  draft: "bg-yellow-100 text-yellow-700",
  expired: "bg-gray-100 text-gray-600",
  terminated: "bg-red-100 text-red-700",
};

export default function MsaCard({ msa, linkedSowCount }) {
  const daysLeft = msa.end_date ? differenceInDays(parseISO(msa.end_date), new Date()) : null;
  const expiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 60;
  const expired = daysLeft !== null && daysLeft < 0;

  return (
    <Card className="hover:shadow-md transition-shadow h-full">
      <Link to={createPageUrl(`MSADetail?id=${msa.id}`)} className="block h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">{msa.title}</CardTitle>
            <Badge className={`${statusColors[msa.status]} shrink-0`}>{msa.status}</Badge>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Building2 className="w-3 h-3" />
            {msa.vendor_name}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {msa.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{msa.description}</p>
          )}
          <div className="flex flex-wrap gap-3">
            {msa.effective_date && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span>From {format(parseISO(msa.effective_date), "MMM d, yyyy")}</span>
              </div>
            )}
            {msa.end_date && (
              <div className={`flex items-center gap-1 text-xs ${expired ? "text-red-600" : expiringSoon ? "text-orange-500" : "text-muted-foreground"}`}>
                <Calendar className="w-3 h-3" />
                <span>{expired ? "Expired" : `Until`} {format(parseISO(msa.end_date), "MMM d, yyyy")}</span>
              </div>
            )}
          </div>
          {linkedSowCount > 0 && (
            <p className="text-xs text-primary/70">{linkedSowCount} linked SOW{linkedSowCount > 1 ? "s" : ""}</p>
          )}
          <div className="flex justify-end">
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}