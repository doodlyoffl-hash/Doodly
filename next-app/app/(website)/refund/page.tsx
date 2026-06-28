import { LegalPage, legalMetadata } from "@/components/site/LegalPage";

export const metadata = legalMetadata("Refund Policy", "DOODLY's refund and cancellation policy for milk subscriptions and bottle deposits.");

export default function RefundPage() {
  return (
    <LegalPage
      title="Refund Policy"
      intro="Fresh milk is perishable, so our refund policy is built around fairness and quality."
      sections={[
        { h: "Quality guarantee", p: ["If a delivery arrives spoiled, damaged or short, tell us within 24 hours and we'll replace it or refund that delivery in full."] },
        { h: "Cancelling a subscription", p: ["You can cancel anytime. Any prepaid balance for undelivered days is refunded to your wallet or original payment method."] },
        { h: "Bottle deposits", p: ["Glass-bottle deposits are fully refundable once the bottles are returned in usable condition."] },
        { h: "How refunds are issued", p: ["Refunds are processed to your original payment method or DOODLY wallet within 5–7 business days."] },
        { h: "Trial packs", p: ["Trial packs are a one-time introductory offer and are non-refundable once delivered, except in case of a quality issue."] },
      ]}
    />
  );
}
