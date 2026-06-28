import { permanentRedirect } from "next/navigation";

// /unfold-pure is a permanent alias for the canonical /doodly brand-story page.
export const dynamic = "force-static";

export default function UnfoldPureAlias(): never {
  permanentRedirect("/doodly");
}
