"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/* Mobile-only sticky purchase bar — appears after the hero scrolls away.
   Drives conversion without covering content on desktop. */
export function StickyOrderBar() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 640);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          className="fixed inset-x-0 bottom-0 z-50 border-t border-mint-soft bg-white/90 px-4 py-3 backdrop-blur lg:hidden"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
        >
          <div className="mx-auto flex max-w-md items-center gap-3">
            <div className="flex-1">
              <p className="text-xs text-ink-3">From</p>
              <p className="font-display text-lg font-bold text-forest">₹70<span className="text-sm font-medium text-ink-3"> / day</span></p>
            </div>
            <Link href="/subscriptions" className="flex-1 rounded-full bg-leaf py-3 text-center font-semibold text-white shadow-lg shadow-leaf/30">Order Now</Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
