/* =============================================================
   DOODLY — Catalogue & Pricing Configuration  (the "CMS")
   -------------------------------------------------------------
   SINGLE SOURCE OF TRUTH for every product attribute on the site.
   The frontend is a pure presentation layer — it renders whatever
   is here; there are NO hardcoded product values in the render
   code. In the production build (see /docs + /next-app) these map
   1:1 to normalized Postgres tables, and the Admin CMS edits them
   via PATCH endpoints. In this static build, the Admin editor
   (admin-cms.js) mutates this object and persists overrides to
   localStorage via cms.js — same architecture, no redeploy.

   Launch a product: set  status: "coming_soon" -> "available".
   ============================================================= */

window.DOODLY = {
  brand: {
    name: "DOODLY",
    tagline: "Fresh Milk. Delivered Daily.",
    promise: "A2 Buffalo Milk · Glass Bottles · Delivered by 7 AM",
    phone: "+91 91177 99143",
    email: "doodlyoffl@gmail.com",
    city: "Vijayawada",
    currency: "₹",
    // ---- Single source of truth for business config (Admin-editable) ----
    // `whatsapp` is the display number; wa.me uses the digits-only form derived from it.
    support: { phone: "+91 91177 99143", whatsapp: "+91 94296 92738", email: "doodlyoffl@gmail.com", salesEmail: "doodlyoffl@gmail.com", hours: "Mon–Sat, 8 AM – 8 PM", days: [1,2,3,4,5,6], openHour: 8, closeHour: 20, emailSubject: "DOODLY Customer Support" },
    company: { legalName: "SUBADHAAM MILK DAIRY Pvt. Ltd.", gst: "", pan: "", cin: "", address: "Beside Sri Balaji Shirdi Hotel, Near Pandit Nehru Bus Stop, Bhramaramba Puram, Krishnalanka, Vijayawada, Andhra Pradesh 520013" },
    // Single source of truth for social links. Only non-empty URLs render (future
    // channels stay "" until their official accounts exist — no broken placeholders).
    social: { instagram: "https://www.instagram.com/doodlyoffl?igsh=MWVvZXk3a3JseXJqYw==", facebook: "https://www.facebook.com/share/18ioyH5qRY/?mibextid=wwXIfr", x: "", youtube: "", linkedin: "" },
    // Integration keys live server-side in production (.env); empty here on purpose.
    integrations: { googleMapsKey: "", razorpayKeyId: "", gaMeasurementId: "", metaPixelId: "", domain: "doodly.in" },
  },

  /* ---- Delivery scheduling settings (Admin-configurable) ----
     The 8 PM cut-off and everything below is read by schedule.js;
     admins override these from /admin/delivery-settings (persisted
     to localStorage doodly-delivery). Nothing is hardcoded in the UI. */
  delivery: {
    cutoffHour: 20, cutoffMinute: 0,            // 8:00 PM next-morning cut-off
    slotStart: "5:00 AM", slotEnd: "7:00 AM",   // delivery window — before-7-AM promise
    availableDays: [0, 1, 2, 3, 4, 5, 6],       // 0=Sun … 6=Sat
    weekendDelivery: true,                       // deliver on Sat/Sun
    holidays: [],                                // ISO dates, e.g. "2026-08-15"
    blackoutDates: [],                           // ISO dates (maintenance etc.)
    minAdvanceDays: 1,                           // earliest = today + this (then cut-off)
    maxAdvanceDays: 30,                          // furthest a start date can be booked
  },

  /* ---- Serviceable delivery areas (Admin-managed; NOT hardcoded in UI) ----
     Add a row here (or from /admin/serviceable-areas) and the storefront
     starts accepting that pincode immediately — no redeploy. */
  deliveryZones: [
    { id: "Z1", name: "Central Vijayawada", executive: "Ramesh K." },
    { id: "Z2", name: "East Vijayawada", executive: "Suresh B." },
    { id: "Z3", name: "Tadepalli", executive: "Anil P." },
  ],
  serviceablePincodes: [
    { pincode: "520013", area: "Krishnalanka", city: "Vijayawada", state: "Andhra Pradesh", zone: "Z1", charge: 0, slot: "Before 7 AM", eta: "", enabled: true },
    { pincode: "520001", area: "One Town", city: "Vijayawada", state: "Andhra Pradesh", zone: "Z1", charge: 0, slot: "Before 7 AM", eta: "", enabled: true },
    { pincode: "520002", area: "Governorpet", city: "Vijayawada", state: "Andhra Pradesh", zone: "Z1", charge: 0, slot: "Before 7 AM", eta: "", enabled: true },
    { pincode: "520003", area: "Gandhi Nagar", city: "Vijayawada", state: "Andhra Pradesh", zone: "Z1", charge: 0, slot: "Before 7 AM", eta: "", enabled: true },
    { pincode: "520012", area: "Bhavanipuram / Vidyadharapuram", city: "Vijayawada", state: "Andhra Pradesh", zone: "Z1", charge: 0, slot: "Before 7 AM", eta: "", enabled: true },
    { pincode: "520011", area: "Kaleswara Rao Market Area", city: "Vijayawada", state: "Andhra Pradesh", zone: "Z1", charge: 0, slot: "Before 7 AM", eta: "", enabled: true },
    { pincode: "520004", area: "Gunadala", city: "Vijayawada", state: "Andhra Pradesh", zone: "Z2", charge: 0, slot: "Before 7 AM", eta: "", enabled: true },
    { pincode: "520007", area: "Kanuru / Yanamalakuduru / Auto Nagar", city: "Vijayawada", state: "Andhra Pradesh", zone: "Z2", charge: 0, slot: "6:30–8:30 AM", eta: "By 8:30 AM", enabled: true },
    { pincode: "520008", area: "Ramavarappadu", city: "Vijayawada", state: "Andhra Pradesh", zone: "Z2", charge: 0, slot: "6:30–8:30 AM", eta: "By 8:30 AM", enabled: true },
    { pincode: "520010", area: "Benz Circle / Patamata / Labbipet", city: "Vijayawada", state: "Andhra Pradesh", zone: "Z2", charge: 0, slot: "Before 7 AM", eta: "", enabled: true },
    { pincode: "520015", area: "Ajit Singh Nagar / Payakapuram", city: "Vijayawada", state: "Andhra Pradesh", zone: "Z2", charge: 0, slot: "6:30–8:30 AM", eta: "By 8:30 AM", enabled: true },
    { pincode: "522501", area: "Tadepalli", city: "Tadepalli", state: "Andhra Pradesh", zone: "Z3", charge: 10, slot: "6:30–8:30 AM", eta: "By 8:30 AM", enabled: true },
  ],

  /* ---- Auto-pay (recurring) settings (Admin-configurable) ---- */
  autopay: {
    reminderDays: 5, retryLimit: 3, retryGapHours: 24,
    methods: ["UPI AutoPay", "Credit Card", "Debit Card", "Net Banking"],
  },

  /* ---- Milk size variants (per-product; milk is the live SKU) ----
     The Subscription Builder reads dailyPrice/fixedPrice from here. */
  variants: [
    { id: "v300",  productId: "milk", label: "300 ml",  displayName: "300 ml Trial Pack", sub: "Sample Pack",
      ml: 300,  type: "trial",        fixedPrice: 200, fixedDays: 3, sku: "MILK-300-TRIAL", stock: 95,  lowStockThreshold: 20, restockDate: null, weight: "300 g",  active: true,
      note: "Taste DOODLY for 3 mornings before you commit.", bestFor: "First-timers" },
    { id: "v500",  productId: "milk", label: "500 ml",  displayName: "500 ml Daily Bottle", sub: "Daily Bottle",
      ml: 500,  type: "subscription", dailyPrice: 70,  sku: "MILK-500", stock: 410, lowStockThreshold: 25, restockDate: null, weight: "500 g",  active: true,
      note: "Just right for a small household or a daily chai ritual.", bestFor: "1–2 people" },
    { id: "v1000", productId: "milk", label: "1000 ml", displayName: "1000 ml Family Bottle", sub: "Family Bottle",
      ml: 1000, type: "subscription", dailyPrice: 130, sku: "MILK-1000", stock: 640, lowStockThreshold: 30, restockDate: null, weight: "1000 g", active: true,
      note: "Enough milk for a full family — and the kids' badam milk.", bestFor: "3–5 people", featured: true },
  ],

  /* ---- Subscription plans (editable from Admin) ---------- */
  plans: [
    { id: "single", name: "Single Pour",          days: 1,  discount: 0,    blurb: "One delivery, tomorrow morning. No commitment.",
      tag: null,            autoRenew: false, active: true, description: "A one-off delivery. No commitment, cancel anytime." },
    { id: "p7",     name: "7-Day Fresh Start",     days: 7,  discount: 0.05, blurb: "A week of fresh mornings to build the habit.",
      tag: null,            autoRenew: true,  active: true, description: "Seven mornings of fresh milk at 5% off." },
    { id: "p30",    name: "30-Day Morning Ritual", days: 30, discount: 0.08, blurb: "The everyday plan most families settle into.",
      tag: "Most popular",  autoRenew: true,  active: true, description: "The everyday plan — 8% off, auto-renews monthly." },
    { id: "p90",    name: "90-Day Nourish Plan",   days: 90, discount: 0.10, blurb: "Lock in the best price and forget about it.",
      tag: "Best value",    autoRenew: true,  active: true, description: "Best price, locked in for 90 days at 10% off." },
  ],

  /* ---- Product catalogue --------------------------------- */
  products: [
    {
      id: "milk", slug: "milk", name: "A2 Buffalo Milk", status: "available",
      lowStockThreshold: 60, restockDate: null, visible: true,
      category: "Milk", order: 1, emoji: "🥛",
      desc: "Single-source, chilled within minutes, bottled in glass.",
      from: "from ₹70 / day",
      rating: { value: 4.9, count: 312 },

      image: "/assets/img/products/milk-bottle.png",
      gallery: [
        "/assets/img/products/milk-bottle.png",
        "/assets/img/products/milk-lifestyle.jpg",
        "/assets/img/products/milk-splash.jpg",
        "/assets/img/products/farm-story.jpg",
      ],

      // PRICING (₹) — nothing hardcoded in the UI
      pricing: { mrp: 80, selling: 70, cost: 48, offer: 70, discountPct: 12, taxPct: 0,
                 deposit: 120, deliveryCharge: 0, freeDeliveryThreshold: 0 },

      // DESCRIPTION (rich)
      description: {
        short: "Single-source, chilled within minutes, bottled in glass.",
        long: "Pure A2 buffalo milk from a small circle of family-run farms we know by name. Collected at dawn, snap-chilled to 4°C within minutes, tested for fat, SNF and purity, then bottled in sterilised returnable glass the same morning — at your door before breakfast.",
        story: "DOODLY began with one frustration: honest, fresh milk had become impossible to find in the city. So we went back to the source — a handful of trusted buffalo farms on the edge of Hyderabad, no middlemen, no pooling.",
        benefits: ["Naturally A2 — easier on most stomachs", "Richer in fat & protein for creamier chai", "No preservatives, no dilution, ever", "Returnable glass keeps it colder and cleaner"],
        usage: "Shake gently before use. Lovely in chai, coffee, badam milk, curd and paneer.",
        storage: "Keep refrigerated at 4°C. Best consumed within 2 days of delivery.",
        ingredients: "100% A2 buffalo milk. Nothing added.",
        allergens: "Contains milk.",
      },

      // NUTRITION (per 100 ml)
      nutrition: { fat: "7.5g", snf: "9.1", protein: "3.8g", calcium: "210mg", energy: "97 kcal",
                   carbs: "5.0g", sugar: "5.0g", minerals: "0.7g", vitamins: "A, D, B12" },

      // QUALITY parameters (latest batch)
      quality: { fat: "7.5%", snf: "9.1", lactometer: "28.5", collectionTemp: "4°C", storageTemp: "4°C",
                 batch: "B-2026-0627", milkType: "A2", animalType: "Buffalo (desi)",
                 collectionDate: "Today, 4:30 AM", expiry: "Today + 2 days" },

      // BADGES (toggled in Admin) — [label, icon]
      badges: [
        { label: "Fresh A2 Buffalo Milk", icon: "drop",   on: true },
        { label: "Glass Bottle",          icon: "bottle", on: true },
        { label: "No Preservatives",      icon: "shield", on: true },
        { label: "Farm Fresh",            icon: "leaf",   on: true },
        { label: "Delivered Fresh",       icon: "truck",  on: true },
      ],

      // AVAILABILITY
      availability: { cities: ["Hyderabad"], slots: ["Before 7:00 AM"],
                      launchDate: "2026-04-01", endDate: null, inventoryStatus: "In stock" },

      // SEO
      seo: { metaTitle: "DOODLY A2 Buffalo Milk — Fresh, in Glass, Delivered Daily",
             metaDescription: "Pure A2 buffalo milk, chilled within minutes and delivered in returnable glass bottles by 7 AM. Try the ₹200 sample pack.",
             ogImage: "/assets/img/products/milk-splash.jpg", canonical: "/products/milk.html",
             keywords: ["a2 milk", "buffalo milk", "glass bottle milk", "fresh milk hyderabad", "milk subscription"] },

      // ANALYTICS (read-only KPIs in Admin)
      analytics: { orders: 1284, revenue: "₹38.4L", views: 9420, conversion: "4.8%", stock: 640, rating: 4.9 },
    },

    { id: "curd",   slug: "curd",   name: "Buffalo Pot Curd", status: "coming_soon", launchDate: "2026-08-01", visible: true, category: "Dairy", order: 2, emoji: "🍶",
      desc: "Set thick from the same A2 milk. Cultured overnight.", from: "Launching soon" },
    { id: "paneer", slug: "paneer", name: "Malai Paneer", status: "coming_soon", launchDate: "2026-08-15", visible: true, category: "Dairy", order: 3, emoji: "🧀",
      desc: "Soft, fresh-pressed paneer. Nothing added.", from: "Launching soon" },
    { id: "kova",   slug: "kova",   name: "Palkova", status: "coming_soon", launchDate: "2026-09-01", visible: true, category: "Sweets", order: 4, emoji: "🍮",
      desc: "Slow-reduced milk khoa for festive sweets.", from: "Launching soon" },
    { id: "ghee",   slug: "ghee",   name: "Buffalo Ghee", status: "coming_soon", launchDate: "2026-09-15", visible: true, category: "Dairy", order: 5, emoji: "🫙",
      desc: "Bilona-method ghee, golden and aromatic.", from: "Launching soon" },
  ],

  /* ---- Static marketing content -------------------------- */
  why: [
    { icon: "leaf",     title: "Fresh from local farms",  text: "Single-source A2 buffalo milk from farmers we know by name." },
    { icon: "clock",    title: "Collected daily",         text: "Milked at dawn, never stored overnight, never pooled." },
    { icon: "snow",     title: "Instant chilling",        text: "Cooled to 4°C within minutes of milking to lock in freshness." },
    { icon: "bottle",   title: "Glass bottles",           text: "No plastic taint. Sterilised, sealed, and returnable." },
    { icon: "shield",   title: "No preservatives",        text: "No chemicals, no additives, no shelf-life games." },
    { icon: "drop",     title: "A2 protein",              text: "Naturally A2 buffalo milk — easier on most stomachs." },
  ],

  steps: [
    { n: "01", title: "Farmer collection", text: "Milk is collected fresh at the farm each morning." },
    { n: "02", title: "Quality testing",   text: "Fat, SNF and lactometer checks on every batch." },
    { n: "03", title: "Rapid chilling",    text: "Snap-cooled to 4°C to halt bacterial growth." },
    { n: "04", title: "Glass bottling",    text: "Filled and sealed in sterilised glass bottles." },
    { n: "05", title: "Delivery",          text: "At your door, chilled, before you wake up." },
  ],

  testimonials: [
    { name: "Ananya R.",  area: "Jubilee Hills",  text: "It tastes like the milk I grew up with at my grandmother's village. The glass bottle is a lovely touch.", stars: 5 },
    { name: "Karthik V.", area: "Gachibowli",     text: "Switched my whole family over. The 1000ml family bottle lands before 7 every single day.", stars: 5 },
    { name: "Meera S.",   area: "Banjara Hills",  text: "Started with the ₹200 sample pack, never looked back. You can taste that there's nothing added.", stars: 5 },
  ],

  faqs: [
    { q: "What makes A2 buffalo milk different?", a: "DOODLY milk comes from buffalo breeds whose milk is naturally A2 — many people find it easier to digest than ordinary mixed-herd milk. It's also richer in fat and protein." },
    { q: "How fresh is the milk, really?", a: "It's milked at dawn, chilled to 4°C within minutes, bottled the same morning, and delivered to you before breakfast — usually within hours of leaving the farm." },
    { q: "Why glass bottles?", a: "Glass doesn't leach anything into your milk and keeps it colder for longer. We collect the empties on your next delivery, sterilise them, and reuse them — better for you and the planet." },
    { q: "How does the bottle deposit work?", a: "A small refundable deposit is added per bottle on your first order. Return your empties and the deposit stays in your wallet. Your dashboard tracks every bottle issued and returned." },
    { q: "Can I pause or skip deliveries?", a: "Anytime, from your dashboard. Pause for a trip with Vacation Mode, skip tomorrow with one tap, or add an extra bottle when guests are over." },
    { q: "What if I'm not home?", a: "Our delivery executive leaves your chilled bottle at your door and marks proof of delivery. You can also set a delivery OTP for contactless handover." },
  ],
};
