/* =============================================================
   DOODLY — Mock data for dashboards (customer / admin / driver)
   In production these are API/Prisma queries. Here they feed the
   block renderers so every page shows realistic, designed content.
   ============================================================= */
window.DOODLY_DATA = (function () {
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

  const data = {
    inr,

    /* ---- the signed-in customer (demo) ---- */
    me: {
      name: "Ananya Reddy", initials: "AR", phone: "+91 98480 11234",
      email: "ananya.r@example.com", area: "Jubilee Hills, Hyderabad",
      walletPaise: 48000, bottlesPending: 2, depositPaise: 12000,
      plan: "30-Day Morning Ritual", variant: "1000 ml Family Bottle",
      nextDelivery: "Tomorrow, 6:40 AM", subStatus: "Active", points: 1240,
    },

    /* ---- customer: orders ---- */
    orders: [
      { id: "DOO-10428", date: "26 Jun 2026", item: "1000 ml × 30 days", amount: 3588, status: ["green","Active"] },
      { id: "DOO-10391", date: "01 Jun 2026", item: "1000 ml × 30 days", amount: 3588, status: ["grey","Completed"] },
      { id: "DOO-10355", date: "02 May 2026", item: "500 ml × 30 days",  amount: 1932, status: ["grey","Completed"] },
      { id: "DOO-10318", date: "12 Apr 2026", item: "300 ml trial",      amount: 200,  status: ["grey","Completed"] },
      { id: "DOO-10288", date: "28 Mar 2026", item: "1000 ml × 7 days",  amount: 864,  status: ["red","Refunded"] },
    ],

    /* ---- customer: upcoming deliveries ---- */
    deliveries: [
      { id: "D-88142", date: "Tomorrow", time: "6:40 AM", item: "1000 ml", driver: "Ramesh K.", status: ["amber","Scheduled"] },
      { id: "D-88101", date: "Today",    time: "6:32 AM", item: "1000 ml", driver: "Ramesh K.", status: ["green","Delivered"] },
      { id: "D-88060", date: "Yesterday",time: "6:51 AM", item: "1000 ml", driver: "Ramesh K.", status: ["green","Delivered"] },
      { id: "D-88019", date: "25 Jun",   time: "6:38 AM", item: "1000 ml", driver: "Suresh M.", status: ["green","Delivered"] },
      { id: "D-87980", date: "24 Jun",   time: "—",       item: "1000 ml", driver: "—",          status: ["red","Skipped"] },
    ],

    /* ---- delivery tracking timeline ---- */
    trackTimeline: [
      { t: "Order accepted", s: "6:02 AM · System", state: "done" },
      { t: "Bottle packed", s: "6:11 AM · Hub, Jubilee Hills", state: "done" },
      { t: "Out for delivery", s: "6:25 AM · Ramesh K.", state: "done" },
      { t: "Arriving at your door", s: "ETA 6:40 AM", state: "active" },
      { t: "Delivered", s: "Awaiting OTP confirmation", state: "" },
    ],

    /* ---- bottle ledger ---- */
    bottleLedger: [
      { date: "26 Jun", type: ["green","Issued"], qty: "+1", note: "Delivery D-88101", bal: 2 },
      { date: "25 Jun", type: ["blue","Returned"], qty: "−1", note: "Collected by Ramesh K.", bal: 1 },
      { date: "25 Jun", type: ["green","Issued"], qty: "+1", note: "Delivery D-88019", bal: 2 },
      { date: "24 Jun", type: ["green","Issued"], qty: "+1", note: "Delivery D-87980", bal: 1 },
      { date: "12 Apr", type: ["amber","Deposit"], qty: "₹120", note: "Refundable deposit charged", bal: 0 },
    ],

    /* ---- wallet transactions ---- */
    wallet: [
      { date: "26 Jun", desc: "Referral reward — Karthik joined", amount: "+₹100", credit: true },
      { date: "20 Jun", desc: "Subscription payment DOO-10428", amount: "−₹3,588", credit: false },
      { date: "18 Jun", desc: "Bottle deposit refund (1)", amount: "+₹120", credit: true },
      { date: "01 Jun", desc: "Wallet top-up (UPI)", amount: "+₹1,000", credit: true },
    ],

    invoices: [
      { id: "INV-2026-0428", date: "26 Jun 2026", amount: 3588, gst: "incl. GST", status: ["green","Paid"] },
      { id: "INV-2026-0391", date: "01 Jun 2026", amount: 3588, gst: "incl. GST", status: ["green","Paid"] },
      { id: "INV-2026-0355", date: "02 May 2026", amount: 1932, gst: "incl. GST", status: ["green","Paid"] },
    ],

    addresses: [
      { label: "Home", line: "Plot 42, Road No. 12, Jubilee Hills, Hyderabad 500033", def: true },
      { label: "Office", line: "WeWork, Krishe Sapphire, Madhapur, Hyderabad 500081", def: false },
    ],

    notifications: [
      { ic: "truck", t: "Out for delivery", s: "Your 1000 ml bottle is on the way — ETA 6:40 AM", unread: true },
      { ic: "bottle", t: "Bottle reminder", s: "You have 2 empties pending collection", unread: true },
      { ic: "gift", t: "You earned ₹100", s: "Karthik joined using your referral code", unread: false },
      { ic: "shield", t: "Quality report ready", s: "June batch report is available to view", unread: false },
    ],

    referrals: [
      { name: "Karthik V.", date: "26 Jun", status: ["green","Joined"], reward: "₹100" },
      { name: "Meera S.", date: "18 Jun", status: ["green","Joined"], reward: "₹100" },
      { name: "Rahul T.", date: "10 Jun", status: ["amber","Invited"], reward: "—" },
    ],

    tickets: [
      { id: "TK-2041", subject: "Bottle not collected on 24 Jun", date: "25 Jun", status: ["amber","Open"] },
      { id: "TK-1990", subject: "Change delivery time to 7 AM", date: "12 Jun", status: ["green","Resolved"] },
    ],

    /* =====================  ADMIN  ===================== */
    adminKpis: [
      { n: "₹1.84L", l: "Today's revenue", delta: "+12.4%", up: true },
      { n: "1,284", l: "Active subscriptions", delta: "+38 this week", up: true },
      { n: "27", l: "New customers (today)", delta: "+6%", up: true },
      { n: "312", l: "Pending deliveries", delta: "tomorrow 6 AM", up: true },
      { n: "₹2.1L", l: "Month revenue", delta: "+18% MoM", up: true },
      { n: "1,940 L", l: "Milk procured (wk)", delta: "12 farms", up: true },
      { n: "418", l: "Bottles in field", delta: "−24 vs target", up: false },
      { n: "4.8★", l: "Avg delivery rating", delta: "+0.1", up: true },
    ],
    revenueBars: [
      { l: "Mon", v: 62 }, { l: "Tue", v: 70 }, { l: "Wed", v: 58 }, { l: "Thu", v: 81 },
      { l: "Fri", v: 92 }, { l: "Sat", v: 100 }, { l: "Sun", v: 76 },
    ],

    customers: [
      { id: "C-4821", name: "Ananya Reddy", initials: "AR", area: "Jubilee Hills", plan: "30-Day", since: "Apr 2026", status: ["green","Active"] },
      { id: "C-4820", name: "Karthik Varma", initials: "KV", area: "Gachibowli", plan: "90-Day", since: "Jun 2026", status: ["green","Active"] },
      { id: "C-4815", name: "Meera Sharma", initials: "MS", area: "Banjara Hills", plan: "30-Day", since: "Mar 2026", status: ["green","Active"] },
      { id: "C-4799", name: "Rahul Tej", initials: "RT", area: "Kondapur", plan: "7-Day", since: "Jun 2026", status: ["amber","Paused"] },
      { id: "C-4781", name: "Sneha Iyer", initials: "SI", area: "Madhapur", plan: "Trial", since: "Jun 2026", status: ["blue","Trial"] },
      { id: "C-4760", name: "Vikram Rao", initials: "VR", area: "Hitech City", plan: "30-Day", since: "Feb 2026", status: ["red","Churned"] },
    ],

    adminOrders: [
      { id: "DOO-10428", cust: "Ananya Reddy", item: "1000 ml × 30d", amount: 3588, pay: ["green","Paid"], status: ["green","Active"] },
      { id: "DOO-10427", cust: "Karthik Varma", item: "1000 ml × 90d", amount: 10530, pay: ["green","Paid"], status: ["green","Active"] },
      { id: "DOO-10426", cust: "Sneha Iyer", item: "300 ml trial", amount: 200, pay: ["amber","Pending"], status: ["amber","Processing"] },
      { id: "DOO-10425", cust: "Rahul Tej", item: "500 ml × 7d", amount: 466, pay: ["green","Paid"], status: ["grey","Paused"] },
      { id: "DOO-10424", cust: "Meera Sharma", item: "1000 ml × 30d", amount: 3588, pay: ["red","Failed"], status: ["red","On hold"] },
    ],

    drivers: [
      { id: "DRV-07", name: "Ramesh Kumar", initials: "RK", zone: "Jubilee Hills", stops: 42, done: 38, rating: "4.9", status: ["green","On route"] },
      { id: "DRV-04", name: "Suresh Mehta", initials: "SM", zone: "Gachibowli", stops: 51, done: 51, rating: "4.8", status: ["green","Completed"] },
      { id: "DRV-09", name: "Imran Shaikh", initials: "IS", zone: "Madhapur", stops: 36, done: 12, rating: "4.7", status: ["amber","On route"] },
      { id: "DRV-02", name: "Anil Gupta", initials: "AG", zone: "Banjara Hills", stops: 44, done: 0, rating: "4.9", status: ["grey","Idle"] },
    ],

    routes: [
      { id: "RT-JH-01", zone: "Jubilee Hills", driver: "Ramesh Kumar", stops: 42, litres: "58 L", status: ["green","Active"] },
      { id: "RT-GC-01", zone: "Gachibowli", driver: "Suresh Mehta", stops: 51, litres: "73 L", status: ["green","Active"] },
      { id: "RT-MD-01", zone: "Madhapur", driver: "Imran Shaikh", stops: 36, litres: "44 L", status: ["amber","Delayed"] },
      { id: "RT-BH-01", zone: "Banjara Hills", driver: "Anil Gupta", stops: 44, litres: "61 L", status: ["grey","Not started"] },
    ],

    farmers: [
      { id: "F-118", name: "Lakshmi Dairy Farm", owner: "G. Lakshmaiah", village: "Shamirpet", litres: "180 L/day", fat: "7.8%", status: ["green","Verified"] },
      { id: "F-104", name: "Sri Venkateshwara Farm", owner: "K. Naidu", village: "Shankarpally", litres: "210 L/day", fat: "8.1%", status: ["green","Verified"] },
      { id: "F-097", name: "Green Meadows", owner: "M. Reddy", village: "Chevella", litres: "150 L/day", fat: "7.5%", status: ["amber","Review"] },
      { id: "F-088", name: "Gokul Buffalo Farm", owner: "S. Yadav", village: "Moinabad", litres: "120 L/day", fat: "7.9%", status: ["green","Verified"] },
    ],

    procurement: [
      { date: "27 Jun", farm: "Lakshmi Dairy", litres: "180 L", fat: "7.8%", snf: "9.1", rate: "₹62/L", amount: 11160, qc: ["green","Pass"] },
      { date: "27 Jun", farm: "Sri Venkateshwara", litres: "210 L", fat: "8.1%", snf: "9.3", rate: "₹64/L", amount: 13440, qc: ["green","Pass"] },
      { date: "27 Jun", farm: "Green Meadows", litres: "150 L", fat: "7.5%", snf: "8.8", rate: "₹60/L", amount: 9000, qc: ["amber","Recheck"] },
      { date: "27 Jun", farm: "Gokul Buffalo", litres: "120 L", fat: "7.9%", snf: "9.0", rate: "₹62/L", amount: 7440, qc: ["green","Pass"] },
    ],

    quality: [
      { batch: "B-2026-0627", farm: "Lakshmi Dairy", fat: "7.8%", snf: "9.1", temp: "4.0°C", result: ["green","Passed"] },
      { batch: "B-2026-0626", farm: "Sri Venkateshwara", fat: "8.1%", snf: "9.3", temp: "3.8°C", result: ["green","Passed"] },
      { batch: "B-2026-0625", farm: "Green Meadows", fat: "7.4%", snf: "8.7", temp: "4.2°C", result: ["amber","Flagged"] },
    ],

    inventory: [
      { sku: "MILK-1000", item: "1000 ml Glass Bottle (filled)", stock: 640, reorder: 200, status: ["green","Healthy"] },
      { sku: "MILK-500", item: "500 ml Glass Bottle (filled)", stock: 410, reorder: 150, status: ["green","Healthy"] },
      { sku: "MILK-300", item: "300 ml Trial Bottle", stock: 95, reorder: 100, status: ["amber","Low"] },
      { sku: "BTL-EMPTY", item: "Empty bottles (sanitised)", stock: 1280, reorder: 400, status: ["green","Healthy"] },
      { sku: "CAP-FOIL", item: "Foil caps", stock: 80, reorder: 500, status: ["red","Reorder"] },
    ],

    bottleInv: [
      { n: "8,420", l: "Total bottles owned" },
      { n: "1,280", l: "In sanitised stock" },
      { n: "6,722", l: "In circulation" },
      { n: "418", l: "Pending return" },
      { n: "62", l: "Lost / damaged (mo)" },
      { n: "₹1.0L", l: "Deposits held" },
    ],

    payments: [
      { id: "pay_R8x2", cust: "Ananya Reddy", method: "UPI", amount: 3588, status: ["green","Captured"], date: "26 Jun" },
      { id: "pay_R8x1", cust: "Karthik Varma", method: "Card", amount: 10530, status: ["green","Captured"], date: "26 Jun" },
      { id: "pay_R8w9", cust: "Meera Sharma", method: "UPI", amount: 3588, status: ["red","Failed"], date: "26 Jun" },
      { id: "pay_R8w7", cust: "Rahul Tej", method: "Wallet", amount: 466, status: ["amber","Refunding"], date: "25 Jun" },
    ],

    coupons: [
      { code: "FRESH10", desc: "10% off first subscription", uses: "312 / 1000", status: ["green","Active"] },
      { code: "GLASS50", desc: "₹50 off bottle deposit", uses: "88 / 500", status: ["green","Active"] },
      { code: "DIWALI26", desc: "Festive 15% off 90-day plan", uses: "0 / 2000", status: ["grey","Scheduled"] },
      { code: "WELCOME", desc: "₹100 wallet credit", uses: "1204 / ∞", status: ["amber","Paused"] },
    ],

    adminTickets: [
      { id: "TK-2041", cust: "Ananya Reddy", subject: "Bottle not collected", pri: ["red","High"], status: ["amber","Open"] },
      { id: "TK-2038", cust: "Vikram Rao", subject: "Refund for skipped days", pri: ["amber","Med"], status: ["amber","Open"] },
      { id: "TK-2035", cust: "Sneha Iyer", subject: "Change delivery slot", pri: ["grey","Low"], status: ["green","Resolved"] },
    ],

    audit: [
      { who: "admin@doodly.in", act: "Set product 'Curd' → AVAILABLE", time: "10:42 AM", ip: "10.0.0.4" },
      { who: "ops@doodly.in", act: "Assigned RT-MD-01 to Imran Shaikh", time: "09:15 AM", ip: "10.0.0.9" },
      { who: "admin@doodly.in", act: "Created coupon DIWALI26", time: "Yesterday", ip: "10.0.0.4" },
      { who: "finance@doodly.in", act: "Exported GST report (May)", time: "Yesterday", ip: "10.0.0.7" },
    ],

    /* =====================  DRIVER  ===================== */
    driverKpis: [
      { n: "42", l: "Stops today" },
      { n: "38", l: "Delivered" },
      { n: "₹2,140", l: "Cash to collect" },
      { n: "31", l: "Bottles to pick up" },
    ],
    driverStops: [
      { seq: 1, cust: "Ananya Reddy", addr: "Plot 42, Road 12, Jubilee Hills", item: "1000 ml", pay: "Prepaid", status: ["green","Delivered"] },
      { seq: 2, cust: "Karthik Varma", addr: "Villa 7, Aparna Sarovar, Gachibowli", item: "1000 ml", pay: "Prepaid", status: ["green","Delivered"] },
      { seq: 3, cust: "Priya N.", addr: "Flat 304, My Home Avatar, Narsingi", item: "500 ml", pay: "₹70 COD", status: ["amber","Next stop"] },
      { seq: 4, cust: "Arjun S.", addr: "Plot 19, Film Nagar", item: "1000 ml", pay: "Prepaid", status: ["grey","Pending"] },
      { seq: 5, cust: "Divya R.", addr: "Road 36, Jubilee Hills", item: "500 ml", pay: "₹70 COD", status: ["grey","Pending"] },
    ],
    driverCompleted: [
      { date: "Today", stops: 38, cash: "₹1,540", bottles: 26, rating: "4.9" },
      { date: "Yesterday", stops: 44, cash: "₹2,030", bottles: 31, rating: "4.8" },
      { date: "25 Jun", stops: 41, cash: "₹1,820", bottles: 28, rating: "5.0" },
    ],

    /* ---- blog ---- */
    posts: [
      { emoji: "🥛", cat: "Nutrition", title: "Why A2 buffalo milk is easier to digest", excerpt: "The science behind A2 beta-casein and what it means for your gut.", meta: "5 min · 24 Jun 2026" },
      { emoji: "♻️", cat: "Sustainability", title: "The journey of a DOODLY glass bottle", excerpt: "From our hub to your door and back — sterilised and reused.", meta: "4 min · 18 Jun 2026" },
      { emoji: "🌾", cat: "Our farmers", title: "Meet the Lakshmaiah family farm", excerpt: "Three generations of buffalo farming on the edge of Shamirpet.", meta: "6 min · 11 Jun 2026" },
      { emoji: "❄️", cat: "Quality", title: "How rapid chilling locks in freshness", excerpt: "Why the first 30 minutes after milking matter most.", meta: "3 min · 04 Jun 2026" },
      { emoji: "🍮", cat: "Recipes", title: "Festive kova from fresh A2 milk", excerpt: "A slow-reduced sweet base for your Diwali mithai.", meta: "7 min · 28 May 2026" },
      { emoji: "📦", cat: "Product", title: "Building a subscription you can pause anytime", excerpt: "How vacation mode and emergency skip actually work.", meta: "4 min · 20 May 2026" },
    ],
  };

  /* PRODUCTION SAFETY — a REAL signed-in user (real cuid + token, NOT the localhost
     "static-" exploration persona) must never see demo records. Empty every demo
     record array at the source so any admin/staff/driver module that is un-wired,
     still loading, or offline shows an honest EMPTY state instead of fabricated
     rows. Structural bits (inr, blog posts) are kept; the demo persona keeps all. */
  try {
    const u = JSON.parse(localStorage.getItem("doodly-currentuser") || "null");
    const realUser = !!(u && u.id && !/^static-/.test(String(u.id)) && localStorage.getItem("doodly-token"));
    if (realUser) {
      ["orders", "deliveries", "trackTimeline", "bottleLedger", "wallet", "invoices", "addresses", "notifications", "referrals", "tickets",
        "customers", "adminOrders", "drivers", "routes", "farmers", "procurement", "quality", "inventory", "bottleInv", "payments", "coupons", "adminTickets", "audit",
        "driverStops", "driverCompleted", "adminKpis", "revenueBars", "driverKpis"].forEach((k) => { if (Array.isArray(data[k])) data[k] = []; });
    }
  } catch (e) { /* no localStorage → treat as demo persona */ }

  return data;
})();
