import Shell, { NavGroup } from "@/components/dashboard/Shell";
import { LiveOrderBanner } from "@/components/order-status/LiveOrderBanner";

const nav: NavGroup[] = [
  { heading: "Overview", items: [{ label: "Dashboard", href: "/account/dashboard" }] },
  { heading: "Orders & plans", items: [
    { label: "My Orders", href: "/account/orders" },
    { label: "My Subscription", href: "/account/subscription" },
  ]},
  { heading: "Deliveries", items: [
    { label: "Deliveries", href: "/account/deliveries" },
    { label: "Tracking", href: "/account/tracking" },
    { label: "Calendar", href: "/account/calendar" },
  ]},
  { heading: "Bottles & money", items: [
    { label: "Bottle Tracking", href: "/account/bottles" },
    { label: "Wallet", href: "/account/wallet" },
    { label: "Invoices", href: "/account/invoices" },
  ]},
  { heading: "Account", items: [
    { label: "Profile", href: "/account/profile" },
    { label: "Settings", href: "/account/settings" },
  ]},
  { heading: "Discover", items: [
    { label: "Our Story · Unfold Pure", href: "/doodly" },
    { label: "Help & FAQs", href: "/help" },
  ]},
];

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <Shell role="Customer" nav={nav}><LiveOrderBanner />{children}</Shell>;
}
