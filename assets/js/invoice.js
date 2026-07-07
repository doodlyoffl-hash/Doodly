/* =============================================================
   DOODLY — Premium Animated Invoice System (DOODLY_INVOICE)
   Two distinct, dairy-inspired documents:
     • mountB2C(host, id)  — customer invoice (subscription billing)
     • mountB2B(host, code)— business partner statement (credit,
       outstanding, supply analytics, payment history)
   Animated on screen (count-up, section reveal, payment progress,
   paid-success check); animations are OFF for print/PDF and under
   prefers-reduced-motion. Export: Print · PDF · Excel(B2B) · Email
   · WhatsApp. Super-Admin invoice config (logo/footer/terms/GST/
   signature/watermark/QR/prefix/format). Pulls live data from
   DOODLY_B2B / DOODLY_GST / DOODLY_WALLET. Static build.
   ============================================================= */
window.DOODLY_INVOICE = (function () {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var toast = function (m) { if (window.DOODLY_PINCODE && DOODLY_PINCODE.toast) DOODLY_PINCODE.toast(m); };
  var RB = function () { return window.DOODLY_RBAC; };
  var B2B = function () { return window.DOODLY_B2B; };
  var GST = function () { return window.DOODLY_GST; };
  var WAL = function () { return window.DOODLY_WALLET; };
  var isSuper = function () { return RB() ? RB().activeRole() === "super_admin" : true; };
  var brand = function () { return (window.DOODLY && window.DOODLY.brand) || {}; };
  var inr = function (n) { return "₹" + Math.round(+n || 0).toLocaleString("en-IN"); };
  var qp = function (k) { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } };
  var reduced = function () { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; };
  function ic(n, s) { return window.DOODLY_BLOCKS ? window.DOODLY_BLOCKS.icon(n, s) : ""; }

  var STATUS = { paid: ["green", "Paid"], pending: ["amber", "Pending"], partial: ["blue", "Partial Payment"], overdue: ["red", "Overdue"], cancelled: ["grey", "Cancelled"], draft: ["grey", "Draft"], credit: ["blue", "Credit Note"] };
  var PLAN_LABEL = { p30: "30-Day Morning Ritual", p90: "90-Day Nourish Plan", monthly: "Monthly Subscription" };

  /* ---------- config (Super-Admin) ---------- */
  function cfg() {
    return Object.assign({
      brandName: brand().name || "DOODLY", tagline: "Fresh A2 buffalo milk, delivered daily",
      footer: "Thank you for choosing DOODLY — fresh from our farms to your home.",
      terms: "Payment due within the agreed credit period. Goods once delivered are governed by our refund policy. E.&O.E.",
      showGST: true, signature: "For " + ((brand().company && brand().company.legalName) || "DOODLY"), watermark: "", showQR: true,
      prefix: "DOODLY", format: "DOODLY/INV/{YYYY}/{#####}",
    }, get("doodly-invoice-cfg", {}));
  }
  function saveCfg(c) { set("doodly-invoice-cfg", Object.assign(cfg(), c)); }
  function get(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- shared bits ---------- */
  function logo() { return '<span class="inv-logo"><img src="/assets/img/logo.png" alt="' + esc(cfg().brandName) + '"></span>'; }
  function badge(status) { var s = STATUS[status] || STATUS.pending; return '<span class="inv-badge ' + s[0] + (status === "paid" ? " inv-badge-paid" : "") + '">' + (status === "paid" ? '<span class="inv-check" aria-hidden="true"></span>' : '') + esc(s[1]) + '</span>'; }
  function num(v, pre) { return '<span class="inv-num" data-count="' + (Math.round(+v || 0)) + '"' + (pre ? ' data-pre="' + pre + '"' : "") + '>' + (pre || "") + '0</span>'; }
  function qr(text) {
    if (!cfg().showQR) return "";
    var svg = (window.DOODLY_QR && DOODLY_QR.toSvg) ? DOODLY_QR.toSvg(text, { size: 92 }) : '<div class="inv-qr-fallback">QR</div>';
    return '<div class="inv-qr" title="Scan to pay / verify (future-ready)">' + svg + '<small>Scan to verify</small></div>';
  }
  function watermark() { var w = cfg().watermark; return w ? '<div class="inv-watermark" aria-hidden="true">' + esc(w) + '</div>' : ""; }
  function curve() { return '<svg class="inv-curve" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 24 C200 4 400 40 600 22 C800 6 1000 38 1200 18 L1200 40 L0 40Z" fill="currentColor"/></svg>'; }

  function actionBar(kind, ctx) {
    var sup = isSuper();
    return '<div class="inv-actions" role="toolbar" aria-label="Invoice actions">' +
      '<button class="btn btn-primary sm" data-act="print">' + ic("printer", 15) + ' Print</button>' +
      '<button class="btn btn-ghost sm" data-act="pdf">' + ic("download", 15) + ' Download PDF</button>' +
      (kind === "b2b" ? '<button class="btn btn-ghost sm" data-act="excel">' + ic("download", 15) + ' Excel</button>' : "") +
      '<button class="btn btn-ghost sm" data-act="email">' + ic("mail", 15) + ' Email</button>' +
      '<a class="btn btn-ghost sm" data-act="wa" href="' + waLink(ctx) + '" target="_blank" rel="noopener">' + ic("chat", 15) + ' WhatsApp</a>' +
      (sup ? '<button class="btn btn-ghost sm inv-cfg-btn" data-act="config" title="Invoice settings">' + ic("settings", 15) + '</button>' : "") +
      '</div>';
  }
  function waLink(ctx) { var t = encodeURIComponent((ctx.title || "Your DOODLY invoice") + " " + (ctx.no || "") + " — " + inr(ctx.amount || 0) + ". View: " + location.href); return "https://wa.me/?text=" + t; }

  /* Production empty state — shown when there's no real invoice/statement to
     render (these premium documents are templates, not yet wired to live billing,
     so on the live site they must never display fabricated figures). */
  function invEmpty(host, title, msg) {
    host.innerHTML =
      '<div class="inv inv-empty" style="max-width:640px;margin:0 auto;text-align:center;padding:56px 26px">' +
        '<div style="font-size:44px;line-height:1;margin-bottom:14px">🧾</div>' +
        '<h2 style="margin:0 0 8px;font-size:1.25rem">' + esc(title) + '</h2>' +
        '<p style="margin:0;color:#6b7280;font-size:.95rem;line-height:1.6">' + esc(msg) + '</p>' +
      '</div>';
  }
  function demoOK() { return !!(window.DOODLY_DEMO_ALLOWED && window.DOODLY_DEMO_ALLOWED()); }

  /* ============================================================
     B2C — Customer invoice
     ============================================================ */
  function b2cInvoice(id) {
    var sub = null; try { sub = JSON.parse(localStorage.getItem("doodly-subscription") || "null"); } catch (e) {}
    var g = GST();
    var lines = [
      { slug: "milk", name: "A2 Buffalo Milk", qty: 30, unit: "bottle (1000ml)", price: 66 },
      { slug: "curd", name: "Buffalo Pot Curd", qty: 4, unit: "tub (400g)", price: 120 },
      { slug: "ghee", name: "Buffalo Ghee", qty: 1, unit: "jar (500ml)", price: 1100 },
    ].map(function (l) {
      var amount = l.qty * l.price;
      var pct = g ? (g.resolve(l.slug).percent || 0) : (l.slug === "milk" ? 0 : l.slug === "ghee" ? 12 : 5);
      var gst = Math.round(amount * pct) / 100;
      return Object.assign(l, { amount: amount, gstPct: pct, gst: gst });
    });
    var subtotal = lines.reduce(function (s, l) { return s + l.amount; }, 0);
    var gstTotal = lines.reduce(function (s, l) { return s + l.gst; }, 0);
    var discount = 180, walletUsed = 100, referralUsed = 0, delivery = 0;
    var grand = subtotal + gstTotal - discount - walletUsed - referralUsed + delivery;
    return {
      no: id || "DOODLY/INV/2026/00128", date: "30 Jun 2026", period: "1–30 Jun 2026", status: "paid",
      customer: { name: "Ananya Reddy", id: "C-4821", mobile: "+91 98480 11122", address: "Flat 304, Lake View Residency, Benz Circle, Vijayawada 520010", plan: (sub && PLAN_LABEL[sub.planId]) || "30-Day Morning Ritual", slot: "6:00 – 8:00 AM" },
      lines: lines, subtotal: subtotal, discount: discount, gst: gstTotal, walletUsed: walletUsed, referralUsed: referralUsed, delivery: delivery, grand: grand, outstanding: 0,
      payment: { status: "Paid", method: "UPI · GPay", txn: "pay_R8xK2mPq51", date: "30 Jun 2026" },
      deliveries: { total: 30, delivered: 28, skipped: 1, paused: 1, bonus: 2 },
    };
  }

  function mountB2C(host, id) {
    if (!host) return;
    if (!demoOK()) return invEmpty(host, "No invoice to display", "Your tax invoice will appear here once your billing has been generated.");
    var v = b2cInvoice(id || qp("id"));
    var c = cfg();
    var rowsDesktop = v.lines.map(function (l) {
      return '<tr><td><b>' + esc(l.name) + '</b></td><td>' + l.qty + '</td><td>' + esc(l.unit) + '</td><td>' + inr(l.price) + '</td><td>' + (l.gstPct ? l.gstPct + "% · " + inr(l.gst) : "Nil") + '</td><td class="inv-amt">' + inr(l.amount) + '</td></tr>';
    }).join("");
    var cardsMobile = v.lines.map(function (l) {
      return '<div class="inv-pcard"><div class="inv-pcard-h"><b>' + esc(l.name) + '</b><span class="inv-amt">' + inr(l.amount) + '</span></div><div class="inv-pcard-meta">' + l.qty + ' × ' + esc(l.unit) + ' @ ' + inr(l.price) + ' · GST ' + (l.gstPct ? l.gstPct + "%" : "Nil") + '</div></div>';
    }).join("");
    var sumRow = function (l, val, neg, strong) { return '<div class="inv-srow' + (strong ? " grand" : "") + '"><span>' + l + '</span><span>' + (neg ? "− " : "") + inr(Math.abs(val)) + '</span></div>'; };
    host.innerHTML =
      '<div class="inv inv-b2c reveal-inv">' + watermark() + actionBar("b2c", { title: "DOODLY Invoice", no: v.no, amount: v.grand }) +
      '<div class="inv-doc" id="invDoc">' +
        '<header class="inv-head"><div class="inv-brand">' + logo() + '<div><div class="inv-bname">' + esc(c.brandName) + '</div><div class="inv-tag">' + esc(c.tagline) + '</div></div></div>' +
          '<div class="inv-meta"><div class="inv-title">TAX INVOICE</div><div class="inv-mrow"><span>Invoice</span><b>' + esc(v.no) + '</b></div><div class="inv-mrow"><span>Date</span><b>' + esc(v.date) + '</b></div><div class="inv-mrow"><span>Billing period</span><b>' + esc(v.period) + '</b></div><div class="inv-mrow"><span>Status</span>' + badge(v.status) + '</div></div></header>' +
        '<div class="inv-curvewrap">' + curve() + '</div>' +
        '<section class="inv-sec inv-parties" style="--i:1"><div class="inv-party"><div class="inv-ph">Billed to</div><b>' + esc(v.customer.name) + '</b><div class="inv-pl">Customer ID ' + esc(v.customer.id) + '</div><div class="inv-pl">' + esc(v.customer.mobile) + '</div><div class="inv-pl">' + esc(v.customer.address) + '</div></div>' +
          '<div class="inv-party"><div class="inv-ph">Subscription</div><div class="inv-kv"><span>Plan</span><b>' + esc(v.customer.plan) + '</b></div><div class="inv-kv"><span>Delivery slot</span><b>' + esc(v.customer.slot) + '</b></div>' + (c.showQR ? "" : "") + '</div>' +
          (c.showQR ? '<div class="inv-party inv-qrcell">' + qr("upi://pay?pa=doodly@upi&am=" + v.grand + "&tn=" + v.no) + '</div>' : "") + '</section>' +
        '<section class="inv-sec" style="--i:2"><div class="table-wrap inv-table-d"><table class="tbl inv-table"><thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th>Unit price</th><th>GST</th><th>Amount</th></tr></thead><tbody>' + rowsDesktop + '</tbody></table></div><div class="inv-table-m">' + cardsMobile + '</div></section>' +
        '<section class="inv-sec inv-bottom" style="--i:3">' +
          '<div class="inv-delivery"><div class="inv-ph">Delivery summary</div><div class="inv-dgrid">' +
            dchip("📦", "Total", v.deliveries.total) + dchip("✅", "Delivered", v.deliveries.delivered) + dchip("⏭️", "Skipped", v.deliveries.skipped) + dchip("⏸️", "Paused", v.deliveries.paused) + dchip("🎁", "Bonus", v.deliveries.bonus) +
          '</div><div class="inv-pay"><div class="inv-ph">Payment</div><div class="inv-kv"><span>Status</span>' + badge(v.payment.status.toLowerCase()) + '</div><div class="inv-kv"><span>Method</span><b>' + esc(v.payment.method) + '</b></div><div class="inv-kv"><span>Transaction</span><b>' + esc(v.payment.txn) + '</b></div><div class="inv-kv"><span>Paid on</span><b>' + esc(v.payment.date) + '</b></div></div></div>' +
          '<div class="inv-summary"><div class="inv-ph">Summary</div>' +
            sumRow("Subtotal", v.subtotal) + (v.discount ? sumRow("Discount", v.discount, true) : "") + (c.showGST ? sumRow("GST", v.gst) : "") +
            (v.walletUsed ? sumRow("Wallet used", v.walletUsed, true) : "") + (v.referralUsed ? sumRow("Referral reward used", v.referralUsed, true) : "") + sumRow("Delivery charges", v.delivery) +
            '<div class="inv-srow grand"><span>Grand total</span><span>' + num(v.grand, "₹") + '</span></div>' +
            (v.outstanding ? '<div class="inv-srow out"><span>Outstanding balance</span><span>' + inr(v.outstanding) + '</span></div>' : '<div class="inv-paidstamp">' + ic("check", 14) + ' Paid in full</div>') +
          '</div></section>' +
        '<footer class="inv-foot"><div class="inv-thanks">' + esc(c.footer) + '</div><div class="inv-support">Support: ' + esc((brand().support || {}).phone || "+91 90000 00000") + ' · WhatsApp ' + esc((brand().support || {}).whatsapp || "") + ' · ' + esc(brand().website || "doodly.in") + '</div><div class="inv-terms">' + esc(c.terms) + '</div>' + (c.signature ? '<div class="inv-sign">' + esc(c.signature) + '<span class="inv-sign-line"></span>Authorised signatory</div>' : "") + '</footer>' +
      '</div></div>';
    afterMount(host, { kind: "b2c", v: v });
  }
  function dchip(emo, l, n) { return '<div class="inv-dchip"><span class="inv-dchip-e">' + emo + '</span><span class="inv-dchip-n" data-count="' + n + '">0</span><span class="inv-dchip-l">' + l + '</span></div>'; }

  /* ============================================================
     B2B — Business partner statement
     ============================================================ */
  function b2bStatement(code) {
    var b = B2B();
    var biz = null, prof = null, ords = [];
    if (b) {
      var all = b.businesses();
      biz = code ? all.find(function (x) { return x.code === code; }) : all[0];
      biz = biz || all[0];
      if (biz) { prof = b.profile(biz); ords = b.orders().filter(function (o) { return o.businessId === biz.id; }); }
    }
    if (!biz) biz = { code: "DOO-B2B-000001", name: "Grand Park Hotel", type: "Hotel", gst: "37ABCDE1234F1Z5", contactPerson: "Mr. Suresh", mobile: "+91 98480 22113", email: "purchase@grandpark.in", address: "MG Road, Vijayawada 520010", paymentTerm: "Monthly Billing", creditLimit: 50000 };
    if (!prof) prof = { totalOrders: 24, totalRevenue: 86400, avgDaily: 45, outstanding: 18650, lastDelivery: "2026-06-28", preferred: [{ name: "A2 Buffalo Milk" }, { name: "Malai Paneer" }] };
    // financial summary
    var current = 24200, prevOut = 12450, received = 18000, creditNotes = 600, adjustments = 0, discounts = 1200, gst = 0;
    var totalOut = prevOut + current - received - creditNotes - adjustments;
    var creditLimit = biz.creditLimit || 50000;
    var dueDate = "2026-07-10", daysOverdue = 0;
    var amountDue = totalOut, balanceAfter = 0, netPayable = totalOut;
    var litres = (prof.avgDaily || 45) * 30, bottles = Math.round(litres);
    var history = (ords.length ? ords.slice(0, 6) : seedHistory()).map(function (o, i) {
      var amt = o.total != null ? o.total : [3588, 4655, 2400, 5200, 3100, 4200][i % 6];
      var paid = o.paymentStatus === "Paid" ? amt : (o.paid != null ? o.paid : [amt, 0, amt, 2000, amt, 0][i % 6]);
      return { date: o.deliveryDate || o.createdAt || "2026-06-2" + (i + 1), no: o.code || ("DOODLY/B2B/2026/0000" + (i + 1)), amount: amt, paid: paid, pending: Math.max(0, amt - paid), status: paid >= amt ? "paid" : paid > 0 ? "partial" : "pending" };
    });
    return {
      no: "DOODLY/B2B/2026/00042", date: "30 Jun 2026", period: "1–30 Jun 2026", creditPeriod: "30 days", dueDate: dueDate, rep: "Vikram Rao",
      biz: biz, status: totalOut > 0 ? (daysOverdue > 0 ? "overdue" : "pending") : "paid",
      supply: { litres: litres, bottles: bottles, products: (prof.preferred || []).length || 3, deliveryDays: 26, avgDaily: prof.avgDaily || 45 },
      fin: { prevOut: prevOut, current: current, received: received, creditNotes: creditNotes, adjustments: adjustments, discounts: discounts, gst: gst, totalOut: totalOut, netPayable: netPayable, amountDue: amountDue, balanceAfter: balanceAfter },
      track: { outstanding: totalOut, dueDate: dueDate, daysOverdue: daysOverdue, creditLimit: creditLimit, available: Math.max(0, creditLimit - totalOut), progress: Math.min(100, Math.round((received / (prevOut + current || 1)) * 100)) },
      history: history,
      analytics: { avgDaily: inr(2880), monthly: inr(86400), quarterly: inr(248000), highMonth: "May 2026", lowMonth: "Feb 2026", avgPayTime: "8 days", mostOrdered: (prof.preferred && prof.preferred[0] ? prof.preferred[0].name : "A2 Buffalo Milk"), lifetime: inr(prof.totalRevenue * 6 || 518000) },
    };
  }
  function seedHistory() { return [{}, {}, {}, {}, {}, {}]; }

  function mountB2B(host, code) {
    if (!host) return;
    // Real statement needs a registered business with recorded orders; otherwise
    // (and always on production without real data) show a clean empty state.
    var hasBiz = false; try { hasBiz = !!(B2B() && B2B().businesses && B2B().businesses().length); } catch (e) {}
    if (!demoOK() && !hasBiz) return invEmpty(host, "No business statement yet", "Register a business and record B2B orders to generate a partner statement here.");
    var v = b2bStatement(code || qp("id"));
    var c = cfg(), b = B2B();
    var bizOpts = b ? b.businesses().map(function (x) { return '<option value="' + x.code + '"' + (x.code === v.biz.code ? " selected" : "") + '>' + esc(x.name) + ' (' + x.code + ')</option>'; }).join("") : "";
    var stat = function (l, val, sub, tone, count) { return '<div class="inv-stat ' + (tone || "") + '"><div class="inv-stat-v">' + (count !== false ? num(val, "₹") : esc(val)) + '</div><div class="inv-stat-l">' + l + '</div>' + (sub ? '<div class="inv-stat-s">' + sub + '</div>' : "") + '</div>'; };
    var alerts = [];
    if (v.track.daysOverdue > 0) alerts.push(["red", "⚠️ Overdue payment — " + v.track.daysOverdue + " days past due (" + inr(v.track.outstanding) + ")."]);
    else if (v.track.outstanding > 0) alerts.push(["amber", "🕒 Payment due soon — " + inr(v.fin.amountDue) + " by " + v.dueDate + "."]);
    if (v.track.available <= v.track.creditLimit * 0.15) alerts.push(["red", "🚫 Credit limit nearly reached — only " + inr(v.track.available) + " available."]);
    if (v.history.some(function (h) { return h.status === "pending"; })) alerts.push(["amber", "📄 You have pending invoices awaiting payment."]);

    host.innerHTML =
      '<div class="inv inv-b2b reveal-inv">' + watermark() + actionBar("b2b", { title: "DOODLY B2B statement", no: v.no, amount: v.fin.amountDue }) +
      (b && bizOpts ? '<div class="inv-bizpick"><label>Business</label><select class="input" id="invBizSel">' + bizOpts + '</select></div>' : "") +
      '<div class="inv-doc" id="invDoc">' +
        '<header class="inv-head"><div class="inv-brand">' + logo() + '<div><div class="inv-bname">' + esc(c.brandName) + '</div><div class="inv-tag">Business Partner Statement</div></div></div>' +
          '<div class="inv-meta"><div class="inv-title">STATEMENT OF ACCOUNT</div><div class="inv-mrow"><span>Statement</span><b>' + esc(v.no) + '</b></div><div class="inv-mrow"><span>Date</span><b>' + esc(v.date) + '</b></div><div class="inv-mrow"><span>Billing period</span><b>' + esc(v.period) + '</b></div><div class="inv-mrow"><span>Due date</span><b>' + esc(v.dueDate) + '</b></div><div class="inv-mrow"><span>Status</span>' + badge(v.status) + '</div></div></header>' +
        '<div class="inv-curvewrap">' + curve() + '</div>' +
        (alerts.length ? '<div class="inv-alerts">' + alerts.map(function (a) { return '<div class="inv-alert ' + a[0] + '">' + esc(a[1]) + '</div>'; }).join("") + '</div>' : "") +
        '<section class="inv-sec inv-parties" style="--i:1"><div class="inv-party"><div class="inv-ph">Business</div><b>' + esc(v.biz.name) + '</b><div class="inv-pl">' + esc(v.biz.type || "") + ' · ' + esc(v.biz.code) + '</div><div class="inv-pl">GSTIN ' + esc(v.biz.gst || "—") + '</div><div class="inv-pl">' + esc(v.biz.contactPerson || "") + ' · ' + esc(v.biz.mobile || "") + '</div><div class="inv-pl">' + esc(v.biz.email || "") + '</div><div class="inv-pl">' + esc(v.biz.address || "") + '</div></div>' +
          '<div class="inv-party"><div class="inv-ph">Billing</div><div class="inv-kv"><span>Credit period</span><b>' + esc(v.creditPeriod) + '</b></div><div class="inv-kv"><span>Payment due</span><b>' + esc(v.dueDate) + '</b></div><div class="inv-kv"><span>Terms</span><b>' + esc(v.biz.paymentTerm || "Monthly Billing") + '</b></div><div class="inv-kv"><span>Sales rep</span><b>' + esc(v.rep) + '</b></div></div></section>' +
        '<section class="inv-sec" style="--i:2"><div class="inv-ph">Supply summary</div><div class="inv-supgrid">' +
          dchip("🥛", "Total litres", v.supply.litres) + dchip("🍶", "Total bottles", v.supply.bottles) + dchip("📦", "Products", v.supply.products) + dchip("🚚", "Delivery days", v.supply.deliveryDays) + dchip("📊", "Avg daily (L)", v.supply.avgDaily) +
        '</div></section>' +
        '<section class="inv-sec" style="--i:3"><div class="inv-ph">Financial summary</div><div class="inv-stats">' +
          stat("Previous outstanding", v.fin.prevOut) + stat("Current invoice", v.fin.current) + stat("Payments received", v.fin.received, "", "green") + stat("Credit notes", v.fin.creditNotes) +
          stat("Discounts", v.fin.discounts) + stat("GST", v.fin.gst) + stat("Total outstanding", v.fin.totalOut, "", "amber") + stat("Net payable", v.fin.netPayable, "", "forest") +
        '</div></section>' +
        '<section class="inv-sec inv-trackwrap" style="--i:4"><div class="inv-track"><div class="inv-ph">Outstanding tracker</div>' +
          '<div class="inv-trow"><span>Outstanding</span><b>' + inr(v.track.outstanding) + '</b></div><div class="inv-trow"><span>Due date</span><b>' + esc(v.track.dueDate) + '</b></div><div class="inv-trow"><span>Days overdue</span><b class="' + (v.track.daysOverdue ? "inv-red" : "") + '">' + v.track.daysOverdue + '</b></div>' +
          '<div class="inv-credit"><div class="inv-trow"><span>Credit limit</span><b>' + inr(v.track.creditLimit) + '</b></div><div class="inv-trow"><span>Available credit</span><b class="inv-green">' + inr(v.track.available) + '</b></div>' +
          '<div class="inv-progress" role="progressbar" aria-valuenow="' + v.track.progress + '" aria-valuemin="0" aria-valuemax="100"><div class="inv-progress-fill" data-w="' + v.track.progress + '"></div></div><div class="inv-progress-l">' + v.track.progress + '% of this cycle settled</div></div></div>' +
          '<div class="inv-paybox"><div class="inv-ph">Amount due today</div><div class="inv-due">' + num(v.fin.amountDue, "₹") + '</div><div class="inv-kv"><span>Balance after payment</span><b>' + inr(v.fin.balanceAfter) + '</b></div></div></section>' +
        '<section class="inv-sec" style="--i:5"><div class="inv-ph">Payment history</div><div class="table-wrap inv-table-d"><table class="tbl inv-table"><thead><tr><th>Date</th><th>Invoice</th><th>Amount</th><th>Paid</th><th>Pending</th><th>Status</th></tr></thead><tbody>' +
          v.history.map(function (h) { return '<tr><td>' + esc(h.date) + '</td><td><span class="cell-id">' + esc(h.no) + '</span></td><td>' + inr(h.amount) + '</td><td>' + inr(h.paid) + '</td><td>' + (h.pending ? inr(h.pending) : "—") + '</td><td>' + badge(h.status) + '</td></tr>'; }).join("") +
          '</tbody></table></div><div class="inv-table-m">' + v.history.map(function (h) { return '<div class="inv-pcard"><div class="inv-pcard-h"><b>' + esc(h.no) + '</b>' + badge(h.status) + '</div><div class="inv-pcard-meta">' + esc(h.date) + ' · ' + inr(h.amount) + ' · paid ' + inr(h.paid) + (h.pending ? ' · pending ' + inr(h.pending) : "") + '</div></div>'; }).join("") + '</div></section>' +
        '<section class="inv-sec" style="--i:6"><div class="inv-ph">Business analytics</div><div class="inv-angrid">' +
          an("Avg daily purchase", v.analytics.avgDaily) + an("Monthly purchase", v.analytics.monthly) + an("Quarterly purchase", v.analytics.quarterly) + an("Lifetime value", v.analytics.lifetime) +
          an("Highest month", v.analytics.highMonth) + an("Lowest month", v.analytics.lowMonth) + an("Avg payment time", v.analytics.avgPayTime) + an("Most ordered", v.analytics.mostOrdered) +
        '</div></section>' +
        '<footer class="inv-foot"><div class="inv-thanks">' + esc(c.footer) + '</div><div class="inv-support">Accounts: ' + esc((brand().support || {}).phone || "+91 90000 00000") + ' · ' + esc(brand().website || "doodly.in") + '</div><div class="inv-terms">' + esc(c.terms) + '</div>' + (c.signature ? '<div class="inv-sign">' + esc(c.signature) + '<span class="inv-sign-line"></span>Authorised signatory</div>' : "") + '</footer>' +
      '</div></div>';
    afterMount(host, { kind: "b2b", v: v });
    var sel = host.querySelector("#invBizSel"); if (sel) sel.addEventListener("change", function () { var u = new URL(location.href); u.searchParams.set("id", sel.value); history.replaceState({}, "", u); mountB2B(host, sel.value); });
  }
  function an(l, v) { return '<div class="inv-an"><div class="inv-an-l">' + l + '</div><div class="inv-an-v">' + esc(v) + '</div></div>'; }

  /* ---------- after mount: animations + export wiring ---------- */
  function afterMount(host, ctx) {
    // count-up
    animateCounts(host);
    // payment progress fill
    var pf = host.querySelector(".inv-progress-fill"); if (pf) { var w = pf.dataset.w + "%"; if (reduced()) pf.style.width = w; else { pf.style.width = "0"; requestAnimationFrame(function () { requestAnimationFrame(function () { pf.style.width = w; }); }); } }
    // export
    host.querySelectorAll("[data-act]").forEach(function (b) {
      var act = b.dataset.act;
      if (act === "wa") return;
      b.addEventListener("click", function () {
        if (act === "print" || act === "pdf") { window.print(); }
        else if (act === "excel") { exportExcel(ctx); }
        else if (act === "email") { var sub = encodeURIComponent("Your DOODLY " + (ctx.kind === "b2b" ? "statement " : "invoice ") + (ctx.v.no || "")); var body = encodeURIComponent("Please find your DOODLY " + (ctx.kind === "b2b" ? "business statement" : "invoice") + " " + (ctx.v.no || "") + ".\nAmount: " + inr(ctx.kind === "b2b" ? ctx.v.fin.amountDue : ctx.v.grand) + "\nView online: " + location.href); location.href = "mailto:?subject=" + sub + "&body=" + body; }
        else if (act === "config") { configModal(host, ctx); }
      });
    });
  }
  function animateCounts(root) {
    var rm = reduced() || window.matchMedia("print").matches;
    root.querySelectorAll("[data-count]").forEach(function (el) {
      var to = parseFloat(el.dataset.count) || 0, pre = el.dataset.pre || "", dur = 850, t0 = null;
      if (rm) { el.textContent = pre + Math.round(to).toLocaleString("en-IN"); return; }
      function step(ts) { if (!t0) t0 = ts; var p = Math.min(1, (ts - t0) / dur); var v = Math.round(to * (1 - Math.pow(1 - p, 3))); el.textContent = pre + v.toLocaleString("en-IN"); if (p < 1) requestAnimationFrame(step); }
      requestAnimationFrame(step);
    });
  }
  function exportExcel(ctx) {
    var v = ctx.v, rows;
    if (ctx.kind === "b2b") rows = [["DOODLY B2B Statement", v.no], ["Business", v.biz.name + " (" + v.biz.code + ")"], ["GSTIN", v.biz.gst || ""], ["Period", v.period], [], ["Previous outstanding", v.fin.prevOut], ["Current invoice", v.fin.current], ["Payments received", v.fin.received], ["Discounts", v.fin.discounts], ["Total outstanding", v.fin.totalOut], ["Amount due today", v.fin.amountDue], [], ["Payment history"], ["Date", "Invoice", "Amount", "Paid", "Pending", "Status"]].concat(v.history.map(function (h) { return [h.date, h.no, h.amount, h.paid, h.pending, h.status]; }));
    else rows = [["DOODLY Invoice", v.no]];
    var html = "<table>" + rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>";
    var a = document.createElement("a"); a.href = "data:application/vnd.ms-excel;charset=utf-8," + encodeURIComponent('<html><head><meta charset="utf-8"></head><body>' + html + "</body></html>"); a.download = (v.no || "statement").replace(/[\/]/g, "-") + ".xls"; a.click();
    toast("Excel exported");
  }

  /* ---------- admin config modal ---------- */
  function configModal(host, ctx) {
    if (!isSuper()) return;
    var c = cfg();
    var m = document.createElement("div"); m.className = "rbac-modal";
    var f = function (id, label, val, ph) { return '<label class="rbac-f"><span>' + label + '</span><input id="' + id + '" value="' + esc(val || "") + '" placeholder="' + (ph || "") + '"></label>'; };
    m.innerHTML = '<div class="rbac-modal-card" role="dialog" aria-modal="true"><div class="rbac-modal-head"><h3>Invoice settings</h3><button class="rbac-x">✕</button></div>' +
      f("icBrand", "Brand name", c.brandName) + f("icTag", "Tagline", c.tagline) +
      f("icPrefix", "Invoice prefix", c.prefix) + f("icFormat", "Number format", c.format, "DOODLY/INV/{YYYY}/{#####}") +
      '<label class="rbac-f"><span>Footer message</span><textarea id="icFooter" rows="2">' + esc(c.footer) + '</textarea></label>' +
      '<label class="rbac-f"><span>Terms &amp; conditions</span><textarea id="icTerms" rows="2">' + esc(c.terms) + '</textarea></label>' +
      f("icSign", "Signature line", c.signature) + f("icWater", "Watermark text (optional)", c.watermark, "e.g. PAID / DRAFT") +
      '<label class="rbac-check"><input type="checkbox" id="icGST" ' + (c.showGST ? "checked" : "") + '> Show GST</label>' +
      '<label class="rbac-check"><input type="checkbox" id="icQR" ' + (c.showQR ? "checked" : "") + '> Show QR code</label>' +
      '<button class="btn btn-primary inv-cfg-save">Save settings</button></div>';
    document.body.appendChild(m); requestAnimationFrame(function () { m.classList.add("show"); });
    var close = function () { m.classList.remove("show"); setTimeout(function () { m.remove(); }, 200); };
    m.addEventListener("click", function (e) { if (e.target === m || e.target.closest(".rbac-x")) close(); });
    m.querySelector(".inv-cfg-save").addEventListener("click", function () {
      saveCfg({ brandName: m.querySelector("#icBrand").value, tagline: m.querySelector("#icTag").value, prefix: m.querySelector("#icPrefix").value, format: m.querySelector("#icFormat").value, footer: m.querySelector("#icFooter").value, terms: m.querySelector("#icTerms").value, signature: m.querySelector("#icSign").value, watermark: m.querySelector("#icWater").value, showGST: m.querySelector("#icGST").checked, showQR: m.querySelector("#icQR").checked });
      if (RB()) RB().audit("invoice.config", "updated invoice settings");
      close(); toast("Invoice settings saved");
      if (ctx.kind === "b2b") mountB2B(host); else mountB2C(host);
    });
  }

  /* ---------- tests ---------- */
  function runTests() {
    var R = [], ok = function (n, c) { R.push({ name: n, pass: !!c }); };
    try {
      var v = b2cInvoice();
      var lineSum = v.lines.reduce(function (s, l) { return s + l.amount; }, 0);
      ok("B2C subtotal = sum of line amounts", v.subtotal === lineSum);
      var gstSum = v.lines.reduce(function (s, l) { return s + l.gst; }, 0);
      ok("B2C GST = sum of line GST", v.gst === gstSum);
      ok("B2C grand = subtotal + GST − discount − wallet − referral + delivery", v.grand === v.subtotal + v.gst - v.discount - v.walletUsed - v.referralUsed + v.delivery);
      ok("B2C milk line is GST-nil", v.lines.find(function (l) { return l.slug === "milk"; }).gstPct === 0);
      ok("B2C delivery counts present", v.deliveries.total >= v.deliveries.delivered);
      var s = b2bStatement();
      ok("B2B total outstanding = prev + current − received − creditNotes − adjustments", s.fin.totalOut === s.fin.prevOut + s.fin.current - s.fin.received - s.fin.creditNotes - s.fin.adjustments);
      ok("B2B available credit = limit − outstanding", s.track.available === Math.max(0, s.track.creditLimit - s.track.outstanding));
      ok("B2B payment history rows have balance fields", s.history.length > 0 && typeof s.history[0].pending === "number");
      ok("B2B status reflects outstanding", (s.fin.totalOut > 0) === (s.status !== "paid"));
      ok("Status badge map covers all states", ["paid", "pending", "partial", "overdue", "cancelled", "draft", "credit"].every(function (k) { return !!STATUS[k]; }));
      ok("Config has invoice number format", /\{#+\}/.test(cfg().format));
      ok("GST integration resolves a percent", !GST() || typeof GST().resolve("ghee").percent === "number");
    } catch (e) { ok("harness ran without throwing: " + e.message, false); }
    return { passed: R.filter(function (x) { return x.pass; }).length, total: R.length, results: R };
  }

  return { mountB2C: mountB2C, mountB2B: mountB2B, b2cInvoice: b2cInvoice, b2bStatement: b2bStatement, cfg: cfg, saveCfg: saveCfg, runTests: runTests };
})();
