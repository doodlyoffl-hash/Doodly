import { LegalPage, legalMetadata } from "@/components/site/LegalPage";

export const metadata = legalMetadata("Terms of Service", "The terms that govern your use of DOODLY and our milk subscription service.");

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="By subscribing to or ordering from DOODLY, you agree to these terms."
      sections={[
        { h: "Your subscription", p: ["A DOODLY subscription delivers milk on the schedule you choose. You can pause, skip, reschedule or cancel at any time from your account."] },
        { h: "Pricing & payment", p: ["Prices are shown in Indian Rupees and include applicable taxes. Subscription charges are billed per your selected plan; a refundable glass-bottle deposit applies."] },
        { h: "Delivery", p: ["We deliver within our serviceable areas in Vijayawada and Tadepalli. Delivery windows are estimates and may shift due to weather or local conditions."] },
        { h: "Glass bottles", p: ["Bottles remain part of the deposit-and-return program. Please return empties on the next delivery; the deposit is refunded on cancellation."] },
        { h: "Acceptable use", p: ["You agree to provide accurate delivery information and to use the service lawfully. We may suspend accounts that abuse the service."] },
      ]}
    />
  );
}
