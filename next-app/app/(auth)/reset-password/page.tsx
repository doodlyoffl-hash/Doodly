import type { Metadata } from "next";
import { AuthShell } from "../AuthShell";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Choose a new password for your DOODLY account.",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  return (
    <AuthShell title="Set a new password" subtitle="Choose a strong password you don't use elsewhere.">
      <ResetForm token={searchParams?.token ?? ""} />
    </AuthShell>
  );
}
