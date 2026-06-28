import { LegalPage, legalMetadata } from "@/components/site/LegalPage";

export const metadata = legalMetadata("Privacy Policy", "How DOODLY collects, uses and protects your personal information.");

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="Your trust matters to us. This policy explains what we collect and why."
      sections={[
        { h: "What we collect", p: ["We collect the details you give us to deliver milk — name, delivery address, phone number and email — plus order and payment records.", "We do not collect or store raw card data; payments are handled by our PCI-compliant gateway."] },
        { h: "How we use it", p: ["To process orders, schedule deliveries, send order updates, and provide customer support. We may send you offers only if you opt in."] },
        { h: "Who we share it with", p: ["Only the partners needed to serve you — our payment gateway and delivery team. We never sell your personal data to third parties."] },
        { h: "Your choices", p: ["You can update your details, download your data, or request deletion of your account at any time by contacting us."] },
        { h: "Cookies", p: ["We use essential cookies to keep you signed in and analytics cookies (only with consent) to improve the site."] },
      ]}
    />
  );
}
