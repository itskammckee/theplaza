import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getAccountLedger, GetAccountLedgerOutputType } from "zite-endpoints-sdk";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer, Mail } from "lucide-react";
import { formatCurrency } from "../lib/formatters";
import { toast } from "sonner";

type LedgerEntry = GetAccountLedgerOutputType["ledger"][0];
type HostInfo = GetAccountLedgerOutputType["host"];

export default function ViewLedgerPage() {
  const { hostId } = useParams<{ hostId: string }>();

  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [host, setHost] = useState<HostInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hostId) return;

    // reset when param changes (prevents stale UI)
    setLoading(true);
    setLedger([]);
    setHost(null);

    void loadLedger(hostId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId]);

  const loadLedger = async (id: string) => {
    try {
      // Backend now supports UUID OR fallback key, so just call it once.
      const result = await getAccountLedger({ hostId: id });

      const sorted = (result.ledger || []).slice().sort((a, b) => {
        if (!a.created || !b.created) return 0;
        return new Date(a.created).getTime() - new Date(b.created).getTime();
      });

      setLedger(sorted);
      setHost(result.host || null);

      if ((result as any)?.error === "host_not_found") {
        toast.error("Host not found for this ledger link.");
      }
    } catch (error) {
      console.error("Error loading ledger:", error);
      toast.error("Failed to load account ledger");
    } finally {
      setLoading(false);
    }
  };

  const calculateBalance = () => {
    const charges = ledger
      .filter((e) => e.paymentType === "Charge" || e.paymentType === "Cleaning Fee")
      .reduce((sum, e) => sum + Math.abs(e.amount || 0), 0);

    const payments = ledger
      .filter((e) =>
        ["Rental Payment", "Deposit Applied", "Recorded Payment"].includes(e.paymentType || "")
      )
      .reduce((sum, e) => sum + Math.abs(e.amount || 0), 0);

    const discounts = ledger
      .filter((e) => e.paymentType === "Discount")
      .reduce((sum, e) => sum + Math.abs(e.amount || 0), 0);

    return charges - payments - discounts;
  };

  const handlePrint = () => window.print();

  const balance = calculateBalance();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary mx-auto" />
          <p className="text-muted-foreground">Loading ledger...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-3xl font-bold">Account Ledger</h1>
            {host && (
              <p className="text-muted-foreground mt-1">
                {host.fullName} • {host.email}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={handlePrint} variant="outline">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="print:border-b">
            <div className="flex items-center justify-between">
              <CardTitle>Transaction History</CardTitle>
              <div className="text-right hidden print:block">
                {host && (
                  <div>
                    <p className="font-semibold">{host.fullName}</p>
                    <p className="text-sm text-muted-foreground">{host.email}</p>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase">
                      Date
                    </th>
                    <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase">
                      Type
                    </th>
                    <th className="text-left p-4 text-xs font-semibold text-muted-foreground uppercase">
                      Description
                    </th>
                    <th className="text-right p-4 text-xs font-semibold text-muted-foreground uppercase">
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {ledger.map((entry) => {
                    const isCharge =
                      entry.paymentType === "Charge" || entry.paymentType === "Cleaning Fee";
                    const isPayment = ["Rental Payment", "Deposit Applied", "Recorded Payment"].includes(
                      entry.paymentType || ""
                    );
                    const isDiscount = entry.paymentType === "Discount";
                    const isDeposit = entry.paymentType === "Deposit";

                    const displayAmount = Math.abs(entry.amount || 0);

                    return (
                      <tr key={entry.id}>
                        <td className="p-4 text-sm">
                          {entry.created ? new Date(entry.created).toLocaleDateString() : "-"}
                        </td>
                        <td className="p-4 text-sm font-medium">{entry.paymentType || "-"}</td>
                        <td className="p-4 text-sm text-muted-foreground">{entry.memo || "-"}</td>
                        <td
                          className={`p-4 text-sm text-right font-bold ${
                            isCharge
                              ? "text-destructive"
                              : isPayment || isDiscount
                              ? "text-accent"
                              : isDeposit
                              ? "text-muted-foreground"
                              : ""
                          }`}
                        >
                          {formatCurrency(displayAmount)}
                        </td>
                      </tr>
                    );
                  })}

                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-12 text-center text-muted-foreground">
                        No ledger entries found
                      </td>
                    </tr>
                  )}
                </tbody>

                {ledger.length > 0 && (
                  <tfoot className="bg-muted/50 border-t-2">
                    <tr>
                      <td colSpan={3} className="p-4 text-right font-bold">
                        Current Balance:
                      </td>
                      <td
                        className={`p-4 text-lg text-right font-bold ${
                          balance > 0 ? "text-destructive" : balance < 0 ? "text-accent" : ""
                        }`}
                      >
                        {formatCurrency(balance)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>

        {balance > 0 && (
          <Card className="print:hidden">
            <CardContent className="pt-6">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  For payment arrangements, please contact The Plaza
                </p>
                <div className="flex items-center justify-center gap-4 text-sm">
                  <a
                    href="mailto:info@plazaeventcenter.com"
                    className="text-accent hover:underline flex items-center gap-1"
                  >
                    <Mail className="h-4 w-4" />
                    info@plazaeventcenter.com
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
