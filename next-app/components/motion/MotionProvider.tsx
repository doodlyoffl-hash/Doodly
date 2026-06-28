"use client";
import { MotionConfig } from "framer-motion";

/* Wraps the app so every Framer Motion animation honours the user's
   prefers-reduced-motion setting automatically. */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
