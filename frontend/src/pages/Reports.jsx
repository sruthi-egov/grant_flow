import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, addDays } from "date-fns";
import Next4WeeksReport from "@/components/reports/Next4WeeksReport";
import FinancialHealthReport from "@/components/reports/FinancialHealthReport";
import GrantUtilisationReport from "@/components/reports/GrantUtilisationReport";
import ComplianceReport from "@/components/reports/ComplianceReport";
import CounterpartyExposureReport from "@/components/reports/CounterpartyExposureReport";
import ContractLifecycleReport from "@/components/reports/ContractLifecycleReport";
import ClosedGrantsReport from "@/components/reports/ClosedGrantsReport";

const today = new Date();

const REPORTS = [
  { value: "next4weeks", label: "Next 4 Weeks — Action Dashboard" },
  { value: "financial", label: "Financial Health" },
  { value: "utilisation", label: "Grant Utilisation" },
  { value: "compliance", label: "Compliance & Reporting Obligations" },
  { value: "counterparty", label: "Counterparty Exposure" },
  { value: "lifecycle", label: "Contract Lifecycle" },
  { value: "closed", label: "Closed Grants History" },
];

const DATE_RANGE = {
  next4weeks: `${format(today, "d MMM")} – ${format(addDays(today, 28), "d MMM yyyy")}`,
  financial: `${format(today, "d MMM yyyy")} · Next 3 months projected`,
  utilisation: `${format(today, "d MMM yyyy")} · All active grants`,
  compliance: `${format(today, "d MMM yyyy")} · Next 60 days + overdue`,
  counterparty: `${format(today, "d MMM yyyy")} · All active contracts`,
  lifecycle: `${format(today, "d MMM yyyy")} · 24-month window`,
  closed: `${format(today, "d MMM yyyy")} · All time`,
};

export default function Reports() {
  const [report, setReport] = useState("next4weeks");
  const reportLabel = REPORTS.find(r => r.value === report)?.label || "";

  const ReportComponent = {
    next4weeks: Next4WeeksReport,
    financial: FinancialHealthReport,
    utilisation: GrantUtilisationReport,
    compliance: ComplianceReport,
    counterparty: CounterpartyExposureReport,
    lifecycle: ContractLifecycleReport,
    closed: ClosedGrantsReport,
  }[report];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1.5">
          <Select value={report} onValueChange={setReport}>
            <SelectTrigger className="w-80 font-semibold text-base h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPORTS.map(r => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground pl-1">
            {format(today, "d MMM yyyy")} &nbsp;·&nbsp; {DATE_RANGE[report]}
          </p>
        </div>
        <Button variant="outline" className="gap-2">
          <span>📄</span> Export PDF
        </Button>
      </div>

      {/* Report content */}
      {ReportComponent && <ReportComponent />}
    </div>
  );
}