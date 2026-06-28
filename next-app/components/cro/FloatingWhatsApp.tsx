"use client";

import { SITE } from "@/config/site";

/* Floating WhatsApp button — opens a pre-filled chat. Sits above the mobile
   sticky bar; non-intrusive on desktop. */
export function FloatingWhatsApp() {
  const href = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent("Hi DOODLY! I'd like to know more about fresh milk delivery.")}`;
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp"
      className="group fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-[#25D366] p-3.5 text-white shadow-lg shadow-black/20 transition-transform hover:scale-105 lg:bottom-6"
    >
      <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden>
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.9c0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.13c-.24.68-1.42 1.32-1.95 1.36-.5.05-1.14.24-3.66-.77-3.08-1.21-5.05-4.34-5.2-4.54-.15-.2-1.24-1.65-1.24-3.15s.79-2.24 1.07-2.55c.28-.31.6-.38.8-.38.2 0 .4 0 .57.01.18.01.43-.07.67.51.24.59.83 2.04.9 2.19.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.36 1.45.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.71.81 2.01.96.3.15.5.22.57.34.07.12.07.71-.17 1.39Z"/>
      </svg>
      <span className="hidden pr-1 text-sm font-semibold sm:inline">Chat with us</span>
    </a>
  );
}
