import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutList } from "lucide-react";

function confidenceColor(score) {
  if (!score) return "bg-gray-100 text-gray-600";
  if (score >= 80) return "bg-green-100 text-green-700";
  if (score >= 50) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

function RateTable({ table }) {
  const columns = table.columns || [];
  const rows = table.rows || [];

  if (columns.length === 0 && rows.length === 0) return null;

  // Derive columns from first row if none declared
  const effectiveCols = columns.length > 0
    ? columns
    : (rows[0] && !Array.isArray(rows[0]) ? Object.keys(rows[0]) : []);

  const getCellValue = (row, col, idx) => {
    if (Array.isArray(row)) return String(row[idx] ?? "");
    return String(row[col] ?? row[Object.keys(row)[idx]] ?? "");
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted/50">
            {effectiveCols.map((col, i) => (
              <th key={i} className="text-left p-2 font-medium text-xs border-b whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b hover:bg-muted/20">
              {effectiveCols.length > 0
                ? effectiveCols.map((col, ci) => (
                    <td key={ci} className="p-2 text-xs text-foreground">
                      {getCellValue(row, col, ci)}
                    </td>
                  ))
                : Object.values(row).map((val, vi) => (
                    <td key={vi} className="p-2 text-xs text-foreground">{String(val ?? "")}</td>
                  ))
              }
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableCard({ table, idx, sectionLabel }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <LayoutList className="w-4 h-4 text-muted-foreground shrink-0" />
            <CardTitle className="text-base">
              {table.table_title || `${sectionLabel} ${idx + 1}`}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {table.table_type && (
              <Badge variant="outline" className="text-xs">{table.table_type}</Badge>
            )}
            {table.currency && (
              <Badge variant="outline" className="text-xs">{table.currency}</Badge>
            )}
            {table.billing_frequency && (
              <Badge variant="outline" className="text-xs">{table.billing_frequency}</Badge>
            )}
            {table.extraction_confidence != null && (
              <Badge className={`text-xs ${confidenceColor(table.extraction_confidence)}`}>
                {table.extraction_confidence}% confidence
              </Badge>
            )}
          </div>
        </div>
        {table.notes && (
          <p className="text-xs text-muted-foreground mt-1">{table.notes}</p>
        )}
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <RateTable table={table} />
      </CardContent>
    </Card>
  );
}

export default function SowRateCardsTab({ sow }) {
  const rateTables             = Array.isArray(sow?.rate_cards)              ? sow.rate_cards              : [];
  const commercialTables       = Array.isArray(sow?.commercial_tables)       ? sow.commercial_tables       : [];
  const paymentScheduleTables  = Array.isArray(sow?.payment_schedule_tables) ? sow.payment_schedule_tables : [];

  const totalCount = rateTables.length + commercialTables.length + paymentScheduleTables.length;

  if (totalCount === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No rate cards or commercial tables available for this SoW.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {rateTables.map((table, idx) => (
        <TableCard key={`rc-${idx}`} table={table} idx={idx} sectionLabel="Rate Card" />
      ))}
      {commercialTables.map((table, idx) => (
        <TableCard key={`ct-${idx}`} table={table} idx={idx} sectionLabel="Commercial Table" />
      ))}
      {paymentScheduleTables.map((table, idx) => (
        <TableCard key={`ps-${idx}`} table={table} idx={idx} sectionLabel="Payment Schedule" />
      ))}
    </div>
  );
}