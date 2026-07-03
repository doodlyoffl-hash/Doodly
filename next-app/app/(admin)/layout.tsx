import Shell, { NavGroup } from "@/components/dashboard/Shell";

const nav: NavGroup[] = [
  { heading: "Overview", items: [{ label: "Dashboard", href: "/admin/dashboard" }] },
  { heading: "Commerce", items: [
    { label: "Orders", href: "/admin/orders" },
    { label: "Bulk Orders", href: "/admin/bulk-orders" },
    { label: "Subscriptions", href: "/admin/subscriptions" },
    { label: "B2B Orders", href: "/admin/b2b" },
    { label: "B2B Pricing", href: "/admin/b2b-pricing" },
    { label: "Business Invoices", href: "/admin/business-invoices" },
    { label: "Subscription Billing", href: "/admin/subscription-billing" },
    { label: "Customers", href: "/admin/customers" },
    { label: "Payments", href: "/admin/payments" },
  ]},
  { heading: "Catalogue", items: [
    { label: "Products", href: "/admin/products" },
    { label: "Categories", href: "/admin/categories" },
    { label: "Inventory", href: "/admin/inventory" },
  ]},
  { heading: "Finance", items: [
    { label: "Daily Expenses", href: "/admin/expenses" },
  ]},
  { heading: "Operations", items: [
    { label: "Auto Assignment", href: "/admin/assignments" },
    { label: "Delivery Mgmt", href: "/admin/deliveries" },
    { label: "Drivers", href: "/admin/drivers" },
    { label: "Routes", href: "/admin/routes" },
  ]},
  { heading: "Supply", items: [
    { label: "Farmers", href: "/admin/farmers" },
    { label: "Procurement", href: "/admin/procurement" },
    { label: "Quality", href: "/admin/quality" },
  ]},
  { heading: "System", items: [
    { label: "Users & Roles", href: "/admin/users" },
    { label: "Reports", href: "/admin/reports" },
    { label: "CMS", href: "/admin/cms" },
    { label: "Brand Story", href: "/admin/brand-story" },
    { label: "Help Center", href: "/admin/help-center" },
    { label: "Search Insights", href: "/admin/search" },
    { label: "Settings", href: "/admin/settings" },
  ]},
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Shell role="Admin" nav={nav}>{children}</Shell>;
}
