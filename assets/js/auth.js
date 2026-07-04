/* =============================================================
   DOODLY — Premium auth experience behaviours
   Injects the looping rural-dairy SVG scene, the farm-to-home
   story strip and the milk wave into the markup produced by
   layout.js renderAuth(); wires floating-label validation,
   the premium button (loading/success), the milk-drop loading
   overlay, password reveal, and subtle cursor-reactive parallax.
   Transform/opacity only, fully reduced-motion aware. Preserves
   the existing navigation (form[data-dest]).
   ============================================================= */
window.DOODLY_AUTH = (function () {
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- tiny icon set (story strip) ---------- */
  const I = {
    buffalo: '<path d="M5 13c-2-1-3-4-1-5 1 2 3 2 3 2M19 13c2-1 3-4 1-5-1 2-3 2-3 2" /><path d="M6 10c0-2 2-4 6-4s6 2 6 4c0 3-2 6-6 6s-6-3-6-6Z"/><path d="M10 16v3M14 16v3"/>',
    drop: '<path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3Z"/>',
    flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 14h9"/>',
    snow: '<path d="M12 2v20M4 6l16 12M20 6 4 18M2 12h20"/>',
    bottle: '<path d="M9 2h6M10 2v3.5L8.2 8A4 4 0 0 0 8 9.6V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9.6A4 4 0 0 0 15.8 8L14 5.5V2"/><path d="M8 13h8"/>',
    truck: '<path d="M3 5h11v11H3zM14 9h4l3 3v4h-7"/><circle cx="7.5" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
    home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
  };
  const sic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

  const STORY = [
    ["buffalo", "Desi buffalo"], ["drop", "Fresh milk"], ["flask", "Quality test"],
    ["snow", "Instant chill"], ["bottle", "Glass bottle"], ["truck", "DOODLY van"], ["home", "Your home"],
  ];

  /* ============================================================
     SVG SCENE  (fixed art colours — identical in light & dark)
     ============================================================ */
  function cloud(x, y, s) {
    return `<g transform="translate(${x},${y}) scale(${s})" fill="#ffffff" opacity=".9">
      <ellipse cx="0" cy="0" rx="46" ry="22"/><ellipse cx="34" cy="6" rx="34" ry="18"/>
      <ellipse cx="-32" cy="7" rx="30" ry="16"/><ellipse cx="6" cy="-12" rx="26" ry="16"/></g>`;
  }
  function bird(x, y, s) {
    return `<g transform="translate(${x},${y}) scale(${s})"><path class="as-bird"
      d="M0 6 Q7 -4 14 6 Q7 2 0 6Z M14 6 Q21 -4 28 6 Q21 2 14 6Z" fill="#46586f" opacity=".8"/></g>`;
  }
  function tree(x, y, s, cls) {
    return `<g transform="translate(${x},${y}) scale(${s})"><g class="as-tree ${cls}">
      <rect x="-5" y="-34" width="10" height="40" rx="4" fill="#6c4a32"/>
      <ellipse cx="0" cy="-48" rx="36" ry="34" fill="#3f9f5b"/>
      <ellipse cx="-20" cy="-36" rx="24" ry="22" fill="#49ab64"/>
      <ellipse cx="20" cy="-38" rx="22" ry="22" fill="#379152"/></g></g>`;
  }
  function can(x, y, s) {
    return `<g transform="translate(${x},${y}) scale(${s})">
      <ellipse cx="0" cy="58" rx="20" ry="5" fill="#06281c" opacity=".18"/>
      <rect x="-17" y="0" width="34" height="56" rx="7" fill="url(#steel)"/>
      <rect x="-17" y="14" width="34" height="5" fill="#9fb0b8" opacity=".7"/>
      <rect x="-17" y="40" width="34" height="5" fill="#9fb0b8" opacity=".7"/>
      <ellipse cx="0" cy="2" rx="14" ry="5" fill="#cdd8de"/>
      <rect x="-5" y="-9" width="10" height="9" rx="3" fill="#aab9c0"/></g>`;
  }
  function droplet(x, y, cls) {
    return `<g transform="translate(${x},${y})"><path class="as-droplet ${cls}"
      d="M0 -7 C4 -2 6 1 6 4 A6 6 0 0 1 -6 4 C-6 1 -4 -2 0 -7Z" fill="#ffffff" opacity=".9"/></g>`;
  }
  function butterfly(x, y, cls) {
    return `<g transform="translate(${x},${y})"><g class="as-fly ${cls}">
      <g class="as-wing"><ellipse cx="-5" cy="-4" rx="6" ry="8" fill="#f6a64b" opacity=".92"/><ellipse cx="-5" cy="6" rx="5" ry="6" fill="#f08a3c" opacity=".92"/></g>
      <g class="as-wing as-wing-r"><ellipse cx="5" cy="-4" rx="6" ry="8" fill="#f6a64b" opacity=".92"/><ellipse cx="5" cy="6" rx="5" ry="6" fill="#f08a3c" opacity=".92"/></g>
      <rect x="-1" y="-7" width="2" height="16" rx="1" fill="#3a2a18"/></g></g>`;
  }
  function buffalo(x, y, s, look) {
    const head = `<g class="as-bhead">
        <path d="M150 8 C170 0 182 6 176 20 C170 14 160 14 150 18Z" fill="#2c3a33"/>
        <path d="M110 8 C90 0 78 6 84 20 C90 14 100 14 110 18Z" fill="#2c3a33"/>
        <path d="M104 14 q26 -14 52 0 q4 22 -26 26 q-30 -4 -26 -26Z" fill="#36473f"/>
        <circle cx="146" cy="26" r="3" fill="#10201a"/></g>`;
    return `<g transform="translate(${x},${y}) scale(${s})"><g class="as-buffalo${look ? "" : " as-buffalo-b"}">
      <ellipse cx="70" cy="86" rx="74" ry="10" fill="#06281c" opacity=".16"/>
      <path d="M10 60 C4 30 30 22 70 22 C118 22 140 30 140 56 C140 76 128 86 108 86 L26 86 C14 86 12 72 10 60Z" fill="#33433b"/>
      <path d="M20 50 C18 40 34 36 64 36 C104 36 124 42 124 56" fill="none" stroke="#43564c" stroke-width="4" opacity=".5"/>
      <rect x="30" y="78" width="9" height="20" rx="4" fill="#2b3a33"/><rect x="58" y="80" width="9" height="20" rx="4" fill="#2b3a33"/>
      <rect x="92" y="80" width="9" height="20" rx="4" fill="#2b3a33"/><rect x="116" y="78" width="9" height="20" rx="4" fill="#2b3a33"/>
      <g transform="translate(-12,30)">${look ? `<g class="as-bhead-look">${head}</g>` : head}</g></g></g>`;
  }

  function sceneSVG() {
    let rays = "";
    for (let i = 0; i < 12; i++) rays += `<rect x="-2" y="-150" width="4" height="74" rx="2" fill="#fff3cf" transform="rotate(${i * 30})"/>`;
    let birds = "";
    [[0, 0, 1], [40, 22, .8], [78, 6, .9]].forEach(([bx, by, bs]) => birds += bird(bx, by, bs));
    return `
<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMax slice" role="img" aria-label="Sunrise over a DOODLY dairy farm with grazing buffaloes and a delivery van">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bcd8ef"/><stop offset=".34" stop-color="#e4e7e6"/>
      <stop offset=".62" stop-color="#fde7c9"/><stop offset=".82" stop-color="#f4f9ec"/><stop offset="1" stop-color="#eef7e6"/>
    </linearGradient>
    <radialGradient id="sunGlow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#fff6da" stop-opacity=".95"/><stop offset=".5" stop-color="#ffe7ad" stop-opacity=".45"/><stop offset="1" stop-color="#ffe7ad" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="hillFar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfeccb"/><stop offset="1" stop-color="#bce4b9"/></linearGradient>
    <linearGradient id="hillMid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9dba3"/><stop offset="1" stop-color="#8ecf8a"/></linearGradient>
    <linearGradient id="field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc77f"/><stop offset="1" stop-color="#57aa64"/></linearGradient>
    <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cdd8de"/><stop offset=".4" stop-color="#eef3f6"/><stop offset=".55" stop-color="#b7c3ca"/><stop offset="1" stop-color="#d7e0e5"/></linearGradient>
    <linearGradient id="van" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27b86f"/><stop offset="1" stop-color="#149254"/></linearGradient>
    <linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e2cf"/><stop offset="1" stop-color="#d7cdb4"/></linearGradient>
  </defs>

  <rect width="1000" height="1000" fill="url(#sky)"/>

  <!-- sun + glow + rays -->
  <circle class="as-sunglow" cx="770" cy="250" r="230" fill="url(#sunGlow)"/>
  <g transform="translate(770,250)"><g class="as-rays">${rays}</g></g>
  <circle class="as-sun" cx="770" cy="250" r="50" fill="#ffe9b0"/>
  <circle class="as-sun" cx="770" cy="250" r="34" fill="#fff6dc"/>

  <!-- clouds -->
  <g class="as-cloud">${cloud(180, 170, 1)}</g>
  <g class="as-cloud-b">${cloud(520, 250, .8)}</g>

  <!-- birds -->
  <g transform="translate(120,210)"><g class="as-birds">${birds}</g></g>

  <!-- far hills -->
  <g class="as-parallax-far">
    <path d="M0 640 Q250 560 520 620 T1000 600 L1000 1000 L0 1000Z" fill="url(#hillFar)"/>
  </g>
  <!-- mid hills -->
  <path d="M0 720 Q300 650 620 710 T1000 690 L1000 1000 L0 1000Z" fill="url(#hillMid)"/>
  <!-- mist -->
  <g class="as-mist"><ellipse cx="420" cy="700" rx="360" ry="26" fill="#ffffff" opacity=".5"/><ellipse cx="760" cy="724" rx="260" ry="20" fill="#ffffff" opacity=".4"/></g>

  <!-- near field + farm -->
  <g class="as-parallax-near">
    <path d="M0 800 Q280 740 600 790 T1000 770 L1000 1000 L0 1000Z" fill="url(#field)"/>
    <!-- road from farm to lower-left -->
    <path d="M250 1000 C430 900 600 880 740 858 L820 852 L850 880 L300 1000Z" fill="url(#road)" opacity=".92"/>
    <path d="M360 980 L760 866" stroke="#ffffff" stroke-width="4" stroke-dasharray="14 18" opacity=".5"/>

    ${tree(120, 880, 1.1, "")}
    ${tree(940, 900, 1.25, "as-tree-b")}

    <!-- barn -->
    <g transform="translate(700,742)">
      <rect x="-6" y="-86" width="6" height="34" fill="#b7c3ca"/>
      <g class="as-steam"><ellipse cx="-3" cy="-92" rx="7" ry="10" fill="#fff" opacity=".7"/></g>
      <g class="as-steam as-steam-b"><ellipse cx="6" cy="-96" rx="6" ry="9" fill="#fff" opacity=".6"/></g>
      <rect x="-70" y="-58" width="140" height="70" rx="6" fill="#f3e7d4"/>
      <path d="M-80 -58 L0 -98 L80 -58Z" fill="#169a57"/>
      <path d="M-80 -58 L0 -98 L80 -58Z" fill="#0f7e45" opacity=".25"/>
      <rect x="-20" y="-32" width="40" height="44" rx="4" fill="#caa978"/>
      <rect x="-20" y="-32" width="40" height="44" rx="4" fill="none" stroke="#9c7c4f" stroke-width="2"/>
      <line x1="0" y1="-32" x2="0" y2="12" stroke="#9c7c4f" stroke-width="2"/>
    </g>

    <!-- milk cans -->
    ${can(590, 712, .9)}${can(626, 720, 1)}${can(662, 712, .9)}

    <!-- buffaloes -->
    ${buffalo(250, 770, 1, true)}
    ${buffalo(430, 800, .8, false)}

    <!-- delivery van (drives along the road) -->
    <g transform="translate(250,876)"><g class="as-van">
      <ellipse cx="40" cy="40" rx="56" ry="8" fill="#06281c" opacity=".18"/>
      <path d="M-2 4 H52 a8 8 0 0 1 8 6 l14 6 a6 6 0 0 1 4 6 V34 a4 4 0 0 1-4 4 H-2 a4 4 0 0 1-4-4 V8 a4 4 0 0 1 4-4Z" fill="url(#van)"/>
      <rect x="56" y="12" width="16" height="12" rx="2" fill="#cfeede" opacity=".9"/>
      <rect x="4" y="14" width="40" height="9" rx="2" fill="#ffffff" opacity=".92"/>
      <circle cx="14" cy="20" r="3.4" fill="#1FAE66"/>
      <path d="M11 20 a3 3 0 0 1 6 0 a3 1.4 0 0 1-6 0Z" fill="#1FAE66"/>
      <circle class="as-wheel" cx="14" cy="40" r="9" fill="#243029"/><circle cx="14" cy="40" r="3.4" fill="#9fb0b8"/>
      <circle class="as-wheel" cx="60" cy="40" r="9" fill="#243029"/><circle cx="60" cy="40" r="3.4" fill="#9fb0b8"/>
    </g></g>

    <!-- floating milk droplets near the cans -->
    ${droplet(596, 700, "")}${droplet(640, 690, "as-droplet-b")}${droplet(676, 704, "as-droplet-c")}

    <!-- butterflies -->
    ${butterfly(360, 760, "")}${butterfly(840, 820, "as-fly-b")}
  </g>
</svg>`;
  }

  function waveSVG() {
    return `<svg viewBox="0 0 1200 74" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 30 C150 8 250 52 400 34 C560 14 660 56 820 36 C980 16 1080 52 1200 34 L1200 74 L0 74Z" fill="#ffffff" opacity=".82"/>
      <path d="M0 44 C150 24 250 60 400 46 C560 30 660 64 820 48 C980 30 1080 60 1200 46 L1200 74 L0 74Z" fill="#ffffff"/>
    </svg>`;
  }

  function storyHTML() {
    return STORY.map((s, i) =>
      `${i ? '<span class="story-link"></span>' : ""}<div class="story-step"><span class="story-ic">${sic(s[0])}</span><span class="story-lbl">${s[1]}</span></div>`
    ).join("");
  }

  /* ============================================================
     Validation
     ============================================================ */
  const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function ruleFor(input) {
    if (input.type === "password") return "password";
    const hint = (input.getAttribute("data-rule") || input.type || "").toLowerCase();
    if (input.type === "email") return "email";
    if (input.type === "tel") return "contact";
    if (/email|phone|mobile|contact/.test(hint)) return "contact";
    return "required";
  }
  function validate(input) {
    const v = input.value.trim(), rule = ruleFor(input);
    if (!v) return [false, "This field is required"];
    if (rule === "password") return v.length >= 6 ? [true, ""] : [false, "Use at least 6 characters"];
    if (rule === "email") return reEmail.test(v) ? [true, ""] : [false, "Enter a valid email"];
    if (rule === "contact") {
      if (v.includes("@")) return reEmail.test(v) ? [true, ""] : [false, "Enter a valid email"];
      const digits = v.replace(/\D/g, "");
      return digits.length >= 10 ? [true, ""] : [false, "Enter a valid phone or email"];
    }
    return v.length >= 2 ? [true, ""] : [false, "Please complete this field"];
  }
  function setState(field, ok, msg) {
    field.classList.toggle("is-valid", ok);
    field.classList.toggle("is-error", !ok);
    const err = field.querySelector(".fl-err");
    if (err) err.textContent = ok ? "" : msg;
  }

  /* ============================================================
     Wiring
     ============================================================ */
  function wireForm(scope) {
    const form = scope.querySelector(".auth-card");
    if (!form || form.tagName !== "FORM" || form.dataset.wired) return;
    form.dataset.wired = "1";

    // password reveal
    scope.querySelectorAll(".fl-eye").forEach((btn) => {
      btn.addEventListener("click", () => {
        const inp = btn.parentElement.querySelector("input");
        const show = inp.type === "password";
        inp.type = show ? "text" : "password";
        btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
        btn.classList.toggle("on", show);
      });
    });

    // live validation
    scope.querySelectorAll(".fl-field input").forEach((inp) => {
      const field = inp.closest(".fl-field");
      inp.addEventListener("blur", () => { if (inp.value.trim()) { const [ok, m] = validate(inp); setState(field, ok, m); } });
      inp.addEventListener("input", () => {
        if (field.classList.contains("is-error")) { const [ok, m] = validate(inp); if (ok) setState(field, true, ""); }
        else if (inp.value.trim()) { const [ok] = validate(inp); field.classList.toggle("is-valid", ok); }
      });
    });

    // ripple + submit
    const btn = form.querySelector(".btn-auth");
    if (btn) btn.addEventListener("click", (e) => ripple(btn, e));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const fields = [...form.querySelectorAll(".fl-field")];
      const otp = form.querySelector(".otp-row");
      let firstBad = null;

      if (otp) {
        const filled = [...otp.querySelectorAll("input")].every((i) => i.value.trim());
        if (!filled) { shake(otp); otp.querySelector("input:not([value])")?.focus(); return; }
        // OTP delivery (SMS provider) isn't connected yet — on the live site this
        // must not grant access. The localhost demo keeps working for development.
        if (!isLocalhost()) { showCustomerAuthError(form, "OTP sign-in is coming soon — please log in with your email and password."); return; }
      } else {
        fields.forEach((field) => {
          const inp = field.querySelector("input"); if (!inp) return;
          const [ok, m] = validate(inp);
          setState(field, ok, m);
          if (!ok && !firstBad) firstBad = field;
        });
        if (firstBad) { shake(firstBad); firstBad.querySelector("input").focus(); return; }
      }
      // audit OTP verification + password reset where applicable
      try {
        const RB0 = window.DOODLY_RBAC, route0 = (document.body && document.body.dataset.route) || "";
        if (RB0 && RB0.audit) {
          if (otp) RB0.audit("auth.otp_verified", "OTP verified");
          if (/forgot-password|reset|new-password/.test(route0)) RB0.audit("auth.password_reset", "Password reset completed");
        }
      } catch (e) {}
      const authRoute = (document.body && document.body.dataset.route) || "";
      if (form.dataset.loginRole) { resolveCustomerLogin(form); return; }   // customer portal → real backend sign-in, then navigate
      if (form.dataset.adminLogin) { resolveAdminLogin(form); return; }     // staff portal → real backend sign-in (demo fallback on localhost)
      if (authRoute === "delivery/login") { resolveDeliveryLogin(form); return; }   // executive portal → real sign-in, role-gated
      if (authRoute === "signup") { resolveSignup(form); return; }          // real account creation + auto sign-in
      if (!resolveLogin(form)) return;        // sets the role + destination (and may block on a bad account)
      succeed(form);
    });

    // google — no OAuth client is configured yet: the live site must not grant
    // access from this button (the localhost demo keeps working for development)
    const g = form.querySelector(".btn-google");
    if (g) g.addEventListener("click", () => {
      if (!isLocalhost()) { showCustomerAuthError(form, "Google sign-in is coming soon — please continue with your email and password."); return; }
      succeed(form);
    });

    // demo staff-email shortcuts on the admin login
    scope.querySelectorAll(".auth-demo").forEach((b) => b.addEventListener("click", () => {
      const inp = form.querySelector(".fl-field input"); if (inp) { inp.value = b.dataset.email; inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("blur")); }
    }));
  }

  /* ============================================================
     Role-based redirect — resolves the destination + sets the
     active identity so RBAC routes/nav reflect the role on landing.
     Customer login → customer; Admin login → looked-up or selected
     staff role → that role's dashboard. Blocks disabled/locked.
     ============================================================ */
  function resolveLogin(form) {
    const RB = window.DOODLY_RBAC; if (!RB) return true;
    const showErr = (msg) => { try { if (RB.audit) RB.audit("auth.login_failed", "Blocked sign-in: " + msg, { status: "Failed", entityType: "Session" }); } catch (e) {} const e = form.querySelector("#authErr"); if (e) { e.hidden = false; e.textContent = msg; } shake(form.querySelector(".btn-auth") || form); return false; };
    if (form.dataset.loginRole) {                         // customer portal
      RB.setRealRole(form.dataset.loginRole); if (RB.returnToSelf) RB.returnToSelf(); if (RB.recordLogin) RB.recordLogin(true);
      return true;
    }
    if (form.dataset.adminLogin) {                         // admin / staff portal
      const emailInp = form.querySelector(".fl-field input");
      const email = emailInp ? emailInp.value.trim().toLowerCase() : "";
      const sel = form.querySelector("#adminRole");
      let role = sel ? sel.value : "super_admin", user = null;
      if (email) { try { user = RB.users().find((u) => !u.deleted && (u.email || "").toLowerCase() === email); } catch (e) {} }
      if (user) {
        if (user.status === "disabled") return showErr("This account is disabled. Contact your Super Admin.");
        if (user.status === "locked") return showErr("This account is locked after failed attempts. Contact your Super Admin.");
        if (user.role === "customer") return showErr("That's a customer account — please use Customer Login.");
        role = user.role;                                  // retrieve the assigned role from the account
      }
      RB.setRealRole(role); if (RB.returnToSelf) RB.returnToSelf(); if (RB.recordLogin) RB.recordLogin(true);
      form.dataset.dest = (RB.roleOf(role).home) || "/admin/dashboard.html";   // → correct dashboard for the role
      return true;
    }
    return true;
  }

  /* ============================================================
     Customer login → resolve the REAL backend customer id via the dev
     resolver (POST /api/dev/login), then store it as the current user
     so the static app forwards X-Doodly-Actor-Id and account pages load
     per-customer data. Graceful: wrong credentials block with an inline
     error; an unreachable backend falls back to demo/mock mode so the
     portal stays explorable offline. Production replaces this with the
     real Auth.js session (middleware reads req.auth.user.id directly).
     ============================================================ */
  function isLocalhost() { try { return /^(localhost|127\.0\.0\.1)$/.test(location.hostname); } catch (e) { return true; } }

  /** Exchange email+password for the signed sign-in token; persist the identity.
      Returns { user } on success, "invalid" on bad credentials, null when the
      backend is unreachable / the input isn't an email (→ caller may fall back). */
  async function tokenSignIn(email, password) {
    if (!window.DOODLY_API || !/@/.test(email)) return null;
    try {
      const resolved = await window.DOODLY_API.post("/api/token", { email: email.toLowerCase(), password: password });
      if (resolved && resolved.token && resolved.user && resolved.user.id) {
        try {
          localStorage.setItem("doodly-token", resolved.token);
          localStorage.setItem("doodly-currentuser", JSON.stringify(resolved.user));
        } catch (e) {}
        return { user: resolved.user };
      }
      return null;
    } catch (err) {
      if (err && (err.status === 401 || err.code === "unauthorized")) return "invalid";
      if (err && err.status === 429) return "throttled";
      return null;   // offline / 422 (phone login) / server error
    }
  }

  async function resolveCustomerLogin(form) {
    const RB = window.DOODLY_RBAC;
    const flds = [...form.querySelectorAll(".fl-field input")];
    const emailInp = form.querySelector('input[type="email"]') || flds[0] || null;
    const pwInp = form.querySelector('input[type="password"]') || null;
    const email = emailInp ? String(emailInp.value || "").trim() : "";
    const password = pwInp ? String(pwInp.value || "") : "";

    // Adopt the customer role locally first (works even if the backend is down).
    if (RB) { if (RB.setRealRole) RB.setRealRole("customer"); if (RB.returnToSelf) RB.returnToSelf(); }

    const res = await tokenSignIn(email, password);
    if (res === "invalid") return showCustomerAuthError(form, "Invalid email or password.");
    if (res === "throttled") return showCustomerAuthError(form, "Too many attempts — please try again in a minute.");
    if (res && res.user) {
      if (RB && RB.setRealRole) RB.setRealRole(res.user.role || "customer");
    } else if (!isLocalhost()) {
      // live site + backend reachable but no account matched (e.g. phone number entered)
      return showCustomerAuthError(form, "Please sign in with your registered email and password.");
    }
    // localhost with no backend match → demo (mock) portal stays explorable
    if (RB && RB.recordLogin) RB.recordLogin(true);
    succeed(form);
  }

  /** Staff sign-in: real credentials give the real role everywhere (production
      included). On localhost the existing demo role-picker remains the fallback. */
  async function resolveAdminLogin(form) {
    const RB = window.DOODLY_RBAC;
    const flds = [...form.querySelectorAll(".fl-field input")];
    const emailInp = form.querySelector('input[type="email"]') || flds[0] || null;
    const pwInp = form.querySelector('input[type="password"]') || null;
    const email = emailInp ? String(emailInp.value || "").trim() : "";
    const password = pwInp ? String(pwInp.value || "") : "";

    const res = await tokenSignIn(email, password);
    if (res === "throttled") return showCustomerAuthError(form, "Too many attempts — please try again in a minute.");
    if (res && res.user) {
      if (res.user.role === "customer") return showCustomerAuthError(form, "That's a customer account — please use Customer Login.");
      if (RB) { if (RB.setRealRole) RB.setRealRole(res.user.role); if (RB.returnToSelf) RB.returnToSelf(); if (RB.recordLogin) RB.recordLogin(true); }
      form.dataset.dest = (RB && RB.roleOf && RB.roleOf(res.user.role).home) || "/admin/dashboard.html";
      succeed(form);
      return;
    }
    if (res === "invalid" && !isLocalhost()) return showCustomerAuthError(form, "Invalid email or password.");
    // localhost / offline → the existing demo staff flow (role dropdown + local accounts)
    if (!resolveLogin(form)) return;
    succeed(form);
  }

  /** Delivery-executive sign-in: real credentials only on the live site, and the
      account must actually hold the delivery_executive role. Demo on localhost. */
  async function resolveDeliveryLogin(form) {
    const RB = window.DOODLY_RBAC;
    const flds = [...form.querySelectorAll(".fl-field input")];
    const idInp = flds[0] || null;
    const pwInp = form.querySelector('input[type="password"]') || null;
    const idVal = idInp ? String(idInp.value || "").trim() : "";
    const password = pwInp ? String(pwInp.value || "") : "";

    const res = await tokenSignIn(idVal, password);      // executives sign in with their registered email
    if (res === "throttled") return showCustomerAuthError(form, "Too many attempts — please try again in a minute.");
    if (res && res.user) {
      if (res.user.role !== "delivery_executive" && res.user.role !== "super_admin")
        return showCustomerAuthError(form, "This portal is for delivery executives only — please use the customer or admin login.");
      if (RB) { if (RB.setRealRole) RB.setRealRole(res.user.role); if (RB.returnToSelf) RB.returnToSelf(); if (RB.recordLogin) RB.recordLogin(true); }
      succeed(form); return;
    }
    if (!isLocalhost()) {
      return showCustomerAuthError(form, res === "invalid" ? "Invalid credentials." : "Please sign in with your registered email and password.");
    }
    // localhost demo executive
    if (RB) { if (RB.setRealRole) RB.setRealRole("delivery_executive"); if (RB.returnToSelf) RB.returnToSelf(); if (RB.recordLogin) RB.recordLogin(true); }
    succeed(form);
  }

  /** Sign-up: create a REAL account through the backend, then sign straight in.
      Server enforces unique email/phone + password strength; errors show inline. */
  async function resolveSignup(form) {
    const RB = window.DOODLY_RBAC;
    const flds = [...form.querySelectorAll(".fl-field input")];
    const val = (i) => (flds[i] ? String(flds[i].value || "").trim() : "");
    const name = val(0), phone = val(1);
    const emailInp = form.querySelector('input[type="email"]');
    const email = (emailInp ? String(emailInp.value || "").trim() : val(2)).toLowerCase();
    const pwInp = form.querySelector('input[type="password"]');
    const password = pwInp ? String(pwInp.value || "") : "";

    // arrived mid-purchase (e.g. trial quick-order)? continue to checkout after joining
    const fromOrder = /[?&]order=/.test(location.search);
    if (fromOrder) form.dataset.dest = "/checkout.html";

    if (window.DOODLY_API) {
      try {
        await window.DOODLY_API.post("/api/register", { name: name, email: email, phone: phone || undefined, password: password });
        const res = await tokenSignIn(email, password);
        if (res && res.user && RB) { if (RB.setRealRole) RB.setRealRole("customer"); if (RB.returnToSelf) RB.returnToSelf(); if (RB.recordLogin) RB.recordLogin(true); }
        succeed(form); return;                            // account exists either way — welcome in
      } catch (err) {
        if (err && err.status === 409) return showCustomerAuthError(form, err.message || "An account with this email already exists — try logging in.");
        if (err && err.status === 429) return showCustomerAuthError(form, "Too many attempts — please try again in a minute.");
        if (err && err.details) { const first = Object.values(err.details)[0]; return showCustomerAuthError(form, String(first || err.message || "Please check the highlighted fields.")); }
        if (!isLocalhost()) return showCustomerAuthError(form, (err && err.message) || "Couldn't create your account right now. Please try again.");
      }
    } else if (!isLocalhost()) {
      return showCustomerAuthError(form, "Sign-up is temporarily unavailable. Please try again shortly.");
    }
    // localhost offline demo
    if (RB) { if (RB.setRealRole) RB.setRealRole("customer"); if (RB.returnToSelf) RB.returnToSelf(); }
    succeed(form);
  }

  function showCustomerAuthError(form, msg) {
    let box = form.querySelector("#authErr");
    if (!box) {
      box = document.createElement("div");
      box.className = "auth-err"; box.id = "authErr"; box.setAttribute("role", "alert"); box.setAttribute("aria-live", "assertive");
      const btn = form.querySelector(".btn-auth");
      if (btn) form.insertBefore(box, btn); else form.appendChild(box);
    }
    box.hidden = false; box.textContent = msg;
    shake(form.querySelector(".btn-auth") || form);
  }

  /* ---------- session: logout + configurable idle auto-logout ---------- */
  function logout() {
    try { sessionStorage.removeItem("doodly-session-logged"); } catch (e) {}
    try { localStorage.removeItem("doodly-currentuser"); localStorage.removeItem("doodly-token"); } catch (e) {}
    const RB = window.DOODLY_RBAC; if (RB) { if (RB.returnToSelf) RB.returnToSelf(); RB.audit && RB.audit("auth.logout", "Signed out"); }
    window.location.href = "/login.html";
  }
  let idleTimer = null;
  function setIdleTimeout(min) { try { localStorage.setItem("doodly-idle-min", String(min)); } catch (e) {} initIdle(); }
  function initIdle() {
    let min = 0; try { min = parseInt(localStorage.getItem("doodly-idle-min") || "0", 10) || 0; } catch (e) {}
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (!min) return;                                      // 0 = disabled (configurable; off by default)
    const reset = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { try { if (window.DOODLY_RBAC && window.DOODLY_RBAC.audit) window.DOODLY_RBAC.audit("auth.session_timeout", "Auto sign-out after inactivity", { status: "Success", entityType: "Session" }); } catch (e) {} if (window.DOODLY_PINCODE) DOODLY_PINCODE.toast("Signed out due to inactivity"); logout(); }, min * 60000); };
    ["click", "keydown", "mousemove", "scroll", "touchstart"].forEach((ev) => document.addEventListener(ev, reset, { passive: true }));
    reset();
  }

  function ripple(btn, e) {
    if (reduced()) return;
    const r = btn.getBoundingClientRect(), s = Math.max(r.width, r.height);
    const el = document.createElement("span");
    el.className = "btn-ripple";
    el.style.width = el.style.height = s + "px";
    el.style.left = (e.clientX - r.left - s / 2) + "px";
    el.style.top = (e.clientY - r.top - s / 2) + "px";
    btn.appendChild(el);
    setTimeout(() => el.remove(), 650);
  }
  function shake(el) {
    el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
  }
  function succeed(form) {
    const btn = form.querySelector(".btn-auth");
    const dest = form.dataset.dest || "/account/dashboard.html";
    if (btn) { btn.classList.add("is-loading"); }
    // loading overlay → navigate
    const loader = document.getElementById("authLoader");
    setTimeout(() => {
      if (btn) { btn.classList.remove("is-loading"); btn.classList.add("is-success"); }
      if (loader) loader.classList.add("show");
      setTimeout(() => { window.location.href = dest; }, reduced() ? 250 : 1100);
    }, reduced() ? 150 : 720);
  }

  /* cursor-reactive parallax (transform-only, throttled) */
  function wireCursor(scope) {
    const stage = scope.querySelector(".auth-stage"), scene = scope.querySelector(".auth-scene");
    if (!stage || !scene || reduced() || !window.matchMedia("(pointer:fine)").matches) return;
    const near = scene.querySelector(".as-parallax-near"), far = scene.querySelector(".as-parallax-far"),
      head = scene.querySelector(".as-bhead-look");
    let raf = 0, tx = 0, ty = 0;
    stage.addEventListener("pointermove", (e) => {
      const r = stage.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width * 2 - 1;
      ty = (e.clientY - r.top) / r.height * 2 - 1;
      if (!raf) raf = requestAnimationFrame(apply);
    });
    stage.addEventListener("pointerleave", () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(apply); });
    function apply() {
      raf = 0;
      [near, far].forEach((el) => { if (el) { el.style.setProperty("--ax", tx.toFixed(3)); el.style.setProperty("--ay", ty.toFixed(3)); } });
      if (head) head.style.setProperty("--bx", tx.toFixed(3));
    }
  }

  function ensureLoader() {
    if (document.getElementById("authLoader")) return;
    const d = document.createElement("div");
    d.id = "authLoader"; d.className = "auth-loader"; d.setAttribute("role", "status"); d.setAttribute("aria-live", "polite");
    d.innerHTML = `<div class="auth-loader-inner">
      <div class="al-stage"><span class="al-drop"></span><span class="al-splash"></span>
        <span class="al-logo"><img src="/assets/img/logo.png" alt="DOODLY"></span></div>
      <div><div class="al-text">Preparing your fresh delivery<span class="dots"></span></div>
      <div class="al-sub">Just a moment — pouring something fresh</div></div></div>`;
    document.body.appendChild(d);
  }

  function init(scope) {
    scope = scope || document;
    const sceneEl = scope.querySelector(".auth-scene");
    if (sceneEl && !sceneEl.dataset.built) { sceneEl.innerHTML = sceneSVG(); sceneEl.dataset.built = "1"; }
    const storyEl = scope.querySelector(".auth-story");
    if (storyEl && !storyEl.dataset.built) { storyEl.innerHTML = storyHTML(); storyEl.dataset.built = "1"; }
    const waveEl = scope.querySelector(".auth-wave");
    if (waveEl && !waveEl.dataset.built) { waveEl.innerHTML = waveSVG(); waveEl.dataset.built = "1"; }
    ensureLoader();
    // Live site: Google OAuth + OTP delivery aren't connected yet, so those
    // entry points are removed until real providers exist (defence-in-depth:
    // their handlers are also blocked). The localhost demo keeps them.
    if (!isLocalhost()) {
      scope.querySelectorAll(".btn-google, .auth-otp-link").forEach((el) => {
        el.remove();
      });
      const div = scope.querySelector(".auth-divider");
      if (div && !scope.querySelector(".btn-google")) div.remove();
    }
    wireForm(scope);
    wireCursor(scope);
  }

  return { init, logout, initIdle, setIdleTimeout };
})();
