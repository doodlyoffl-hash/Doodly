import { LegalPage, legalMetadata } from "@/components/site/LegalPage";

export const metadata = legalMetadata("Shipping & Delivery", "How and where DOODLY delivers fresh A2 buffalo milk — areas, timings and charges.");

export default function ShippingPage() {
  return (
    <LegalPage
      title="Shipping &amp; Delivery"
      intro="Everything about how your milk reaches you, fresh, every morning."
      sections={[
        { h: "Where we deliver", p: ["We currently serve Vijayawada and Tadepalli. Enter your pincode at checkout to confirm coverage on your street — we add new areas every month."] },
        { h: "Delivery timing", p: ["Fresh milk is delivered daily by 7 AM, within 12 hours of milking. Same-day order cut-off applies for next-morning delivery."] },
        { h: "Delivery charges", p: ["Delivery is free within our serviceable zones. Any applicable charge for newer or outlying areas is shown clearly at checkout."] },
        { h: "Missed deliveries", p: ["If you'll be away, please pause or skip from your account. We'll always try to reach you before marking a delivery as missed."] },
        { h: "Start date", p: ["Choose your first delivery date at checkout, subject to the daily order cut-off. You're in control of when deliveries begin."] },
      ]}
    />
  );
}
