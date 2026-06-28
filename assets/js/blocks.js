/* =============================================================
   DOODLY — Reusable content-block renderers
   A small library of pure functions: each takes a block spec and
   returns an HTML string. layout.js renders a route's recipe by
   mapping its blocks through here. Adding a page = composing blocks.
   ============================================================= */
window.DOODLY_BLOCKS = (function () {
  const D = () => window.DOODLY;
  const M = () => window.DOODLY_DATA;
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

  /* ---------- Icons ---------- */
  const ICONS = {
    leaf:'<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    snow:'<path d="M12 2v20M4 6l16 12M20 6 4 18M2 12h20"/>',
    bottle:'<path d="M9 2h6M10 2v3.5L8.2 8A4 4 0 0 0 8 9.6V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9.6A4 4 0 0 0 15.8 8L14 5.5V2"/><path d="M8 13h8"/>',
    shield:'<path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
    drop:'<path d="M12 2.7C12 2.7 5 9.5 5 14a7 7 0 0 0 14 0c0-4.5-7-11.3-7-11.3Z"/>',
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    truck:'<path d="M3 5h11v11H3zM14 9h4l3 3v4h-7"/><circle cx="7.5" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
    gift:'<rect x="3" y="8" width="18" height="13" rx="1.5"/><path d="M12 8v13M3 12h18M12 8S9 2 6.5 4 9 8 12 8Zm0 0s3-6 5.5-4S15 8 12 8Z"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/>',
    users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 4-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 5.5a3.5 3.5 0 0 1 0 6.8M22 20c-.6-2.4-2-4-3.7-4.8"/>',
    home:'<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>',
    box:'<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
    wallet:'<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M17 14h.01"/>',
    bell:'<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    map:'<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
    route:'<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8 18h6a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h2"/>',
    chart:'<path d="M4 4v16h16"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
    file:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
    tag:'<path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9Z"/><circle cx="8" cy="8" r="1.5"/>',
    star:'<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/>',
    check:'<path d="m4 12 5 5L20 6"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    phone:'<path d="M4 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L18 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 4 6 2 2 0 0 1 4 4Z"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    pin:'<path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
    card:'<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
    refresh:'<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
    pause:'<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>',
    play:'<path d="M7 4v16l13-8Z"/>',
    download:'<path d="M12 3v12M7 11l5 5 5-5M5 21h14"/>',
    edit:'<path d="M4 20h4L20 8l-4-4L4 16Z"/><path d="m14 6 4 4"/>',
    trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    x:'<path d="M6 6l12 12M18 6 6 18"/>',
    alert:'<path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
    percent:'<path d="M5 19 19 5"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
    award:'<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>',
    msg:'<path d="M4 5h16v11H9l-5 4Z"/><path d="M8 9h8M8 12h5"/>',
    lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    beaker:'<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 14h9"/>',
    factory:'<path d="M3 21V10l6 4V10l6 4V7l6 3v11Z"/><path d="M7 21v-4M12 21v-4M17 21v-4"/>',
    sprout:'<path d="M12 22V11M12 11C12 8 9 5 3 6c0 4 4 6 9 5ZM12 11c0-3 3-6 9-5 0 4-4 6-9 5Z"/>',
    coins:'<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3"/><path d="M15 12c2.8.2 6 1.3 6 3s-3 3-6 3-6-1.3-6-3"/>',
    receipt:'<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2Z"/><path d="M9 8h6M9 12h6"/>',
    heart:'<path d="M12 21S4 13.5 4 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8 2.5C20 13.5 12 21 12 21Z"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    clipboard:'<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h4"/>',
    pkg:'<path d="M16 3 21 6v12l-9 4-9-4V6l9-4Z"/><path d="m3 6 9 4 9-4M12 10v12"/>',
    fire:'<path d="M12 2s5 5 5 9a5 5 0 0 1-10 0c0-1.5.6-2.8 1.4-3.7C9 9 9 11 11 11c0-3 1-6 1-9Z"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    dollar:'<path d="M12 2v20M16 6.5C16 4.5 14.2 3.5 12 3.5S8 4.6 8 7s2 3 4 3.5 4 1.2 4 3.5-1.8 3.5-4 3.5-4-1-4-3"/>',
  };
  const icon = (name, size = 22) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.box}</svg>`;

  /* ---------- Glass bottle SVG (fill scales with ml) ---------- */
  function bottle(ml, w = 90) {
    const frac = ml >= 1000 ? 0.92 : ml >= 500 ? 0.64 : 0.44;
    const bodyTop = 30, bodyBot = 150, bodyH = bodyBot - bodyTop;
    const fillTop = bodyBot - bodyH * frac;
    return `
    <svg width="${w}" viewBox="0 0 100 170" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${ml} ml glass bottle">
      <defs>
        <linearGradient id="milkG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eafff3"/></linearGradient>
        <clipPath id="bClip"><path d="M34 ${bodyTop} h32 v8 l6 10 a10 10 0 0 1 4 8 v${bodyH-24} a8 8 0 0 1 -8 8 h-36 a8 8 0 0 1 -8 -8 v${bodyH-24} a10 10 0 0 1 4 -8 l6 -10 Z"/></clipPath>
      </defs>
      <rect x="36" y="8" width="28" height="16" rx="5" fill="#1FAE66"/>
      <rect x="40" y="20" width="20" height="8" rx="2" fill="#15533E"/>
      <path d="M34 ${bodyTop} h32 v8 l6 10 a10 10 0 0 1 4 8 v${bodyH-24} a8 8 0 0 1 -8 8 h-36 a8 8 0 0 1 -8 -8 v${bodyH-24} a10 10 0 0 1 4 -8 l6 -10 Z" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.7)" stroke-width="2"/>
      <g clip-path="url(#bClip)"><rect x="20" y="${fillTop}" width="60" height="${bodyBot}" fill="url(#milkG)"/><ellipse cx="50" cy="${fillTop}" rx="22" ry="4" fill="#ffffff" opacity="0.9"/></g>
      <rect x="40" y="46" width="6" height="${bodyH-50}" rx="3" fill="rgba(255,255,255,0.5)"/>
    </svg>`;
  }

  /* ---------- small helpers ---------- */
  const badge = (b) => b ? `<span class="badge ${b[0]}">${b[1]}</span>` : "";
  // centralized availability badges (single source of truth — DOODLY_STATUS)
  const ST = () => window.DOODLY_STATUS;
  const statusOf = (e, opts) => ST() ? ST().compute(e, opts) : { key:"available", label:"Available", orderable:true, available:true };
  const statusBadge = (e, opts) => ST() ? ST().badgeFor(e, opts) : "";
  const badgeObj = (s, opts) => ST() ? ST().badge(s, opts) : "";
  const userCell = (initials, name, sub) =>
    `<span class="cell-user"><span class="av">${initials}</span><span><span class="strong">${name}</span>${sub?`<br><small class="muted">${sub}</small>`:""}</span></span>`;
  // action buttons: real links when an href is given, otherwise functional <button>s
  // (export → CSV of the page's table; others → toast feedback) — never dead "#".
  const btn = (a) => a.href
    ? `<a class="btn ${a.kind||"btn-ghost"}" href="${a.href}">${a.icon?icon(a.icon,16):""}${a.label}</a>`
    : `<button type="button" class="btn ${a.kind||"btn-ghost"} js-headaction" data-action="${a.label}">${a.icon?icon(a.icon,16):""}${a.label}</button>`;

  /* =============================================================
     TABLE registry — dataset -> {title, cols, row}
     ============================================================= */
  const TABLES = {
    orders: { title:"Order history", cols:["Order","Date","Items","Amount","Status"],
      row:(r)=>[`<span class="cell-id">${r.id}</span>`, r.date, r.item, `<span class="strong">${inr(r.amount)}</span>`, badge(r.status)] },
    deliveries: { title:"Deliveries", cols:["ID","Date","Time","Item","Driver","Status"],
      row:(r)=>[`<span class="cell-id">${r.id}</span>`, r.date, r.time, r.item, r.driver, badge(r.status)] },
    bottleLedger: { title:"Bottle ledger", cols:["Date","Type","Qty","Note","Balance"],
      row:(r)=>[r.date, badge(r.type), `<span class="strong">${r.qty}</span>`, r.note, r.bal] },
    wallet: { title:"Transactions", cols:["Date","Description","Amount"],
      row:(r)=>[r.date, r.desc, `<span class="strong" style="color:${r.credit?'var(--leaf-600)':'var(--ink)'}">${r.amount}</span>`] },
    invoices: { title:"Invoices", cols:["Invoice","Date","Amount","Tax","Status",""],
      row:(r)=>[`<span class="cell-id">${r.id}</span>`, r.date, `<span class="strong">${inr(r.amount)}</span>`, r.gst, badge(r.status), `<button class="link js-invoice-dl" data-inv="${r.id}" data-date="${r.date}" data-amt="${r.amount}" data-gst="${r.gst}" aria-label="Download invoice ${r.id}">${icon("download",16)}</button>`] },
    referrals: { title:"Your referrals", cols:["Friend","Date","Status","Reward"],
      row:(r)=>[r.name, r.date, badge(r.status), `<span class="strong">${r.reward}</span>`] },
    tickets: { title:"Support tickets", cols:["Ticket","Subject","Date","Status"],
      row:(r)=>[`<span class="cell-id">${r.id}</span>`, r.subject, r.date, badge(r.status)] },
    customers: { title:"Customers", cols:["ID","Customer","Area","Plan","Since","Status"],
      row:(r)=>[`<span class="cell-id">${r.id}</span>`, userCell(r.initials,r.name), r.area, r.plan, r.since, badge(r.status)] },
    adminOrders: { title:"Orders", cols:["Order","Customer","Items","Amount","Payment","Status"],
      row:(r)=>[`<span class="cell-id">${r.id}</span>`, r.cust, r.item, `<span class="strong">${inr(r.amount)}</span>`, badge(r.pay), badge(r.status)] },
    drivers: { title:"Delivery executives", cols:["ID","Driver","Zone","Progress","Rating","Status"],
      row:(r)=>[`<span class="cell-id">${r.id}</span>`, userCell(r.initials,r.name), r.zone, `${r.done}/${r.stops} stops`, `${r.rating}★`, badge(r.status)] },
    routes: { title:"Routes", cols:["Route","Zone","Driver","Stops","Milk","Status"],
      row:(r)=>[`<span class="cell-id">${r.id}</span>`, r.zone, r.driver, r.stops, r.litres, badge(r.status)] },
    farmers: { title:"Farmers", cols:["ID","Farm","Owner","Village","Supply","Fat","Status"],
      row:(r)=>[`<span class="cell-id">${r.id}</span>`, `<span class="strong">${r.name}</span>`, r.owner, r.village, r.litres, r.fat, badge(r.status)] },
    procurement: { title:"Milk procurement (today)", cols:["Date","Farm","Litres","Fat","SNF","Rate","Amount","QC"],
      row:(r)=>[r.date, r.farm, r.litres, r.fat, r.snf, r.rate, `<span class="strong">${inr(r.amount)}</span>`, badge(r.qc)] },
    quality: { title:"Quality tests", cols:["Batch","Farm","Fat","SNF","Temp","Result"],
      row:(r)=>[`<span class="cell-id">${r.batch}</span>`, r.farm, r.fat, r.snf, r.temp, badge(r.result)] },
    inventory: { title:"Inventory", cols:["SKU","Item","Stock","Reorder at","Status"],
      row:(r)=>[`<span class="cell-id">${r.sku}</span>`, r.item, `<span class="strong">${r.stock}</span>`, r.reorder, badge(r.status)] },
    payments: { title:"Payments", cols:["Payment ID","Customer","Method","Amount","Status","Date"],
      row:(r)=>[`<span class="cell-id">${r.id}</span>`, r.cust, r.method, `<span class="strong">${inr(r.amount)}</span>`, badge(r.status), r.date] },
    coupons: { title:"Coupons", cols:["Code","Description","Usage","Status",""],
      row:(r)=>[`<span class="cell-id">${r.code}</span>`, r.desc, r.uses, badge(r.status), `<a class="link" href="/admin/coupons.html" aria-label="Edit coupon ${r.code}">${icon("edit",16)}</a>`] },
    adminTickets: { title:"Support tickets", cols:["Ticket","Customer","Subject","Priority","Status"],
      row:(r)=>[`<span class="cell-id">${r.id}</span>`, r.cust, r.subject, badge(r.pri), badge(r.status)] },
    audit: { title:"Audit log", cols:["User","Action","Time","IP"],
      row:(r)=>[r.who, r.act, r.time, `<span class="cell-id">${r.ip}</span>`] },
    driverStops: { title:"Today's stops", cols:["#","Customer","Address","Item","Payment","Status"],
      row:(r)=>[`<span class="strong">${r.seq}</span>`, r.cust, `<span class="muted-sm">${r.addr}</span>`, r.item, r.pay, badge(r.status)] },
    driverCompleted: { title:"Completed days", cols:["Date","Stops","Cash","Bottles","Rating"],
      row:(r)=>[r.date, r.stops, `<span class="strong">${r.cash}</span>`, r.bottles, `${r.rating}★`] },
  };

  /* =============================================================
     BLOCK RENDERERS
     ============================================================= */
  const R = {};

  R.pageHead = (s) => `
    <div class="page-head reveal">
      <div><div class="ph-title">${s.title}</div>${s.sub?`<p class="ph-sub">${s.sub}</p>`:""}</div>
      ${s.actions?`<div class="ph-actions">${s.actions.map(btn).join("")}</div>`:""}
    </div>`;

  R.innerHero = (s) => `
    <header class="inner-hero">
      <div class="wrap">
        ${s.eyebrow?`<span class="eyebrow">${s.eyebrow}</span>`:""}
        <h1>${s.title}</h1>
        ${s.text?`<p>${s.text}</p>`:""}
        ${s.actions?`<div class="hero-cta" style="margin-top:22px">${s.actions.map(btn).join("")}</div>`:""}
      </div>
    </header>`;

  R.prose = (s) => `<div class="prose reveal">${s.lede?`<p class="lede">${s.lede}</p>`:""}${(s.sections||[]).map(sec=>`
      ${sec.h?`<h2>${sec.h}</h2>`:""}${(sec.p||[]).map(p=>`<p>${p}</p>`).join("")}
      ${sec.bullets?`<ul class="bullets">${sec.bullets.map(b=>`<li>${b}</li>`).join("")}</ul>`:""}`).join("")}</div>`;

  // Premium policy document (Shipping, Refund, …) with an animated, themed header.
  // `s.illus` selects the header animation: "delivery" | "refund".
  R.policyDoc = (s) => {
    const b = (window.DOODLY && window.DOODLY.brand) || {};
    const sup = b.support || {}, co = b.company || {};
    const phone = sup.phone || "+91 91177 99143";
    const email = sup.email || "doodlyoffl@gmail.com";
    const addr = co.address || "Vijayawada, Andhra Pradesh";
    const ILLUS = {};
    ILLUS.delivery = `
      <svg class="sv-svg" viewBox="0 0 760 150" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A DOODLY van delivering fresh milk along its route">
        <rect x="0" y="124" width="760" height="26" fill="#eafaf0"/>
        <line class="sv-dash" x1="36" y1="124" x2="724" y2="124" stroke="#8FE3B5" stroke-width="3" stroke-linecap="round"/>
        <g transform="translate(30 88)"><rect x="0" y="8" width="26" height="34" rx="4" fill="#cfe8da" stroke="#1FAE66" stroke-width="2"/><rect x="4" y="0" width="18" height="8" rx="2" fill="#1FAE66"/><rect x="2" y="17" width="22" height="4" fill="#9ed7b6"/></g>
        <g transform="translate(688 80)"><path d="M0 18 L18 2 L36 18 Z" fill="#1FAE66"/><rect x="5" y="18" width="26" height="24" rx="2" fill="#cfe8da" stroke="#1FAE66" stroke-width="2"/><rect x="14" y="28" width="8" height="14" fill="#1FAE66"/></g>
        <g class="sv-bottle" transform="translate(366 44)"><path d="M6 0 h8 v4 l3 5 a5 5 0 0 1 2 4 v22 a4 4 0 0 1 -4 4 h-11 a4 4 0 0 1 -4 -4 v-22 a5 5 0 0 1 2 -4 l3 -5 Z" fill="#ffffff" stroke="#1FAE66" stroke-width="1.6"/><rect x="7" y="-3" width="6" height="4" rx="1.5" fill="#1FAE66"/></g>
        <g class="sv-van"><g transform="translate(0 84)">
          <rect x="0" y="0" width="58" height="30" rx="5" fill="#ffffff" stroke="#1FAE66" stroke-width="2"/>
          <path d="M58 6 h14 l12 12 v12 h-26 Z" fill="#ffffff" stroke="#1FAE66" stroke-width="2"/>
          <rect x="62" y="9" width="11" height="9" rx="2" fill="#cfeede"/>
          <rect x="0" y="12" width="58" height="5" fill="#1FAE66"/>
          <text x="7" y="26" font-size="9" font-weight="800" fill="#1FAE66" font-family="system-ui, sans-serif">DOODLY</text>
          <g transform="translate(17 36)"><g class="sv-wheel"><circle r="7" fill="#2b3a33"/><circle r="3" fill="#cdd6d1"/><line x1="0" y1="-6" x2="0" y2="6" stroke="#cdd6d1" stroke-width="1.4"/></g></g>
          <g transform="translate(67 36)"><g class="sv-wheel"><circle r="7" fill="#2b3a33"/><circle r="3" fill="#cdd6d1"/><line x1="0" y1="-6" x2="0" y2="6" stroke="#cdd6d1" stroke-width="1.4"/></g></g>
        </g></g>
      </svg>`;
    ILLUS.refund = `
      <svg class="rf-svg" viewBox="0 0 760 168" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DOODLY returns and refunds — bottles back, money back">
        <ellipse cx="380" cy="90" rx="150" ry="66" fill="#eafaf0"/>
        <g class="rf-ring">
          <circle cx="380" cy="90" r="50" stroke="#8FE3B5" stroke-width="3" stroke-dasharray="7 9" fill="none"/>
          <path d="M380 40 l-9 -6 m9 6 l-6 9" stroke="#1FAE66" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M380 140 l9 6 m-9 -6 l6 -9" stroke="#1FAE66" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <g transform="translate(367 66)"><g class="rf-bottle"><path d="M6 0 h8 v4 l3 5 a5 5 0 0 1 2 4 v22 a4 4 0 0 1 -4 4 h-11 a4 4 0 0 1 -4 -4 v-22 a5 5 0 0 1 2 -4 l3 -5 Z" fill="#ffffff" stroke="#1FAE66" stroke-width="1.8"/><rect x="7" y="-3" width="6" height="4" rx="1.5" fill="#1FAE66"/></g></g>
        <g transform="translate(474 54)"><g class="rf-coin"><circle r="17" fill="#FBF0D9" stroke="#E8B864" stroke-width="2"/><text x="0" y="6" text-anchor="middle" font-size="17" font-weight="800" fill="#b5851f" font-family="system-ui, sans-serif">₹</text></g></g>
        <g transform="translate(262 60)"><g class="rf-coin" style="animation-delay:.7s"><path d="M0 0 l2.4 6 6 2.4 -6 2.4 -2.4 6 -2.4 -6 -6 -2.4 6 -2.4Z" fill="#8FE3B5"/></g></g>
      </svg>`;
    ILLUS.terms = `
      <svg class="tc-svg" viewBox="0 0 760 168" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DOODLY terms and conditions — read, understood and agreed">
        <ellipse cx="380" cy="90" rx="150" ry="66" fill="#eafaf0"/>
        <g transform="translate(330 38)"><g class="tc-doc">
          <rect x="0" y="0" width="100" height="94" rx="8" fill="#ffffff" stroke="#1FAE66" stroke-width="2"/>
          <rect x="14" y="16" width="58" height="6" rx="3" fill="#1FAE66"/>
          <rect x="14" y="32" width="72" height="4" rx="2" fill="#cfe8da"/>
          <rect x="14" y="44" width="72" height="4" rx="2" fill="#cfe8da"/>
          <rect x="14" y="56" width="72" height="4" rx="2" fill="#cfe8da"/>
          <rect x="14" y="68" width="46" height="4" rx="2" fill="#cfe8da"/>
        </g></g>
        <g transform="translate(426 122)"><g class="tc-seal"><circle r="18" fill="#1FAE66"/><path d="M-7 0 l5 6 l9 -12" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g></g>
        <g transform="translate(268 58)"><g class="rf-coin"><path d="M0 0 l2.4 6 6 2.4 -6 2.4 -2.4 6 -2.4 -6 -6 -2.4 6 -2.4Z" fill="#8FE3B5"/></g></g>
      </svg>`;
    ILLUS.privacy = `
      <svg class="pv-svg" viewBox="0 0 760 168" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DOODLY privacy — your information, protected">
        <ellipse cx="380" cy="90" rx="150" ry="66" fill="#eafaf0"/>
        <g transform="translate(380 90)">
          <circle class="pv-ring" r="46" fill="none" stroke="#8FE3B5" stroke-width="3"/>
          <circle class="pv-ring pv-ring-2" r="46" fill="none" stroke="#8FE3B5" stroke-width="3"/>
        </g>
        <g transform="translate(346 44)"><g class="pv-shield">
          <path d="M34 0 l34 12 v22 c0 26 -18 40 -34 48 c-16 -8 -34 -22 -34 -48 v-22 Z" fill="#ffffff" stroke="#1FAE66" stroke-width="2.4"/>
          <rect x="22" y="42" width="24" height="20" rx="4" fill="#1FAE66"/>
          <path d="M26 42 v-6 a8 8 0 0 1 16 0 v6" fill="none" stroke="#1FAE66" stroke-width="3"/>
          <circle cx="34" cy="50" r="3" fill="#ffffff"/>
        </g></g>
        <g transform="translate(266 58)"><g class="rf-coin"><path d="M0 0 l2.4 6 6 2.4 -6 2.4 -2.4 6 -2.4 -6 -6 -2.4 6 -2.4Z" fill="#8FE3B5"/></g></g>
      </svg>`;
    const header = ILLUS[s.illus] || "";
    const contactCard = `
      <div class="ps-contact">
        <p class="psc-name">DOODLY Customer Support</p>
        <p><span class="psc-k">Phone</span><a href="tel:${phone.replace(/\s/g, "")}" aria-label="Call DOODLY Customer Support">${phone}</a></p>
        <p><span class="psc-k">Email</span><a href="mailto:${email}?subject=${encodeURIComponent(sup.emailSubject || "DOODLY Customer Support")}" aria-label="Email DOODLY Support">${email}</a></p>
        <p><span class="psc-k">Address</span><span>${addr}</span></p>
      </div>`;
    const section = (x) => `
      <li class="policy-sec reveal">
        <div class="ps-num">${x.n}</div>
        <div class="ps-body">
          <h2>${x.h}</h2>
          ${(x.p || []).map(p => `<p>${p}</p>`).join("")}
          ${x.list ? `<ul class="ps-list">${x.list.map(li => `<li>${li}</li>`).join("")}</ul>` : ""}
          ${(x.subs || []).map(sub => `<div class="ps-subsec"><h3 class="ps-sub">${sub.h}</h3>${(sub.p || []).map(p => `<p>${p}</p>`).join("")}${sub.list ? `<ul class="ps-list">${sub.list.map(li => `<li>${li}</li>`).join("")}</ul>` : ""}</div>`).join("")}
          ${(x.after || []).map(p => `<p>${p}</p>`).join("")}
          ${x.contact ? contactCard : ""}
        </div>
      </li>`;
    return `
      <section class="policy"><div class="wrap">
        ${header ? `<div class="policy-illus reveal" aria-hidden="true">${header}</div>` : ""}
        ${s.updated ? `<p class="policy-updated reveal">${s.updated}</p>` : ""}
        ${s.intro ? `<p class="policy-lede reveal">${s.intro}</p>` : ""}
        <ol class="policy-sections">${(s.sections || []).map(section).join("")}</ol>
        ${s.foot ? `<p class="policy-foot reveal">${s.foot}</p>` : ""}
      </div></section>`;
  };

  R.kpis = (s) => {
    const items = s.items || (M()[s.dataset] || []);
    return `<div class="kpi-row reveal">${items.map(k=>`
      <div class="kpi"><div class="n">${k.n}</div><div class="l">${k.l}</div>
      ${k.delta?`<div class="delta ${k.up===false?"down":"up"}">${k.up===false?"▼":"▲"} ${k.delta}</div>`:""}</div>`).join("")}</div>`;
  };

  R.cardGrid = (s) => `
    <div class="grid-cards cols-${s.cols||3} reveal">${s.cards.map(c=>`
      <a class="tile" href="${c.href||"#"}" style="display:block">
        ${c.ic?`<div class="qa-tile" style="all:unset"><div class="feature" style="padding:0;box-shadow:none;border:none;background:none"><div class="ic">${icon(c.ic)}</div></div></div>`:""}
        <h4>${c.title}</h4><p>${c.text||""}</p>
        ${c.link?`<div class="mt-1 hl" style="font-size:.85rem;font-weight:700">${c.link} →</div>`:""}
      </a>`).join("")}</div>`;

  R.quickActions = (s) => `
    <div class="qa-row reveal">${s.items.map(a=>`
      <a class="qa-tile" href="${a.href||"#"}"><div class="ic">${icon(a.ic)}</div><div class="t">${a.t}</div><div class="s">${a.s||""}</div></a>`).join("")}</div>`;

  R.table = (s) => {
    const cfg = TABLES[s.dataset]; if (!cfg) return "";
    const rows = M()[s.dataset] || [];
    const head = `<tr>${cfg.cols.map(c=>`<th>${c}</th>`).join("")}</tr>`;
    const body = rows.map(r=>`<tr>${cfg.row(r).map(c=>`<td>${c}</td>`).join("")}</tr>`).join("");
    return `
      <div class="reveal">
        ${s.toolbar!==false?`<div class="toolbar">
          <div class="search-box grow">${icon("search")}<input class="input" placeholder="Search ${cfg.title.toLowerCase()}…"></div>
          ${(s.filters||["All"]).length?`<div class="seg">${(s.filters||["All","Active","Archived"]).map((f,i)=>`<button class="${i===0?"active":""}">${f}</button>`).join("")}</div>`:""}
          <select class="select"><option>Sort: Newest</option><option>Oldest</option><option>A–Z</option></select>
        </div>`:""}
        <div class="table-wrap">
          <table class="tbl"><thead>${head}</thead><tbody>${body}</tbody></table>
        </div>
        ${s.pager!==false?`<div class="pager"><span class="meta">Showing ${rows.length} of ${rows.length*4}</span>
          <div class="pages"><span class="pg">‹</span><span class="pg active">1</span><span class="pg">2</span><span class="pg">3</span><span class="pg">›</span></div></div>`:""}
      </div>`;
  };

  R.timeline = (s) => {
    const items = s.items || (M()[s.dataset] || []);
    return `<div class="panel panel-pad reveal"><div class="timeline">${items.map(i=>`
      <div class="tl-item ${i.state||""}"><span class="dot">${i.state==="done"?icon("check",12):""}</span>
      <div class="tl-t">${i.t}</div><div class="tl-s">${i.s||""}</div></div>`).join("")}</div></div>`;
  };

  R.tabs = (s) => `<div class="tabs reveal">${s.items.map((t,i)=>`<button class="${i===0?"active":""}">${t}</button>`).join("")}</div>`;

  R.faq = (s) => {
    const items = s.items || D().faqs;
    return `<div class="faq reveal" id="${s.id||"faqList"}">${items.map(f=>`
      <div class="qa"><button aria-expanded="false">${f.q}<span class="plus">+</span></button>
      <div class="ans"><p>${f.a}</p></div></div>`).join("")}</div>`;
  };

  R.state = (s) => {
    const kind = s.kind || "empty";
    return `<div class="state ${kind==="error"?"error":""} reveal">
      ${kind==="loading"?'<div class="spinner"></div>':`<div class="ic">${icon(s.icon||(kind==="error"?"shield":"box"))}</div>`}
      <h3>${s.title||(kind==="error"?"Something went wrong":"Nothing here yet")}</h3>
      <p>${s.text||""}</p>
      ${s.action?btn(s.action):""}
    </div>`;
  };

  R.skeleton = () => `<div class="panel panel-pad reveal"><div class="sk-line skeleton w40"></div><div class="sk-line skeleton w80"></div><div class="sk-line skeleton"></div><div class="sk-line skeleton w60"></div></div>`;

  R.form = (s) => `
    <div class="panel panel-pad reveal" style="max-width:${s.width||"720px"}">
      ${s.title?`<h3 style="font-family:'Fraunces',serif;color:var(--forest);font-size:1.2rem;margin-bottom:6px">${s.title}</h3>`:""}
      ${s.sub?`<p class="muted-sm" style="margin-bottom:18px">${s.sub}</p>`:""}
      <div class="form-grid ${s.cols===2?"two":""}">${s.fields.map(f=>`
        <div class="field ${f.full?"full":""}">
          <label>${f.label}</label>
          ${f.type==="textarea"?`<textarea placeholder="${f.placeholder||""}"></textarea>`
            :f.type==="select"?`<select>${(f.options||[]).map(o=>`<option>${o}</option>`).join("")}</select>`
            :`<input type="${f.type||"text"}" placeholder="${f.placeholder||""}">`}
          ${f.hint?`<span class="hint">${f.hint}</span>`:""}
        </div>`).join("")}</div>
      ${s.check?`<label class="check mt-2"><input type="checkbox"> ${s.check}</label>`:""}
      <div class="mt-2"><button class="btn btn-primary">${s.submit||"Save changes"}</button>${s.cancel?`<button class="btn btn-ghost" style="margin-left:8px">Cancel</button>`:""}</div>
    </div>`;

  R.feed = (s) => {
    const items = s.items || (M()[s.dataset] || []);
    return `<div class="panel panel-pad reveal"><div class="feed">${items.map(i=>`
      <div class="item ${i.unread?"unread":""}"><div class="ic">${icon(i.ic||"bell")}</div>
      <div><div class="t">${i.t}</div><div class="s">${i.s||""}</div></div></div>`).join("")}</div></div>`;
  };

  R.bars = (s) => {
    const items = M()[s.dataset] || [];
    return `<div class="panel panel-pad reveal"><div class="panel-head" style="padding:0 0 14px;border:none"><h3>${s.title||"Revenue (7 days)"}</h3><span class="badge green">+12.4%</span></div>
      <div class="bars">${items.map(b=>`<div class="bar" style="height:${b.v}%"><span>${b.l}</span></div>`).join("")}</div></div>`;
  };

  R.donut = (s) => `
    <div class="panel panel-pad reveal" style="text-align:center">
      <div class="panel-head" style="padding:0 0 14px;border:none"><h3>${s.title||"Plan mix"}</h3></div>
      <div class="donut" style="background:conic-gradient(var(--leaf) 0 ${s.pct||62}%, var(--mint) ${s.pct||62}% ${(s.pct||62)+24}%, var(--gold) ${(s.pct||62)+24}% 100%)">
        <div class="hole"><div><div class="n">${s.center||"62%"}</div><div class="l">${s.label||"30-day"}</div></div></div>
      </div>
      <div class="chart-legend" style="justify-content:center">${(s.legend||["30-day plan","90-day plan","7-day plan"]).map((l,i)=>`<span>● ${l}</span>`).join("")}</div>
    </div>`;

  R.split = (s) => `
    <div class="split ${s.rev?"rev":""} reveal">
      <div><span class="eyebrow">${s.eyebrow||""}</span>
        <h2 class="display" style="font-size:1.9rem;margin-top:10px">${s.title}</h2>
        ${(s.p||[]).map(p=>`<p class="lead" style="margin-top:14px">${p}</p>`).join("")}
        ${s.bullets?`<ul class="bullets mt-2">${s.bullets.map(b=>`<li>${b}</li>`).join("")}</ul>`:""}
        ${s.action?`<div class="mt-2">${btn(s.action)}</div>`:""}
      </div>
      <div class="media-card"><div><div class="big">${s.media||"🥛"}</div>${s.mediaLabel?`<div class="display" style="font-size:1.3rem;margin-top:10px">${s.mediaLabel}</div>`:""}</div></div>
    </div>`;

  R.notice = (s) => `<div class="notice ${s.warn?"warn":""} reveal">${icon(s.icon||"shield",18)}<div>${s.text}</div></div>`;

  R.deflist = (s) => `<div class="panel panel-pad reveal">${s.title?`<h3 style="font-family:'Fraunces',serif;color:var(--forest);font-size:1.1rem;margin-bottom:8px">${s.title}</h3>`:""}
    <div class="deflist">${s.rows.map(r=>`<div class="row"><span class="k">${r[0]}</span><span class="v">${r[1]}</span></div>`).join("")}</div></div>`;

  R.calendar = () => {
    const dows = ["S","M","T","W","T","F","S"];
    let cells = "";
    for (let i=0;i<3;i++) cells += `<div class="day muted"></div>`;
    for (let d=1; d<=30; d++) {
      const deliver = d%1===0 && d>2 && ![9,16,23].includes(d);
      const paused = [16].includes(d);
      cells += `<div class="day ${paused?"paused":deliver?"deliver":""}">${d}${deliver&&!paused?'<span class="d-dot"></span>':""}</div>`;
    }
    return `<div class="panel panel-pad reveal">
      <div class="row-between" style="margin-bottom:14px"><h3 style="font-family:'Fraunces',serif;color:var(--forest)">June 2026</h3>
        <div class="seg"><button>‹</button><button class="active">Month</button><button>›</button></div></div>
      <div class="cal">${dows.map(d=>`<div class="dow">${d}</div>`).join("")}${cells}</div>
      <div class="chart-legend"><span style="color:var(--leaf-600)">● Delivery</span><span style="color:#a9791b">● Paused</span></div>
    </div>`;
  };

  /* ---------- Marketing / storefront blocks ---------- */
  R.storeHero = () => {
    const d = D();
    const milk = (d.products || []).find(p => p.id === "milk") || {};
    const trial = (d.variants || []).find(x => x.type === "trial") || {};
    const mq = milk.quality || {};
    const chips = [["leaf","No preservatives"],["bottle","Glass bottles"],["drop","A2 buffalo milk"],["clock","Delivered by 7 AM"]];
    return `
    <header class="hero">
      <div class="wrap">
        <div class="hero-copy reveal">
          <span class="fresh-badge"><span class="fb-dot"></span>Fresh Every Morning</span>
          <span class="eyebrow">${d.brand.promise}</span>
          <h1 class="display">Fresh Milk.<br><em>Delivered Daily.</em></h1>
          <p class="lead">Pure A2 buffalo milk from local farms — chilled within minutes of milking, bottled in glass, and at your door before breakfast.</p>
          <div class="hero-cta">
            <a href="/subscriptions.html" class="btn btn-primary btn-lg">Subscribe now</a>
            <a href="/products.html" class="btn btn-ghost btn-lg">Explore products</a>
          </div>
          <div class="trust-row">${chips.map(([ic,t])=>`<span class="chip">${icon(ic,15)}${t}</span>`).join("")}</div>
        </div>
        <div class="hero-visual reveal">
          <div class="glass hero-card float">
            <span class="price-flag">Limited offer</span>
            <div class="hero-card-eyebrow">🌿 First time here?</div>
            <div class="bottle">${milk.image ? `<img class="hero-bottle-img" src="${milk.image}" alt="DOODLY Fresh Farm Milk" width="700" height="1348" fetchpriority="high">` : bottle(300,100)}</div>
            <h3>${trial.label||"300 ml"} ${trial.sub||"Sample Pack"} ${statusBadge(trial,{product:milk})}</h3>
            <div class="price">${inr(trial.fixedPrice||200)} <span>/ ${trial.fixedDays||3} mornings</span></div>
            <div class="stat-strip"><div><div class="n">${mq.storageTemp||"4°C"}</div><div class="l">Chilled fast</div></div><div><div class="n">7 AM</div><div class="l">At your door</div></div><div><div class="n">${mq.milkType||"A2"}</div><div class="l">Buffalo milk</div></div></div>
            <div class="hero-card-cta">
              <button type="button" class="btn btn-primary js-qorder">Order Trial Pack</button>
              <a class="hero-card-link" href="/products/milk.html?variant=v300">View details</a>
            </div>
          </div>
        </div>
      </div>
    </header>`;
  };

  R.whyGrid = (s) => `
    <section><div class="wrap">
      <div class="section-head reveal"><span class="eyebrow">Why DOODLY</span><h2 class="display">Milk worth waking up for.</h2><p class="lead">Six reasons families switch to DOODLY and never go back to packet milk.</p></div>
      <div class="grid why-grid">${D().why.map(w=>`<article class="feature reveal"><div class="ic">${icon(w.icon)}</div><h3>${w.title}</h3><p>${w.text}</p></article>`).join("")}</div>
    </div></section>`;

  R.stepsRow = (s) => `
    <section style="background:var(--milk-2)"><div class="wrap">
      <div class="section-head reveal"><span class="eyebrow">How it works</span><h2 class="display">From the farm to your door in hours.</h2><p class="lead">Five steps, every single morning, before the city wakes up.</p></div>
      <div class="steps">${D().steps.map(st=>`<div class="step reveal"><div class="n">${st.n}</div><div><h3>${st.title}</h3><p>${st.text}</p></div></div>`).join("")}</div>
    </div></section>`;

  R.productGrid = (s) => `
    <section${s.bg?` style="background:var(--milk-2)"`:""}><div class="wrap">
      ${s.head!==false?`<div class="section-head reveal"><span class="eyebrow">Our products</span><h2 class="display">Start with milk. More is on the way.</h2><p class="lead">Milk is available to order today. Curd, paneer, kova and ghee — all from the same A2 milk — are coming soon.</p></div>`:""}
      <div class="grid product-grid">${D().products.filter(p=>statusOf(p).key!=="hidden").map(p=>{
        const s = statusOf(p);
        const href = `/products/${p.id}.html`;
        const cls = s.key==="oos"?"is-oos":s.key==="soon"?"is-soon":s.key==="discontinued"?"is-discontinued":"";
        return `<article class="product reveal ${cls}">${statusBadge(p,{pos:"tl"})}
          <div class="pstage">${p.image ? `<img class="pbottle" src="${p.image}" alt="${p.name}" width="540" height="1031" loading="lazy">` : `<span class="pemoji">${p.emoji}</span>`}</div><h3>${p.name}</h3><p>${p.desc}</p><div class="from">${p.from}</div>
          ${s.orderable?`<a class="plink" href="${href}">View product ${icon("arrow",16)}</a>`:`<a class="plink muted" href="${href}">${s.key==="soon"?"Notify me":"Notify me when available"} ${icon("arrow",16)}</a>`}</article>`;
      }).join("")}</div>
    </div></section>`;

  R.builderSection = (s) => `
    <section id="builder"><div class="wrap">
      <div class="section-head reveal"><span class="eyebrow">Build your subscription</span><h2 class="display">Your milk, your schedule, your price.</h2><p class="lead">Pick a bottle and a plan — we'll do the maths and show you exactly what you save.</p></div>
      <div class="builder reveal"><div class="builder-grid">
        <div class="pane pane-left">
          <div class="opt-label">1 · Choose your bottle</div><div class="opt-row size-row" id="sizeRow"></div>
          <div class="opt-label" id="planLabel">2 · Choose your plan</div><div class="opt-row" id="planRow"></div>
          <div class="opt-label" id="dateLabel">3 · Choose your delivery start date</div>
          <div id="datePickerHost"></div>
        </div>
        <div class="pane pane-right">
          <div class="summary-bottle" id="summaryBottle"></div>
          <div id="summaryBody">
            <div class="sum-line"><span class="k" id="sumQtyK">Daily price</span><span class="v" id="sumDaily">—</span></div>
            <div class="sum-line"><span class="k" id="sumDaysK">Days</span><span class="v" id="sumDays">—</span></div>
            <div class="sum-line strike"><span class="k">Original price</span><span class="v" id="sumOriginal">—</span></div>
            <div class="sum-line disc"><span class="k" id="sumDiscK">Discount</span><span class="v" id="sumDiscount">—</span></div>
            <div class="sum-total"><span class="k">You pay</span><span class="v" id="sumTotal">—</span></div>
            <div class="saved" id="sumSaved">Choose a plan to see your savings</div>
            <div class="sum-schedule" id="sumSchedule" hidden></div>
          </div>
          <a href="/signup.html" class="btn btn-cta btn-lg" id="builderCta">Continue to checkout</a>
          <div class="dz-required" id="dateRequired" hidden>Please choose a delivery start date to continue.</div>
          <p class="fineprint">Refundable glass-bottle deposit added at checkout · Pause or cancel anytime</p>
        </div>
      </div></div>
    </div></section>`;

  R.plansCompare = (s) => `
    <section${s.bg!==false?` style="background:var(--milk-2)"`:""} id="plans"><div class="wrap">
      <div class="section-head reveal"><span class="eyebrow">Subscription plans</span><h2 class="display">The longer you commit, the more you save.</h2><p class="lead">Every plan is the same fresh milk — just better pricing the longer you stay.</p></div>
      <div class="grid plans-grid">${D().plans.map(p=>{
        const best = p.tag==="Best value";
        return `<article class="plan reveal ${best?"best":""}">${p.tag?`<span class="ptag">${p.tag}</span>`:""}
          <h3>${p.name}</h3><div class="pdisc">${Math.round(p.discount*100)}%<span> off</span></div>
          <div class="pdays">${p.days===1?"One delivery":p.days+" days"}</div><p>${p.blurb}</p>
          <a class="btn ${best?"btn-primary":"btn-ghost"}" href="#builder" data-plan="${p.id}">Choose plan</a></article>`;
      }).join("")}</div>
    </div></section>`;

  R.testimonialGrid = (s) => `
    <section><div class="wrap">
      <div class="section-head reveal"><span class="eyebrow">Loved by mornings</span><h2 class="display">What DOODLY families say.</h2></div>
      <div class="grid tgrid">${D().testimonials.map(t=>`<article class="tcard reveal"><div class="stars">${"★".repeat(t.stars)}</div><p>“${t.text}”</p><div class="who"><span class="av">${t.name[0]}</span><span><b>${t.name}</b><small>${t.area}</small></span></div></article>`).join("")}</div>
    </div></section>`;

  R.faqSection = (s) => `
    <section style="background:var(--milk-2)"><div class="wrap">
      <div class="section-head center reveal"><span class="eyebrow">Good to know</span><h2 class="display">Frequently asked questions</h2></div>
      ${R.faq({items:s.items||D().faqs})}
    </div></section>`;

  R.ctaBand = (s) => `
    <section><div class="wrap"><div class="cta-band reveal">
      <span class="eyebrow" style="color:var(--mint)">${s.eyebrow||"Start tomorrow morning"}</span>
      <h2 class="display">${s.title||"Wake up to fresher milk."}</h2>
      <p>${s.text||"Begin with the ₹200 sample pack or jump straight into a daily plan. Either way, your first bottle can arrive as soon as tomorrow."}</p>
      <div class="hero-cta"><a href="/subscriptions.html" class="btn btn-primary btn-lg">Subscribe now</a><a href="/contact.html" class="btn btn-ghost btn-lg">Talk to us</a></div>
    </div></div></section>`;

  R.downloadApp = (s) => `
    <section style="background:var(--milk-2)"><div class="wrap"><div class="split reveal">
      <div><span class="eyebrow">DOODLY app</span><h2 class="display" style="font-size:2rem;margin-top:10px">Manage every morning from your phone.</h2>
        <p class="lead mt-2">Track deliveries live, pause for a trip, return bottles, top up your wallet and collect rewards — all in one tap.</p>
        <div class="hero-cta"><a class="btn btn-dark btn-lg" href="/download.html">${icon("download",18)} App Store</a><a class="btn btn-dark btn-lg" href="/download.html">${icon("download",18)} Google Play</a></div></div>
      <div class="media-card"><div><div class="big">📱</div><div class="display" style="font-size:1.3rem;margin-top:8px">Your daily milk, in your pocket</div></div></div>
    </div></div></section>`;

  /* ---------- Product detail (flagship) ---------- */
  R.productDetail = (s) => {
    const p = D().products.find(x=>x.id===s.product) || D().products[0];
    const soon = p.status!=="available";
    if (soon) return R.comingSoon({product:p});
    const v = D().variants;
    const gal = (p.gallery && p.gallery.length) ? p.gallery : (p.image ? [p.image] : []);
    // everything below is read from the catalogue — no hardcoded product values
    const nut = p.nutrition || {}, ql = p.quality || {}, rating = p.rating || { value: 5, count: 0 };
    const longDesc = (p.description && p.description.long) || p.desc || "";
    const activeVariants = v.filter(x => x.active !== false);
    const selectableV = activeVariants.filter(x => x.stock == null || x.stock > 0);
    const urlVar = (function(){ try { return new URLSearchParams(location.search).get("variant"); } catch(e){ return null; } })();
    const defVar = selectableV.find(x => x.id === urlVar) || selectableV.find(x => x.featured) || selectableV[0] || activeVariants[0];
    const defId = defVar ? defVar.id : null;
    const badges = (p.badges || []).filter(b => b.on !== false);
    const deposit = p.pricing && p.pricing.deposit;
    const dailyPrices = activeVariants.filter(x => x.dailyPrice).map(x => x.dailyPrice);
    const minDaily = dailyPrices.length ? Math.min.apply(null, dailyPrices) : null;
    return `
    <section><div class="wrap">
      <div class="crumbs"><a href="/">Home</a><span class="sep">/</span><a href="/products.html">Products</a><span class="sep">/</span><span class="cur">${p.name}</span></div>
      <div class="pd-grid">
        <div class="pd-gallery reveal" data-gallery>
          ${gal.length ? `
          <div class="pd-stage">
            ${statusBadge(p,{pos:"tl",size:"md"})}
            <div class="pd-figure"><img class="pd-main" src="${gal[0]}" alt="${p.name}" width="700" height="700" fetchpriority="high"></div>
            <button class="pd-zoom" type="button" aria-label="Open full image">${icon("eye",18)}</button>
          </div>
          <div class="pd-thumbs">
            ${gal.map((src,i)=>`<button class="th ${i===0?"active":""}" type="button" data-src="${src}"><img src="${src}" alt="${p.name} view ${i+1}" loading="lazy"></button>`).join("")}
          </div>` : `<div class="bottle">${bottle(1000,150)}</div>`}
        </div>
        <div class="reveal">
          <div class="pd-statusrow">${statusBadge(p,{size:"md",sub:true})}</div>
          <h1 class="pd-title">${p.name}</h1>
          <div class="pd-rating">${"★".repeat(5)} <span>${rating.value} · ${rating.count} reviews</span></div>
          <p class="lead">${longDesc}</p>
          <div class="nutri mt-2">
            <div class="n"><b>${nut.fat||"—"}</b><small>Fat / 100ml</small></div><div class="n"><b>${nut.snf||"—"}</b><small>SNF</small></div>
            <div class="n"><b>${ql.milkType||"A2"}</b><small>Protein type</small></div><div class="n"><b>${ql.storageTemp||"4°C"}</b><small>Cold chain</small></div>
          </div>
          <div class="mt-3"><div class="opt-label" style="color:var(--leaf-600)">Choose your bottle</div>
            <div class="vposters mt-1">${activeVariants.map(x=>{
              const s2 = statusOf(x,{product:p});
              const ht = x.ml>=1000?104:x.ml>=500?86:66;
              const price = x.type==="trial"?inr(x.fixedPrice)+" / "+(x.fixedDays||3)+" days":inr(x.dailyPrice)+" / day";
              const blocked = !s2.orderable;
              const sel = x.id===defId;
              return `<div class="vposter reveal ${sel?"selected":""} ${blocked?"is-oos":""}" data-variant="${x.id}" data-type="${x.type}" data-status="${s2.key}" role="button" tabindex="0" aria-pressed="${sel?"true":"false"}" aria-disabled="${blocked?"true":"false"}" aria-label="${x.displayName||x.label}, ${price}, ${s2.label}">
                <span class="vp-selbadge">${icon("check",12)} Selected</span>
                ${s2.key!=="available"?badgeObj(s2,{pos:"tr"}):""}
                <div class="vp-stage"><img src="${gal[0]}" alt="${x.label} DOODLY milk" style="height:${ht}px" loading="lazy"></div>
                <div class="vp-qty">${x.label}</div><div class="vp-sub">${x.sub}</div>
                <div class="vp-price">${price}</div></div>`;
            }).join("")}</div>
            <div class="vp-selected mt-2" id="vpSelected" aria-live="polite"></div>
            <div class="usp-strip mt-2">${badges.map(b=>`<span class="usp-chip">${icon(b.icon,14)}${b.label}</span>`).join("")}</div>
          </div>
          <div class="vp-cartwarn mt-3" hidden></div>
          <div class="vp-actions mt-3">
            <button type="button" class="btn btn-primary btn-lg vp-order">Order Now</button>
            <button type="button" class="btn btn-ghost btn-lg vp-sub">Subscribe</button>
            <button type="button" class="btn btn-ghost btn-lg vp-cart">${icon("box",16)} Add to cart</button>
          </div>
          <div class="vp-notify mt-3" hidden></div>
          <div class="notice mt-3">${icon("bottle",18)}<div>Comes in a returnable glass bottle.${deposit?` A small refundable deposit of ${inr(deposit)} applies;`:" A small refundable deposit applies;"} return empties for a full refund.</div></div>
        </div>
      </div>
    </div></section>
    ${R.builderSection({})}
    <section><div class="wrap"><div class="section-head reveal"><span class="eyebrow">Benefits</span><h2 class="display">Why this milk is different.</h2></div>
      <div class="grid why-grid">${D().why.map(w=>`<article class="feature reveal"><div class="ic">${icon(w.icon)}</div><h3>${w.title}</h3><p>${w.text}</p></article>`).join("")}</div></div></section>
    ${R.faqSection({})}
    ${R.productGrid({bg:true})}
    <div class="pd-buybar" role="region" aria-label="Quick purchase">
      <div class="pd-buybar-price"><span>From</span><b>${minDaily!=null?inr(minDaily):(p.from||"")}<small> / day</small></b></div>
      <span class="pd-bb-status">${badgeObj(statusOf(defVar||p,{product:p}))}</span>
      <a class="btn btn-ghost pd-bb-cart" href="#builder">Add to cart</a>
      <a class="btn btn-primary" href="#builder">Subscribe Now</a>
    </div>`;
  };

  R.comingSoon = (s) => {
    const p = s.product || D().products.find(x=>x.id===s.productId);
    return `
    <section><div class="wrap">
      <div class="crumbs"><a href="/">Home</a><span class="sep">/</span><a href="/products.html">Products</a><span class="sep">/</span><span class="cur">${p.name}</span></div>
      <div class="state reveal" style="max-width:560px;margin:30px auto;padding:60px 30px">
        <div class="ic" style="font-size:2rem;background:var(--gold-soft);color:var(--gold)">${p.emoji}</div>
        <div style="display:flex;justify-content:center">${statusBadge(p,{size:"md",sub:true})}</div>
        <h3 style="margin-top:14px;font-size:1.5rem">${p.name} is on the way</h3>
        <p>${p.desc} Made from the very same A2 milk. Leave your number and we'll tell you the moment it launches.</p>
        <div class="search-box" style="max-width:340px;margin:0 auto 16px">${icon("mail")}<input class="input" placeholder="you@email.com" style="width:100%"></div>
        <button class="btn btn-primary">Notify me at launch</button>
        <p class="muted-sm mt-2">Admins flip one field — <code>status: available</code> — and this page becomes fully orderable. Zero code change.</p>
      </div>
    </div></section>
    ${R.productGrid({bg:true,head:false})}`;
  };

  /* ---------- checkout (built by checkout.js) ---------- */
  R.checkout = () => `<section class="co-root"><div class="wrap"><div id="checkoutMount"></div></div></section>`;

  /* ---------- delivery settings (admin) + active-subscription (account); built by schedule.js ---------- */
  R.deliverySettings = () => `<div class="reveal" id="deliverySettingsMount"></div>`;
  R.subSchedule = () => `<div class="reveal" id="subScheduleMount"></div>`;

  /* ---------- serviceable pincode + auto-pay (built by pincode.js / autopay.js) ---------- */
  R.serviceableAreas = () => `<div class="reveal" id="serviceableAreasMount"></div>`;
  R.autopayBilling = () => `<div class="reveal" id="autopayBillingMount"></div>`;
  R.autopaySettings = () => `<div class="reveal" id="autopaySettingsMount"></div>`;
  R.pincodeChecker = (s) => `<section class="${s&&s.bare?"":"reveal"}"><div class="${s&&s.bare?"":"wrap"}">
    <div class="pincard"><div class="pincard-h">${icon("pin",18)} Check delivery availability</div>
    <p class="pincard-p">Enter your pincode to see if DOODLY delivers fresh milk to your area.</p>
    <div id="pincodeCheckerMount"></div></div></div></section>`;

  /* ---------- RBAC (built by rbac.js) ---------- */
  R.userManagement = () => `<div class="reveal" id="userManagementMount"></div>`;
  R.permissionMatrix = () => `<div class="reveal" id="permissionMatrixMount"></div>`;
  R.auditLog = () => `<div class="reveal" id="auditLogMount"></div>`;

  /* ---------- maps + delivery (built by maps.js / delivery.js) ---------- */
  R.addressManager = () => `<div class="reveal" id="addressManagerMount"></div>`;
  R.deliveryPortal = () => `<div class="reveal" id="deliveryPortalMount"></div>`;
  R.deliveryAnalytics = () => {
    const zones = (D().deliveryZones || []);
    const k = [["Today's deliveries","248"],["Completed","204"],["Pending","38"],["Delayed","6"],["Avg delivery time","11 min"],["Bottle collection","94%"],["Customer rating","4.8★"],["Distance covered","612 km"]]
      .map(x=>`<div class="dl-an-kpi"><div class="n">${x[1]}</div><div class="l">${x[0]}</div></div>`).join("");
    const execRows = [["Ramesh K.","Z1",42,40,"10 min","4.9★"],["Suresh B.","Z2",46,38,"12 min","4.8★"],["Anil P.","Z3",28,24,"13 min","4.7★"]]
      .map(r=>`<tr><td><span class="strong">${r[0]}</span></td><td>${(zones.find(z=>z.id===r[1])||{}).name||r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${r[5]}</td></tr>`).join("");
    return `<div class="reveal"><div class="dl-an-kpis">${k}</div>
      <div class="panel mt-3"><div class="panel-head"><h3>Deliveries per executive</h3></div>
        <div class="panel-pad"><div class="table-wrap"><table class="tbl"><thead><tr><th>Executive</th><th>Zone</th><th>Assigned</th><th>Completed</th><th>Avg time</th><th>Rating</th></tr></thead><tbody>${execRows}</tbody></table></div></div></div></div>`;
  };

  /* ---------- blog list ---------- */
  R.blogList = (s) => `
    <div class="blog-grid reveal">${(M().posts||[]).map(p=>`
      <a class="post" href="/blog/why-a2.html"><div class="cover">${p.emoji}</div>
        <div class="pbody"><div class="cat">${p.cat}</div><h3>${p.title}</h3><p>${p.excerpt}</p><div class="meta">${p.meta}</div></div></a>`).join("")}</div>`;

  /* ---------- admin product table (with status flip) ---------- */
  R.productAdmin = () => {
    const variantsOf = (id) => (D().variants || []).filter(v => (v.productId || "milk") === id);
    const rows = D().products.map(p=>{
      const vs = variantsOf(p.id);
      const prices = vs.filter(x=>x.dailyPrice).map(x=>x.dailyPrice);
      const priceRange = prices.length ? inr(Math.min.apply(null,prices))+"–"+inr(Math.max.apply(null,prices)) : "—";
      const nameCell = p.image
        ? `<span class="cell-user"><span class="av av-img"><img src="${p.image}" alt=""></span><span><span class="strong">${p.name}</span><br><small class="muted">${p.category||""}</small></span></span>`
        : userCell(p.emoji,p.name,p.category||p.from);
      return `<tr><td>${nameCell}</td><td>${vs.length||"—"}</td><td>${priceRange}</td><td>${statusBadge(p,{size:"md"})}</td>
        <td><button class="btn btn-ghost" style="padding:.42rem .8rem;font-size:.82rem" data-edit="${p.id}">${icon("edit",15)} Edit</button></td>
        <td><a class="link" href="/products/${p.id}.html" aria-label="View on storefront">${icon("eye",16)}</a></td></tr>`;
    }).join("");
    return `<div class="table-wrap reveal js-admin-products"><table class="tbl"><thead><tr><th>Product</th><th>Variants</th><th>Price</th><th>Status</th><th>Edit</th><th>View</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };

  /* ---------- composite: section wrapper for app content ---------- */
  R.panel = (s) => `<div class="panel reveal"><div class="panel-head"><h3>${s.title}</h3>${s.link?`<a class="link" href="${s.link.href||"#"}">${s.link.label}</a>`:""}</div><div class="panel-pad">${s.html||""}</div></div>`;
  R.html = (s) => `<div class="reveal">${s.html}</div>`;
  R.columns = (s) => `<div class="grid-cards cols-${s.cols||2} reveal" style="align-items:start">${s.items.map(i=>render([i])).join("")}</div>`;

  /* =============================================================
     render(recipe) -> html
     ============================================================= */
  function render(blocks) {
    return (blocks || []).map(b => {
      const fn = R[b.type];
      if (!fn) return `<!-- unknown block: ${b.type} -->`;
      try { return fn(b); } catch (e) { return `<div class="notice warn">Block "${b.type}" failed: ${e.message}</div>`; }
    }).join("\n");
  }

  return { render, icon, bottle, badge, R, TABLES };
})();
