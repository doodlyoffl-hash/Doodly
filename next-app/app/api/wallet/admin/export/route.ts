/* GET /api/wallet/admin/export?report=&from=&to=&format=pdf|xls|csv
   Wallet financial reports as downloadable files. Admin/Finance only. Audited. */
import { NextRequest, NextResponse } from "next/server";
import { buildWalletReport, walletReportCsv, walletReportXls, renderWalletReportPdf, walletReportFilename, WALLET_REPORTS, type WalletReportKey } from "@/lib/wallet/reports";
import { actorRole, actorId, canViewWallets } from "@/lib/wallet/guard";
import { audit } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const role = actorRole(req);
  if (!canViewWallets(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const report = (sp.get("report") ?? "summary") as WalletReportKey;
  if (!WALLET_REPORTS.includes(report)) return NextResponse.json({ error: "Unknown report" }, { status: 400 });
  const format = (sp.get("format") ?? "pdf").toLowerCase();
  const from = sp.get("from") ? new Date(sp.get("from")!) : undefined;
  const to = sp.get("to") ? new Date(sp.get("to")!) : undefined;

  try {
    const built = await buildWalletReport(report, from, to);
    await audit({ userId: null, actorRole: role, action: "wallet.report.export", target: `${report} · ${format} · ${built.rowCount} row(s)` }).catch(() => {});

    if (format === "json") {
      await audit({ userId: null, actorRole: role, action: "wallet.report.view", target: `${report} · ${built.rowCount} row(s)` }).catch(() => {});
      return NextResponse.json(built);
    }
    if (format === "csv") {
      return new NextResponse(walletReportCsv(built), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${walletReportFilename(report, "csv")}"` } });
    }
    if (format === "xls") {
      return new NextResponse(walletReportXls(built), { headers: { "Content-Type": "application/vnd.ms-excel", "Content-Disposition": `attachment; filename="${walletReportFilename(report, "xls")}"` } });
    }
    const { bytes } = await renderWalletReportPdf(built);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${walletReportFilename(report, "pdf")}"` } });
  } catch (e) {
    console.error("wallet.export", (e as Error)?.message);
    return NextResponse.json({ error: "Could not build the report." }, { status: 500 });
  }
}
