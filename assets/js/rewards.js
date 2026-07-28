/* =============================================================
   DOODLY — Reward claim page (DOODLY_REWARDS)
   Renders /rewards/claim: validates a reward (code or link token), gates on
   sign-in, collects a SERVICEABLE delivery address (saved or new), then redeems
   → the backend creates the ₹0 7-day subscription. Reuses DOODLY_API +
   DOODLY_PINCODE (serviceability). Self-contained styles (injected once).
   ============================================================= */
window.DOODLY_REWARDS = (function () {
  const API = () => window.DOODLY_API;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function signedIn() { try { const u = JSON.parse(localStorage.getItem("doodly-currentuser") || "null"); return (u && u.id && !/^static-/.test(String(u.id)) && localStorage.getItem("doodly-token")) ? u : null; } catch (e) { return null; } }
  function qs(n) { try { return new URLSearchParams(location.search).get(n) || ""; } catch (e) { return ""; } }
  function fmtDate(d) { try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } }

  function injectStyles() {
    if (document.getElementById("rc-style")) return;
    const s = document.createElement("style"); s.id = "rc-style";
    s.textContent =
      ".rc-wrap{max-width:560px;margin:0 auto;padding:8px 0 40px}" +
      ".rc-card{border:1px solid var(--glass-brd,#e3ece3);background:var(--glass-bg,#fff);backdrop-filter:var(--glass-blur);-webkit-backdrop-filter:var(--glass-blur);border-radius:22px;padding:26px;box-shadow:var(--shadow,0 12px 40px rgba(15,61,46,.1))}" +
      ".rc-head{text-align:center;margin-bottom:14px}.rc-emoji{font-size:2.4rem;display:block}" +
      ".rc-title{font-family:'Fraunces',serif;font-weight:600;color:var(--forest,#0F3D2E);font-size:1.5rem;margin:6px 0 2px}" +
      ".rc-sub{color:var(--ink-3,#6b7c72);font-size:.9rem;margin:0}" +
      ".rc-prize{margin:16px 0;padding:16px;border-radius:16px;background:linear-gradient(135deg,rgba(31,174,102,.12),rgba(31,174,102,.04));border:1px solid var(--mint,#cfe8d8);text-align:center}" +
      ".rc-prize-big{font-family:'Fraunces',serif;font-weight:700;color:var(--leaf-600,#169A57);font-size:1.9rem;line-height:1.1}" +
      ".rc-prize-p{color:var(--ink-2,#37463d);font-size:.9rem;margin-top:4px}" +
      ".rc-note{color:var(--ink-2,#37463d);font-size:.92rem;text-align:center;margin:10px 0 16px}" +
      ".rc-step h3{font-family:'Fraunces',serif;color:var(--forest,#0F3D2E);font-size:1.1rem;margin:18px 0 10px}" +
      ".rc-addrs{display:grid;gap:10px;margin-bottom:12px}" +
      ".rc-addr{display:flex;gap:10px;align-items:flex-start;border:1.5px solid var(--line,#e3ece3);border-radius:14px;padding:12px 14px;cursor:pointer;transition:border-color .18s,background .18s}" +
      ".rc-addr:hover{border-color:var(--leaf,#1FAE66)}.rc-addr input{margin-top:3px}" +
      ".rc-addr-no{opacity:.6;cursor:not-allowed}.rc-no-badge{color:#c0392b;font-weight:700;font-size:.76rem}" +
      ".rc-newwrap{border:1px dashed var(--line,#e3ece3);border-radius:14px;padding:0 14px;margin-bottom:14px}" +
      ".rc-newwrap summary{cursor:pointer;font-weight:700;color:var(--leaf-600,#169A57);padding:12px 0}" +
      ".rc-form{display:grid;gap:9px;padding-bottom:14px}.rc-f2{display:grid;grid-template-columns:1fr 1fr;gap:9px}" +
      ".rc-i{width:100%;padding:.72rem .85rem;border-radius:12px;border:1.5px solid var(--line,#e3ece3);background:var(--surface,#fff);color:var(--forest,#0F3D2E);font:inherit;font-size:.92rem}" +
      ".rc-i:focus{outline:none;border-color:var(--leaf,#1FAE66);box-shadow:var(--ring,0 0 0 3px rgba(31,174,102,.18))}" +
      ".rc-pin{position:relative}.rc-pin-r{display:block;margin-top:5px;font-size:.8rem;font-weight:700}.rc-pin-r.ok{color:var(--leaf-600,#169A57)}.rc-pin-r.no{color:#c0392b}" +
      ".rc-cta{width:100%;margin-top:10px}.rc-err{color:#c0392b;font-size:.85rem;font-weight:600;margin:8px 0}" +
      ".rc-ok{color:var(--leaf-600,#169A57);font-weight:700;text-align:center;margin:14px 0}" +
      ".rc-bad{color:#c0392b;font-weight:600;text-align:center;margin:14px 0;line-height:1.5}" +
      ".rc-success{text-align:center}.rc-success-cta{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:16px}.rc-success-cta .btn{flex:1 1 auto}" +
      ".rc-loading{text-align:center;color:var(--ink-3,#6b7c72);padding:24px 0}" +
      "@media(max-width:480px){.rc-card{padding:20px}.rc-f2{grid-template-columns:1fr}}";
    document.head.appendChild(s);
  }

  const card = (inner) => '<div class="rc-wrap"><div class="rc-card">' + inner + "</div></div>";
  function rewardHeader(r) {
    return '<div class="rc-head"><span class="rc-emoji" aria-hidden="true">🎁</span><h1 class="rc-title">Your Puzzle Winner Reward</h1>' +
      '<p class="rc-sub">' + esc(r.campaignName) + "</p></div>" +
      '<div class="rc-prize"><div class="rc-prize-big">7 Days FREE</div><div class="rc-prize-p">' + esc(r.productLabel) + " — delivered fresh every morning</div></div>";
  }

  function mountClaim(host) {
    if (!host) return;
    injectStyles();
    const token = qs("token"), code = qs("code");
    if (!token && !code) { host.innerHTML = card('<div class="rc-bad">This claim link is invalid or incomplete. Please use the exact link or code we sent you.</div>'); return; }
    host.innerHTML = card('<div class="rc-loading">Checking your reward…</div>');
    if (!API()) { host.innerHTML = card('<div class="rc-bad">Couldn\'t reach DOODLY right now — please refresh.</div>'); return; }
    const q = token ? "token=" + encodeURIComponent(token) : "code=" + encodeURIComponent(code);
    API().get("/api/rewards/claim?" + q)
      .then((data) => render(host, data, { token, code }))
      .catch((e) => { host.innerHTML = card('<div class="rc-bad">' + esc((e && e.message) || "We couldn't find that reward.") + "</div>"); });
  }

  function render(host, data, sel) {
    const r = data.reward;
    if (r.reason === "redeemed") { host.innerHTML = card(rewardHeader(r) + '<div class="rc-ok">✅ This reward has already been claimed.</div><a class="btn btn-primary rc-cta" href="/account/subscription.html">View your subscription</a>'); return; }
    if (r.reason === "expired") { host.innerHTML = card(rewardHeader(r) + '<div class="rc-bad">This reward has expired' + (r.expiresAt ? " on " + fmtDate(r.expiresAt) : "") + '. Contact support if you think this is a mistake.</div><a class="btn btn-ghost rc-cta" href="/contact.html">Contact support</a>'); return; }
    if (r.reason === "cancelled") { host.innerHTML = card(rewardHeader(r) + '<div class="rc-bad">This reward is no longer valid.</div><a class="btn btn-ghost rc-cta" href="/contact.html">Contact support</a>'); return; }
    if (r.reason === "bound_to_other") { host.innerHTML = card(rewardHeader(r) + '<div class="rc-bad">This reward is linked to a different DOODLY account. Please sign in with the account that won the puzzle.</div>'); return; }
    if (!data.signedIn) {
      const back = encodeURIComponent(location.pathname + location.search);
      host.innerHTML = card(rewardHeader(r) + '<p class="rc-note">Sign in (or create your free account) to claim your reward and choose your delivery address.</p><a class="btn btn-primary rc-cta" href="/login/customer.html?from=' + back + '">Sign in to claim</a>');
      return;
    }
    renderAddressStep(host, data, sel);
  }

  function renderAddressStep(host, data, sel) {
    const r = data.reward, addrs = data.addresses || [];
    let firstServiceable = -1;
    const savedRows = addrs.map((a, i) => {
      if (a.serviceable && firstServiceable < 0) firstServiceable = i;
      return '<label class="rc-addr ' + (a.serviceable ? "" : "rc-addr-no") + '"><input type="radio" name="rcaddr" value="' + esc(a.id) + '" ' + (a.serviceable ? "" : "disabled") + (a.serviceable && firstServiceable === i ? " checked" : "") + ">" +
        '<span class="rc-addr-body"><b>' + esc(a.label) + "</b> " + (a.isDefault ? '<span class="badge">Default</span>' : "") +
        '<br><span class="muted-sm">' + esc(a.line1) + ", " + esc(a.city) + " — " + esc(a.pincode) + "</span>" +
        (a.serviceable ? "" : '<br><span class="rc-no-badge">Not serviceable yet</span>') + "</span></label>";
    }).join("");
    const noneServiceable = addrs.length > 0 && firstServiceable < 0;
    host.innerHTML = card(rewardHeader(r) +
      '<div class="rc-step"><h3>Where should we deliver?</h3>' +
      (savedRows ? '<div class="rc-addrs">' + savedRows + "</div>" : '<p class="rc-note" style="text-align:left">Add a delivery address to activate your reward.</p>') +
      (noneServiceable ? '<p class="rc-note" style="text-align:left;color:#c0392b">None of your saved addresses are in our delivery area yet — add a serviceable one below.</p>' : "") +
      '<details class="rc-newwrap"' + (savedRows && !noneServiceable ? "" : " open") + "><summary>+ Add a new address</summary>" + addressForm() + "</details>" +
      '<div class="rc-err" id="rcErr" hidden></div>' +
      '<button type="button" class="btn btn-primary rc-cta" id="rcClaim">Claim my free 7 days</button></div>');
    wireClaim(host, data, sel);
  }

  function addressForm() {
    const row = (id, ph, type) => '<input class="rc-i" id="' + id + '" placeholder="' + esc(ph) + '"' + (type ? ' type="' + type + '"' : "") + ">";
    return '<div class="rc-form">' + row("na-name", "Full name") + row("na-phone", "Mobile number", "tel") +
      row("na-house", "House / Flat no.") + row("na-street", "Street / Road") +
      row("na-area", "Area / Locality") + row("na-landmark", "Landmark (optional)") +
      '<div class="rc-f2">' + row("na-city", "City") + row("na-state", "State") + "</div>" +
      '<div class="rc-pin"><input class="rc-i" id="na-pincode" placeholder="Delivery pincode" inputmode="numeric" maxlength="6"><span class="rc-pin-r" id="na-pinres"></span></div></div>';
  }

  function wireClaim(host, data, sel) {
    const err = host.querySelector("#rcErr");
    const showErr = (m) => { if (err) { err.hidden = false; err.textContent = m; } };
    const pin = host.querySelector("#na-pincode"), pinres = host.querySelector("#na-pinres");
    if (pin) pin.addEventListener("input", () => {
      pin.value = pin.value.replace(/\D/g, "").slice(0, 6);
      if (pin.value.length === 6 && window.DOODLY_PINCODE && DOODLY_PINCODE.validateLive) {
        DOODLY_PINCODE.validateLive(pin.value).then((res) => { pinres.textContent = res && res.serviceable ? "✓ We deliver here" : "✗ Not serviceable yet"; pinres.className = "rc-pin-r " + (res && res.serviceable ? "ok" : "no"); }).catch(() => {});
      } else if (pinres) { pinres.textContent = ""; }
    });
    const btn = host.querySelector("#rcClaim");
    btn.addEventListener("click", () => {
      if (err) err.hidden = true;
      const newWrap = host.querySelector(".rc-newwrap");
      const useNew = newWrap && newWrap.open && (host.querySelector("#na-pincode").value || "").length === 6;
      const body = {};
      if (sel.token) body.token = sel.token; else body.code = sel.code;
      if (useNew) {
        const g = (id) => ((host.querySelector("#" + id) || {}).value || "").trim();
        body.newAddress = { contactName: g("na-name"), contactPhone: g("na-phone"), houseNo: g("na-house"), street: g("na-street"), area: g("na-area"), landmark: g("na-landmark"), city: g("na-city") || "Vijayawada", state: g("na-state") || "Andhra Pradesh", pincode: g("na-pincode") };
      } else {
        const checked = host.querySelector('input[name="rcaddr"]:checked');
        if (!checked) return showErr("Choose a serviceable delivery address, or add a new one.");
        body.addressId = checked.value;
      }
      btn.disabled = true; btn.textContent = "Activating…";
      API().post("/api/rewards/redeem", body).then(() => {
        host.innerHTML = card('<div class="rc-success"><span class="rc-emoji" aria-hidden="true">🎉</span><h1 class="rc-title">Reward activated!</h1>' +
          '<p class="rc-sub">Your FREE 7 days of 1 L A2 Buffalo Milk is confirmed. Your first delivery arrives tomorrow morning, before 7 AM.</p>' +
          '<div class="rc-success-cta"><a class="btn btn-primary" href="/account/subscription.html">My subscription</a><a class="btn btn-ghost" href="/account/deliveries.html">See deliveries</a></div></div>');
      }).catch((e) => { btn.disabled = false; btn.textContent = "Claim my free 7 days"; showErr((e && e.message) || "Couldn't activate your reward — please try again."); });
    });
  }

  function mountAll() { const m = document.getElementById("rewardClaimMount"); if (m) mountClaim(m); }
  return { mountClaim, mountAll };
})();
