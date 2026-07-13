/* =============================================================
   DOODLY — Sound Design System  (window.DOODLY_SOUND)
   Subtle, premium, dairy-inspired UI micro-sounds, synthesised live
   with the Web Audio API — no audio files to download, instant
   playback, works offline, tiny memory. Every sound is short
   (<200ms), soft (well below clipping) and calming: soft glass taps,
   warm chimes, milk-drops, a distant farm bell.

   One central manager — components never create their own players.
     DOODLY_SOUND.playClick() / playSuccess() / playError() /
     playNotification() / playWallet() / playReward() /
     playDelivery() / playToggle() / playCheckout() / play(name)
   Accessibility: user Enable/Disable + Low/Med/High volume (persisted),
   honours prefers-reduced-motion, and only ever plays after a real
   user gesture (autoplay-safe). A global, throttled click delegate
   gives buttons/cards/tabs their tap sound automatically.

   Future-ready: a sound can be a synth recipe OR a file URL, so real
   recorded packs (seasonal / festival / morning-dairy ambience) can be
   dropped in later without touching callers.
   ============================================================= */
window.DOODLY_SOUND = (function () {
  "use strict";
  if (window.DOODLY_SOUND && window.DOODLY_SOUND.__ready) return window.DOODLY_SOUND;

  var LS_ON = "doodly-sound-enabled";        // "1" | "0" | null (unset → default)
  var LS_VOL = "doodly-sound-volume";        // "low" | "med" | "high"
  var VOL = { low: 0.032, med: 0.06, high: 0.1 };   // master peak — deliberately quiet (~-18 LUFS feel)
  var reduced = (function () { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } })();

  /* ---------- persisted preferences ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function volKey() { var v = lsGet(LS_VOL); return (v === "low" || v === "med" || v === "high") ? v : "med"; }
  // Default ON — but if the OS asks for reduced motion and the user hasn't chosen,
  // start silent (respecting the accessibility signal). The user can still enable.
  function enabled() { var v = lsGet(LS_ON); if (v === "1") return true; if (v === "0") return false; return !reduced; }

  /* ---------- audio context (lazy + autoplay-safe) ---------- */
  var Ctx = window.AudioContext || window.webkitAudioContext;
  var ac = null, master = null, unlocked = false;
  function ctx() {
    if (!Ctx) return null;
    if (!ac) {
      try { ac = new Ctx(); master = ac.createGain(); master.gain.value = VOL[volKey()]; master.connect(ac.destination); }
      catch (e) { ac = null; }
    }
    if (ac && ac.state === "suspended") { try { ac.resume(); } catch (e) {} }
    return ac;
  }
  // Unlock/resume on the first real gesture (browsers block audio before that).
  function unlock() { if (unlocked) return; unlocked = true; ctx(); }
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
    try { window.addEventListener(ev, unlock, { once: false, passive: true, capture: true }); } catch (e) {}
  });

  /* ---------- tiny synth primitives (clean, no clicks/pops) ---------- */
  // One soft partial: an oscillator with an exponential attack+decay envelope,
  // through a gentle low-pass so nothing is ever harsh. `t0` is a relative offset.
  function partial(o) {
    var a = ctx(); if (!a) return;
    var now = a.currentTime + (o.t0 || 0);
    var osc = a.createOscillator();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.freq, now);
    if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, o.glideTo), now + (o.dur || 0.12));
    var g = a.createGain();
    var peak = (o.gain == null ? 1 : o.gain);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, now + (o.dur || 0.12));
    var node = osc;
    if (o.lp) { var f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.lp; f.Q.value = o.q || 0.7; osc.connect(f); f.connect(g); }
    else { osc.connect(g); }
    g.connect(master);
    osc.start(now);
    osc.stop(now + (o.dur || 0.12) + 0.02);
    // let the nodes be GC'd once done
    osc.onended = function () { try { osc.disconnect(); g.disconnect(); } catch (e) {} };
  }
  // A short filtered-noise texture — the soft "plip"/water body under a drop.
  function noise(o) {
    var a = ctx(); if (!a) return;
    var now = a.currentTime + (o.t0 || 0), dur = o.dur || 0.08;
    var buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
    var d = buf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    var src = a.createBufferSource(); src.buffer = buf;
    var f = a.createBiquadFilter(); f.type = o.type || "bandpass"; f.frequency.value = o.freq || 700; f.Q.value = o.q || 1.2;
    var g = a.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(o.gain == null ? 0.5 : o.gain, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(now); src.stop(now + dur + 0.02);
    src.onended = function () { try { src.disconnect(); f.disconnect(); g.disconnect(); } catch (e) {} };
  }

  /* ---------- the DOODLY sound library (recipes) ----------
     Gains are relative to the (already quiet) master; kept low + warm. */
  var LIB = {
    // soft glass-bottle tap — the default click. one clean high partial + faint body.
    click: function () { partial({ freq: 1620, type: "sine", dur: 0.055, gain: 0.6, lp: 3200 }); partial({ freq: 820, type: "sine", dur: 0.05, gain: 0.18, lp: 1800 }); },
    // tiny softer tap for toggles/switches
    toggle: function () { partial({ freq: 1180, type: "sine", dur: 0.045, gain: 0.5, lp: 2600 }); },
    // a smooth liquid milk-drop — quick downward glide + a filtered plip
    drop: function () { partial({ freq: 900, glideTo: 430, type: "sine", dur: 0.12, gain: 0.5, lp: 2200 }); noise({ freq: 620, dur: 0.06, gain: 0.12, q: 1.4, t0: 0.02 }); },
    // warm dairy chime — a gentle major third+fifth, softly staggered
    success: function () { partial({ freq: 660, type: "sine", dur: 0.20, gain: 0.5, lp: 2800 }); partial({ freq: 830, type: "sine", dur: 0.22, gain: 0.34, lp: 2800, t0: 0.05 }); partial({ freq: 990, type: "sine", dur: 0.26, gain: 0.24, lp: 2800, t0: 0.10 }); },
    // subtle muted "check this field" — soft low two-note dip, never a buzzer
    error: function () { partial({ freq: 300, type: "sine", dur: 0.10, gain: 0.42, lp: 900 }); partial({ freq: 250, type: "sine", dur: 0.13, gain: 0.36, lp: 800, t0: 0.08 }); },
    // calm premium single chime
    notification: function () { partial({ freq: 880, type: "sine", dur: 0.18, gain: 0.4, lp: 3000 }); partial({ freq: 1320, type: "sine", dur: 0.16, gain: 0.16, lp: 3200, t0: 0.02 }); },
    // soft coin + glass — a bright clink over a warm body
    wallet: function () { partial({ freq: 1500, type: "triangle", dur: 0.08, gain: 0.34, lp: 4000 }); partial({ freq: 990, type: "sine", dur: 0.18, gain: 0.3, lp: 2600, t0: 0.03 }); partial({ freq: 1980, type: "sine", dur: 0.10, gain: 0.12, lp: 5000, t0: 0.03 }); },
    // short uplifting farm chime — gentle ascending pentatonic
    reward: function () { partial({ freq: 660, type: "sine", dur: 0.14, gain: 0.42, lp: 3000 }); partial({ freq: 880, type: "sine", dur: 0.14, gain: 0.36, lp: 3000, t0: 0.07 }); partial({ freq: 1170, type: "sine", dur: 0.20, gain: 0.3, lp: 3200, t0: 0.14 }); },
    // milk bottle + distant morning bell
    delivery: function () { partial({ freq: 720, type: "sine", dur: 0.22, gain: 0.4, lp: 2600 }); partial({ freq: 1080, type: "sine", dur: 0.30, gain: 0.2, lp: 3000, t0: 0.06 }); partial({ freq: 540, type: "sine", dur: 0.34, gain: 0.14, lp: 1800, t0: 0.12 }); },
    // elegant checkout confirmation — a warm two-note resolve
    checkout: function () { partial({ freq: 588, type: "sine", dur: 0.16, gain: 0.44, lp: 2800 }); partial({ freq: 784, type: "sine", dur: 0.30, gain: 0.34, lp: 2800, t0: 0.10 }); },
    // very light ambient fade for page transitions (skipped under reduced-motion)
    page: function () { partial({ freq: 520, type: "sine", dur: 0.24, gain: 0.14, attack: 0.06, lp: 1600 }); }
  };
  // map public names → recipe (some share)
  var ALIAS = { click: "click", tap: "click", toggle: "toggle", success: "success", error: "error", notification: "notification", notify: "notification", wallet: "wallet", reward: "reward", delivery: "delivery", checkout: "checkout", page: "page", drop: "drop" };
  var OPTIONAL = { page: 1 };   // suppressed under reduced-motion even when sounds are on

  /* ---------- polyphony / rapid-fire throttle ---------- */
  var lastAt = {}, voices = 0;
  function canPlay(name) {
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    var gap = name === "click" ? 45 : 60;                 // min ms between identical sounds
    if (lastAt[name] && now - lastAt[name] < gap) return false;
    if (voices > 6) return false;                         // cap simultaneous voices
    lastAt[name] = now; return true;
  }

  /* ---------- core play ---------- */
  function play(name, opts) {
    opts = opts || {};
    var key = ALIAS[name] || name;
    if (!LIB[key]) return;
    if (!opts.force) {
      if (!enabled()) return;
      if (reduced && OPTIONAL[key]) return;               // honour reduced-motion for optional sounds
    }
    if (!Ctx) return;                                     // no Web Audio → silent (never breaks)
    if (!opts.force && !canPlay(key)) return;
    if (!ctx()) return;
    try { voices++; LIB[key](); setTimeout(function () { voices = Math.max(0, voices - 1); }, 350); } catch (e) {}
  }

  /* ---------- global click delegation (buttons, cards, tabs, CTAs) ---------- */
  var CLICK_SEL = 'button, .btn, [role="button"], a.btn, a.btn-primary, .cta, .co-next, .btn-auth, .btn-primary, .card[data-href], .tab, .exp-tab, .na-chip, .ad-lab, .pill[role="button"], summary';
  var TOGGLE_SEL = 'input[type="checkbox"], input[type="radio"], .switch, .ap-switch, [role="switch"]';
  function onPointerDown(e) {
    if (!enabled()) return;
    var t = e.target;
    if (t.closest && t.closest(TOGGLE_SEL)) { play("toggle"); return; }
    var hit = t.closest && t.closest(CLICK_SEL);
    if (hit && !hit.classList.contains("no-sound") && hit.getAttribute("data-sound") !== "off") play("click");
  }

  /* ---------- hook the global toast → a calm notification ---------- */
  function hookToast() {
    try {
      var PC = window.DOODLY_PINCODE;
      if (PC && PC.toast && !PC.toast.__soundwrapped) {
        var orig = PC.toast;
        PC.toast = function (m) { try { play("notification"); } catch (e) {} return orig.apply(this, arguments); };
        PC.toast.__soundwrapped = true;
      }
    } catch (e) {}
  }

  /* ---------- public setters ---------- */
  function setEnabled(on) { lsSet(LS_ON, on ? "1" : "0"); if (on) unlock(); }
  function setVolume(v) { v = (v === "low" || v === "med" || v === "high") ? v : "med"; lsSet(LS_VOL, v); if (master && ac) { try { master.gain.setTargetAtTime(VOL[v], ac.currentTime, 0.01); } catch (e) { master.gain.value = VOL[v]; } } }

  /* ---------- customer Settings control (Settings → Sound Effects) ---------- */
  function mountSettings(host) {
    if (!host || host.dataset.soundMounted) return; host.dataset.soundMounted = "1";
    var on = enabled(), vol = volKey();
    host.innerHTML =
      '<div class="snd-card">' +
        '<div class="snd-head"><span class="snd-ic">🔊</span><div><b>Sound effects</b><small>Subtle dairy-inspired taps &amp; chimes on key actions.</small></div>' +
          '<label class="snd-switch"><input type="checkbox" id="sndOn"' + (on ? " checked" : "") + '><span class="snd-knob"></span></label></div>' +
        '<div class="snd-body" id="sndBody"' + (on ? "" : ' hidden') + '>' +
          '<div class="snd-vol"><span>Volume</span><div class="snd-seg" role="group" aria-label="Volume">' +
            ['low', 'med', 'high'].map(function (v) { return '<button type="button" class="snd-v' + (v === vol ? " on" : "") + '" data-v="' + v + '">' + (v === "med" ? "Medium" : v[0].toUpperCase() + v.slice(1)) + '</button>'; }).join("") +
          '</div></div>' +
          '<button type="button" class="btn btn-ghost sm snd-preview">Preview</button>' +
          (reduced ? '<p class="snd-note">Your device requests reduced motion — sounds start off but you can enable them here.</p>' : "") +
        '</div>' +
      '</div>';
    var body = host.querySelector("#sndBody");
    host.querySelector("#sndOn").addEventListener("change", function () { setEnabled(this.checked); body.hidden = !this.checked; if (this.checked) play("success", { force: true }); });
    host.querySelectorAll(".snd-v").forEach(function (b) { b.addEventListener("click", function () { host.querySelectorAll(".snd-v").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); setVolume(b.dataset.v); play("click", { force: true }); }); });
    host.querySelector(".snd-preview").addEventListener("click", function () { preview("success"); });
  }

  /* ---------- admin control (preview library + set default volume) ---------- */
  function mountAdmin(host) {
    if (!host || host.dataset.soundMounted) return; host.dataset.soundMounted = "1";
    var names = ["click", "success", "error", "notification", "wallet", "reward", "delivery", "toggle", "checkout"];
    host.innerHTML =
      '<div class="snd-card"><div class="snd-head"><span class="snd-ic">🎧</span><div><b>UI Sounds</b><small>Preview the DOODLY sound library and set the default volume. Per-customer control lives in their Settings.</small></div>' +
        '<label class="snd-switch"><input type="checkbox" id="sndAOn"' + (enabled() ? " checked" : "") + '><span class="snd-knob"></span></label></div>' +
      '<div class="snd-vol"><span>Default volume</span><div class="snd-seg">' + ['low', 'med', 'high'].map(function (v) { return '<button type="button" class="snd-v' + (v === volKey() ? " on" : "") + '" data-v="' + v + '">' + (v === "med" ? "Medium" : v[0].toUpperCase() + v.slice(1)) + '</button>'; }).join("") + '</div></div>' +
      '<div class="snd-grid">' + names.map(function (n) { return '<button type="button" class="snd-chip" data-p="' + n + '">▶ ' + n + '</button>'; }).join("") + '</div>' +
      '<p class="snd-note">Uploading custom recorded sound packs (seasonal / festival / morning ambience) is future-ready — the service already supports file-based sounds alongside these synthesised ones.</p></div>';
    host.querySelector("#sndAOn").addEventListener("change", function () { setEnabled(this.checked); });
    host.querySelectorAll(".snd-v").forEach(function (b) { b.addEventListener("click", function () { host.querySelectorAll(".snd-v").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); setVolume(b.dataset.v); play("click", { force: true }); }); });
    host.querySelectorAll(".snd-chip").forEach(function (b) { b.addEventListener("click", function () { preview(b.dataset.p); }); });
  }

  function preview(name) { unlock(); play(name, { force: true }); }   // always audible in previews

  /* ---------- control styling (injected once, matches DOODLY tokens) ---------- */
  function injectCSS() {
    if (document.getElementById("doodly-sound-css")) return;
    var css = "" +
      ".snd-card{border:1px solid var(--line,#e6ece8);border-radius:14px;padding:16px 18px;background:var(--surface,#fff)}" +
      ".snd-head{display:flex;align-items:center;gap:12px}.snd-head>div{flex:1}.snd-head b{display:block;font-size:15px;color:var(--forest,#0F3D2E)}.snd-head small{color:var(--ink-3,#6b7a72);font-size:12.5px}" +
      ".snd-ic{font-size:20px}" +
      ".snd-switch{position:relative;width:44px;height:26px;flex:0 0 auto;cursor:pointer;display:inline-block}.snd-switch input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;z-index:1}" +
      ".snd-knob{position:absolute;inset:0;background:#cfd8d3;border-radius:999px;transition:background .2s}.snd-knob::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}" +
      ".snd-switch input:checked+.snd-knob{background:var(--leaf,#1FAE66)}.snd-switch input:checked+.snd-knob::after{transform:translateX(18px)}" +
      ".snd-body{margin-top:14px}.snd-vol{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 0 12px}.snd-vol>span{font-size:13px;color:var(--ink-2,#3a4a42);font-weight:600}" +
      ".snd-seg{display:inline-flex;border:1px solid var(--line,#e6ece8);border-radius:10px;overflow:hidden}.snd-v{border:none;background:#fff;padding:7px 14px;font-size:12.5px;font-weight:600;color:var(--ink-3,#6b7a72);cursor:pointer;border-right:1px solid var(--line,#e6ece8)}.snd-v:last-child{border-right:none}.snd-v.on{background:var(--green-soft,#E7F5EC);color:var(--leaf-600,#158a50)}" +
      ".snd-note{font-size:12px;color:var(--ink-3,#6b7a72);margin:12px 0 0}" +
      ".snd-grid{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.snd-chip{border:1px solid var(--line,#e6ece8);background:#fff;border-radius:999px;padding:6px 13px;font-size:12.5px;color:var(--forest,#0F3D2E);cursor:pointer}.snd-chip:hover{background:var(--green-soft,#E7F5EC)}";
    var st = document.createElement("style"); st.id = "doodly-sound-css"; st.textContent = css; document.head.appendChild(st);
  }

  /* ---------- init ---------- */
  function init() {
    injectCSS();
    try { document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true }); } catch (e) {}
    hookToast();                                   // if pincode.js is already loaded
    setTimeout(hookToast, 1500);                   // …and once more after late scripts load
    // Pages render their content after scripts load, so watch for the control hosts
    // (#soundSettingsMount / #soundAdminMount) to appear and mount them then.
    function scan() {
      var s = document.getElementById("soundSettingsMount"); if (s) mountSettings(s);
      var a = document.getElementById("soundAdminMount"); if (a) mountAdmin(a);
      return !!(s && s.dataset.soundMounted) && !!(a && a.dataset.soundMounted);
    }
    scan();
    try {
      var mo = new MutationObserver(function () { if (scan() || (mounted() === 2)) mo.disconnect(); });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { try { mo.disconnect(); } catch (e) {} }, 20000);   // stop watching eventually
    } catch (e) {}
  }
  function mounted() { var n = 0; var s = document.getElementById("soundSettingsMount"), a = document.getElementById("soundAdminMount"); if (s && s.dataset.soundMounted) n++; if (a && a.dataset.soundMounted) n++; return n; }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  return {
    __ready: true,
    play: play,
    playClick: function () { play("click"); }, playToggle: function () { play("toggle"); },
    playSuccess: function () { play("success"); }, playError: function () { play("error"); },
    playNotification: function () { play("notification"); }, playWallet: function () { play("wallet"); },
    playReward: function () { play("reward"); }, playDelivery: function () { play("delivery"); },
    playCheckout: function () { play("checkout"); }, playPage: function () { play("page"); },
    enabled: enabled, setEnabled: setEnabled, volume: volKey, setVolume: setVolume,
    preview: preview, mountSettings: mountSettings, mountAdmin: mountAdmin, reducedMotion: function () { return reduced; }
  };
})();
