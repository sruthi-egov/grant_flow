/**
 * RateCardTableEditor
 * Displays and allows editing of extracted rate card / commercial tables.
 * Used in both SoW and MoU extraction review panels and detail pages.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Table } from "lucide-react";

function confidenceBadge(score) {
  if (score >= 80) return "bg-green-100 text-green-700";
  if (score >= 40) return "bg-yellow-100 text-yellow-700";
  return "bg-orange-100 text-orange-700";
}

function SingleRateTable({ table, onChange, onDelete, readOnly }) {
  const [t, setT] = useState(table);

  const update = (next) => { setT(next); onChange(next); };

  const setCell = (rowIdx, col, value) => {
    const rows = t.rows.map((r, i) =>
      i === rowIdx ? { ...r, [col]: value } : r
    );
    update({ ...t, rows });
  };

  const addRow = () => {
    const emptyRow = Object.fromEntries((t.columns || []).map(c => [c, ""]));
    update({ ...t, rows: [...(t.rows || []), emptyRow] });
  };

  const deleteRow = (idx) => {
    update({ ...t, rows: t.rows.filter((_, i) => i !== idx) });
  };

  const columns = t.columns || [];
  const rows = t.rows || [];

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Table header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b gap-2">
        <div className="flex items-center gap-2">
          <Table className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">{t.table_title || "Rate Table"}</span>
          {t.table_type && (
            <Badge variant="outline" className="text-xs px-1.5 py-0">{t.table_type}</Badge>
          )}
          {t.currency && (
            <Badge variant="outline" className="text-xs px-1.5 py-0">{t.currency}</Badge>
          )}
          {t.billing_frequency && (
            <Badge variant="outline" className="text-xs px-1.5 py-0">{t.billing_frequency}</Badge>
          )}
          {typeof t.extraction_confidence === "number" && (
            <Badge className={`text-xs px-1.5 py-0 ${confidenceBadge(t.extraction_confidence)}`}>
              {t.extraction_confidence}% confidence
            </Badge>
          )}
        </div>
        {!readOnly && onDelete && (
          <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Table grid */}
      {columns.length > 0 && rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/20 border-b">
                {columns.map(col => (
                  <th key={col} className="text-left px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap">
                    {col}
                  </th>
                ))}
                {!readOnly && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b last:border-0 hover:bg-muted/10">
                  {columns.map(col => (
                    <td key={col} className="px-1 py-1">
                      {readOnly ? (
                        <span className="px-1">{row[col] ?? ""}</span>
                      ) : (
                        <Input
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input px-1"
                          value={row[col] ?? ""}
                          onChange={e => setCell(ri, col, e.target.value)}
                        />
                      )}
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="px-1 py-1">
                      <Button size="icon" variant="ghost" className="h-5 w-5 text-red-400 hover:text-red-600" onClick={() => deleteRow(ri)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground px-3 py-2 italic">
          {rows.length === 0 ? "No rows extracted." : "No columns detected."}
          {t.notes && ` Note: ${t.notes}`}
        </p>
      )}

      {/* Notes */}
      {t.notes && (
        <p className="text-xs text-muted-foreground px-3 py-1 border-t bg-muted/10 italic">{t.notes}</p>
      )}

      {/* Add row */}
      {!readOnly && columns.length > 0 && (
        <div className="px-3 py-1.5 border-t bg-muted/10">
          <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={addRow}>
            <Plus className="w-3 h-3" /> Add Row
          </Button>
        </div>
      )}
    </div>
  );
}

export default function RateCardTableEditor({ rateTables = [], onChange, readOnly = false }) {
  const [tables, setTables] = useState(rateTables);

  const updateTable = (idx, updated) => {
    const next = tables.map((t, i) => i === idx ? updated : t);
    setTables(next);
    onChange?.(next);
  };

  const deleteTable = (idx) => {
    const next = tables.filter((_, i) => i !== idx);
    setTables(next);
    onChange?.(next);
  };

  if (tables.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center">
        <Table className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
        <p className="text-xs text-muted-foreground">No rate card or commercial table detected.</p>
        <p className="text-xs text-muted-foreground mt-0.5">This is not required — not all documents contain rate tables.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tables.map((t, i) => (
        <SingleRateTable
          key={i}
          table={t}
          readOnly={readOnly}
          onChange={updated => updateTable(i, updated)}
          onDelete={!readOnly ? () => deleteTable(i) : undefined}
        />
      ))}
    </div>
  );
}