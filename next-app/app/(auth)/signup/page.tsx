import type { Metadata } from "next";
import { AuthShell } from "../AuthShell";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Sign up for DOODLY to subscribe to fresh A2 buffalo milk delivered daily.",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <AuthShell title="Create your account" subtitle="Start your fresh-milk subscription in minutes.">
      <SignupForm />
    </AuthShell>
  );
}
