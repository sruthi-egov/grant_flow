import { Badge } from "@/components/ui/badge";
import { differenceInDays, isBefore, parseISO } from "date-fns";

const today = new Date();
today.setHours(0, 0, 0, 0);

export function StatusBadge({ dateStr }) {
  if (!dateStr) return null;
  const d = parseISO(dateStr);
  if (isBefore(d, today)) return <Badge className="bg-red-100 text-red-700">Overdue</Badge>;
  const diff = differenceInDays(d, today);
  if (diff <= 7) return <Badge className="bg-amber-100 text-amber-700">Due Soon</Badge>;
  return <Badge className="bg-green-100 text-green-700">Upcoming</Badge>;
}

export function SectionHeader({ title, count }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className="text-base font-bold">{title}</h2>
      <Badge variant="outline" className="text-xs">{count}</Badge>
    </div>
  );
}

export function EmptyRow({ cols }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-4 text-sm text-muted-foreground text-center italic">
        No items to display
      </td>
    </tr>
  );
}

export function Th({ children }) {
  return <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{children}</th>;
}

export function Td({ children, className = "" }) {
  return <td className={`px-4 py-3 text-sm align-middle ${className}`}>{children}</td>;
}

export function KpiChip({ value, label, color = "blue" }) {
  const colors = {
    red: "bg-red-50 border-red-200 text-red-600 label-red-700",
    amber: "bg-amber-50 border-amber-200 text-amber-600",
    green: "bg-green-50 border-green-200 text-green-600",
    blue: "bg-blue-50 border-blue-200 text-blue-600",
    orange: "bg-orange-50 border-orange-200 text-orange-600",
  };
  const labelColors = { red: "text-red-700", amber: "text-amber-700", green: "text-green-700", blue: "text-blue-700", orange: "text-orange-700" };
  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${colors[color]}`}>
      <span className={`text-lg font-bold ${colors[color].split(" ")[2]}`}>{value}</span>
      <span className={`text-xs font-medium ${labelColors[color]}`}>{label}</span>
    </div>
  );
}

export function TableWrap({ children }) {
  return <div className="border rounded-lg overflow-x-auto"><table className="w-full text-sm"><tbody className="divide-y">{children}</tbody></table></div>;
}

export function TableWithHead({ head, children }) {
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b"><tr>{head}</tr></thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export function getToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}