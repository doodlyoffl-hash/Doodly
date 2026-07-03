/* =============================================================
   DOODLY — Help Center & Knowledge Base (DOODLY_HELP)
   A premium, searchable Help Center (Airbnb / Stripe-docs feel):
   quick-help cards, categorised FAQ accordions with dairy-themed
   background animations, video-guide placeholders and contact
   support — plus an Admin CMS (add/edit/delete/reorder/publish
   FAQs, categories, videos, illustrations) and analytics (most
   viewed FAQs, most searched terms, unanswered searches, tour
   completion). Also provides the contextual tooltips (ⓘ) used
   across the site.

   Content is config-driven and fully editable from the CMS — it
   lives in localStorage `doodly-help` (seeded from DEFAULTS), so
   no front-end code changes are needed to manage the knowledge
   base. Analytics live in `doodly-help-analytics`.
   ============================================================= */
window.DOODLY_HELP = (function () {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var RBAC = function () { return window.DOODLY_RBAC; };
  var isSuper = function () { return RBAC() ? RBAC().activeRole() === "super_admin" : true; };
  var toast = function (m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); };
  var support = function () { var b = (window.DOODLY && window.DOODLY.brand) || {}; return b.support || { phone: b.phone || "+91 90000 00000", whatsapp: "+91 90000 00000", email: b.email || "hello@doodly.in", hours: "Mon–Sat, 8 AM – 8 PM" }; };

  /* ---------- icons ---------- */
  var IC = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    box: '<path d="m12 3 9 5v8l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v9"/>',
    truck: '<path d="M2 6h11v9H2zM13 9h4l3 3v3h-7z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
    bottle: '<path d="M9 2h6M10 2v3.5L8.2 8A4 4 0 0 0 8 9.6V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9.6A4 4 0 0 0 15.8 8L14 5.5V2"/>',
    factory: '<path d="M3 21V9l6 4V9l6 4V5l6 3v13Z"/><path d="M3 21h18"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="m10 9 5 3-5 3Z"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    phone: '<path d="M4 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 4 6 2 2 0 0 1 4 4Z"/>',
    chat: '<path d="M4 5h16v11H9l-5 4Z"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12h.01M3 9h18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', spark: '<path d="m12 3 2 6 6 .5-4.6 3.8L17 20l-5-3.2L7 20l1.6-6.7L4 9.5 10 9Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', edit: '<path d="M4 20h4l10-10-4-4L4 16Z"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  };
  var svg = function (n, s) { return '<svg viewBox="0 0 24 24" width="' + (s || 18) + '" height="' + (s || 18) + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || "") + '</svg>'; };

  /* ============================================================
     DEFAULT KNOWLEDGE BASE (editable from the CMS)
     ============================================================ */
  var QUICK = [
    { id: "getting-started", icon: "box", emoji: "📦", label: "Place an Order" },
    { id: "delivery", icon: "truck", emoji: "🚚", label: "Track Delivery" },
    { id: "payments", icon: "card", emoji: "💳", label: "Payments" },
    { id: "subscription", icon: "refresh", emoji: "🥛", label: "Subscription Guide" },
    { id: "bottle-returns", icon: "bottle", emoji: "♻️", label: "Bottle Returns" },
    { id: "b2b", icon: "factory", emoji: "🏢", label: "Bulk Orders (B2B)" },
  ];
  var DEFAULT_CATS = [
    { id: "getting-started", icon: "box", title: "Getting Started", faqs: [
      { q: "What is DOODLY?", a: "DOODLY delivers farm-fresh, naturally A2 buffalo milk and dairy in reusable glass bottles — chilled within minutes of milking and at your door before breakfast." },
      { q: "How do I place my first order?", a: "Pick a product, choose a bottle size (300ml / 500ml / 1000ml), select a plan, choose your delivery start date and address, and check out. The whole flow takes under a minute." },
      { q: "How do subscriptions work?", a: "Choose Single Pour for a one-off, or 7 / 30 / 90-day plans for recurring morning delivery. Longer plans unlock bigger savings, and you can pause, skip or cancel anytime." },
      { q: "What products do you offer?", a: "A2 Buffalo Milk is live today. Buffalo Pot Curd, Malai Paneer, Palkova and Buffalo Ghee are coming soon — you'll see them in the catalogue marked “Coming soon”." },
    ]},
    { id: "products", icon: "bottle", title: "Products", faqs: [
      { q: "What is A2 Buffalo Milk?", a: "Milk that contains only the A2 type of beta-casein protein, which many people find gentler on digestion. DOODLY's buffalo milk is naturally A2 and richer in fat and protein — creamier chai, thicker curd." },
      { q: "Why glass bottles?", a: "Glass keeps milk fresher and tastes cleaner than plastic, and it's fully reusable. We run a closed glass loop — sterilise, fill, deliver, collect, repeat." },
      { q: "Are there preservatives?", a: "Never. No preservatives, no added water, no chemicals — just pure buffalo milk, delivered fast enough that it doesn't need them." },
      { q: "How fresh is the milk?", a: "Collected each morning, chilled to 4°C within minutes, and delivered the same morning. It goes from farm to your fridge without ever warming up." },
    ]},
    { id: "delivery", icon: "truck", title: "Delivery", faqs: [
      { q: "What are the delivery timings?", a: "Morning delivery between 6:00 AM and 8:00 AM by default. You can pick a preferred slot during checkout." },
      { q: "What is the 8 PM cut-off rule?", a: "Orders placed before 8:00 PM qualify for next-morning delivery. Order after 8 PM and your first delivery moves to the following morning." },
      { q: "How do I track my delivery?", a: "A live status banner shows your order from Confirmed → Out for Delivery → Delivered, with your executive and ETA. You can also open Delivery Tracking in your dashboard." },
      { q: "Which areas do you serve?", a: "We're live across Vijayawada and Tadepalli. Enter your pincode on any product or the Contact page to check serviceability instantly." },
      { q: "What happens if I miss a delivery?", a: "Our executive marks the attempt and you're notified. For subscriptions the day can be skipped or rescheduled — your plan simply extends so you never lose a delivery." },
    ]},
    { id: "subscription", icon: "refresh", title: "Subscription", faqs: [
      { q: "Can I change my start date?", a: "Yes — before your first delivery you can change the start date from My Subscription, subject to the 8 PM cut-off for the new date." },
      { q: "How do I pause my subscription?", a: "Open My Subscription and tap Pause. Deliveries stop and your plan's remaining days are preserved." },
      { q: "How do I resume?", a: "Tap Resume on My Subscription and pick the day to restart. Your remaining deliveries continue from there." },
      { q: "Can I skip a single delivery?", a: "Yes — skip any upcoming day from the calendar. The plan extends by one day so you keep every delivery you paid for." },
      { q: "How do I cancel?", a: "You can cancel anytime from My Subscription. Any unused balance follows our refund policy and bottle deposits are returned once empties are collected." },
    ]},
    { id: "wallet", icon: "wallet", title: "Wallet", faqs: [
      { q: "What is Trial Pack cashback?", a: "Complete the ₹200 Trial Pack and then start a 30 or 90-day plan, and we credit ₹200 back to your DOODLY Wallet — once per customer." },
      { q: "How do I use my wallet balance?", a: "Wallet balance is offered automatically at checkout and applied to your order total. You choose how much to use." },
      { q: "Does wallet credit expire?", a: "Promotional credit can carry an expiry (shown on each credit). Cashback and refunds you've earned don't expire." },
      { q: "Can wallet money be refunded?", a: "Refunds for orders are credited back to your wallet (or original method per our refund policy) and can be used on any future order." },
    ]},
    { id: "payments", icon: "card", title: "Payments", faqs: [
      { q: "Which payment methods are supported?", a: "UPI (GPay/PhonePe/Paytm/BHIM), debit & credit cards, net-banking and wallet balance. Cash-on-delivery is available on select plans." },
      { q: "What is Auto Pay and what happens at renewal?", a: "Auto Pay securely renews your subscription automatically so deliveries never pause for payment. You're notified before each renewal and can turn it off anytime." },
      { q: "A payment failed — what now?", a: "We retry automatically and notify you. Your deliveries continue during a short grace window; just update your payment method to clear any dues." },
      { q: "Do you provide GST invoices?", a: "Yes — every order generates an invoice in your account, with GST details for business customers." },
    ]},
    { id: "bottle-returns", icon: "bottle", title: "Bottle Returns", faqs: [
      { q: "How does the bottle deposit work?", a: "A small refundable deposit (₹120/bottle) is added on your first order. It stays in your wallet and is returned when the empties come back." },
      { q: "How does the return process work?", a: "Just leave the empties out on your next delivery. Our executive collects them and your bottle ledger and deposit update automatically." },
      { q: "What if a bottle breaks or is lost?", a: "Accidents happen — a small replacement charge applies only for bottles not returned over time, never for normal use." },
    ]},
    { id: "b2b", icon: "factory", title: "B2B Orders", faqs: [
      { q: "Can I order in bulk for my business?", a: "Yes — hotels, cafés, caterers and offices can register for B2B with negotiated pricing, flexible quantities and scheduled bulk delivery." },
      { q: "What is a Business ID?", a: "Every registered business gets a unique ID like DOO-B2B-000001 used for quick lookup, ordering, invoicing and tracking outstanding balances." },
      { q: "How is B2B delivery scheduled?", a: "Choose a delivery date and preferred time (5:30 AM, 7:00 AM, 11:30 AM and more) per order, with standing/recurring options for regular customers." },
    ]},
    { id: "account", icon: "info", title: "Account", faqs: [
      { q: "How do I reset my password?", a: "Use “Forgot password” on the login screen — we'll send an OTP to your registered mobile/email to set a new one." },
      { q: "How do I update my profile?", a: "Open Settings → Profile in your account to update your name, email and preferences." },
      { q: "How do I change my phone number?", a: "From Settings → Profile, update your number and verify it with the OTP we send to confirm the change." },
      { q: "How do I delete my account?", a: "Request deletion from Settings → Account. We'll settle any wallet balance and bottle deposits before closing the account." },
    ]},
  ];
  var DEFAULT_VIDEOS = [
    { id: "v1", title: "How to place an order", url: "" },
    { id: "v2", title: "How subscriptions work", url: "" },
    { id: "v3", title: "How bottle returns work", url: "" },
    { id: "v4", title: "How Auto Pay works", url: "" },
  ];

  /* ---------- contextual help catalogue (features · statuses · actions · columns · metrics) ----------
     Keys are namespaced so the resolver can match elements by what they ARE:
       plain (wallet, gst…) · status:<label> · act:<label> · col:<label> · metric:<label>
     Admin can override copy (doodly-help-tips) and disable per module (doodly-help-tip-modules)
     with no code change. Each entry: { t:title, d:description, ex?:example, more?:link }. */
  var TIP_DEFAULTS = {
    /* features / technical terms */
    wallet: { t: "DOODLY Wallet", d: "Your in-app balance from cashback, referrals and refunds — used automatically at checkout to reduce your bill." },
    walletbalance: { t: "Wallet balance", d: "The available amount you can use toward future purchases or subscriptions." },
    subscription: { t: "Subscription", d: "Pick a duration and we deliver fresh every morning. Pause, skip or cancel anytime — your remaining days are always preserved." },
    bottlereturns: { t: "Bottle returns", d: "Leave the empties out on your next delivery. We collect them and refund the deposit to your wallet automatically." },
    autopay: { t: "Auto Pay", d: "Securely renews your plan so deliveries never pause. You're notified before each charge and can turn it off anytime." },
    trial: { t: "Trial Pack", d: "A short-term trial subscription that lets new customers experience DOODLY before choosing a long-term plan." },
    cutoff: { t: "8 PM cut-off", d: "Order before 8 PM for next-morning delivery. After 8 PM, your first delivery shifts to the following morning." },
    pincode: { t: "Serviceable pincodes", d: "We deliver to selected pincodes across Vijayawada & Tadepalli. Check yours before you subscribe." },
    referralcode: { t: "Referral code", d: "A unique code that lets you invite friends. You earn a reward when an eligible customer joins with your code and completes a qualifying subscription.", ex: "DOODLY12345" },
    referralreward: { t: "Referral reward", d: "The amount credited to the referring customer when all referral conditions are successfully met.", ex: "₹100" },
    outstanding: { t: "Outstanding amount", d: "The amount that remains unpaid after previous payments have been deducted." },
    pendingamount: { t: "Pending amount", d: "The total unpaid amount that is still due from this customer or business partner." },
    deliveryslot: { t: "Delivery slot", d: "The preferred time window during which your milk will be delivered.", ex: "6:00 – 8:00 AM" },
    gst: { t: "GST", d: "Goods and Services Tax applied according to the product's applicable tax rate." },
    pausesubscription: { t: "Pause subscription", d: "Temporarily stop your deliveries. Your remaining subscription balance resumes when you reactivate it." },
    bulkorder: { t: "Bulk order", d: "Place large-quantity orders for weddings, functions, hotels, restaurants, catering or other special events." },
    creditlimit: { t: "Credit limit", d: "The maximum outstanding amount a business partner may carry before payment is required." },
    availablecredit: { t: "Available credit", d: "Credit limit minus current outstanding — how much more this partner can order on credit." },
    search: { t: "Search", d: "Search customers, invoices, products, orders, reports and more — all from one place." },
    /* status badges */
    "status:pending": { t: "Pending", d: "In progress and awaiting completion." },
    "status:completed": { t: "Completed", d: "The process has been successfully finished." },
    "status:cancelled": { t: "Cancelled", d: "This request or order has been cancelled." },
    "status:paused": { t: "Paused", d: "Temporarily inactive. It can be resumed later." },
    "status:active": { t: "Active", d: "Live and running normally." },
    "status:paid": { t: "Paid", d: "Payment has been received in full." },
    "status:overdue": { t: "Overdue", d: "Payment is past its due date." },
    "status:partial payment": { t: "Partial payment", d: "Part of the amount has been paid; a balance still remains." },
    "status:partially paid": { t: "Partially paid", d: "Part of the amount has been paid; a balance still remains." },
    "status:draft": { t: "Draft", d: "Not yet finalised or sent." },
    "status:credit note": { t: "Credit note", d: "An amount credited back against an invoice." },
    "status:out for delivery": { t: "Out for delivery", d: "On the way to the customer right now." },
    "status:delivered": { t: "Delivered", d: "Successfully handed over to the customer." },
    "status:reward credited": { t: "Reward credited", d: "The referral reward has been added to the referrer's wallet." },
    "status:rejected": { t: "Rejected", d: "Reviewed and declined — it won't proceed." },
    /* action buttons / icons */
    "act:approve": { t: "Approve", d: "Confirm this request and move it to the next stage." },
    "act:reject": { t: "Reject", d: "Decline this request. It will not proceed." },
    "act:export": { t: "Export", d: "Download the currently filtered data as CSV, Excel or PDF." },
    "act:auto-assign": { t: "Auto-assign", d: "Automatically distribute deliveries to executives within their 45-bottle carrying capacity." },
    "act:delete": { t: "Delete", d: "Permanently removes this record. This action may not be reversible." },
    "act:edit": { t: "Edit", d: "Change the details of this record." },
    "act:reverse": { t: "Reverse", d: "Undo this credit/reward and adjust the balance. The change is logged." },
    "act:reorder": { t: "Reorder", d: "Create a new order with the same items and quantities." },
    "act:pause next delivery": { t: "Pause next delivery", d: "Skip the upcoming delivery — your plan extends so you don't lose it." },
    "act:track order": { t: "Track order", d: "See live delivery status, ETA and your delivery executive." },
    "act:print": { t: "Print", d: "Open a clean, print-ready version of this document." },
    "act:download pdf": { t: "Download PDF", d: "Save this document as an A4 PDF that matches the on-screen design." },
    "act:preview as user": { t: "Preview as user", d: "View the platform exactly as this user — their menus, pages and buttons reflect their effective permissions." },
    /* table columns */
    "col:amount": { t: "Amount", d: "The total value of this row, including taxes where applicable." },
    "col:outstanding": { t: "Outstanding", d: "Unpaid balance remaining on this account." },
    "col:gst": { t: "GST", d: "Tax applied at the product's rate." },
    "col:status": { t: "Status", d: "The current stage of this record." },
    "col:reward": { t: "Reward", d: "The referral amount credited for this referral." },
    "col:tax type": { t: "Tax type", d: "GST, CGST+SGST, IGST, CESS or Exempt — how this rate is applied." },
    /* metrics / KPIs / charts */
    "metric:gst collected": { t: "GST collected", d: "Total tax collected across the filtered transactions." },
    "metric:total outstanding": { t: "Total outstanding", d: "Sum of all unpaid balances across invoices." },
    "metric:pending queue": { t: "Pending queue", d: "Bottles that couldn't be assigned yet — they auto-assign when an executive returns to the dairy." },
    "metric:conversion": { t: "Conversion", d: "Share of trials that converted to a paid plan during the period." },
    "metric:revenue": { t: "Revenue", d: "Total revenue generated from completed orders in the selected period." },
    "metric:total orders": { t: "Total orders", d: "Count of orders in the selected period." },
    "metric:total bottles": { t: "Total bottles", d: "Total glass bottles across all deliveries." },
    "metric:assigned": { t: "Assigned", d: "Bottles allocated to delivery executives." },
    "metric:completed": { t: "Completed", d: "Deliveries finished successfully." },
    "metric:available execs": { t: "Available executives", d: "Executives free to take a new trip." },
    "metric:on route": { t: "On route", d: "Executives currently out delivering." },
    "metric:returned": { t: "Returned", d: "Executives back at the dairy, ready for the next trip." },
    "metric:collected": { t: "Collected", d: "Total payment received in the period." },
    "metric:taxable value": { t: "Taxable value", d: "The amount on which GST is calculated." },
    "metric:tax liability": { t: "Tax liability", d: "The total GST payable for the period." },
    "metric:transactions": { t: "Transactions", d: "Number of transactions counted." },
    "metric:wallet earned": { t: "Wallet earned", d: "Total credited to your wallet from referrals." },
    "metric:wallet balance": { t: "Wallet balance", d: "The amount currently available to spend." },
    "metric:total paid": { t: "Total paid", d: "Total rewards/amounts paid out." },
    "metric:pending rewards": { t: "Pending rewards", d: "Referrals awaiting an eligible purchase before the reward is credited." },
    /* more status badges */
    "status:trial": { t: "Trial", d: "A short trial subscription before committing to a long-term plan." },
    "status:churned": { t: "Churned", d: "This customer has stopped subscribing." },
    "status:processing": { t: "Processing", d: "Being prepared — not yet completed." },
    "status:on hold": { t: "On hold", d: "Temporarily halted, pending an action." },
    "status:confirmed": { t: "Confirmed", d: "Accepted and scheduled to proceed." },
    "status:preparing": { t: "Preparing", d: "Being made ready for delivery." },
    "status:accepted": { t: "Accepted", d: "The executive has accepted this delivery." },
    "status:assigned": { t: "Assigned", d: "Allocated to a delivery executive." },
    "status:returned to dairy": { t: "Returned to dairy", d: "The executive is back and available for the next trip." },
    "status:failed": { t: "Failed", d: "Could not be completed." },
    "status:rescheduled": { t: "Rescheduled", d: "Moved to a new date or time slot." },
    "status:inactive": { t: "Inactive", d: "Not currently active; it can be re-enabled." },
    "status:soon": { t: "Coming soon", d: "Not yet available — launching shortly." },
    "status:coming soon": { t: "Coming soon", d: "Not yet available — launching shortly." },
    "status:verified": { t: "Verified", d: "Checked and confirmed as genuine." },
    "status:review": { t: "Under review", d: "Awaiting verification." },
    "status:idle": { t: "Idle", d: "Available but not currently on a task." },
    "status:on route": { t: "On route", d: "Currently out making deliveries." },
    "status:on shift": { t: "On shift", d: "Currently working." },
    "status:locked": { t: "Locked", d: "Access is blocked, often after failed sign-in attempts." },
    "status:disabled": { t: "Disabled", d: "Turned off; cannot be used until re-enabled." },
    "status:published": { t: "Published", d: "Live and visible to users." },
    "status:unpublished": { t: "Unpublished", d: "Hidden from users until published." },
    "status:eligible purchase": { t: "Eligible purchase", d: "A qualifying purchase that earns the referral reward." },
    "status:trial purchased": { t: "Trial purchased", d: "Bought a trial — the reward stays pending until an eligible plan is purchased." },
    "status:registered": { t: "Registered", d: "Signed up using the referral code." },
    "status:invited": { t: "Invited", d: "A referral was sent; not yet registered." },
    "status:credit": { t: "Credit", d: "Billed on agreed credit terms." },
    "status:default": { t: "Default", d: "The standard option applied unless overridden." },
    "status:custom": { t: "Custom", d: "A user-created option." },
    "status:full access": { t: "Full access", d: "All permissions are granted." },
    "status:refunded": { t: "Refunded", d: "Payment has been returned to the customer." },
    /* more actions */
    "act:add customer": { t: "Add customer", d: "Create a new customer record." },
    "act:add driver": { t: "Add driver", d: "Create a new delivery executive." },
    "act:add farmer": { t: "Add farmer", d: "Register a new partner farm." },
    "act:filters": { t: "Filters", d: "Narrow the list by status, area, date and more." },
    "act:csv": { t: "CSV export", d: "Download as a comma-separated file for spreadsheets." },
    "act:excel": { t: "Excel export", d: "Download as an Excel workbook (.xls)." },
    "act:pdf": { t: "PDF export", d: "Download a print-ready PDF." },
    "act:clear all filters": { t: "Clear all filters", d: "Remove every active filter and search." },
    "act:save": { t: "Save", d: "Store your changes." },
    "act:save changes": { t: "Save changes", d: "Store your edits to this record." },
    "act:save settings": { t: "Save settings", d: "Apply and store these settings." },
    "act:create": { t: "Create", d: "Add a new record." },
    "act:create role": { t: "Create role", d: "Add a custom role with its own permissions." },
    "act:create user": { t: "Create user", d: "Add a new staff account and assign a role." },
    "act:view": { t: "View", d: "Open the full details." },
    "act:cancel": { t: "Cancel", d: "Discard and close without saving." },
    "act:assign": { t: "Assign", d: "Allocate this to a person or route." },
    "act:assign delivery": { t: "Assign Delivery", d: "Assign this delivery to a delivery executive." },
    "act:export report": { t: "Export Report", d: "Download the currently filtered report in CSV, Excel or PDF format." },
    "act:reassign": { t: "Reassign", d: "Move this to a different person." },
    "act:assign users": { t: "Assign users", d: "Move the selected users onto this role." },
    "act:generate invoice": { t: "Generate invoice", d: "Create an invoice for this order." },
    "act:record payment": { t: "Record payment", d: "Log a payment received against this account." },
    "act:share": { t: "Share", d: "Send this via WhatsApp, SMS or email." },
    "act:copy code": { t: "Copy code", d: "Copy your referral code to the clipboard." },
    "act:copy link": { t: "Copy link", d: "Copy your referral link to the clipboard." },
    "act:subscribe": { t: "Subscribe", d: "Start a recurring delivery plan." },
    "act:subscribe now": { t: "Subscribe", d: "Start a recurring delivery plan." },
    "act:explore products": { t: "Explore products", d: "Browse the full DOODLY range." },
    "act:run tests": { t: "Run tests", d: "Run the built-in checks for this module." },
    "act:refresh": { t: "Refresh", d: "Reload the latest data." },
    "act:reset": { t: "Reset", d: "Restore to the default state." },
    "act:set default": { t: "Set default", d: "Make this the standard option." },
    "act:duplicate": { t: "Duplicate", d: "Create a copy you can edit." },
    "act:rename": { t: "Rename", d: "Change the name." },
    "act:unassign": { t: "Unassign", d: "Remove the current assignment." },
    "act:advance status": { t: "Advance status", d: "Move to the next stage in the workflow." },
    "act:whatsapp": { t: "WhatsApp", d: "Open a WhatsApp message with the details pre-filled." },
    "act:email": { t: "Email", d: "Open an email with the details pre-filled." },
    "act:call executive": { t: "Call executive", d: "Call the assigned delivery executive." },
    /* more table columns */
    "col:id": { t: "ID", d: "A unique identifier for this record." },
    "col:customer": { t: "Customer", d: "The customer this row belongs to." },
    "col:area": { t: "Area", d: "The locality or zone for delivery." },
    "col:plan": { t: "Plan", d: "The subscription duration chosen." },
    "col:since": { t: "Since", d: "When this customer joined DOODLY." },
    "col:date": { t: "Date", d: "The date this record applies to." },
    "col:method": { t: "Method", d: "How the payment was made — UPI, card, net-banking, etc." },
    "col:payment": { t: "Payment", d: "The payment status for this row." },
    "col:quantity": { t: "Quantity", d: "Number of units ordered." },
    "col:qty": { t: "Quantity", d: "Number of units ordered." },
    "col:unit": { t: "Unit", d: "The pack size or measure (e.g. 1000ml bottle)." },
    "col:unit price": { t: "Unit price", d: "Price per unit before tax." },
    "col:price": { t: "Price", d: "Price per unit." },
    "col:tax": { t: "Tax", d: "GST applied at the product's rate." },
    "col:executive": { t: "Delivery executive", d: "The staff member who delivers this route." },
    "col:driver": { t: "Driver", d: "The delivery executive for this route." },
    "col:zone": { t: "Zone", d: "The delivery zone." },
    "col:route": { t: "Route", d: "The planned delivery route." },
    "col:stops": { t: "Stops", d: "Number of delivery stops on this route." },
    "col:rating": { t: "Rating", d: "Average customer rating." },
    "col:role": { t: "Role", d: "The user's assigned role and permissions." },
    "col:balance": { t: "Balance", d: "Remaining amount after payments." },
    "col:paid": { t: "Paid", d: "Amount already paid." },
    "col:pending": { t: "Pending", d: "Amount still due." },
    "col:invoice": { t: "Invoice", d: "The invoice number." },
    "col:order": { t: "Order", d: "The order number." },
    "col:product": { t: "Product", d: "The item ordered." },
    "col:items": { t: "Items", d: "The products and quantities in this order." },
    "col:contact": { t: "Contact", d: "Mobile or email for this record." },
    "col:last login": { t: "Last login", d: "When this user last signed in." },
    "col:effective": { t: "Effective", d: "The dates this configuration is active." },
    "col:type": { t: "Type", d: "The category or kind of this record." },
    /* B2B statement financials + sections */
    "metric:previous outstanding": { t: "Previous outstanding", d: "Unpaid balance carried over from earlier invoices." },
    "metric:current invoice": { t: "Current invoice", d: "Charges for the current billing period." },
    "metric:payments received": { t: "Payments received", d: "Total payments received during this period." },
    "metric:credit notes": { t: "Credit notes", d: "Amounts credited back against invoices." },
    "metric:discounts": { t: "Discounts", d: "Reductions applied to the amount payable." },
    "metric:net payable": { t: "Net payable", d: "The final amount due after all adjustments." },
    "metric:total milk supplied": { t: "Total milk supplied", d: "Total volume supplied to this partner in the period." },
    "metric:avg daily quantity": { t: "Average daily quantity", d: "Average litres delivered per day." },
    duedate: { t: "Due date", d: "The date by which payment must be made." },
    daysoverdue: { t: "Days overdue", d: "How many days the payment is past its due date." },
    creditperiod: { t: "Credit period", d: "How long after billing a partner has to pay." },
    "section:supply summary": { t: "Supply summary", d: "What was supplied this period — litres, bottles, products and delivery days." },
    "section:financial summary": { t: "Financial summary", d: "A complete breakdown of charges, payments and the balance due." },
    "section:outstanding tracker": { t: "Outstanding tracker", d: "How much is owed, when it's due, and the credit still available." },
    "section:payment history": { t: "Payment history", d: "Past invoices with amounts paid, pending and their status." },
    "section:business analytics": { t: "Business analytics", d: "Purchase trends and insights for this business partner." },
    "section:delivery summary": { t: "Delivery summary", d: "Deliveries made, skipped, paused and bonus days this period." },
    /* ---- dashboard KPI cards & stat tiles (admin / account / driver / farmer) ---- */
    "metric:todays revenue": { t: "Today's revenue", d: "Money collected from all orders so far today." },
    "metric:month revenue": { t: "Month revenue", d: "Total revenue booked this calendar month.", ex: "MoM = vs the same point last month." },
    "metric:active subscriptions": { t: "Active subscriptions", d: "Recurring plans currently running and being billed." },
    "metric:new customers today": { t: "New customers (today)", d: "Customers who placed their first order today." },
    "metric:pending deliveries": { t: "Pending deliveries", d: "Orders scheduled but not yet delivered." },
    "metric:milk procured wk": { t: "Milk procured (week)", d: "Litres collected from partner farms this week." },
    "metric:bottles in field": { t: "Bottles in field", d: "Glass bottles currently with customers, awaiting return." },
    "metric:avg delivery rating": { t: "Average delivery rating", d: "Mean customer rating for recent deliveries (out of 5)." },
    "metric:total bottles owned": { t: "Total bottles owned", d: "The full glass-bottle inventory you own across all stages." },
    "metric:in sanitised stock": { t: "In sanitised stock", d: "Cleaned bottles ready to be filled and dispatched." },
    "metric:in circulation": { t: "In circulation", d: "Bottles currently out for delivery or with customers." },
    "metric:pending return": { t: "Pending return", d: "Bottles delivered but not yet collected back." },
    "metric:lost / damaged mo": { t: "Lost / damaged (month)", d: "Bottles written off as lost or broken this month." },
    "metric:deposits held": { t: "Deposits held", d: "Refundable bottle deposits currently held from customers." },
    "metric:deposit held": { t: "Deposit held", d: "Refundable deposit held against bottles you have." },
    "metric:stops today": { t: "Stops today", d: "Delivery stops on your route for today." },
    "metric:delivered": { t: "Delivered", d: "Stops completed and handed over so far." },
    "metric:cash to collect": { t: "Cash to collect", d: "Total cash-on-delivery still to be collected on this route." },
    "metric:bottles to pick up": { t: "Bottles to pick up", d: "Empty bottles to collect from customers today." },
    "metric:next delivery": { t: "Next delivery", d: "When your next order is scheduled to arrive." },
    "metric:bottles pending": { t: "Bottles pending", d: "Empties still to be returned for your refund." },
    "metric:reward points": { t: "Reward points", d: "Points earned that can be redeemed for discounts." },
    "metric:redeemable": { t: "Redeemable", d: "Reward value you can apply to your next order." },
    "metric:points": { t: "Points", d: "Loyalty points earned from orders and referrals." },
    "metric:tier": { t: "Tier", d: "Your loyalty level — higher tiers unlock better perks." },
    "metric:badges": { t: "Badges", d: "Achievements earned for milestones and streaks." },
    "metric:total issued": { t: "Total issued", d: "Bottles handed to you across all deliveries." },
    "metric:returned": { t: "Returned", d: "Bottles you've handed back for collection." },
    "metric:new wk": { t: "New (week)", d: "Customers added in the last 7 days." },
    "metric:churn": { t: "Churn", d: "Share of customers who cancelled in the period." },
    "metric:1000 ml ready": { t: "1000 ml ready", d: "One-litre bottles filled and ready to dispatch." },
    "metric:500 ml ready": { t: "500 ml ready", d: "Half-litre bottles filled and ready to dispatch." },
    "metric:low skus": { t: "Low SKUs", d: "Products at or below their reorder level." },
    "metric:reorder now": { t: "Reorder now", d: "Items that should be restocked immediately." },
    "metric:scheduled": { t: "Scheduled", d: "Deliveries planned for the selected day." },
    "metric:zones": { t: "Zones", d: "Distinct delivery areas covered today." },
    "metric:milk required": { t: "Milk required", d: "Litres needed to fulfil all scheduled orders." },
    "metric:drivers": { t: "Drivers", d: "Delivery agents assigned for the day." },
    "metric:collected today": { t: "Collected today", d: "Litres received from farms today." },
    "metric:payable": { t: "Payable", d: "Amount owed to farmers for their supply." },
    "metric:avg fat": { t: "Average fat", d: "Mean fat percentage across tested batches — a key quality measure." },
    "metric:avg snf": { t: "Average SNF", d: "Solids-Not-Fat — milk solids besides fat; higher means richer milk." },
    "metric:qc passed": { t: "QC passed", d: "Batches that cleared quality control." },
    "metric:batches tested": { t: "Batches tested", d: "Milk batches put through quality checks." },
    "metric:flagged": { t: "Flagged", d: "Batches held back for failing a quality check." },
    "metric:avg temp": { t: "Average temperature", d: "Mean cold-chain temperature — milk must stay chilled." },
    "metric:today": { t: "Today", d: "Figures for the current day." },
    "metric:this month": { t: "This month", d: "Totals for the current calendar month." },
    "metric:mom growth": { t: "MoM growth", d: "Month-on-month change versus the previous month." },
    "metric:avg order": { t: "Average order", d: "Mean value of an order in the period." },
    "metric:captured today": { t: "Captured today", d: "Payments successfully charged today." },
    "metric:refunding": { t: "Refunding", d: "Payments currently being refunded to customers." },
    "metric:disputed": { t: "Disputed", d: "Payments a customer or bank has contested." },
    "metric:open": { t: "Open", d: "Tickets awaiting a first response or resolution." },
    "metric:high priority": { t: "High priority", d: "Urgent tickets that need attention first." },
    "metric:avg response": { t: "Average response", d: "Typical time to first reply on a ticket." },
    "metric:resolved": { t: "Resolved", d: "Tickets closed after the issue was fixed." },
    "metric:to collect": { t: "To collect", d: "Bottles still to be picked up on this route." },
    "metric:collected": { t: "Collected", d: "Bottles or cash already picked up." },
    "metric:remaining": { t: "Remaining", d: "Items still left to handle on the route." },
    "metric:damaged": { t: "Damaged", d: "Bottles returned broken or unusable." },
    "metric:expected": { t: "Expected", d: "What was planned for collection or delivery." },
    "metric:cod stops": { t: "COD stops", d: "Stops where cash is collected on delivery." },
    "metric:partner farms": { t: "Partner farms", d: "Verified farms that supply your milk." },
    "metric:glass bottles": { t: "Glass bottles", d: "Reusable glass packaging — no single-use plastic." },
    "metric:preservatives": { t: "Preservatives", d: "Additives used — zero in fresh A2 milk." },
    "metric:customer rating": { t: "Customer rating", d: "Average satisfaction score from customers." },
    "metric:cold chain": { t: "Cold chain", d: "Unbroken chilled handling from farm to doorstep." },
    "metric:batch tested": { t: "Batch tested", d: "Every batch lab-checked before dispatch." },
    "metric:fair avg rate": { t: "Fair average rate", d: "Average price paid to farmers per litre." },
    "metric:collection": { t: "Collection", d: "How milk is gathered from partner farms." },
    "metric:tested": { t: "Tested", d: "Share of supply that passed quality testing." },
    "metric:reuse cycle": { t: "Reuse cycle", d: "How many times a glass bottle is reused on average." },
    "metric:refundable deposit": { t: "Refundable deposit", d: "Bottle deposit returned when empties come back." },
    /* referral stat tiles + generic status words used as stat tiles */
    "metric:total referrals": { t: "Total referrals", d: "Everyone you've invited so far." },
    "metric:successful": { t: "Successful", d: "Referrals that completed and earned a reward." },
    "metric:pending": { t: "Pending", d: "Items still awaiting action or completion." },
    "metric:rejected": { t: "Rejected", d: "Entries that didn't qualify or were declined." },
    "metric:active": { t: "Active", d: "Records that are currently running." },
    "metric:paused": { t: "Paused", d: "Temporarily on hold and not being processed." },
    "metric:completed": { t: "Completed", d: "Finished and closed out." },
    "metric:failed": { t: "Failed", d: "Did not go through and may need a retry." },
    "metric:refunded": { t: "Refunded", d: "Money returned to the customer." },
    "metric:processing": { t: "Processing", d: "Currently being worked on." },
    "metric:wallet earned": { t: "Wallet earned", d: "Reward credit added to your wallet from referrals." },
    /* status badges seen across pages */
    "status:quality checked": { t: "Quality Checked", d: "This batch passed every lab quality test before dispatch." },
    "status:reward credited": { t: "Reward Credited", d: "The referral reward has been added to the wallet." },
    "status:trial purchased": { t: "Trial Purchased", d: "Your friend bought a trial pack — reward is on the way." },
    "status:registered": { t: "Registered", d: "Your friend signed up but hasn't ordered yet." },
    "status:invited": { t: "Invited", d: "Invitation sent — waiting for your friend to join." },
    /* table columns seen across pages */
    "col:friend": { t: "Friend", d: "The person you referred." },
    "col:gst name": { t: "GST Name", d: "A label for this tax rate configuration." },
    "col:created by": { t: "Created by", d: "The admin who added this record." },
    "col:actions": { t: "Actions", d: "Things you can do to this row — edit, view or remove." },
    "col:reward": { t: "Reward", d: "What you earn when this referral completes." },
    "col:payment id": { t: "Payment ID", d: "The unique reference for this payment from the gateway." },
    "col:sku": { t: "SKU", d: "Stock Keeping Unit — a unique code for each product variant." },
    "col:item": { t: "Item", d: "The product this stock row tracks." },
    "col:stock": { t: "Stock", d: "Units currently available." },
    "col:reorder at": { t: "Reorder at", d: "The level at which this item should be restocked." },
    "col:description": { t: "Description", d: "A short note explaining this entry." },
    "col:credit / debit": { t: "Credit / Debit", d: "Money added to (credit) or taken from (debit) the wallet." },
    "col:balance after": { t: "Balance after", d: "The wallet balance once this transaction was applied." },
    "col:reference": { t: "Reference", d: "A code linking this entry to an order or payment." },
    "status:captured": { t: "Captured", d: "Payment was successfully charged and settled." },
    "status:healthy": { t: "Healthy", d: "Stock is comfortably above the reorder level." },
    "status:low": { t: "Low", d: "Stock is near the reorder level — restock soon." },
    "status:reorder": { t: "Reorder", d: "Stock is critically low or out — order now." },
  };
  /* term aliases — map a phrase as it appears in a label/cell to a help key */
  var TERM_ALIASES = {
    "gst": "gst", "outstanding": "outstanding", "outstanding amount": "outstanding", "outstanding balance": "outstanding", "total outstanding": "outstanding",
    "wallet": "wallet", "doodly wallet": "wallet", "wallet balance": "walletbalance", "available balance": "walletbalance",
    "available credit": "availablecredit", "credit limit": "creditlimit", "referral code": "referralcode", "your referral code": "referralcode",
    "referral reward": "referralreward", "delivery slot": "deliveryslot", "preferred time": "deliveryslot", "trial pack": "trial", "trial": "trial",
    "auto pay": "autopay", "autopay": "autopay", "bulk order": "bulkorder", "bulk orders": "bulkorder", "b2b orders": "bulkorder",
    "pause subscription": "pausesubscription", "subscription": "subscription", "pending amount": "pendingamount", "amount due today": "pendingamount",
    "net payable": "outstanding", "net amount payable": "outstanding",
    "due date": "duedate", "days overdue": "daysoverdue", "credit period": "creditperiod",
    "previous outstanding": "metric:previous outstanding", "current invoice": "metric:current invoice",
    "payments received": "metric:payments received", "credit notes": "metric:credit notes", "discounts": "metric:discounts",
    "total milk supplied": "metric:total milk supplied", "average daily quantity": "metric:avg daily quantity",
    "supply summary": "section:supply summary", "financial summary": "section:financial summary",
    "outstanding tracker": "section:outstanding tracker", "payment history": "section:payment history",
    "business analytics": "section:business analytics", "delivery summary": "section:delivery summary",
  };
  function tipOverrides() { try { return JSON.parse(localStorage.getItem("doodly-help-tips") || "{}"); } catch (e) { return {}; } }
  function saveTipOverrides(o) { try { localStorage.setItem("doodly-help-tips", JSON.stringify(o)); } catch (e) {} }
  function tipModules() { try { return JSON.parse(localStorage.getItem("doodly-help-tip-modules") || "{}"); } catch (e) { return {}; } }
  function saveTipModules(m) { try { localStorage.setItem("doodly-help-tip-modules", JSON.stringify(m)); } catch (e) {} }
  function getTip(key) { if (!key) return null; var ov = tipOverrides()[key]; var base = TIP_DEFAULTS[key]; if (!base && !ov) return null; return Object.assign({}, base, ov); }
  var TIPS = TIP_DEFAULTS;   // back-compat alias (tip()/AUTO_TIPS reference this)

  /* ============================================================
     DATA + ANALYTICS
     ============================================================ */
  function db() {
    var d; try { d = JSON.parse(localStorage.getItem("doodly-help") || "null"); } catch (e) {}
    if (!d || !d.cats) { d = { cats: clone(DEFAULT_CATS), videos: clone(DEFAULT_VIDEOS), illustrations: true }; save(d); }
    return d;
  }
  function save(d) { try { localStorage.setItem("doodly-help", JSON.stringify(d)); } catch (e) {} }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function cats() { return db().cats; }
  function publishedCats() { return cats().map(function (c) { return Object.assign({}, c, { faqs: c.faqs.filter(function (f) { return f.published !== false; }) }); }).filter(function (c) { return c.faqs.length; }); }

  function analytics() { var a; try { a = JSON.parse(localStorage.getItem("doodly-help-analytics") || "null"); } catch (e) {} return a || { views: {}, searches: {}, unanswered: {}, cards: {}, tourStarted: 0, tourCompleted: 0, tourSkipped: 0 }; }
  function saveA(a) { try { localStorage.setItem("doodly-help-analytics", JSON.stringify(a)); } catch (e) {} }
  function track(kind, key) { var a = analytics(); if (kind === "tour") { a[key] = (a[key] || 0) + 1; } else { a[kind] = a[kind] || {}; a[kind][key] = (a[kind][key] || 0) + 1; } saveA(a); }
  function faqKey(catId, q) { return catId + "::" + q; }

  /* ============================================================
     PUBLIC HELP CENTER  —  mount(host)
     ============================================================ */
  function scene() {
    if (!db().illustrations) return "";
    return '<div class="help-scene" aria-hidden="true">' +
      '<div class="hs-sun"></div>' +
      '<svg class="hs-hills" viewBox="0 0 1440 200" preserveAspectRatio="none"><path d="M0 120 Q360 40 720 110 T1440 90 V200 H0Z" fill="currentColor" opacity=".5"/><path d="M0 150 Q400 90 800 140 T1440 130 V200 H0Z" fill="currentColor" opacity=".8"/></svg>' +
      '<div class="hs-buffalo">🐃</div><div class="hs-buffalo two">🐃</div>' +
      '<div class="hs-van">🚚</div>' +
      '<span class="hs-drop d1"></span><span class="hs-drop d2"></span><span class="hs-drop d3"></span>' +
      '<span class="hs-bfly b1">🦋</span><span class="hs-bfly b2">🦋</span>' +
      '<span class="hs-tree t1">🌳</span><span class="hs-tree t2">🌲</span>' +
      '</div>';
  }

  function mount(host) {
    if (!host) return;
    var s = { q: "", open: {} };
    var data = function () { return publishedCats(); };

    function quickCards() {
      return '<div class="help-quick">' + QUICK.map(function (c) {
        return '<button class="help-qcard" data-jump="' + c.id + '"><span class="help-qemoji">' + c.emoji + '</span><span class="help-qlabel">' + esc(c.label) + '</span></button>';
      }).join("") + '</div>';
    }

    function faqList() {
      var q = s.q.trim().toLowerCase();
      var list = data();
      if (q) {
        var hits = [];
        list.forEach(function (c) { c.faqs.forEach(function (f) { if ((f.q + " " + f.a + " " + c.title).toLowerCase().indexOf(q) >= 0) hits.push({ c: c, f: f }); }); });
        if (!hits.length) return '<div class="help-empty">' + svg("search", 26) + '<p>No results for “' + esc(s.q) + '”.</p><span>Try a different term, or contact support below.</span></div>';
        return '<div class="help-results"><p class="help-rescount">' + hits.length + ' result' + (hits.length > 1 ? "s" : "") + '</p>' + hits.map(function (h, i) { return faqCard(h.c, h.f, i, true); }).join("") + '</div>';
      }
      return list.map(function (c, ci) {
        return '<section class="help-cat" id="help-cat-' + c.id + '" style="--d:' + (ci * 40) + 'ms"><h2 class="help-cat-h">' + svg(c.icon, 18) + ' ' + esc(c.title) + '</h2>' +
          '<div class="help-acc">' + c.faqs.map(function (f, i) { return faqCard(c, f, i, false); }).join("") + '</div></section>';
      }).join("");
    }
    function faqCard(c, f, i, flat) {
      var key = faqKey(c.id, f.q), isOpen = !!s.open[key];
      return '<article class="help-faq ' + (isOpen ? "open" : "") + '" data-key="' + esc(key) + '" style="--i:' + i + '">' +
        '<button class="help-q" aria-expanded="' + isOpen + '">' + (flat ? '<span class="help-q-cat">' + esc(c.title) + '</span>' : "") + '<span class="help-q-txt">' + esc(f.q) + '</span><span class="help-q-ic">' + svg("chevron", 18) + '</span></button>' +
        '<div class="help-a" role="region"><div class="help-a-in"><span class="help-ripple"></span>' + esc(f.a) + '</div></div></article>';
    }

    function videos() {
      var vs = db().videos || [];
      if (!vs.length) return "";
      return '<section class="help-videos"><h2 class="help-cat-h">' + svg("play", 18) + ' Video guides <span class="help-soon">Coming soon</span></h2>' +
        '<div class="help-vgrid">' + vs.map(function (v) {
          return '<div class="help-vcard' + (v.url ? " has-url" : "") + '"' + (v.url ? ' data-video="' + esc(v.url) + '"' : "") + '><div class="help-vthumb">' + svg("play", 30) + '</div><div class="help-vtitle">' + esc(v.title) + '</div></div>';
        }).join("") + '</div></section>';
    }

    function contact() {
      var sp = support(), wa = String(sp.whatsapp || "").replace(/\D/g, ""), phone = (sp.phone || "").replace(/\s/g, "");
      return '<section class="help-contact"><div class="help-contact-in">' +
        '<h2>Still need help?</h2><p>Our team is here for you, ' + esc(sp.hours || "Mon–Sat, 8 AM – 8 PM") + '.</p>' +
        '<div class="help-contact-btns">' +
          (wa ? '<a class="help-cbtn wa" href="https://wa.me/' + wa + '" target="_blank" rel="noopener">' + svg("chat", 18) + ' WhatsApp Support</a>' : "") +
          (phone ? '<a class="help-cbtn" href="tel:' + esc(phone) + '">' + svg("phone", 18) + ' Call Us</a>' : "") +
          (sp.email ? '<a class="help-cbtn" href="mailto:' + esc(sp.email) + '?subject=DOODLY%20Support">' + svg("mail", 18) + ' Email Us</a>' : "") +
        '</div>' +
        '<div class="help-hours">' + svg("clock", 14) + ' Support hours · Monday–Saturday · 8:00 AM – 8:00 PM</div>' +
      '</div></section>';
    }

    function render() {
      host.innerHTML =
        '<div class="help-center">' + scene() +
          '<div class="help-head">' +
            '<span class="help-eyebrow">' + svg("spark", 14) + ' Help & FAQs</span>' +
            '<h1 class="help-title">How can we help?</h1>' +
            '<p class="help-lede">Search our knowledge base or browse the topics below. Most answers take seconds.</p>' +
            '<div class="help-searchwrap">' + svg("search", 18) + '<input class="help-search" id="helpSearch" type="search" placeholder="Search subscription, delivery, wallet, bottle return…" aria-label="Search help" value="' + esc(s.q) + '" autocomplete="off">' +
            (s.q ? '<button class="help-clear" id="helpClear" aria-label="Clear">✕</button>' : "") + '</div>' +
            '<div class="help-tourcta">New here? <button class="help-link" id="helpTour">Take the 60-second product tour →</button></div>' +
          '</div>' +
          quickCards() +
          '<div class="help-body">' + faqList() + '</div>' +
          (s.q ? "" : videos()) +
          contact() +
        '</div>';
      wire();
    }

    var searchTimer = null;
    function wire() {
      var inp = host.querySelector("#helpSearch");
      if (inp) {
        inp.addEventListener("input", function () {
          s.q = inp.value; var pos = inp.selectionStart;
          var body = host.querySelector(".help-body"); if (body) body.innerHTML = faqList();
          var clr = host.querySelector(".help-searchwrap"); // toggle clear button without full re-render
          if (s.q && !host.querySelector("#helpClear")) { var b = document.createElement("button"); b.className = "help-clear"; b.id = "helpClear"; b.setAttribute("aria-label", "Clear"); b.textContent = "✕"; clr.appendChild(b); b.addEventListener("click", clearSearch); }
          if (!s.q) { var ex = host.querySelector("#helpClear"); if (ex) ex.remove(); }
          rewireBody();
          clearTimeout(searchTimer); searchTimer = setTimeout(function () { if (s.q.trim().length >= 3) { var q = s.q.trim().toLowerCase(); var any = data().some(function (c) { return c.faqs.some(function (f) { return (f.q + " " + f.a).toLowerCase().indexOf(q) >= 0; }); }); track("searches", q); if (!any) track("unanswered", q); } }, 700);
        });
        inp.addEventListener("keydown", function (e) { if (e.key === "Escape") { clearSearch(); } });
      }
      var clr = host.querySelector("#helpClear"); if (clr) clr.addEventListener("click", clearSearch);
      host.querySelectorAll("[data-jump]").forEach(function (b) { b.addEventListener("click", function () { track("cards", b.dataset.jump); if (s.q) { s.q = ""; render(); } var t = host.querySelector("#help-cat-" + b.dataset.jump); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }); });
      var tour = host.querySelector("#helpTour"); if (tour) tour.addEventListener("click", function () { if (window.DOODLY_TOUR) window.DOODLY_TOUR.start(true); });
      rewireBody();
      host.querySelectorAll(".help-vcard.has-url").forEach(function (v) { v.addEventListener("click", function () { window.open(v.dataset.video, "_blank", "noopener"); }); });
    }
    function rewireBody() {
      host.querySelectorAll(".help-faq").forEach(function (card) {
        var btn = card.querySelector(".help-q");
        btn.onclick = function () {
          var key = card.dataset.key, willOpen = !s.open[key];
          s.open[key] = willOpen;
          card.classList.toggle("open", willOpen);
          btn.setAttribute("aria-expanded", String(willOpen));
          if (willOpen) track("views", key);
        };
      });
    }
    function clearSearch() { s.q = ""; render(); var i = host.querySelector("#helpSearch"); if (i) i.focus(); }

    // Hydrate the knowledge base from the live backend so admin CMS edits show for
    // every visitor. Renders defaults first (no CLS); on success swaps in published
    // content and re-renders if the user hasn't started interacting. Offline → defaults.
    function hydrateFromBackend() {
      var API = window.DOODLY_API; if (!API) return;
      API.get("/api/help/public").then(function (res) {
        if (!res || !res.cats || !res.cats.length) return;
        var existing = db();
        save({
          cats: res.cats,
          videos: (res.videos && res.videos.length) ? res.videos : existing.videos,
          illustrations: existing.illustrations !== false,
        });
        if (!s.q && !Object.keys(s.open).length) render();
      }).catch(function () { /* offline → localStorage/defaults already shown */ });
    }

    render();
    hydrateFromBackend();
  }

  /* ============================================================
     CONTEXTUAL TOOLTIPS (ⓘ)  —  tip(key) + initTips(root)
     ============================================================ */
  function tip(key) {
    var t = getTip(key); if (!t) return "";
    return '<button type="button" class="help-tip" data-tip="' + esc(key) + '" aria-label="' + esc(t.t) + ": " + esc(t.d) + '">' + svg("info", 15) + '</button>';
  }

  /* ---------- resolve which help applies to ANY element (no markup needed) ---------- */
  function norm(s) { return String(s || "").toLowerCase().replace(/[^\w\s/&+-]/g, "").replace(/\s+/g, " ").trim(); }
  function moduleEnabled() { var m = RBAC() ? RBAC().routeModule(location.pathname) : null; if (!m) return true; return tipModules()[m] !== false; }
  function resolveTerm(t) { if (!t) return null; if (TERM_ALIASES[t]) return TERM_ALIASES[t]; if (getTip("metric:" + t)) return "metric:" + t; if (getTip("section:" + t)) return "section:" + t; if (getTip(t)) return t; return null; }
  var LEAF_SEL = ".exp-clabel, .as-kpi-l, .inv-stat-l, .rf-stat-l, .kpi .l, .dl-an-kpi .l, .as-kpi .l, .exp-kv span, .inv-kv span, .lo-dashcell span, .deflist dt, dt, .b2-f > span, .rbac-f > span, .gst-f > span, .rf-codelbl, .inv-ph, .inv-trow span, .dt-count, .rf-stat-l, .as-stat-l, .inv-sec-h, .b2-sec-h, .gst-sec-h, .as-sec-h, .kpi-l, .stat-l, .card-h h3, .sec-h";
  function resolveHelp(node) {
    if (!node || !node.closest) return null;
    var d = node.closest("[data-help]"); if (d) return { key: d.dataset.help, target: d };
    var badge = node.closest(".badge, .inv-badge, .lo-statusbadge, .rba-tag, .seg button, .chip-f"); if (badge) { var k = "status:" + norm(badge.textContent); if (getTip(k)) return { key: k, target: badge }; }
    var th = node.closest("th"); if (th) { var ct = norm(th.textContent); var kc = getTip("col:" + ct) ? "col:" + ct : resolveTerm(ct); if (kc) return { key: kc, target: th }; }
    var btn = node.closest("button, .btn, a.btn, .rf-sbtn, .dt-btn, .icon-btn, .lo-btn, .dl-cbtn, .exp-tab, .lc-cta, .help-launch-item"); if (btn) { var lbl = norm((btn.getAttribute("aria-label") || btn.textContent || "").replace(/\([^)]*\)/g, "")); var ka = getTip("act:" + lbl) ? "act:" + lbl : null; if (ka) return { key: ka, target: btn }; }
    var lab = node.closest(LEAF_SEL); if (lab) { var lt = norm(lab.textContent); var kl = getTip("metric:" + lt) ? "metric:" + lt : resolveTerm(lt); if (kl) return { key: kl, target: lab }; }
    // general fallback: a small childless element whose exact text is a known term
    if (node.children && node.children.length === 0) { var nt = norm(node.textContent); if (nt && nt.length <= 30) { var kg = resolveTerm(nt); if (kg) return { key: kg, target: node }; } }
    return null;
  }

  /* ---------- the floating help card (auto-positioned, arrow, flip) ---------- */
  var tipPop = null, tipFor = null, hideT = null, lpTimer = null, lpFired = false;
  function buildCard(t) { return '<b>' + esc(t.t) + '</b><span>' + esc(t.d) + '</span>' + (t.ex ? '<em class="help-tip-ex">e.g. ' + esc(t.ex) + '</em>' : "") + (t.more ? '<a class="help-tip-more" href="' + esc(t.more) + '">Learn more →</a>' : ""); }
  function openHelp(target, key) {
    if (!moduleEnabled()) return;
    var t = getTip(key); if (!t) return;
    if (tipFor === target && tipPop) { clearTimeout(hideT); return; }
    hideTip();
    tipPop = document.createElement("div"); tipPop.className = "help-tip-pop"; tipPop.id = "help-live"; tipPop.setAttribute("role", "tooltip");
    tipPop.innerHTML = buildCard(t);
    document.body.appendChild(tipPop); tipFor = target;
    try { target.setAttribute("aria-describedby", "help-live"); } catch (e) {}
    position(tipPop, target);
    requestAnimationFrame(function () { if (tipPop) tipPop.classList.add("show"); });
    tipPop.addEventListener("mouseenter", function () { clearTimeout(hideT); });
    tipPop.addEventListener("mouseleave", scheduleHide);
  }
  function position(pop, target) {
    var r = target.getBoundingClientRect(), pw = Math.min(300, window.innerWidth - 20);
    pop.style.width = pw + "px";
    var ph = pop.offsetHeight;
    var above = (window.innerHeight - r.bottom) < ph + 16 && r.top > ph + 16;
    pop.style.left = Math.max(10, Math.min(window.innerWidth - pw - 10, r.left + r.width / 2 - pw / 2)) + "px";
    var left = parseFloat(pop.style.left);
    pop.style.top = (above ? r.top + window.scrollY - ph - 10 : r.bottom + window.scrollY + 10) + "px";
    pop.classList.toggle("flip", above);
    pop.style.setProperty("--arrow-x", Math.max(14, Math.min(pw - 14, r.left + r.width / 2 - left)) + "px");
  }
  function hideTip() { if (tipPop) { if (tipFor) { try { tipFor.removeAttribute("aria-describedby"); } catch (e) {} } tipPop.remove(); tipPop = null; tipFor = null; } }
  function scheduleHide() { clearTimeout(hideT); hideT = setTimeout(function () { if (tipPop && !tipPop.matches(":hover")) hideTip(); }, 140); }

  var AUTO_TIPS = [
    { re: /^(doodly )?wallet( balance)?$/i, key: "wallet" },
    { re: /^auto[\s-]?pay$/i, key: "autopay" },
    { re: /^(my |your )?subscription$/i, key: "subscription" },
    { re: /^bottle (returns?|tracking)$/i, key: "bottlereturns" },
    { re: /^trial pack( cashback)?$/i, key: "trial" },
    { re: /^referral(s| program| code)?$/i, key: "referralcode" },
    { re: /^gst( management)?$/i, key: "gst" },
  ];
  function initTips(root) {
    root = root || document;
    root.querySelectorAll("[data-help]").forEach(function (el) { if (el.dataset.helpReady) return; el.dataset.helpReady = "1"; el.insertAdjacentHTML("beforeend", " " + tip(el.dataset.help)); });
    var used = {};
    root.querySelectorAll(".crumbs .cur, h1, h2, h3, .panel-head h3").forEach(function (el) {
      if (el.dataset.helpReady || el.querySelector(".help-tip")) return;
      var txt = (el.textContent || "").trim();
      for (var i = 0; i < AUTO_TIPS.length; i++) { if (!used[AUTO_TIPS[i].key] && getTip(AUTO_TIPS[i].key) && AUTO_TIPS[i].re.test(txt)) { el.dataset.helpReady = "1"; used[AUTO_TIPS[i].key] = 1; el.insertAdjacentHTML("beforeend", " " + tip(AUTO_TIPS[i].key)); break; } }
    });
    if (!document._helpTipsBound) {
      document._helpTipsBound = true;
      document.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest(".help-tip");
        if (b) { e.preventDefault(); if (tipFor === b && tipPop) hideTip(); else openHelp(b, b.dataset.tip); return; }
        if (lpFired) { e.preventDefault(); e.stopPropagation(); lpFired = false; return; }   // swallow the tap that ends a long-press
        if (!e.target.closest || !e.target.closest(".help-tip-pop")) hideTip();
      }, true);
      document.addEventListener("mouseover", function (e) { var b = e.target.closest && e.target.closest(".help-tip"); if (b) { openHelp(b, b.dataset.tip); return; } var r = resolveHelp(e.target); if (r) openHelp(r.target, r.key); });
      document.addEventListener("mouseout", function (e) { if (e.target.closest && (e.target.closest(".help-tip") || resolveHelp(e.target))) scheduleHide(); });
      document.addEventListener("focusin", function (e) { var b = e.target.closest && e.target.closest(".help-tip"); if (b) { openHelp(b, b.dataset.tip); return; } var r = resolveHelp(e.target); if (r) openHelp(r.target, r.key); });
      document.addEventListener("focusout", scheduleHide);
      document.addEventListener("touchstart", function (e) {
        var t = e.target.closest && e.target.closest(".help-tip"); var r = t ? { target: t, key: t.dataset.tip } : resolveHelp(e.target);
        if (!r) return; clearTimeout(lpTimer); lpFired = false;
        lpTimer = setTimeout(function () { lpFired = true; openHelp(r.target, r.key); }, 600);
      }, { passive: true });
      document.addEventListener("touchend", function () { clearTimeout(lpTimer); });
      document.addEventListener("touchmove", function () { clearTimeout(lpTimer); if (lpFired) hideTip(); });
      window.addEventListener("scroll", hideTip, { passive: true });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") hideTip(); });
    }
  }

  /* ============================================================
     FLOATING HELP LAUNCHER  (persistent “?” on public/account)
     ============================================================ */
  function mountLauncher() {
    if (document.getElementById("helpLauncher")) return;
    var route = document.body.dataset.route || "";
    if (route.indexOf("admin/") === 0 || route.indexOf("driver/") === 0 || route.indexOf("delivery/") === 0 || route.indexOf("auth") === 0 || route === "help") return;
    var wrap = document.createElement("div");
    wrap.id = "helpLauncher"; wrap.className = "help-launch";
    wrap.innerHTML =
      '<div class="help-launch-menu" hidden>' +
        '<button class="help-launch-item" data-act="tour">' + svg("spark", 16) + ' Take the product tour</button>' +
        '<a class="help-launch-item" href="/help.html">' + svg("search", 16) + ' Open Help Center</a>' +
        '<a class="help-launch-item" href="#" data-act="support">' + svg("chat", 16) + ' Contact support</a>' +
      '</div>' +
      '<button class="help-launch-fab" aria-label="Help" aria-expanded="false">' + svg("info", 22) + '</button>';
    document.body.appendChild(wrap);
    var fab = wrap.querySelector(".help-launch-fab"), menu = wrap.querySelector(".help-launch-menu");
    fab.addEventListener("click", function () { var open = menu.hidden; menu.hidden = !open; fab.setAttribute("aria-expanded", String(open)); wrap.classList.toggle("open", open); });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) { menu.hidden = true; wrap.classList.remove("open"); fab.setAttribute("aria-expanded", "false"); } });
    wrap.querySelector('[data-act="tour"]').addEventListener("click", function () { menu.hidden = true; wrap.classList.remove("open"); if (window.DOODLY_TOUR) window.DOODLY_TOUR.start(true); });
    wrap.querySelector('[data-act="support"]').addEventListener("click", function (e) { e.preventDefault(); var sp = support(), wa = String(sp.whatsapp || "").replace(/\D/g, ""); if (wa) window.open("https://wa.me/" + wa, "_blank", "noopener"); else if (sp.phone) window.location.href = "tel:" + String(sp.phone).replace(/\s/g, ""); else window.location.href = "/account/support.html"; });
  }

  /* ============================================================
     ADMIN CMS + ANALYTICS  —  mountAdmin(host)
     ============================================================ */
  function mountAdmin(host) {
    if (!host) return;
    var st = { tab: "faqs", cat: cats()[0] ? cats()[0].id : null, edit: null };
    var T = [["faqs", "FAQs"], ["categories", "Categories"], ["videos", "Videos"], ["tooltips", "Tooltips"], ["settings", "Settings"], ["analytics", "Analytics"]];

    function render() {
      host.innerHTML = '<div class="exp"><div class="exp-tabs">' + T.map(function (t) { return '<button class="exp-tab ' + (st.tab === t[0] ? "on" : "") + '" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join("") + '</div><div class="exp-body">' +
        (st.tab === "faqs" ? viewFaqs() : st.tab === "categories" ? viewCats() : st.tab === "videos" ? viewVideos() : st.tab === "tooltips" ? viewTooltips() : st.tab === "settings" ? viewSettings() : viewAnalytics()) + '</div></div>';
      host.querySelectorAll(".exp-tab").forEach(function (b) { b.addEventListener("click", function () { st.tab = b.dataset.t; st.edit = null; render(); }); });
      wire();
    }

    function viewFaqs() {
      var cs = cats();
      var cur = cs.find(function (c) { return c.id === st.cat; }) || cs[0];
      if (!cur) return '<p class="muted-sm">No categories yet — add one in the Categories tab.</p>';
      var pills = cs.map(function (c) { return '<button class="exp-chip ' + (c.id === cur.id ? "on" : "") + '" data-cat="' + c.id + '">' + esc(c.title) + ' <span class="muted-sm">' + c.faqs.length + '</span></button>'; }).join("");
      var rows = cur.faqs.map(function (f, i) {
        if (st.edit === cur.id + ":" + i) return editForm(cur, i, f);
        return '<div class="help-arow"><div class="help-arow-main"><b>' + esc(f.q) + '</b><p>' + esc(f.a) + '</p></div>' +
          '<div class="help-arow-acts">' +
            '<span class="badge ' + (f.published === false ? "grey" : "green") + '">' + (f.published === false ? "Unpublished" : "Published") + '</span>' +
            '<button class="link" data-pub="' + i + '">' + (f.published === false ? "Publish" : "Unpublish") + '</button>' +
            '<button class="icon-btn" data-up="' + i + '" title="Move up">' + svg("up", 15) + '</button>' +
            '<button class="icon-btn" data-down="' + i + '" title="Move down">' + svg("down", 15) + '</button>' +
            '<button class="icon-btn" data-edit="' + i + '" title="Edit">' + svg("edit", 15) + '</button>' +
            '<button class="icon-btn danger" data-del="' + i + '" title="Delete">' + svg("trash", 15) + '</button>' +
          '</div></div>';
      }).join("") || '<p class="muted-sm">No questions in this category yet.</p>';
      return '<div class="exp-presets">' + pills + '</div>' +
        '<div class="help-arows">' + rows + '</div>' +
        (st.edit === cur.id + ":new" ? editForm(cur, "new", { q: "", a: "" }) : '<button class="btn btn-primary sm" id="faqAdd">' + svg("plus", 15) + ' Add question</button>');
    }
    function editForm(cur, i, f) {
      return '<div class="help-edit"><label class="b2-f"><span>Question</span><input class="input" id="fq" value="' + esc(f.q) + '"></label>' +
        '<label class="b2-f"><span>Answer</span><textarea class="input" id="fa" rows="3">' + esc(f.a) + '</textarea></label>' +
        '<div class="exp-actions"><button class="btn btn-primary sm" data-save="' + i + '">Save</button><button class="btn btn-ghost sm" data-cancel="1">Cancel</button></div></div>';
    }

    function viewCats() {
      var cs = cats();
      var rows = cs.map(function (c, i) {
        return '<div class="help-arow"><div class="help-arow-main"><b>' + svg(c.icon || "info", 15) + ' ' + esc(c.title) + '</b><p class="muted-sm">' + c.faqs.length + ' question' + (c.faqs.length === 1 ? "" : "s") + ' · id: ' + esc(c.id) + '</p></div>' +
          '<div class="help-arow-acts"><button class="icon-btn" data-cup="' + i + '">' + svg("up", 15) + '</button><button class="icon-btn" data-cdown="' + i + '">' + svg("down", 15) + '</button><button class="icon-btn" data-cren="' + i + '" title="Rename">' + svg("edit", 15) + '</button>' + (isSuper() ? '<button class="icon-btn danger" data-cdel="' + i + '" title="Delete">' + svg("trash", 15) + '</button>' : "") + '</div></div>';
      }).join("");
      return '<div class="help-arows">' + rows + '</div><div class="exp-frow" style="margin-top:12px"><input class="input" id="newCat" placeholder="New category name" style="flex:1"><button class="btn btn-primary sm" id="catAdd">' + svg("plus", 15) + ' Add category</button></div>';
    }

    function viewVideos() {
      var vs = db().videos || [];
      var rows = vs.map(function (v, i) {
        return '<div class="help-arow"><div class="help-arow-main"><b>' + svg("play", 15) + ' ' + esc(v.title) + '</b><p class="muted-sm">' + (v.url ? esc(v.url) : "No video yet — placeholder shown to customers") + '</p></div>' +
          '<div class="help-arow-acts"><input class="input sm" data-vurl="' + i + '" placeholder="Paste video URL…" value="' + esc(v.url || "") + '" style="min-width:200px"><button class="icon-btn danger" data-vdel="' + i + '">' + svg("trash", 15) + '</button></div></div>';
      }).join("");
      return '<p class="muted-sm" style="margin-bottom:10px">Add a video URL to turn a placeholder into a playable guide. Leave blank to keep it “Coming soon”.</p><div class="help-arows">' + rows + '</div>' +
        '<div class="exp-frow" style="margin-top:12px"><input class="input" id="newVid" placeholder="New video title" style="flex:1"><button class="btn btn-primary sm" id="vidAdd">' + svg("plus", 15) + ' Add video</button></div>';
    }

    function viewSettings() {
      var d = db(), sp = support();
      return '<div class="help-settings"><label class="help-toggle"><input type="checkbox" id="illus" ' + (d.illustrations ? "checked" : "") + '> <span>Show dairy-themed background illustrations on the Help Center</span></label>' +
        '<div class="panel" style="margin-top:14px"><div class="panel-pad"><p class="exp-block-h">Contact support (from brand settings)</p>' +
        '<p class="exp-kv"><span>Phone:</span> ' + esc(sp.phone || "—") + '</p><p class="exp-kv"><span>WhatsApp:</span> ' + esc(sp.whatsapp || "—") + '</p><p class="exp-kv"><span>Email:</span> ' + esc(sp.email || "—") + '</p><p class="exp-kv"><span>Hours:</span> ' + esc(sp.hours || "—") + '</p>' +
        '<p class="muted-sm">Edit these in Brand / CMS settings — the Help Center reads them live.</p></div></div>' +
        '<button class="btn btn-ghost sm" id="resetHelp" style="margin-top:14px">Reset knowledge base to defaults</button></div>';
    }

    function viewAnalytics() {
      var a = analytics();
      var top = function (obj, n) { return Object.keys(obj || {}).map(function (k) { return { k: k, v: obj[k] }; }).sort(function (x, y) { return y.v - x.v; }).slice(0, n || 8); };
      var label = function (key) { var parts = String(key).split("::"); if (parts.length === 2) { var c = cats().find(function (x) { return x.id === parts[0]; }); return (c ? c.title + " · " : "") + parts[1]; } return key; };
      var tbl = function (title, rows, headv) { return '<div class="panel"><div class="panel-head"><h3>' + title + '</h3></div><div class="panel-pad"><table class="tbl"><thead><tr><th>' + headv[0] + '</th><th>' + headv[1] + '</th></tr></thead><tbody>' + (rows.length ? rows.map(function (r) { return '<tr><td>' + esc(r.label) + '</td><td><b>' + r.v + '</b></td></tr>'; }).join("") : '<tr><td colspan="2" class="muted-sm">No data yet</td></tr>') + '</tbody></table></div></div>'; };
      var started = a.tourStarted || 0, completed = a.tourCompleted || 0;
      var rate = started ? Math.round((completed / started) * 100) : 0;
      var kc = function (l, v) { return '<div class="exp-card"><p class="exp-cval">' + v + '</p><p class="exp-clabel">' + l + '</p></div>'; };
      return '<div class="exp-cards" style="margin-bottom:14px">' + kc("Tour starts", started) + kc("Tour completions", completed) + kc("Completion rate", rate + "%") + kc("Searches", Object.keys(a.searches || {}).length) + '</div>' +
        '<div class="exp-grid2">' +
          tbl("Most viewed FAQs", top(a.views).map(function (r) { return { label: label(r.k), v: r.v }; }), ["Question", "Opens"]) +
          tbl("Most searched keywords", top(a.searches).map(function (r) { return { label: r.k, v: r.v }; }), ["Term", "Searches"]) +
          tbl("Unanswered searches", top(a.unanswered).map(function (r) { return { label: r.k, v: r.v }; }), ["Term", "Times"]) +
          tbl("Most clicked help cards", top(a.cards).map(function (r) { var c = QUICK.find(function (x) { return x.id === r.k; }); return { label: c ? c.label : r.k, v: r.v }; }), ["Card", "Clicks"]) +
        '</div>';
    }

    function viewTooltips() {
      var mods = RBAC() ? RBAC().modules() : [];
      var tm = tipModules(), ov = tipOverrides();
      var modHtml = mods.map(function (m) { return '<label class="help-toggle help-mod"><input type="checkbox" data-mod="' + esc(m.key) + '" ' + (tm[m.key] !== false ? "checked" : "") + '> <span>' + esc(m.label) + '</span></label>'; }).join("");
      var groups = { "Features & terms": [], "Status badges": [], "Action buttons": [], "Table columns": [], "Metrics & charts": [] };
      Object.keys(TIP_DEFAULTS).forEach(function (k) { var g = k.indexOf("status:") === 0 ? "Status badges" : k.indexOf("act:") === 0 ? "Action buttons" : k.indexOf("col:") === 0 ? "Table columns" : k.indexOf("metric:") === 0 ? "Metrics & charts" : "Features & terms"; groups[g].push(k); });
      var editor = Object.keys(groups).map(function (g) {
        if (!groups[g].length) return "";
        return '<div class="help-tipgroup"><div class="exp-block-h">' + g + ' <span class="muted-sm">' + groups[g].length + '</span></div>' + groups[g].map(function (k) {
          var t = getTip(k);
          return '<div class="help-tiprow" data-key="' + esc(k) + '"><div class="help-tiprow-k"><code>' + esc(k) + '</code>' + (ov[k] ? ' <span class="badge blue">edited</span>' : "") + '</div>' +
            '<input class="input help-tt" data-f="t" value="' + esc(t.t) + '" placeholder="Title" aria-label="Title for ' + esc(k) + '">' +
            '<textarea class="input help-tt" data-f="d" rows="2" placeholder="Description" aria-label="Description for ' + esc(k) + '">' + esc(t.d) + '</textarea>' +
            '<input class="input help-tt" data-f="ex" value="' + esc(t.ex || "") + '" placeholder="Example (optional)" aria-label="Example for ' + esc(k) + '"></div>';
        }).join("") + '</div>';
      }).join("");
      return '<p class="muted-sm" style="margin-bottom:10px">Edit contextual-help copy and enable/disable it per module — changes apply instantly across the platform with no code change. Override fields are stored separately, so you can reset to defaults anytime. (Architecture is multi-language ready.)</p>' +
        '<div class="panel"><div class="panel-head"><h3>Enable contextual help per module</h3></div><div class="panel-pad help-mods">' + modHtml + '</div></div>' +
        '<div class="exp-frow" style="margin:14px 0"><input class="input" id="ttSearch" placeholder="Filter tooltips…" style="flex:1;max-width:300px"><button class="btn btn-ghost sm" id="ttReset">Reset all tooltip text</button></div>' +
        '<div class="help-tips-editor">' + editor + '</div>';
    }

    function wire() {
      if (st.tab === "tooltips") {
        host.querySelectorAll("[data-mod]").forEach(function (cb) { cb.addEventListener("change", function () { var m = tipModules(); m[cb.dataset.mod] = cb.checked; saveTipModules(m); if (RBAC()) RBAC().audit("help.tips", (cb.checked ? "enabled" : "disabled") + " help for " + cb.dataset.mod); toast(cb.checked ? "Help enabled" : "Help disabled"); }); });
        host.querySelectorAll(".help-tiprow").forEach(function (row) {
          var key = row.dataset.key;
          row.querySelectorAll(".help-tt").forEach(function (inp) { inp.addEventListener("change", function () {
            var o = tipOverrides(), cur = o[key] || {}; cur[inp.dataset.f] = inp.value.trim(); o[key] = cur; saveTipOverrides(o);
            if (!row.querySelector(".badge")) row.querySelector(".help-tiprow-k").insertAdjacentHTML("beforeend", ' <span class="badge blue">edited</span>');
            if (RBAC()) RBAC().audit("help.tips", "edited tooltip " + key); toast("Tooltip updated");
          }); });
        });
        var tsf = host.querySelector("#ttSearch"); if (tsf) tsf.addEventListener("input", function () { var q = tsf.value.toLowerCase(); host.querySelectorAll(".help-tiprow").forEach(function (r) { r.style.display = (r.dataset.key.toLowerCase().indexOf(q) >= 0 || r.textContent.toLowerCase().indexOf(q) >= 0) ? "" : "none"; }); });
        var tre = host.querySelector("#ttReset"); if (tre) tre.addEventListener("click", function () { if (!confirm("Reset ALL tooltip text to defaults? (Module on/off settings are kept.)")) return; saveTipOverrides({}); toast("Tooltip text reset to defaults"); render(); });
      }
      if (st.tab === "faqs") {
        host.querySelectorAll("[data-cat]").forEach(function (b) { b.addEventListener("click", function () { st.cat = b.dataset.cat; st.edit = null; render(); }); });
        var cs = cats(), cur = cs.find(function (c) { return c.id === st.cat; }) || cs[0];
        var add = host.querySelector("#faqAdd"); if (add) add.addEventListener("click", function () { st.edit = cur.id + ":new"; render(); });
        host.querySelectorAll("[data-edit]").forEach(function (b) { b.addEventListener("click", function () { st.edit = cur.id + ":" + b.dataset.edit; render(); }); });
        host.querySelectorAll("[data-cancel]").forEach(function (b) { b.addEventListener("click", function () { st.edit = null; render(); }); });
        host.querySelectorAll("[data-save]").forEach(function (b) { b.addEventListener("click", function () {
          var q = host.querySelector("#fq").value.trim(), ans = host.querySelector("#fa").value.trim(); if (!q || !ans) { toast("Enter a question and answer"); return; }
          var d = db(), c = d.cats.find(function (x) { return x.id === cur.id; });
          if (b.dataset.save === "new") c.faqs.push({ q: q, a: ans, published: true }); else { c.faqs[+b.dataset.save].q = q; c.faqs[+b.dataset.save].a = ans; }
          save(d); st.edit = null; toast("Saved"); render();
        }); });
        host.querySelectorAll("[data-pub]").forEach(function (b) { b.addEventListener("click", function () { var d = db(), c = d.cats.find(function (x) { return x.id === cur.id; }), f = c.faqs[+b.dataset.pub]; f.published = f.published === false; save(d); render(); }); });
        host.querySelectorAll("[data-del]").forEach(function (b) { b.addEventListener("click", function () { if (!confirm("Delete this question?")) return; var d = db(), c = d.cats.find(function (x) { return x.id === cur.id; }); c.faqs.splice(+b.dataset.del, 1); save(d); toast("Deleted"); render(); }); });
        host.querySelectorAll("[data-up]").forEach(function (b) { b.addEventListener("click", function () { moveFaq(cur.id, +b.dataset.up, -1); }); });
        host.querySelectorAll("[data-down]").forEach(function (b) { b.addEventListener("click", function () { moveFaq(cur.id, +b.dataset.down, 1); }); });
      }
      if (st.tab === "categories") {
        var addC = host.querySelector("#catAdd"); if (addC) addC.addEventListener("click", function () { var name = host.querySelector("#newCat").value.trim(); if (!name) return; var d = db(); var id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || ("cat-" + d.cats.length); d.cats.push({ id: id, icon: "info", title: name, faqs: [] }); save(d); toast("Category added"); render(); });
        host.querySelectorAll("[data-cup]").forEach(function (b) { b.addEventListener("click", function () { moveCat(+b.dataset.cup, -1); }); });
        host.querySelectorAll("[data-cdown]").forEach(function (b) { b.addEventListener("click", function () { moveCat(+b.dataset.cdown, 1); }); });
        host.querySelectorAll("[data-cren]").forEach(function (b) { b.addEventListener("click", function () { var d = db(), c = d.cats[+b.dataset.cren]; var name = prompt("Rename category", c.title); if (name && name.trim()) { c.title = name.trim(); save(d); render(); } }); });
        host.querySelectorAll("[data-cdel]").forEach(function (b) { b.addEventListener("click", function () { if (!confirm("Delete this category and its questions?")) return; var d = db(); d.cats.splice(+b.dataset.cdel, 1); save(d); toast("Category deleted"); render(); }); });
      }
      if (st.tab === "videos") {
        var addV = host.querySelector("#vidAdd"); if (addV) addV.addEventListener("click", function () { var t = host.querySelector("#newVid").value.trim(); if (!t) return; var d = db(); d.videos = d.videos || []; d.videos.push({ id: "v" + (d.videos.length + 1), title: t, url: "" }); save(d); render(); });
        host.querySelectorAll("[data-vurl]").forEach(function (inp) { inp.addEventListener("change", function () { var d = db(); d.videos[+inp.dataset.vurl].url = inp.value.trim(); save(d); toast("Video updated"); }); });
        host.querySelectorAll("[data-vdel]").forEach(function (b) { b.addEventListener("click", function () { var d = db(); d.videos.splice(+b.dataset.vdel, 1); save(d); render(); }); });
      }
      if (st.tab === "settings") {
        var il = host.querySelector("#illus"); if (il) il.addEventListener("change", function () { var d = db(); d.illustrations = il.checked; save(d); toast("Saved"); });
        var rs = host.querySelector("#resetHelp"); if (rs) rs.addEventListener("click", function () { if (!confirm("Reset all FAQs, categories and videos to defaults?")) return; save({ cats: clone(DEFAULT_CATS), videos: clone(DEFAULT_VIDEOS), illustrations: true }); toast("Knowledge base reset"); render(); });
      }
    }
    function moveFaq(catId, i, dir) { var d = db(), c = d.cats.find(function (x) { return x.id === catId; }); var j = i + dir; if (j < 0 || j >= c.faqs.length) return; var t = c.faqs[i]; c.faqs[i] = c.faqs[j]; c.faqs[j] = t; save(d); render(); }
    function moveCat(i, dir) { var d = db(); var j = i + dir; if (j < 0 || j >= d.cats.length) return; var t = d.cats[i]; d.cats[i] = d.cats[j]; d.cats[j] = t; save(d); render(); }

    render();
  }

  return {
    mount: mount, mountAdmin: mountAdmin, mountLauncher: mountLauncher,
    tip: tip, initTips: initTips, track: track, analytics: analytics,
    data: db, TIPS: TIPS, QUICK: QUICK,
  };
})();
