import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your DOODLY account to manage subscriptions, deliveries and bottles.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <LoginForm />;
}
