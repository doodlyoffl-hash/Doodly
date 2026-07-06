/* =============================================================
   DOODLY — premium email design system (reusable components).
   Composable HTML-builder components (the React-Email philosophy:
   table-based layout + inline CSS) for maximum client compatibility
   (Gmail, Outlook/Word engine, Apple Mail, Yahoo, mobile). No external
   images — the brand is expressed with a text wordmark, CSS gradients
   and emoji, so emails look premium even with images turned off.
   Pure functions (no secrets / no server-only) → also renderable for
   previews.  Palette: Deep Blue · Forest Green · Warm Cream · Soft Gold.
   ============================================================= */

export const C = {
  forest: "#0F3D2E",   // primary green
  green: "#1FAE66",    // action green
  deepBlue: "#123A5A", // deep blue
  cream: "#FBF6EC",    // warm cream
  white: "#FFFFFF",
  gold: "#D9A741",     // soft gold accent
  goldSoft: "#F3E4BE",
  ink: "#1C2722",
  muted: "#6B7B73",
  line: "#E7EEEF",
  bg: "#EEF3EE",       // page backdrop
};
const FONT = "'Segoe UI',Helvetica,Arial,-apple-system,BlinkMacSystemFont,sans-serif";
export const SITE = "https://www.doodly.in";

export const esc = (s: unknown) =>
  String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/* ---- outer document shell: dark-mode aware, mobile-responsive ---- */
