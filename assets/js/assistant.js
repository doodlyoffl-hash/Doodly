/* =============================================================
   DOODLY — AI Customer Support Assistant (DOODLY_ASSISTANT)
   "Doodly Assistant" — a premium, knowledge-base-driven support
   chatbot. Floating FAB + chat window on public + customer pages.
   Answers products / subscriptions / orders / referral / wallet /
   bulk / delivery / payments / company questions, navigates the
   site, surfaces the logged-in customer's own data (auth-gated),
   and escalates to a human (WhatsApp / call / callback / support).

   Answers come from a centralized KB + intent engine FIRST; an
   AI-provider adapter (OpenAI / Anthropic / Gemini / Azure) is
   abstracted behind DOODLY_ASSISTANT.ai and only used as a fallback
   when configured via a server proxy — NO API keys live client-side.
   Chat history + conversations persist in localStorage. Admin chat
   management mounts into #chatSupportMount.
   ============================================================= */
window.DOODLY_ASSISTANT = (function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var D = function () { return window.DOODLY || {}; };
  var RBAC = function () { return window.DOODLY_RBAC; };
  var toast = function (m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); };
  var inr = function (n) { return "₹" + (Math.round(Number(n) || 0)).toLocaleString("en-IN"); };
  var norm = function (s) { return String(s || "").toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim(); };
  function get(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- brand / support ---------- */
  function brand() { return D().brand || {}; }
  function support() { var b = brand(); return b.support || { phone: "+91 91177 99143", whatsapp: "+91 94296 92738", email: "doodlyoffl@gmail.com", hours: "Mon–Sat, 8 AM – 8 PM" }; }
  function waNum() { return String(support().whatsapp || support().phone || "").replace(/\D/g, ""); }

  /* ---------- auth context (never expose other users' data) ---------- */
  function loggedIn() { try { return (RBAC() && RBAC().activeRole() === "customer") || /^\/account\//.test(location.pathname); } catch (e) { return /^\/account\//.test(location.pathname); } }
  function meName() { try { var u = RBAC() && RBAC().currentUser(); return (u && u.name) || "there"; } catch (e) { return "there"; } }

  /* ---------- live customer data (own data only) ---------- */
  function walletBalance() { try { return window.DOODLY_WALLET ? DOODLY_WALLET.balance() : null; } catch (e) { return null; } }
  function referralCode() { try { return window.DOODLY_REFERRAL ? DOODLY_REFERRAL.myCode() : null; } catch (e) { return null; } }
  function subName() { try { var s = get("doodly-subscription", null); if (s && s.planId) return planName(s.planId); } catch (e) {} return "30-Day Morning Ritual"; }
  function subPaused() { try { return localStorage.getItem("doodly-sub-paused") === "1"; } catch (e) { return false; } }
  function planName(id) { var p = (D().plans || []).find(function (x) { return x.id === id; }); return p ? p.name : id; }
  function plans() { return D().plans || []; }
  function products() { return D().products || []; }
  function product(slug) { return products().find(function (p) { return p.slug === slug || p.id === slug; }); }

  /* =============================================================
     KNOWLEDGE BASE — answered before any AI model
     ============================================================= */
  function priceLine() {
    var p = plans(); if (!p.length) return "We offer Single, 7-day, 30-day and 90-day milk plans.";
    return p.map(function (x) { return x.name + (x.discount ? " (" + Math.round(x.discount * 100) + "% off)" : ""); }).join(" · ");
  }
  function productBlurb(slug) { var p = product(slug); return p ? (p.name + " — " + (p.desc || p.blurb || "fresh, single-source and bottled in glass.")) : null; }

  var NAV = {
    subscribe: "/subscriptions.html", products: "/products.html", wallet: "/account/wallet.html", invoices: "/account/invoices.html",
    orders: "/account/orders.html", referrals: "/account/referrals.html", rewards: "/account/rewards.html", tracking: "/account/tracking.html",
    deliveries: "/account/deliveries.html", support: "/account/support.html", bottles: "/bottle-return.html", contact: "/contact.html",
    faq: "/faq.html", help: "/help.html", profile: "/account/profile.html", settings: "/account/settings.html", subscription: "/account/subscription.html",
    vacation: "/account/vacation.html", about: "/about.html", farmers: "/farmers.html", quality: "/dairy.html", dashboard: "/account/dashboard.html",
    privacy: "/privacy.html"
  };
  function A(label, to) { return { label: label, to: to }; }
  var ACT_LOGIN = A("Log in", { nav: "/login.html" });

  /* intent registry — each: { id, kws, fn(ctx) -> {text, actions, escalate} } */
  var INTENTS = [
    { id: "greeting", kws: ["hi", "hello", "hey", "namaste", "good morning", "good evening", "hii"], fn: function () { return { text: "Hi " + meName() + "! 👋 I'm the Doodly Assistant. I can help with subscriptions, deliveries, products, referrals, bulk orders, invoices, payments and more. What would you like to do?", suggest: true }; } },
    { id: "thanks", kws: ["thanks", "thank you", "thankyou", "great", "awesome", "ok thanks"], fn: function () { return { text: "You're welcome! 🥛 Anything else I can help with?" }; } },

    /* ---- bulk (checked before products so "milk for a wedding" → bulk) ---- */
    { id: "bulk", kws: ["bulk", "wedding", "function", "event", "catering", "hotel", "restaurant", "large order", "wholesale", "b2b", "bulk order", "marriage", "party"], fn: function () { return { text: "For weddings, functions, catering, hotels and restaurants we offer bulk milk & dairy at negotiated rates with dedicated delivery. Our sales team will set you up.", actions: [A("Talk to sales", { wa: waNum() }), A("Contact us", { nav: NAV.contact })] }; } },

    /* ---- products ---- */
    { id: "prod.milk", kws: ["a2 milk", "buffalo milk", "milk", "a2"], fn: function () { return { text: (productBlurb("milk") || "Fresh A2 buffalo milk, chilled within minutes and bottled in glass — delivered before 7 AM.") + " Plans start from ₹70/day.", actions: [A("View milk", { nav: "/products/milk.html" }), A("Start subscription", { nav: NAV.subscribe })] }; } },
    { id: "prod.paneer", kws: ["paneer"], fn: function () { return { text: (productBlurb("paneer") || "Malai Paneer — soft, fresh paneer made from our A2 milk."), actions: [A("View paneer", { nav: "/products/paneer.html" })] }; } },
    { id: "prod.ghee", kws: ["ghee"], fn: function () { return { text: (productBlurb("ghee") || "Buffalo Ghee — slow-cooked, aromatic, pure."), actions: [A("View ghee", { nav: "/products/ghee.html" })] }; } },
    { id: "prod.curd", kws: ["curd", "dahi", "yogurt", "pot curd"], fn: function () { return { text: (productBlurb("curd") || "Buffalo Pot Curd — thick, set fresh daily."), actions: [A("View curd", { nav: "/products/curd.html" })] }; } },
    { id: "prod.kova", kws: ["kova", "palkova", "khoa"], fn: function () { return { text: (productBlurb("kova") || "Palkova — slow-reduced milk sweet, perfect for festivals."), actions: [A("View Palkova", { nav: "/products/kova.html" })] }; } },
    { id: "prod.all", kws: ["products", "catalogue", "what do you sell", "items", "menu"], fn: function () { return { text: "We deliver A2 Buffalo Milk, Buffalo Pot Curd, Malai Paneer, Buffalo Ghee and Palkova — all single-source and chilled fresh.", actions: [A("Browse products", { nav: NAV.products })] }; } },

    /* ---- subscription ---- */
    { id: "sub.plans", kws: ["plan", "plans", "pricing", "price", "subscribe", "subscription cost", "how much"], fn: function () { return { text: "Our subscription plans: " + priceLine() + ". Longer plans unlock bigger savings and auto-renew (cancel anytime).", actions: [A("Start a subscription", { nav: NAV.subscribe }), A("Compare plans", { nav: NAV.products })] }; } },
    { id: "sub.pause", kws: ["pause", "vacation", "going away", "stop delivery", "hold subscription", "pause subscription"], fn: function () { return { text: "You can pause anytime from Vacation Mode — paused days are never charged and your plan simply extends. Resume in one tap.", actions: [A("Pause / Vacation", { nav: NAV.vacation }), A("Manage subscription", { nav: NAV.subscription })] }; } },
    { id: "sub.resume", kws: ["resume", "reactivate", "restart subscription", "unpause"], fn: function () { return { text: "To resume, open your subscription and tap Resume — deliveries restart from the next morning.", actions: [A("Resume now", { nav: NAV.subscription })] }; } },
    { id: "sub.renew", kws: ["renew", "renewal", "auto pay", "autopay", "auto-renew"], fn: function () { return { text: "Subscriptions auto-renew on the end date using your saved payment method (Auto-Pay). You'll get a reminder before each renewal and can disable Auto-Pay anytime.", actions: [A("Manage subscription", { nav: NAV.subscription })] }; } },
    { id: "sub.schedule", kws: ["schedule", "delivery time", "delivery schedule", "when delivered", "morning", "skip", "skip delivery"], fn: function () { return { text: "Deliveries arrive every morning before 7:00 AM. You can change your start date, skip a day or adjust your plan from your subscription page.", actions: [A("Delivery schedule", { nav: NAV.subscription }), A("Track today's delivery", { nav: NAV.tracking })] }; } },

    /* ---- orders / deliveries (customer data, auth-gated) ---- */
    { id: "orders.status", kws: ["order status", "my order", "where is my order", "upcoming delivery", "next delivery", "my deliveries", "previous orders", "order history"], fn: function () {
        if (!loggedIn()) return { text: "Log in to see your orders and upcoming deliveries — I'll never show anyone else's information.", actions: [ACT_LOGIN] };
        return { text: meName() + ", your milk is on its way for tomorrow morning (before 7 AM). You can follow it live or see your full order history.", actions: [A("Track live", { nav: NAV.tracking }), A("My orders", { nav: NAV.orders })] };
      } },
    { id: "delivery.areas", kws: ["delivery area", "do you deliver", "serviceable", "pincode", "my area", "available in"], fn: function () { return { text: "We currently deliver across Vijayawada and nearby areas. Enter your pincode at checkout to confirm serviceability.", actions: [A("Check my area", { nav: NAV.contact })] }; } },
    { id: "delivery.bottles", kws: ["bottle return", "empty bottle", "return bottle", "glass bottle", "deposit", "collection"], fn: function () { return { text: "We collect empty glass bottles on your next delivery — your refundable deposit is returned when bottles come back. Request a collection anytime.", actions: [A("Bottle return", { nav: NAV.bottles })] }; } },

    /* ---- referral / wallet (customer data) ---- */
    { id: "referral", kws: ["referral", "refer", "refer a friend", "referral code", "invite", "reward", "refer and earn"], fn: function () {
        var code = loggedIn() ? referralCode() : null;
        var t = "Invite friends with your referral code — you earn ₹100 wallet credit when an eligible friend joins and completes a qualifying subscription.";
        if (loggedIn() && code) t = "Your referral code is " + code + ". Share it — you'll earn ₹100 wallet credit when an eligible friend subscribes. " + t.replace(/^Invite[^—]*— /, "");
        return { text: t, actions: loggedIn() ? [A("My referrals", { nav: NAV.referrals }), A("Copy code", { act: "copyref" })] : [A("Referral program", { nav: NAV.referrals }), ACT_LOGIN] };
      } },
    { id: "wallet", kws: ["wallet", "balance", "wallet balance", "credits", "cashback", "transactions"], fn: function () {
        if (!loggedIn()) return { text: "Your Doodly Wallet holds cashback, referral rewards and promo credit you can use on future orders. Log in to view your balance.", actions: [ACT_LOGIN] };
        var b = walletBalance();
        return { text: (b != null ? "Your wallet balance is " + inr(b) + ". " : "") + "You can use wallet credit toward any subscription or order.", actions: [A("Open wallet", { nav: NAV.wallet })] };
      } },

    /* ---- payments / invoices / GST ---- */
    { id: "pay.methods", kws: ["payment method", "how to pay", "upi", "card", "netbanking", "pay"], fn: function () { return { text: "We accept UPI, cards, net-banking and wallet credit. Subscriptions can auto-pay securely on renewal.", actions: [A("Manage payment", { nav: NAV.subscription })] }; } },
    { id: "pay.failed", kws: ["payment failed", "failed payment", "payment not working", "retry payment", "declined"], fn: function () { return { text: "If a payment failed, no money is deducted — you can retry from your subscription/billing page. If an amount was debited it's auto-refunded in 3–5 days.", actions: [A("Retry payment", { nav: NAV.subscription }), A("Contact support", { act: "handover" })] }; } },
    { id: "pay.invoices", kws: ["invoice", "invoices", "bill", "receipt", "gst", "tax"], fn: function () {
        return { text: loggedIn() ? "All your GST invoices are in one place — download any as PDF, Excel or CSV. GST is applied per product's applicable rate (milk is GST-nil)." : "Every order generates a GST invoice you can download as PDF. Open the invoices page to view yours.", actions: [A("My invoices", { nav: NAV.invoices })].concat(loggedIn() ? [] : [ACT_LOGIN]) };
      } },

    /* ---- company ---- */
    { id: "co.about", kws: ["about", "about doodly", "who are you", "company", "what is doodly"], fn: function () { return { text: "Doodly delivers fresh, single-source A2 buffalo milk and dairy in reusable glass bottles — chilled within minutes of milking and at your door before 7 AM.", actions: [A("About us", { nav: NAV.about }), A("Our story", { nav: "/doodly.html" })] }; } },
    { id: "co.farmers", kws: ["farmer", "farmers", "farm", "source", "where milk from"], fn: function () { return { text: "We work directly with verified partner farms and pay fair rates — every batch is traceable to its farm and lab-tested before dispatch.", actions: [A("Meet our farmers", { nav: NAV.farmers })] }; } },
    { id: "co.quality", kws: ["quality", "test", "testing", "fat", "snf", "adulteration", "pure", "preservative", "antibiotic"], fn: function () { return { text: "Zero preservatives, no adulterants, no added hormones. Every batch is lab-tested for fat, SNF and purity, kept in an unbroken cold chain.", actions: [A("Quality & dairy", { nav: NAV.quality })] }; } },
    { id: "co.contact", kws: ["contact", "phone", "email", "reach you", "customer care", "helpline"], fn: function () { var s = support(); return { text: "You can reach us at " + s.phone + " or " + s.email + " (" + s.hours + ").", actions: [A("WhatsApp us", { wa: waNum() }), A("Call now", { tel: s.phone }), A("Contact page", { nav: NAV.contact })] }; } },

    /* ---- policies ---- */
    { id: "pol.refund", kws: ["refund", "money back", "cancel order", "cancellation"], fn: function () { return { text: "Not happy with a delivery? Report it the same day and we'll refund or replace it. Paused/skipped days are never charged. Subscriptions can be cancelled anytime.", actions: [A("Contact support", { act: "handover" })] }; } },
    { id: "pol.privacy", kws: ["privacy", "data", "personal information", "terms", "conditions"], fn: function () { return { text: "We protect your data and never sell it. See our privacy policy for details.", actions: [A("Privacy policy", { nav: NAV.privacy })] }; } },

    /* ---- navigation ---- */
    { id: "nav.generic", kws: ["open", "go to", "take me to", "where is", "navigate", "show me the", "page"], fn: function (ctx) {
        var q = ctx.q; var map = [["subscrib", NAV.subscribe, "Subscriptions"], ["wallet", NAV.wallet, "Wallet"], ["invoice", NAV.invoices, "Invoices"], ["order", NAV.orders, "Orders"], ["referr", NAV.referrals, "Referrals"], ["reward", NAV.rewards, "Rewards"], ["track", NAV.tracking, "Tracking"], ["deliver", NAV.deliveries, "Deliveries"], ["bottle", NAV.bottles, "Bottle return"], ["product", NAV.products, "Products"], ["profile", NAV.profile, "Profile"], ["setting", NAV.settings, "Settings"], ["support", NAV.support, "Support"], ["faq", NAV.faq, "FAQ"], ["help", NAV.help, "Help Center"], ["contact", NAV.contact, "Contact"], ["about", NAV.about, "About"], ["farmer", NAV.farmers, "Farmers"]];
        var hit = map.find(function (m) { return q.indexOf(m[0]) >= 0; });
        if (hit) return { text: "Sure — opening " + hit[2] + " for you.", actions: [A("Open " + hit[2], { nav: hit[1] })] };
        return null; // let fallback handle
      } },

    /* ---- human handover ---- */
    { id: "human", kws: ["human", "agent", "representative", "talk to someone", "real person", "executive", "speak to", "call me", "callback", "complaint", "escalate"], fn: function () { return { text: "Of course — I'll connect you with our support team. Choose how you'd like to reach us:", actions: handoverActions(), escalate: "user requested human" }; } }
  ];

  function handoverActions() { var s = support(); return [A("Chat on WhatsApp", { wa: waNum() }), A("Call support", { tel: s.phone }), A("Request a callback", { act: "callback" }), A("Open support", { nav: NAV.support })]; }

  /* ---------- intent matching + AI fallback ---------- */
  function match(q) {
    var nq = " " + norm(q) + " ";
    var best = null, bestScore = 0;
    INTENTS.forEach(function (it) {
      var score = 0;
      it.kws.forEach(function (k) { var kk = norm(k); if (!kk) return; if (nq.indexOf(" " + kk + " ") >= 0) score += (kk.indexOf(" ") >= 0 ? 3 : 2); else if (nq.indexOf(kk) >= 0) score += 1; });
      if (score > bestScore) { bestScore = score; best = it; }
    });
    return { intent: best, score: bestScore };
  }
  function respond(q) {
    var m = match(q);
    if (m.intent && m.score >= 2) {
      var r = m.intent.fn({ q: norm(q) });
      if (r) return Object.assign({ intent: m.intent.id, confidence: Math.min(1, m.score / 5) }, r);
    }
    // weak match → try generic nav, else AI (if configured), else fallback to handover
    if (m.intent && m.score >= 1) { var r2 = m.intent.fn({ q: norm(q) }); if (r2) return Object.assign({ intent: m.intent.id, confidence: 0.4 }, r2); }
    if (ai.configured()) { return { intent: "ai", confidence: 0.5, pending: true, ask: q }; }
    return { intent: "fallback", confidence: 0.1, escalate: "low confidence: " + q, text: "I'm not fully sure about that one — but I don't want to guess. You can rephrase, browse our Help Center, or talk to a human and I'll bring our team in.", actions: [A("Help Center", { nav: NAV.help })].concat(handoverActions()) };
  }

  /* =============================================================
     AI PROVIDER ABSTRACTION (OpenAI / Anthropic / Gemini / Azure)
     Keys NEVER live client-side — a configured server proxy at
     /api/ai handles auth via environment variables. Until that proxy
     is configured, the assistant runs fully on the KB above.
     ============================================================= */
  var ai = {
    providers: { openai: "/api/ai/openai", anthropic: "/api/ai/anthropic", gemini: "/api/ai/gemini", azure: "/api/ai/azure" },
    provider: function () { return get("doodly-ai-provider", "none"); },
    configured: function () { return get("doodly-ai-proxy", false) === true && this.provider() !== "none"; },
    ask: function (prompt, ctx) {
      // Demo: no server proxy → resolve null so the KB/handover path is used.
      if (!this.configured()) return Promise.resolve(null);
      var url = this.providers[this.provider()];
      return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: prompt, context: ctx || {} }) })
        .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return j && j.reply || null; }).catch(function () { return null; });
    }
  };

  /* ---------- chat history + conversations (persistence) ---------- */
  function chat() { return get("doodly-assistant-chat", null); }
  function saveChat(arr) { set("doodly-assistant-chat", (arr || []).slice(-120)); }
  function convos() { return get("doodly-assistant-convos", null) || seedConvos(); }
  function saveConvos(a) { set("doodly-assistant-convos", a); }
  function logTurn(role, text, meta) {
    var a = convos(); var cur = a.find(function (c) { return c.id === sessionId(); });
    if (!cur) { cur = { id: sessionId(), user: loggedIn() ? meName() : "Guest", started: new Date().toISOString(), status: "active", by: "AI", turns: 0, csat: null, escalated: false, topics: {}, messages: [] }; a.unshift(cur); }
    cur.turns++; cur.messages.push({ role: role, text: String(text).slice(0, 400), at: new Date().toISOString() });
    if (cur.messages.length > 40) cur.messages = cur.messages.slice(-40);
    if (meta && meta.intent) cur.topics[meta.intent] = (cur.topics[meta.intent] || 0) + 1;
    if (meta && meta.escalate) { cur.escalated = true; cur.status = "escalated"; }
    saveConvos(a);
  }
  function sessionId() { try { var s = sessionStorage.getItem("doodly-assist-sid"); if (!s) { s = "CHAT-" + Math.random().toString(36).slice(2, 8).toUpperCase(); sessionStorage.setItem("doodly-assist-sid", s); } return s; } catch (e) { return "CHAT-LOCAL"; } }

  function seedConvos() {
    var now = Date.now(); var d = function (h) { return new Date(now - h * 3600000).toISOString(); };
    var c = [
      { id: "CHAT-9F2A1", user: "Ananya Reddy", started: d(2), status: "resolved", by: "AI", turns: 4, csat: 5, escalated: false, topics: { "sub.plans": 1, "wallet": 1 }, messages: [{ role: "user", text: "What plans do you have?", at: d(2) }, { role: "bot", text: "Our subscription plans: Single Pour · 7-Day Fresh Start · 30-Day Morning Ritual (8% off) · 90-Day Nourish Plan (10% off).", at: d(2) }] },
      { id: "CHAT-7C3B8", user: "Karthik Varma", started: d(5), status: "resolved", by: "AI", turns: 3, csat: 4, escalated: false, topics: { "delivery.bottles": 1 }, messages: [{ role: "user", text: "How do bottle returns work?", at: d(5) }, { role: "bot", text: "We collect empty glass bottles on your next delivery — your deposit is refunded when bottles come back.", at: d(5) }] },
      { id: "CHAT-4D5E2", user: "Rahul Tej", started: d(8), status: "escalated", by: "Human", turns: 6, csat: null, escalated: true, topics: { "pay.failed": 2, "human": 1 }, messages: [{ role: "user", text: "My payment failed and I was charged", at: d(8) }, { role: "bot", text: "If an amount was debited it's auto-refunded in 3–5 days. Connecting you to our team.", at: d(8) }] },
      { id: "CHAT-2A8F0", user: "Guest", started: d(11), status: "resolved", by: "AI", turns: 2, csat: 5, escalated: false, topics: { "bulk": 1 }, messages: [{ role: "user", text: "I need milk for a wedding", at: d(11) }, { role: "bot", text: "For weddings we offer bulk milk at negotiated rates with dedicated delivery — our sales team will set you up.", at: d(11) }] }
    ];
    saveConvos(c); return c;
  }
  function escalate(reason) {
    logTurn("system", "Escalated: " + reason, { escalate: true });
    try { if (RBAC() && RBAC().audit) RBAC().audit("support.escalation", "Assistant escalation: " + reason, { module: "Support", entityType: "Chat", status: "Failed", action: "Human Assistance Requested" }); } catch (e) {}
  }

  /* ============================================================ WIDGET */
  var SUGGEST = ["Start a Milk Subscription", "Track My Delivery", "View My Wallet", "Bulk Milk Orders", "Referral Program", "Pause Subscription", "Contact Support"];
  var WELCOME = "👋 Welcome to Doodly! I'm your AI assistant. I can help you with subscriptions, deliveries, products, referrals, bulk orders, invoices, payments, and more.";

  function svg(p, s) { return '<svg viewBox="0 0 24 24" width="' + (s || 20) + '" height="' + (s || 20) + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>'; }
  var IC = { chat: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12Z"/>', send: '<path d="m4 12 16-7-7 16-2-7-7-2Z"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>', min: '<path d="M5 12h14"/>', max: '<path d="M4 14v6h6M20 10V4h-6M14 10l6-6M10 14l-6 6"/>', dot: '<circle cx="12" cy="12" r="9"/>' };

  function fmtTime(ts) { try { return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }
  var lastSend = 0;

  function mount() {
    var route = (document.body && document.body.dataset.route) || "";
    if (/^admin\/|^driver\/|^delivery\//.test(route)) return;                 // staff surfaces — no customer assistant
    if (["login", "login/customer", "login/admin", "signup", "otp", "forgot-password"].indexOf(route) >= 0) return;
    if (document.getElementById("doodlyAssistant")) return;                    // once per page

    var wrap = document.createElement("div"); wrap.id = "doodlyAssistant"; wrap.className = "da";
    wrap.innerHTML =
      '<button class="da-fab" id="daFab" aria-label="Open Doodly Assistant — AI chat support" aria-haspopup="dialog">' + svg(IC.chat, 26) + '<span class="da-fab-badge" id="daBadge">1</span></button>' +
      '<div class="da-win" id="daWin" role="dialog" aria-label="Doodly Assistant" aria-modal="false" hidden>' +
        '<div class="da-head"><div class="da-id"><div class="da-av">DA</div><div class="da-idtx"><b>Doodly Assistant</b><span class="da-status"><i class="da-online"></i> Online · replies instantly</span></div></div>' +
          '<div class="da-hbtns"><button class="da-hbtn" id="daMax" aria-label="Maximize">' + svg(IC.max, 16) + '</button><button class="da-hbtn" id="daMin" aria-label="Minimize">' + svg(IC.min, 16) + '</button><button class="da-hbtn" id="daClose" aria-label="Close">' + svg(IC.close, 16) + '</button></div></div>' +
        '<div class="da-body" id="daBody" tabindex="0"></div>' +
        '<div class="da-suggest" id="daSuggest"></div>' +
        '<form class="da-input" id="daForm"><input id="daInput" type="text" placeholder="Ask me anything…" autocomplete="off" aria-label="Message Doodly Assistant"><button class="da-send" type="submit" aria-label="Send">' + svg(IC.send, 18) + '</button></form>' +
        '<div class="da-foot">AI assistant — answers from Doodly\'s help knowledge base. <button class="da-link" id="daHuman">Talk to a human</button></div>' +
      '</div>';
    document.body.appendChild(wrap);

    var win = wrap.querySelector("#daWin"), body = wrap.querySelector("#daBody"), fab = wrap.querySelector("#daFab"), badge = wrap.querySelector("#daBadge");
    var input = wrap.querySelector("#daInput"), built = false;

    function open() {
      win.hidden = false; fab.setAttribute("aria-expanded", "true"); badge.hidden = true; wrap.classList.add("da-open");
      if (!built) { built = true; restore(); }
      setTimeout(function () { input.focus(); }, 60); scrollEnd();
    }
    function close() { win.hidden = true; wrap.classList.remove("da-open", "da-maxed"); fab.setAttribute("aria-expanded", "false"); fab.focus(); }
    fab.addEventListener("click", function () { win.hidden ? open() : close(); });
    wrap.querySelector("#daClose").addEventListener("click", close);
    wrap.querySelector("#daMin").addEventListener("click", close);
    wrap.querySelector("#daMax").addEventListener("click", function () { wrap.classList.toggle("da-maxed"); input.focus(); });
    wrap.querySelector("#daHuman").addEventListener("click", function () { handleUser("Talk to a human", true); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !win.hidden) close(); });

    wrap.querySelector("#daForm").addEventListener("submit", function (e) { e.preventDefault(); var v = input.value.trim(); if (!v) return; input.value = ""; handleUser(v); });

    function restore() {
      var h = chat();
      if (h && h.length) { h.forEach(function (m) { addMsg(m.role, m.text, m.actions, m.ts, true); }); }
      else { addBot(WELCOME); renderSuggest(SUGGEST); }
      renderSuggest(SUGGEST); scrollEnd();
    }
    function persist() {
      var msgs = []; body.querySelectorAll(".da-msg").forEach(function (el) { msgs.push({ role: el.classList.contains("user") ? "user" : "bot", text: el.dataset.raw || el.querySelector(".da-bubble").textContent, ts: el.dataset.ts, actions: el._actions || null }); });
      saveChat(msgs);
    }
    function scrollEnd() { body.scrollTop = body.scrollHeight; }

    function addMsg(role, html, actions, ts, silent) {
      ts = ts || new Date().toISOString();
      var el = document.createElement("div"); el.className = "da-msg " + role; el.dataset.ts = ts; el.dataset.raw = typeof html === "string" ? html : "";
      el._actions = actions || null;
      el.innerHTML = '<div class="da-bubble">' + (role === "bot" ? html : esc(html)) + '</div>' +
        (actions && actions.length ? '<div class="da-actions">' + actions.map(function (a, i) { return '<button class="da-act" data-i="' + i + '">' + esc(a.label) + '</button>'; }).join("") + '</div>' : "") +
        '<div class="da-ts">' + fmtTime(ts) + '</div>';
      body.appendChild(el);
      if (actions) el.querySelectorAll(".da-act").forEach(function (b) { b.addEventListener("click", function () { doAction(actions[+b.dataset.i]); }); });
      if (!silent) { scrollEnd(); persist(); }
      return el;
    }
    function addBot(html, actions) { return addMsg("bot", html, actions); }

    function renderSuggest(list) {
      var s = wrap.querySelector("#daSuggest");
      s.innerHTML = list.map(function (q) { return '<button class="da-chip">' + esc(q) + '</button>'; }).join("");
      s.querySelectorAll(".da-chip").forEach(function (b) { b.addEventListener("click", function () { handleUser(b.textContent); }); });
    }

    function typing(on) {
      var t = body.querySelector(".da-typing");
      if (on && !t) { var el = document.createElement("div"); el.className = "da-msg bot da-typing"; el.innerHTML = '<div class="da-bubble"><span class="da-dots"><i></i><i></i><i></i></span></div>'; body.appendChild(el); scrollEnd(); }
      else if (!on && t) t.remove();
    }

    function handleUser(text, forceHuman) {
      var now = Date.now(); if (now - lastSend < 350) return; lastSend = now;                 // light rate-limit
      addMsg("user", text); logTurn("user", text);
      typing(true);
      var t0 = Date.now();
      var go = function (r) {
        typing(false);
        addBot(r.text, r.actions);
        logTurn("bot", r.text, { intent: r.intent, escalate: r.escalate });
        if (r.escalate) escalate(r.escalate);
        if (r.suggest) renderSuggest(SUGGEST);
      };
      var r = forceHuman ? { intent: "human", text: "I'll connect you with our team — choose how you'd like to reach us:", actions: handoverActions(), escalate: "user requested human" } : respond(text);
      if (r.pending) { // AI fallback path (only when a proxy is configured)
        ai.ask(r.ask, { user: loggedIn() ? meName() : "guest" }).then(function (reply) {
          go(reply ? { intent: "ai", text: reply } : { intent: "fallback", text: "I couldn't reach the AI service just now. Let me connect you with our team.", actions: handoverActions(), escalate: "ai unavailable" });
        });
        return;
      }
      setTimeout(function () { go(r); }, 420 + Math.min(500, r.text ? r.text.length * 4 : 300));   // human-like typing delay
    }

    function doAction(a) {
      if (!a || !a.to) return;
      var to = a.to;
      if (to.nav) { location.href = to.nav; }
      else if (to.wa) { window.open("https://wa.me/" + to.wa, "_blank", "noopener"); addBot("Opening WhatsApp support… our team replies during " + support().hours + "."); }
      else if (to.tel) { location.href = "tel:" + String(to.tel).replace(/\s/g, ""); }
      else if (to.act === "copyref") { var c = referralCode() || ""; try { (navigator.clipboard ? navigator.clipboard.writeText(c) : Promise.reject()).then(function () { toast("Referral code copied"); }).catch(function () { toast("Code: " + c); }); } catch (e) { toast("Code: " + c); } }
      else if (to.act === "handover") { handleUser("Talk to a human", true); }
      else if (to.act === "callback") { callbackForm(); }
      else if (to.send) { handleUser(to.send); }
    }
    function callbackForm() {
      addBot("Sure — leave your number and a good time, and our team will call you back.", null);
      var el = document.createElement("div"); el.className = "da-msg bot";
      el.innerHTML = '<div class="da-bubble"><form class="da-cb"><input class="da-cbin" id="daCbNum" type="tel" placeholder="Your phone number" aria-label="Phone number"><input class="da-cbin" id="daCbTime" placeholder="Preferred time (e.g. after 6 PM)" aria-label="Preferred time"><button class="btn btn-primary sm" type="submit">Request callback</button></form></div>';
      body.appendChild(el); scrollEnd();
      el.querySelector(".da-cb").addEventListener("submit", function (e) { e.preventDefault(); var n = el.querySelector("#daCbNum").value.trim(); if (!n) { el.querySelector("#daCbNum").focus(); return; }
        set("doodly-assistant-callbacks", (get("doodly-assistant-callbacks", []) || []).concat([{ phone: n, time: el.querySelector("#daCbTime").value.trim(), at: new Date().toISOString(), user: loggedIn() ? meName() : "Guest" }]));
        escalate("callback requested"); el.querySelector(".da-cb").innerHTML = "✓ Thanks! Our team will call you back shortly.";
        toast("Callback requested"); });
    }

    // lazy: nothing heavy until first open
    fab.setAttribute("aria-expanded", "false");
  }

  /* ============================================================ ADMIN — Chat Management */
  function mountAdmin(host) {
    if (!host) return;
    var canView = true; try { canView = RBAC() ? RBAC().can("chatSupport", "view") : true; } catch (e) {}
    if (!canView) { host.innerHTML = '<div class="panel"><div class="panel-pad"><h3>Access restricted</h3><p class="muted-sm">You don\'t have permission to view chat support.</p></div></div>'; return; }
    var st = { tab: "dashboard", open: null };
    function data() { return convos(); }
    function render() {
      var T = [["dashboard", "Dashboard"], ["chats", "Conversations"], ["canned", "Canned Responses"], ["kb", "Knowledge Base"]];
      host.innerHTML = '<div class="da-admin"><div class="exp-tabs">' + T.map(function (t) { return '<button class="exp-tab ' + (st.tab === t[0] ? "on" : "") + '" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join("") + '</div><div class="exp-body">' +
        (st.tab === "dashboard" ? viewDash() : st.tab === "chats" ? viewChats() : st.tab === "canned" ? viewCanned() : viewKB()) + '</div></div>';
      host.querySelectorAll(".exp-tab").forEach(function (b) { b.addEventListener("click", function () { st.tab = b.dataset.t; st.open = null; render(); }); });
      wire();
    }
    function viewDash() {
      var c = data(); var active = c.filter(function (x) { return x.status === "active"; }).length, resolved = c.filter(function (x) { return x.status === "resolved"; }).length, esc2 = c.filter(function (x) { return x.escalated; }).length;
      var csats = c.filter(function (x) { return x.csat; }).map(function (x) { return x.csat; }); var csat = csats.length ? (csats.reduce(function (a, b) { return a + b; }, 0) / csats.length).toFixed(1) : "—";
      var topics = {}; c.forEach(function (x) { Object.keys(x.topics || {}).forEach(function (k) { topics[k] = (topics[k] || 0) + x.topics[k]; }); });
      var faq = Object.keys(topics).sort(function (a, b) { return topics[b] - topics[a]; }).slice(0, 6);
      var card = function (l, v) { return '<div class="exp-card"><p class="exp-cval">' + v + '</p><p class="exp-clabel">' + l + '</p></div>'; };
      return '<div class="exp-cards" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">' + card("Active chats", active) + card("Resolved", resolved) + card("Escalated", esc2) + card("Customer satisfaction", csat + (csat !== "—" ? " / 5" : "")) + card("Avg response time", "1.0s") + card("Total chats", c.length) + '</div>' +
        '<div class="panel" style="margin-top:14px"><div class="panel-head"><h3>Frequently asked topics</h3></div><div class="panel-pad">' + (faq.length ? faq.map(function (k) { return '<div class="da-faqrow"><span>' + esc(intentLabel(k)) + '</span><b>' + topics[k] + '</b></div>'; }).join("") : '<p class="muted-sm">No data yet.</p>') + '</div></div>';
    }
    function viewChats() {
      var c = data();
      if (st.open) { var conv = c.find(function (x) { return x.id === st.open; }); if (conv) return convoView(conv); }
      var rows = c.map(function (x) { return '<tr class="da-crow" data-id="' + esc(x.id) + '"><td><b>' + esc(x.id) + '</b></td><td>' + esc(x.user) + '</td><td>' + x.turns + '</td><td>' + esc(x.by) + '</td><td>' + fmtTime(x.started) + '</td><td><span class="badge ' + (x.status === "escalated" ? "red" : x.status === "active" ? "amber" : "green") + '">' + esc(x.status) + '</span></td><td>' + (x.csat ? x.csat + "★" : "—") + '</td></tr>'; }).join("") || '<tr><td colspan="7" class="muted-sm" style="text-align:center;padding:20px">No conversations.</td></tr>';
      return '<div class="table-wrap"><table class="tbl"><thead><tr><th>Chat ID</th><th>User</th><th>Turns</th><th>Handled by</th><th>Started</th><th>Status</th><th>CSAT</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }
    function convoView(conv) {
      return '<button class="link" id="daBack">← Back to conversations</button>' +
        '<div class="panel" style="margin-top:10px"><div class="panel-head"><h3>' + esc(conv.id) + ' · ' + esc(conv.user) + ' <span class="badge ' + (conv.status === "escalated" ? "red" : conv.status === "active" ? "amber" : "green") + '">' + esc(conv.status) + '</span></h3></div><div class="panel-pad"><div class="da-transcript">' +
        (conv.messages || []).map(function (m) { return '<div class="da-tmsg ' + (m.role === "user" ? "u" : "b") + '"><span class="da-trole">' + (m.role === "user" ? esc(conv.user) : m.role === "system" ? "System" : "Assistant") + '</span><div class="da-tbubble">' + esc(m.text) + '</div><span class="da-tt">' + fmtTime(m.at) + '</span></div>'; }).join("") +
        '</div><div class="exp-actions" style="margin-top:12px">' + (conv.status !== "resolved" ? '<button class="btn btn-primary sm" id="daResolve">Mark resolved</button>' : "") + (!conv.assigned ? '<button class="btn btn-ghost sm" id="daAssign">Assign to me</button>' : '<span class="badge blue">Assigned: ' + esc(conv.assigned) + '</span>') + '</div></div></div>';
    }
    function viewCanned() {
      var cans = get("doodly-assistant-canned", null) || ["Thanks for reaching out! How can I help?", "Your refund has been initiated and will reflect in 3–5 business days.", "Deliveries arrive every morning before 7:00 AM.", "You can pause anytime from Vacation Mode — paused days are never charged."];
      return '<div class="panel"><div class="panel-head"><h3>Canned responses</h3></div><div class="panel-pad"><div id="daCanList">' + cans.map(function (t, i) { return '<div class="da-canrow"><textarea class="input da-can" data-i="' + i + '" rows="2">' + esc(t) + '</textarea><button class="link da-candel" data-i="' + i + '">Remove</button></div>'; }).join("") + '</div><div style="margin-top:10px"><button class="btn btn-ghost sm" id="daCanAdd">+ Add response</button> <button class="btn btn-primary sm" id="daCanSave">Save</button></div></div></div>';
    }
    function viewKB() {
      var rows = INTENTS.filter(function (i) { return i.fn; }).slice(0, 40).map(function (i) { var r = (function () { try { return i.fn({ q: "" }); } catch (e) { return {}; } })(); return '<tr><td><code>' + esc(i.id) + '</code></td><td>' + esc(intentLabel(i.id)) + '</td><td>' + esc((r && r.text ? r.text : "").slice(0, 90)) + '…</td></tr>'; }).join("");
      var over = get("doodly-assistant-kb", {}) || {};
      return '<div class="panel"><div class="panel-head"><h3>Knowledge base topics</h3></div><div class="panel-pad"><p class="muted-sm">The assistant answers from these topics before any AI model. Add an override answer for any topic (no code change).</p>' +
        '<div class="exp-fgrid" style="margin:12px 0"><label class="b2-f" style="grid-column:1/-1"><span>Topic id</span><input class="input" id="kbId" placeholder="e.g. sub.plans"></label><label class="b2-f" style="grid-column:1/-1"><span>Override answer</span><textarea class="input" id="kbText" rows="3"></textarea></label></div><button class="btn btn-primary sm" id="kbSave">Save override</button>' +
        (Object.keys(over).length ? '<p class="exp-block-h" style="margin-top:14px">Active overrides</p>' + Object.keys(over).map(function (k) { return '<div class="da-faqrow"><span><code>' + esc(k) + '</code>: ' + esc(over[k].slice(0, 70)) + '</span><button class="link da-kbdel" data-k="' + esc(k) + '">Remove</button></div>'; }).join("") : "") +
        '<div class="table-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>Topic</th><th>Name</th><th>Default answer</th></tr></thead><tbody>' + rows + '</tbody></table></div></div></div>';
    }
    function wire() {
      host.querySelectorAll(".da-crow").forEach(function (b) { b.addEventListener("click", function () { st.open = b.dataset.id; render(); }); });
      var back = host.querySelector("#daBack"); if (back) back.addEventListener("click", function () { st.open = null; render(); });
      var res = host.querySelector("#daResolve"); if (res) res.addEventListener("click", function () { var c = data(); var x = c.find(function (y) { return y.id === st.open; }); if (x) { x.status = "resolved"; x.escalated = false; saveConvos(c); toast("Marked resolved"); render(); } });
      var asg = host.querySelector("#daAssign"); if (asg) asg.addEventListener("click", function () { var c = data(); var x = c.find(function (y) { return y.id === st.open; }); if (x) { x.assigned = meName(); x.by = "Human"; saveConvos(c); toast("Assigned to you"); render(); } });
      var cadd = host.querySelector("#daCanAdd"); if (cadd) cadd.addEventListener("click", function () { var list = host.querySelector("#daCanList"); var i = list.children.length; var div = document.createElement("div"); div.className = "da-canrow"; div.innerHTML = '<textarea class="input da-can" data-i="' + i + '" rows="2"></textarea><button class="link da-candel" data-i="' + i + '">Remove</button>'; list.appendChild(div); div.querySelector(".da-candel").addEventListener("click", function () { div.remove(); }); });
      host.querySelectorAll(".da-candel").forEach(function (b) { b.addEventListener("click", function () { b.closest(".da-canrow").remove(); }); });
      var csave = host.querySelector("#daCanSave"); if (csave) csave.addEventListener("click", function () { var vals = Array.prototype.map.call(host.querySelectorAll(".da-can"), function (t) { return t.value.trim(); }).filter(Boolean); set("doodly-assistant-canned", vals); toast("Canned responses saved"); });
      var kbSave = host.querySelector("#kbSave"); if (kbSave) kbSave.addEventListener("click", function () { var id = host.querySelector("#kbId").value.trim(), tx = host.querySelector("#kbText").value.trim(); if (!id || !tx) { toast("Enter a topic id and answer"); return; } var o = get("doodly-assistant-kb", {}) || {}; o[id] = tx; set("doodly-assistant-kb", o); toast("Override saved"); render(); });
      host.querySelectorAll(".da-kbdel").forEach(function (b) { b.addEventListener("click", function () { var o = get("doodly-assistant-kb", {}) || {}; delete o[b.dataset.k]; set("doodly-assistant-kb", o); render(); }); });
    }
    render();
  }
  function intentLabel(id) { var m = { greeting: "Greeting", "sub.plans": "Subscription plans", "sub.pause": "Pause subscription", "delivery.bottles": "Bottle returns", "pay.failed": "Failed payment", bulk: "Bulk orders", wallet: "Wallet", referral: "Referral program", human: "Human handover", "orders.status": "Order status", "co.about": "About Doodly", "co.quality": "Quality", "prod.milk": "A2 milk" }; return m[id] || id.replace(/\./g, " · "); }

  /* apply admin KB overrides on top of intent answers */
  var _respond = respond;
  respond = function (q) { var r = _respond(q); try { var o = get("doodly-assistant-kb", {}) || {}; if (r && r.intent && o[r.intent]) r.text = o[r.intent]; } catch (e) {} return r; };

  /* ---------- self-test ---------- */
  function runTests() {
    var R = []; var ok = function (n, c) { R.push({ name: n, pass: !!c }); };
    ok("greeting matched", respond("hi there").intent === "greeting");
    ok("plans answered", /plan/i.test(respond("what plans do you have").text));
    ok("pause routed", respond("how do I pause my subscription").actions.some(function (a) { return a.to.nav === NAV.vacation; }));
    ok("bulk → sales/whatsapp", respond("milk for a wedding").actions.some(function (a) { return a.to.wa || a.to.nav === NAV.contact; }));
    ok("wallet gated when guest", (function () { var li = loggedIn; loggedIn = function () { return false; }; var r = respond("what is my wallet balance"); loggedIn = li; return r.actions.some(function (a) { return a.to.nav === "/login.html"; }); })());
    ok("human handover escalates", !!respond("I want to talk to a human").escalate);
    ok("nav 'open invoices' routes", respond("open my invoices").actions.some(function (a) { return a.to.nav === NAV.invoices; }));
    ok("unknown → fallback + handover", (function () { var r = respond("asdfqwer zzz"); return r.intent === "fallback" && r.actions.length > 0; })());
    ok("AI adapter abstracted (not configured)", ai.configured() === false && typeof ai.ask === "function");
    ok("input sanitized", esc("<script>") === "&lt;script&gt;");
    return { passed: R.filter(function (x) { return x.pass; }).length, total: R.length, results: R };
  }

  return { mount: mount, mountAdmin: mountAdmin, respond: function (q) { return respond(q); }, ai: ai, escalate: escalate, convos: convos, runTests: runTests };
})();
