import { permanentRedirect } from "next/navigation";

// The standalone FAQ has been folded into the premium Help Center at /help.
export const dynamic = "force-static";

export default function FaqRedirect(): never {
  permanentRedirect("/help");
}
