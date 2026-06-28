"use client";
import { motion } from "framer-motion";

/* Fade-and-slide entrance for page content on first load — the
   React equivalent of the static build's view-transition + reveals. */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
