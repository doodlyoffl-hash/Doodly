import type { Metadata } from "next";
import { AuthShell } from "../AuthShell";
import { ForgotForm } from "./ForgotForm";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Reset your DOODLY account password.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we'll send you a reset link.">
      <ForgotForm />
    </AuthShell>
  );
}
