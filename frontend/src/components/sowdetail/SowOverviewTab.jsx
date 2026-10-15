import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import StructuredText from "@/components/shared/StructuredText";

export default function SowOverviewTab({ sow, startDate, endDate, daysLeft, expired, expiringSoon, personnelText, durationText, totalValueDisplay }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Details */}
      <div className="lg:col-span-2 space-y-5">
        {sow.description && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Description of Services</CardTitle></CardHeader>
            <CardContent>
              <StructuredText text={sow.description} />
            </CardContent>
          </Card>
        )}

        {personnelText && !sow.personnel?.length && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><Users className="w-4 h-4" />Personnel Assigned</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{personnelText}</p>
            </CardContent>
          </Card>
        )}

        {sow.personnel?.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><Users className="w-4 h-4" />Personnel & Rates</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">#</th>
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Role</th>
                    <th className="text-right p-3 font-medium">Allocation</th>
                    <th className="text-right p-3 font-medium">Rate/Month</th>
                  </tr>
                </thead>
                <tbody>
                  {sow.personnel.map((p, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-3 text-muted-foreground">{i + 1}</td>
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 text-muted-foreground">{p.role || "—"}</td>
                      <td className="p-3 text-right text-muted-foreground">
                        {p.allocation_percent && p.allocation_percent !== 100 ? `${p.allocation_percent}%` : "Full"}
                      </td>
                      <td className="p-3 text-right font-semibold">${(p.rate_per_month || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {sow._payment_terms && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Payment Terms</CardTitle></CardHeader>
            <CardContent>
              <StructuredText text={sow._payment_terms} />
            </CardContent>
          </Card>
        )}

        {sow._invoice_terms && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Invoice Terms</CardTitle></CardHeader>
            <CardContent>
              <StructuredText text={sow._invoice_terms} />
              {sow._invoice_emails && (
                <p className="text-sm text-muted-foreground mt-2">Invoice Emails: {sow._invoice_emails}</p>
              )}
            </CardContent>
          </Card>
        )}

        {sow._travel_expense_terms && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Travel Expenses</CardTitle></CardHeader>
            <CardContent>
              <StructuredText text={sow._travel_expense_terms} />
            </CardContent>
          </Card>
        )}

        {sow._governance_requirements && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Governance & Cadence</CardTitle></CardHeader>
            <CardContent>
              <StructuredText text={sow._governance_requirements} />
            </CardContent>
          </Card>
        )}

        {sow._quality_requirements && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Quality & Documentation</CardTitle></CardHeader>
            <CardContent>
              <StructuredText text={sow._quality_requirements} />
            </CardContent>
          </Card>
        )}

        {sow._release_management && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Release Management</CardTitle></CardHeader>
            <CardContent>
              <StructuredText text={sow._release_management} />
            </CardContent>
          </Card>
        )}

        {sow._knowledge_transfer && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Communication & Knowledge Transfer</CardTitle></CardHeader>
            <CardContent>
              <StructuredText text={sow._knowledge_transfer} />
            </CardContent>
          </Card>
        )}

        {(sow._vendor_signatory_name || sow._client_signatory_name) && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Signatories</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {sow._vendor_signatory_name && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Vendor / Service Provider</p>
                  <p className="font-medium">{sow._vendor_signatory_name}</p>
                  {sow._vendor_signatory_designation && <p className="text-muted-foreground">{sow._vendor_signatory_designation}</p>}
                </div>
              )}
              {sow._client_signatory_name && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Client / Service Receiver</p>
                  <p className="font-medium">{sow._client_signatory_name}</p>
                  {sow._client_signatory_designation && <p className="text-muted-foreground">{sow._client_signatory_designation}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Notes fallback if no structured payment fields */}
        {sow.notes && !sow._payment_terms && !sow._invoice_terms && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Payment Terms & Notes</CardTitle></CardHeader>
            <CardContent>
              <StructuredText text={sow.notes} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right: Sidebar */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">SOW Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {sow._msa_reference && (
              <div>
                <span className="text-muted-foreground block">MSA Reference</span>
                <span className="font-medium text-xs">{sow._msa_reference}</span>
              </div>
            )}
            {sow._client_organisation && (
              <div>
                <span className="text-muted-foreground block">Client</span>
                <span className="font-medium text-xs">{sow._client_organisation}</span>
              </div>
            )}
            {startDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Start Date</span>
                <span className="font-medium">{format(startDate, "MMM d, yyyy")}</span>
              </div>
            )}
            {durationText && (
              <div>
                <span className="text-muted-foreground block">Duration</span>
                <span className="font-medium text-xs">{durationText}</span>
              </div>
            )}
            {endDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">End Date</span>
                <span className={`font-medium ${expired ? "text-red-600" : expiringSoon ? "text-orange-600" : ""}`}>
                  {format(endDate, "MMM d, yyyy")}
                </span>
              </div>
            )}
            {daysLeft !== null && !expired && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Days Remaining</span>
                <span className={`font-bold ${expiringSoon ? "text-orange-600" : "text-green-600"}`}>{daysLeft}</span>
              </div>
            )}
            {sow.advance_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Advance Invoice</span>
                <span className="font-medium">${sow.advance_amount.toLocaleString()}</span>
              </div>
            )}
            {(sow.vendor_email || sow._invoice_emails) && (
              <div>
                <span className="text-muted-foreground block">Finance Email</span>
                <span className="font-medium text-xs break-all">{sow.vendor_email || sow._invoice_emails}</span>
              </div>
            )}
            {sow.payment_day && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Day</span>
                <span className="font-medium">Day {sow.payment_day}</span>
              </div>
            )}
            {sow._governing_law && (
              <div>
                <span className="text-muted-foreground block">Governing Law</span>
                <span className="font-medium text-xs">{sow._governing_law}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {sow.pdf_url && (
          <Card>
            <CardContent className="p-4">
              <a href={sow.pdf_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full gap-2">
                  <ExternalLink className="w-4 h-4" /> View SOW PDF
                </Button>
              </a>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}