export function shell(preview: string, inner: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>DOODLY</title>
<!--[if mso]><style>*{font-family:Arial,sans-serif !important}table{border-collapse:collapse}</style><![endif]-->
<style>
  body,table,td{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  img{border:0;line-height:100%;outline:none;text-decoration:none}
  a{text-decoration:none}
  .dk-card{background:${C.white}}
  @media (max-width:600px){ .container{width:100% !important} .px{padding-left:22px !important;padding-right:22px !important} .stack{display:block !important;width:100% !important} .h1{font-size:24px !important} }
  @media (prefers-color-scheme:dark){
    body,.page{background:#0E1A15 !important}
    .dk-card{background:#14231C !important}
    .dk-ink{color:#EAF2EC !important} .dk-mut{color:#9FB3A8 !important}
    .dk-cream{background:#182A21 !important} .dk-line{border-color:#26382E !important}
  }
</style>
</head>
<body class="page" style="margin:0;padding:0;background:${C.bg};font-family:${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preview)}&#8202;&#847;&#847;&#847;&#847;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px">
${inner}
</table></td></tr></table>
</body></html>`;
}

/* ---- brand header: wordmark + tagline over a soft sunrise gradient ---- */
export function header(): string {
  return `<tr><td style="background:${C.forest};background:linear-gradient(135deg,${C.forest} 0%,${C.deepBlue} 100%);border-radius:18px 18px 0 0;padding:30px 34px 26px" class="px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td align="left" style="vertical-align:middle">
        <span style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;color:${C.white};letter-spacing:.5px">Doodly</span>
        <div style="height:5px"></div>
        <span style="font-size:12px;font-weight:600;color:${C.goldSoft};letter-spacing:2px;text-transform:uppercase">Pure by Choice.</span>
      </td>
      <td align="right" style="vertical-align:middle;font-size:26px">🌅</td>
    </tr></table>
  </td></tr>
  <tr><td style="height:6px;background:linear-gradient(90deg,${C.gold} 0%,${C.goldSoft} 50%,${C.gold} 100%);font-size:0;line-height:0">&nbsp;</td></tr>`;
}

/* ---- hero banner: gradient + emoji + headline + optional CTA ---- */
export function hero(o: { emoji?: string; title: string; subtitle?: string; cta?: { label: string; href: string } }): string {
  return `<tr><td class="dk-cream px" style="background:${C.cream};padding:34px 34px 30px;text-align:center">
    ${o.emoji ? `<div style="font-size:40px;line-height:1">${o.emoji}</div><div style="height:12px"></div>` : ""}
    <h1 class="h1 dk-ink" style="margin:0;font-family:Georgia,serif;font-size:27px;line-height:1.25;color:${C.forest};font-weight:700">${esc(o.title)}</h1>
    ${o.subtitle ? `<p class="dk-mut" style="margin:12px auto 0;max-width:420px;font-size:15px;line-height:1.6;color:${C.muted}">${esc(o.subtitle)}</p>` : ""}
    ${o.cta ? `<div style="height:22px"></div>${button(o.cta.label, o.cta.href)}` : ""}
  </td></tr>`;
}

/* ---- bulletproof CTA button (VML for Outlook) ---- */
export function button(label: string, href: string, variant: "primary" | "gold" | "ghost" = "primary"): string {
  const bg = variant === "gold" ? C.gold : variant === "ghost" ? C.white : C.green;
  const fg = variant === "ghost" ? C.forest : C.white;
  const grad = variant === "gold" ? `linear-gradient(135deg,${C.gold},#C7912B)` : variant === "ghost" ? C.white : `linear-gradient(135deg,${C.green},${C.forest})`;
  const border = variant === "ghost" ? `border:2px solid ${C.forest};` : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr><td align="center" bgcolor="${bg}" style="border-radius:999px;background:${grad};${border}">
    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(href)}" style="height:46px;v-text-anchor:middle;width:260px" arcsize="50%" fillcolor="${bg}" stroke="f"><center style="color:${fg};font-family:${FONT};font-size:15px;font-weight:bold">${esc(label)}</center></v:roundrect><![endif]-->
    <!--[if !mso]><!--><a href="${esc(href)}" style="display:inline-block;padding:14px 34px;font-family:${FONT};font-size:15px;font-weight:700;color:${fg};border-radius:999px;line-height:1">${esc(label)}</a><!--<![endif]-->
  </td></tr></table>`;
}

/* ---- rounded white content card ---- */
export function card(inner: string, opts: { pad?: string; bg?: string } = {}): string {
  return `<tr><td class="px" style="padding:0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="dk-card dk-line" style="background:${opts.bg || C.white};border:1px solid #E7EEEF;border-radius:14px"><tr><td style="padding:${opts.pad || "22px 24px"}">${inner}</td></tr></table></td></tr>
  <tr><td style="height:14px;font-size:0;line-height:0">&nbsp;</td></tr>`;
}

export const gap = (h = 16) => `<tr><td style="height:${h}px;font-size:0;line-height:0">&nbsp;</td></tr>`;
export const heading = (t: string) => `<h2 class="dk-ink" style="margin:0 0 8px;font-family:Georgia,serif;font-size:19px;color:${C.forest};font-weight:700">${esc(t)}</h2>`;
export const para = (t: string) => `<p class="dk-mut" style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#3B4A42">${t}</p>`;
export const divider = () => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px dashed #D9E2DC;font-size:0;line-height:0;height:1px">&nbsp;</td></tr></table>`;

/* ---- key/value info row (order details, subscription facts…) ---- */
export function infoRow(label: string, value: string, strong = false): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0"><tr>
    <td style="padding:7px 0;font-size:14px;color:${C.muted}" class="dk-mut">${esc(label)}</td>
    <td align="right" style="padding:7px 0;font-size:14px;color:${C.ink};font-weight:${strong ? "700" : "600"}" class="dk-ink">${esc(value)}</td>
  </tr></table>`;
}

/* ---- big OTP / verification code card ---- */
export function otpCard(code: string, note?: string): string {
  const spaced = String(code).split("").join('<span style="opacity:.25">·</span>');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="dk-cream" style="background:${C.cream};border:1px solid ${C.goldSoft};border-radius:14px"><tr><td align="center" style="padding:26px 20px">
    <div style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.gold}">Your code</div>
    <div style="height:10px"></div>
    <div class="dk-ink" style="font-family:'Courier New',monospace;font-size:38px;font-weight:700;letter-spacing:8px;color:${C.forest}">${spaced}</div>
    ${note ? `<div style="height:10px"></div><div class="dk-mut" style="font-size:13px;color:${C.muted}">${esc(note)}</div>` : ""}
  </td></tr></table>`;
}

/* ---- order line-items + totals summary ---- */
export function orderSummary(o: { items: { name: string; qty?: string; amount: string }[]; totals: { label: string; value: string; strong?: boolean }[] }): string {
  const rows = o.items.map((i) => `<tr>
      <td style="padding:8px 0;font-size:14px;color:${C.ink};border-bottom:1px solid #EEF3F0" class="dk-ink">${esc(i.name)}${i.qty ? `<span style="color:${C.muted};font-size:13px" class="dk-mut"> · ${esc(i.qty)}</span>` : ""}</td>
      <td align="right" style="padding:8px 0;font-size:14px;color:${C.ink};font-weight:600;border-bottom:1px solid #EEF3F0" class="dk-ink">${esc(i.amount)}</td>
    </tr>`).join("");
  const totals = o.totals.map((t) => `<tr>
      <td style="padding:6px 0;font-size:${t.strong ? "16px" : "14px"};color:${t.strong ? C.forest : C.muted};font-weight:${t.strong ? "700" : "500"}" class="${t.strong ? "dk-ink" : "dk-mut"}">${esc(t.label)}</td>
      <td align="right" style="padding:6px 0;font-size:${t.strong ? "18px" : "14px"};color:${t.strong ? C.forest : C.ink};font-weight:${t.strong ? "700" : "600"}" class="dk-ink">${esc(t.value)}</td>
    </tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    <div style="height:8px"></div>${divider()}<div style="height:8px"></div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${totals}</table>`;
}

/* ---- wallet / reward celebration card ---- */
export function walletCard(amount: string, label: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#FFF7E4,${C.cream});border:1px solid ${C.goldSoft};border-radius:16px" class="dk-cream"><tr><td align="center" style="padding:30px 20px">
    <div style="font-size:34px;line-height:1">🪙</div><div style="height:8px"></div>
    <div style="font-family:Georgia,serif;font-size:40px;font-weight:700;color:${C.gold};line-height:1">${esc(amount)}</div>
    <div style="height:8px"></div>
    <div class="dk-ink" style="font-size:15px;font-weight:600;color:${C.forest}">${esc(label)}</div>
  </td></tr></table>`;
}

/* ---- delivery timeline (vertical stepper) ---- */
export function timeline(steps: { title: string; sub?: string; state: "done" | "active" | "todo" }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` + steps.map((s) => {
    const dot = s.state === "done" ? `background:${C.green};color:#fff` : s.state === "active" ? `background:${C.gold};color:#fff` : `background:#E7EEEF;color:#B8C6BE`;
    const mark = s.state === "done" ? "✓" : s.state === "active" ? "•" : "·";
    return `<tr>
      <td width="34" style="vertical-align:top;padding:0 0 14px"><span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;font-size:12px;font-weight:700;${dot}">${mark}</span></td>
      <td style="vertical-align:top;padding:0 0 14px">
        <div class="dk-ink" style="font-size:14px;font-weight:700;color:${s.state === "todo" ? C.muted : C.forest}">${esc(s.title)}</div>
        ${s.sub ? `<div class="dk-mut" style="font-size:13px;color:${C.muted};margin-top:2px">${esc(s.sub)}</div>` : ""}
      </td></tr>`;
  }).join("") + `</table>`;
}

/* ---- premium footer: brand · quick links · social · contact ---- */
export function footer(): string {
  const link = (t: string, h: string) => `<a href="${SITE}${h}" style="color:${C.muted};font-size:13px;text-decoration:none;padding:0 8px;line-height:2.2">${t}</a>`;
  const links = [["Products", "/products.html"], ["Subscriptions", "/subscriptions.html"], ["Help Centre", "/help.html"], ["Farmers", "/farmers.html"], ["Bottle Returns", "/bottle-return.html"], ["Careers", "/careers.html"]];
  return `<tr><td style="height:8px"></td></tr>
  <tr><td class="px" style="padding:26px 34px 8px;text-align:center">
    <span style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:${C.forest}" class="dk-ink">Doodly</span>
    <div style="height:4px"></div>
    <div class="dk-mut" style="font-size:12px;color:${C.muted};letter-spacing:2px;text-transform:uppercase">Pure by Choice.</div>
    <div style="height:16px"></div>
    <div>${["📷 Instagram", "👍 Facebook", "💬 WhatsApp"].map((s) => `<span style="font-size:13px;color:${C.muted};padding:0 10px">${s}</span>`).join("")}</div>
    <div style="height:14px"></div>
    <div style="line-height:1.9">${links.map((l) => link(l[0], l[1])).join(`<span style="color:#CBD6CF">·</span>`)}</div>
    <div style="height:14px"></div>
    <div class="dk-mut" style="font-size:12px;color:${C.muted};line-height:1.7">
      support@doodly.in &nbsp;·&nbsp; +91 91177 99143<br>
      Delivered fresh, before 7:00 AM &nbsp;·&nbsp; Vijayawada
    </div>
    <div style="height:16px"></div>
    <div class="dk-mut" style="font-size:11px;color:#9AAAA1">
      <a href="${SITE}/privacy.html" style="color:#9AAAA1">Privacy</a> ·
      <a href="${SITE}/terms.html" style="color:#9AAAA1">Terms</a> ·
      <a href="${SITE}/refund.html" style="color:#9AAAA1">Refunds</a><br><br>
      © DOODLY — farm-fresh A2 buffalo milk in glass bottles.
    </div>
  </td></tr>`;
}

/* Compose a full email from an array of section builders + a preview line. */
export function compose(preview: string, sections: string[]): string {
  return shell(preview, [header(), ...sections, footer()].join("\n"));
}
