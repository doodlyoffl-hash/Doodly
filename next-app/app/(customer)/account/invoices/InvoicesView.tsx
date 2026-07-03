"use client";

import { inr } from "@/lib/pricing";
import { useResource, StateGate, EmptyState, StatusPill, fmtDate } from "@/components/account/ui";

interface Invoice {
  id: string; number: string; gstPaise: number; pdfUrl: string | null; issuedAt: string;
  order: { totalPaise: number; type: string; status: string; createdAt: string } | null;
}

export function InvoicesView() {
  const { data, state } = useResource<{ invoices: Invoice[] }>("/api/invoices");
  const invoices = data?.invoices ?? [];
  return (
    <StateGate state={state} signedOutTitle="Sign in to see your invoices" signedOutBody="Your GST invoices appear here once you're signed in.">
      {invoices.length === 0 ? (
        <EmptyState title="No invoices yet" body="Invoices are generated automatically when an order is paid." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-mint-soft bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-mint-soft bg-[#F6FAF6] text-xs uppercase tracking-wide text-ink-3">
              <tr>{["Invoice no.", "Date", "Amount", "GST", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {invoices.map((v) => (
                <tr key={v.id} className="border-b border-mint-soft/60">
                  <td className="px-4 py-3 font-mono text-xs text-forest">{v.number}</td>
                  <td className="px-4 py-3 text-ink-2">{fmtDate(v.issuedAt)}</td>
                  <td className="px-4 py-3 font-semibold text-forest">{v.order ? inr(v.order.totalPaise) : "—"}</td>
                  <td className="px-4 py-3 text-ink-2">{inr(v.gstPaise)}</td>
                  <td className="px-4 py-3">{v.order ? <StatusPill status={v.order.status} /> : <span className="text-ink-3">—</span>}</td>
                  <td className="px-4 py-3">
                    {v.pdfUrl
                      ? <a href={v.pdfUrl} target="_blank" rel="noopener" className="font-semibold text-leaf-600 hover:underline">Download</a>
                      : <span className="text-xs text-ink-3">PDF coming soon</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </StateGate>
  );
}
