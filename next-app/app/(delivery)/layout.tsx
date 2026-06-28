import Shell, { NavGroup } from "@/components/dashboard/Shell";

const nav: NavGroup[] = [
  { heading: "Today", items: [
    { label: "Dashboard", href: "/driver/dashboard" },
    { label: "Today's Route", href: "/driver/route" },
    { label: "Deliveries", href: "/driver/deliveries" },
  ]},
  { heading: "Tasks", items: [
    { label: "Bottle Collection", href: "/driver/bottles" },
    { label: "Cash Collection", href: "/driver/cash" },
  ]},
  { heading: "Records", items: [
    { label: "Completed", href: "/driver/completed" },
    { label: "History", href: "/driver/history" },
  ]},
];

export default function DeliveryLayout({ children }: { children: React.ReactNode }) {
  return <Shell role="Driver" nav={nav}>{children}</Shell>;
}
