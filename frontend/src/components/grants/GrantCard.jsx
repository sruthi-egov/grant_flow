import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Archive, ExternalLink, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";

const STATUS_COLORS = {
  active: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
  archived: "bg-gray-100 text-gray-700",
};

export default function GrantCard({ grant, isAdmin, onArchive }) {
  const title = grant.title || grant.grant_name || "Untitled Grant";
  const funder = grant.funder || grant.grantor || "—";
  const status = grant.status || "active";

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <Link to={createPageUrl(`GrantDetail?id=${grant.id}`)} className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm leading-tight hover:text-primary transition-colors line-clamp-2">
              {title}
            </h3>
          </Link>
          <Badge className={`shrink-0 text-xs ${STATUS_COLORS[status] || "bg-gray-100 text-gray-700"}`}>
            {status}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{funder}</p>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {grant.grant_number && <span className="font-mono">#{grant.grant_number}</span>}
          {grant.total_amount && (
            <span className="font-semibold text-foreground">
              ${grant.total_amount.toLocaleString()}
            </span>
          )}
        </div>

        {(grant.start_date || grant.end_date) && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <span>
              {grant.start_date ? format(parseISO(grant.start_date), "d MMM yyyy") : "—"}
              {" → "}
              {grant.end_date ? format(parseISO(grant.end_date), "d MMM yyyy") : "—"}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <Link to={createPageUrl(`GrantDetail?id=${grant.id}`)}>
            <Button variant="outline" size="sm" className="text-xs gap-1 h-7">
              <ExternalLink className="w-3 h-3" /> View
            </Button>
          </Link>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1 h-7 text-muted-foreground hover:text-destructive"
              onClick={() => onArchive(grant)}
            >
              <Archive className="w-3 h-3" /> Archive
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}