/* =============================================================
   DOODLY — Site manifest: navigation + every route's recipe
   layout.js reads document.body.dataset.route, looks it up here,
   mounts the right chrome, and renders the block recipe.
   Add a page = add a route here + a line in tools/routes.json.
   ============================================================= */
window.DOODLY_MANIFEST = (function () {

  /* ---------------- Navigation ---------------- */
  const nav = {
    public: [
      { label:"About", href:"/about.html" },
      { label:"Our Farmers", href:"/farmers.html" },
      { label:"Products", href:"/products.html" },
      { label:"Subscriptions", href:"/subscriptions.html" },
      { label:"Delivery", href:"/delivery.html" },
      { label:"Bottle Return", href:"/bottle-return.html" },
      { label:"Quality", href:"/quality.html" },
      { label:"Blog", href:"/blog.html" },
      { label:"Contact", href:"/contact.html" },
    ],
    footer: [
      { h:"Products", links:[["A2 Buffalo Milk","/products/milk.html"],["Buffalo Pot Curd","/products/curd.html","Soon"],["Malai Paneer","/products/paneer.html","Soon"],["Buffalo Ghee","/products/ghee.html","Soon"],["Palkova","/products/kova.html","Soon"]] },
      { h:"Customer", links:[["My Account","/account/dashboard.html"],["Orders","/account/orders.html"],["Subscription","/account/subscription.html"],["Delivery Tracking","/account/tracking.html"],["Bottle Returns","/bottle-return.html"]] },
      { h:"Company", links:[["About","/about.html"],["Farmers","/farmers.html"],["Contact","/contact.html"],["FAQs","/faq.html"],["Careers","/about.html"]] },
      { h:"Legal", links:[["Privacy Policy","/privacy.html"],["Terms & Conditions","/terms.html"],["Refund Policy","/refund.html"],["Shipping Policy","/shipping.html"]] },
    ],
    account: [
      { h:"Overview", items:[["Dashboard","/account/dashboard.html","home"]] },
      { h:"Orders & plans", items:[["My Orders","/account/orders.html","box"],["My Subscription","/account/subscription.html","refresh"],["Subscription History","/account/subscription-history.html","clock"]] },
      { h:"Deliveries", items:[["Deliveries","/account/deliveries.html","truck"],["Delivery Tracking","/account/tracking.html","pin"],["Calendar","/account/calendar.html","cal"]] },
      { h:"Bottles & money", items:[["Bottle Tracking","/account/bottles.html","bottle"],["Wallet","/account/wallet.html","wallet"],["Invoices","/account/invoices.html","receipt"]] },
      { h:"Rewards", items:[["Referrals","/account/referrals.html","gift"],["Rewards","/account/rewards.html","award"],["Support","/account/support.html","msg"]] },
      { h:"Account", items:[["Addresses","/account/addresses.html","pin"],["Notifications","/account/notifications.html","bell"],["Profile","/account/profile.html","user"],["Settings","/account/settings.html","settings"]] },
    ],
    admin: [
      { h:"Overview", items:[["Dashboard","/admin/dashboard.html","chart"]] },
      { h:"Commerce", items:[["Orders","/admin/orders.html","box"],["Subscriptions","/admin/subscriptions.html","refresh"],["Subscription Billing","/admin/billing.html","card"],["Customers","/admin/customers.html","users"],["Payments","/admin/payments.html","card"]] },
      { h:"Catalogue", items:[["Products","/admin/products.html","tag"],["Categories","/admin/categories.html","clipboard"],["Inventory","/admin/inventory.html","pkg"],["Bottle Inventory","/admin/bottle-inventory.html","bottle"],["Delivery Settings","/admin/delivery-settings.html","clock"]] },
      { h:"Operations", items:[["Delivery Mgmt","/admin/deliveries.html","truck"],["Serviceable Areas","/admin/serviceable-areas.html","pin"],["Drivers","/admin/drivers.html","user"],["Routes","/admin/routes.html","route"]] },
      { h:"Supply", items:[["Farmers","/admin/farmers.html","sprout"],["Procurement","/admin/procurement.html","factory"],["Quality Testing","/admin/quality.html","beaker"]] },
      { h:"Growth", items:[["Reports","/admin/reports.html","file"],["Revenue","/admin/revenue.html","coins"],["Coupons","/admin/coupons.html","percent"],["Offers","/admin/offers.html","gift"]] },
      { h:"Content", items:[["Blogs","/admin/blogs.html","edit"],["CMS","/admin/cms.html","clipboard"],["Notifications","/admin/notifications.html","bell"]] },
      { h:"System", items:[["Support Tickets","/admin/support.html","msg"],["User Management","/admin/users.html","users"],["Roles & Permissions","/admin/roles.html","lock"],["Permissions","/admin/permissions.html","lock"],["Audit Logs","/admin/audit-logs.html","eye"],["Settings","/admin/settings.html","settings"]] },
    ],
    driver: [
      { h:"Today", items:[["Dashboard","/driver/dashboard.html","home"],["Today's Route","/driver/route.html","route"],["Deliveries","/driver/deliveries.html","truck"]] },
      { h:"Tasks", items:[["Bottle Collection","/driver/bottles.html","bottle"],["Cash Collection","/driver/cash.html","wallet"]] },
      { h:"Records", items:[["Completed","/driver/completed.html","check"],["History","/driver/history.html","clock"]] },
      { h:"Account", items:[["Profile","/driver/profile.html","user"]] },
    ],
    delivery: [
      { h:"Today", items:[["My Route","/delivery/dashboard.html","route"]] },
      { h:"Account", items:[["Profile","/delivery/profile.html","user"],["Sign out","/delivery/login.html","logout"]] },
    ],
  };

  /* shorthand builders for compact recipes */
  const head = (title, sub, actions) => ({ type:"pageHead", title, sub, actions });
  const tbl = (dataset, opts={}) => Object.assign({ type:"table", dataset }, opts);

  /* ---------------- Routes ---------------- */
  const routes = {

    /* ===== PUBLIC ===== */
    "home": { surface:"public", title:"Home", full:true, blocks:[
      { type:"storeHero" }, { type:"whyGrid" }, { type:"stepsRow" },
      { type:"productGrid" }, { type:"builderSection" }, { type:"plansCompare" },
      { type:"testimonialGrid" }, { type:"faqSection" }, { type:"downloadApp" }, { type:"ctaBand" },
    ]},

    "about": { surface:"public", title:"About Us", hero:{ eyebrow:"Our story", title:"Fresh milk, the way it used to be.", text:"DOODLY began with a simple frustration — good, honest milk had become impossible to find in the city. So we went back to the source." }, blocks:[
      { type:"prose", lede:"We are a small team obsessed with one thing: getting genuinely fresh A2 buffalo milk from trusted local farms to your door, in glass, before breakfast.", sections:[
        { h:"Our mission", p:["Make farm-fresh, chemical-free milk the default for every family — delivered daily, priced fairly, and packaged without plastic."] },
        { h:"Our vision", p:["A short, transparent supply chain where you know the farm your milk came from, and farmers earn a fair, predictable income."] },
      ]},
      { type:"kpis", items:[{n:"12+",l:"Partner farms"},{n:"100%",l:"Glass bottles"},{n:"0",l:"Preservatives"},{n:"4.8★",l:"Customer rating"}] },
      { type:"split", eyebrow:"Our journey", title:"From one farm to a daily ritual.", p:["What started as a weekend experiment with a single buffalo farm now reaches thousands of mornings across the city — still single-source, still same-day."], bullets:["2024 — first farm partnership","2025 — glass-bottle cold chain","2026 — daily subscriptions city-wide"], media:"🌅", mediaLabel:"Built fresh, like the milk" },
      { type:"cardGrid", cols:3, cards:[
        { ic:"factory", title:"Our dairy", text:"Infrastructure, chilling and quality standards.", link:"Explore", href:"/dairy.html" },
        { ic:"sprout", title:"Our farmers", text:"The families behind every bottle.", link:"Meet them", href:"/farmers.html" },
        { ic:"users", title:"Meet the team", text:"The people building DOODLY.", link:"Say hi", href:"/team.html" },
      ]},
      { type:"ctaBand", title:"Come taste the difference." },
    ]},

    "dairy": { surface:"public", title:"Our Dairy", hero:{ eyebrow:"Our dairy", title:"Where freshness is engineered.", text:"Rapid chilling, sterile glass bottling, and batch-level testing — the infrastructure that keeps DOODLY honest." }, blocks:[
      { type:"split", eyebrow:"Infrastructure", title:"A cold chain that never breaks.", p:["Milk is snap-cooled to 4°C within minutes of collection and stays cold all the way to your door."], bullets:["Bulk milk coolers at collection","Insulated same-morning transport","Sterilised glass-bottling line"], media:"❄️" },
      { type:"split", rev:true, eyebrow:"Quality standards", title:"Tested before it's trusted.", p:["Every batch is checked for fat, SNF, temperature and adulteration before it is ever bottled."], bullets:["Lactometer + fat/SNF on each batch","Adulteration screening","Reject-and-return if it fails"], media:"🧪" },
      { type:"kpis", items:[{n:"4°C",l:"Cold chain"},{n:"<30 min",l:"To chilling"},{n:"100%",l:"Batch tested"},{n:"Glass",l:"Packaging"}] },
      { type:"cardGrid", cols:2, cards:[
        { ic:"beaker", title:"Quality & safety", text:"See our testing process and reports.", link:"View", href:"/quality.html" },
        { ic:"bottle", title:"Bottle return program", text:"How our reusable glass loop works.", link:"Learn", href:"/bottle-return.html" },
      ]},
    ]},

    "team": { surface:"public", title:"Meet Our Team", hero:{ eyebrow:"Our people", title:"Built by people who care about mornings.", text:"A small, cross-functional team across operations, supply, technology and delivery." }, blocks:[
      { type:"cardGrid", cols:4, cards:[
        { ic:"user", title:"Founder & CEO", text:"Sets the vision and obsesses over milk quality." },
        { ic:"factory", title:"Head of Supply", text:"Builds farmer relationships and the cold chain." },
        { ic:"truck", title:"Head of Operations", text:"Runs routes, drivers and daily delivery." },
        { ic:"chart", title:"Head of Product", text:"Designs the app and subscription experience." },
      ]},
      { type:"prose", sections:[{ h:"Want to join?", p:["We're always looking for people who care about food, farmers and craft. Write to careers@doodly.in."] }] },
    ]},

    "farmers": { surface:"public", title:"Our Farmers", hero:{ eyebrow:"Our farmers", title:"We know every farm by name.", text:"DOODLY works with a small circle of family-run buffalo farms — no middlemen, no pooled milk from a hundred herds." }, blocks:[
      { type:"split", eyebrow:"Farmer stories", title:"Three generations, one herd.", p:["The Lakshmaiah family has farmed buffalo on the edge of Shamirpet for over forty years. Today their milk reaches your door within hours of the morning milking.","We visit, we test, and we pay fairly — on time, every time."], media:"🌾", mediaLabel:"Single-source. Same-day." },
      { type:"kpis", items:[{n:"12+",l:"Partner farms"},{n:"₹62/L",l:"Fair avg rate"},{n:"Daily",l:"Collection"},{n:"100%",l:"Tested"}] },
      { type:"cardGrid", cols:3, cards:[
        { ic:"sprout", title:"Procurement process", text:"How we collect, test and price milk each morning." },
        { ic:"award", title:"Farmer benefits", text:"Fair rates, on-time pay, and steady demand." },
        { ic:"factory", title:"Milk collection", text:"From farm cans to chilled bulk coolers." },
      ]},
      { type:"split", rev:true, eyebrow:"Farmer gallery", title:"A look at the farms.", p:["Open pastures, healthy herds, and clean milking — the conditions that make A2 buffalo milk taste the way it should."], media:"📸" },
      { type:"ctaBand", title:"Taste the work of real farmers." },
    ]},

    "products": { surface:"public", title:"Products", hero:{ eyebrow:"Our products", title:"Start with milk. More is on the way.", text:"Milk is available to order today. Curd, paneer, kova and ghee — all from the same A2 milk — are coming soon. Admins launch each with a single status flip." }, blocks:[
      { type:"productGrid", head:false },
      { type:"notice", icon:"tag", text:"<b>Scalable by design:</b> every product is a data row. Flip <code>status: \"coming_soon\" → \"available\"</code> in the admin CMS and that product becomes fully orderable — no code change." },
      { type:"plansCompare", bg:false },
    ]},
    "products/milk":   { surface:"public", title:"A2 Buffalo Milk", full:true, blocks:[{ type:"productDetail", product:"milk" }] },
    "products/curd":   { surface:"public", title:"Buffalo Pot Curd", full:true, blocks:[{ type:"comingSoon", productId:"curd" }] },
    "products/paneer": { surface:"public", title:"Malai Paneer", full:true, blocks:[{ type:"comingSoon", productId:"paneer" }] },
    "products/kova":   { surface:"public", title:"Palkova", full:true, blocks:[{ type:"comingSoon", productId:"kova" }] },
    "products/ghee":   { surface:"public", title:"Buffalo Ghee", full:true, blocks:[{ type:"comingSoon", productId:"ghee" }] },
    "checkout":        { surface:"public", title:"Checkout", full:true, blocks:[{ type:"checkout" }] },

    "subscriptions": { surface:"public", title:"Subscription Plans", full:true, blocks:[
      { type:"innerHero", eyebrow:"Subscriptions", title:"Your milk, your schedule, your price.", text:"Pick a bottle and a plan — we do the maths and show you exactly what you save." },
      { type:"builderSection" }, { type:"plansCompare" },
      { type:"faqSection" },
    ]},

    "delivery": { surface:"public", title:"Delivery Process", hero:{ eyebrow:"Delivery process", title:"How milk reaches your door.", text:"From the farmer's hands to your doorstep — chilled, tracked, and on time, every single morning." }, blocks:[
      { type:"stepsRow" },
      { type:"split", eyebrow:"Timeline", title:"A typical DOODLY morning.", p:["4:30 AM collection · 5:00 testing · 5:15 chilling · 5:45 bottling · 6:00 dispatch · 6:40 at your door."], bullets:["Live tracking in your dashboard","Proof-of-delivery photo + OTP","Contactless handover option"], media:"🚚" },
      { type:"cardGrid", cols:2, cards:[
        { ic:"pin", title:"Live tracking", text:"Follow today's delivery from your account.", link:"Open dashboard", href:"/account/tracking.html" },
        { ic:"bottle", title:"Bottle return", text:"We collect empties on your next delivery.", link:"How it works", href:"/bottle-return.html" },
      ]},
    ]},

    "bottle-return": { surface:"public", title:"Bottle Return Program", hero:{ eyebrow:"Reusable glass", title:"The bottle comes back. So does your deposit.", text:"DOODLY runs a closed glass loop — sterilise, fill, deliver, collect, repeat. Better for your milk and the planet." }, blocks:[
      { type:"kpis", items:[{n:"Glass",l:"100% packaging"},{n:"₹120",l:"Refundable deposit"},{n:"Next-day",l:"Collection"},{n:"∞",l:"Reuse cycle"}] },
      { type:"split", eyebrow:"How the deposit works", title:"Pay once, get it back.", p:["A small refundable deposit is added per bottle on your first order. Return the empties and the deposit stays in your wallet — track every bottle issued and returned in your dashboard."], bullets:["Bottle tracking ledger","Return request in one tap","Lost-bottle charges only if not returned"], media:"♻️" },
      { type:"faq", items:[
        { q:"How do I return empties?", a:"Just leave them out on your next delivery — our executive collects them and updates your ledger automatically." },
        { q:"When is my deposit refunded?", a:"As soon as a bottle is marked returned, the deposit is credited back to your DOODLY wallet." },
        { q:"What if a bottle breaks?", a:"Accidents happen. A small replacement charge applies only for bottles not returned over time." },
      ]},
    ]},

    "quality": { surface:"public", title:"Quality & Safety", hero:{ eyebrow:"Quality & safety", title:"Tested before it's trusted.", text:"Every batch is screened for fat, SNF, temperature and adulteration. If it doesn't pass, it doesn't ship." }, blocks:[
      { type:"kpis", items:[{n:"7.5%",l:"Avg fat"},{n:"9.1",l:"Avg SNF"},{n:"4°C",l:"Cold chain"},{n:"100%",l:"Batch tested"}] },
      { type:"split", eyebrow:"Testing", title:"What we check, every morning.", p:["Lactometer reading, fat and SNF percentage, temperature at collection and dispatch, and adulteration screening — recorded per batch."], bullets:["Fat & SNF on every batch","Temperature logged end-to-end","Adulteration screening"], media:"🧪" },
      { type:"split", rev:true, eyebrow:"Cold chain", title:"Cold from farm to door.", p:["Milk never warms up between the farm and your fridge — bulk coolers, insulated transport, and chilled delivery."], bullets:["<30 min to 4°C","Insulated transport","Chilled handover"], media:"❄️" },
      { type:"notice", icon:"shield", text:"<b>Certifications & reports:</b> FSSAI compliant. Monthly quality reports are published to your account." },
    ]},

    "blog": { surface:"public", title:"Blog", hero:{ eyebrow:"DOODLY journal", title:"Milk, farmers, and fresh thinking.", text:"Stories from the farm, nutrition deep-dives, and the craft behind your daily bottle." }, blocks:[
      { type:"html", html:`<div class="chips-row"><span class="chip-f active">All</span><span class="chip-f">Nutrition</span><span class="chip-f">Our farmers</span><span class="chip-f">Sustainability</span><span class="chip-f">Quality</span><span class="chip-f">Recipes</span></div>` },
      { type:"blogList" },
    ]},
    "blog/why-a2": { surface:"public", title:"Why A2 buffalo milk is easier to digest", blocks:[
      { type:"innerHero", eyebrow:"Nutrition · 5 min", title:"Why A2 buffalo milk is easier to digest", text:"The science behind A2 beta-casein and what it means for your gut." },
      { type:"prose", sections:[
        { h:"What is A2 milk?", p:["A2 milk contains only the A2 type of beta-casein protein, rather than the A1 type found in much mixed-herd milk. Many people find A2 milk gentler on digestion."] },
        { h:"Why buffalo milk?", p:["DOODLY sources naturally A2 buffalo milk, which is also richer in fat and protein — creamier chai, thicker curd, better paneer."] },
        { h:"The freshness factor", p:["Even the best milk loses something when it sits. Chilled within minutes and delivered same-morning, DOODLY keeps the taste intact."] },
      ]},
      { type:"ctaBand", title:"Taste it tomorrow morning." },
    ]},

    "contact": { surface:"public", title:"Contact Us", hero:{ eyebrow:"Contact", title:"We'd love to hear from you.", text:"Questions about milk, delivery, or your subscription? Reach out — we usually reply within a few hours." }, blocks:[
      { type:"columns", cols:2, items:[
        { type:"form", title:"Send us a message", cols:2, fields:[
          { label:"Full name", placeholder:"Your name" },
          { label:"Phone", type:"tel", placeholder:"+91 …" },
          { label:"Email", type:"email", placeholder:"you@email.com", full:true },
          { label:"Subject", type:"select", options:["General enquiry","Delivery issue","Subscription help","Partnership"], full:true },
          { label:"Message", type:"textarea", placeholder:"How can we help?", full:true },
        ], submit:"Send message" },
        (function(){
          var b=(window.DOODLY&&window.DOODLY.brand)||{}, s=b.support||{};
          var wa=String(s.whatsapp||"").replace(/\D/g,""), phone=s.phone||b.phone||"", email=s.email||b.email||"";
          var subj=encodeURIComponent(s.emailSubject||"DOODLY Customer Support");
          var rows=[];
          if(phone) rows.push(["Call us", `<a href="tel:${phone.replace(/\s/g,"")}" aria-label="Call DOODLY Customer Support">${phone}</a>`]);
          if(wa) rows.push(["WhatsApp", `<a href="https://wa.me/${wa}" target="_blank" rel="noopener noreferrer" title="Chat with us on WhatsApp" aria-label="Chat with DOODLY on WhatsApp">${s.whatsapp}</a>`]);
          if(email) rows.push(["Email", `<a href="mailto:${email}?subject=${subj}" aria-label="Email DOODLY Support">${email}</a>`]);
          rows.push(["Service area", `${b.city||"Vijayawada"} & Tadepalli`]);
          rows.push(["Support hours", s.hours||"Mon–Sat, 8 AM – 8 PM"]);
          return { type:"deflist", title:"Reach us directly", rows: rows };
        })(),
      ]},
      { type:"html", html:`<div class="pincard mt-3"><div class="pincard-h">Check if we deliver to you</div><p class="pincard-p">Enter your pincode to see if DOODLY is live in your area.</p><div id="pincodeCheckerMount"></div></div>` },
    ]},

    "faq": { surface:"public", title:"FAQ", hero:{ eyebrow:"Help centre", title:"Frequently asked questions", text:"Search common questions about milk, delivery, bottles and billing." }, blocks:[
      { type:"html", html:`<div class="search-box" style="max-width:520px;margin:0 auto 24px">${window.DOODLY_BLOCKS?window.DOODLY_BLOCKS.icon("search"):""}<input class="input" placeholder="Search the FAQ…" style="width:100%"></div>` },
      { type:"html", html:`<div class="chips-row" style="justify-content:center"><span class="chip-f active">All</span><span class="chip-f">Milk</span><span class="chip-f">Delivery</span><span class="chip-f">Bottles</span><span class="chip-f">Billing</span><span class="chip-f">Account</span></div>` },
      { type:"faq" },
    ]},

    "privacy":  { surface:"public", title:"Privacy Policy", hero:{ eyebrow:"Legal", title:"Privacy Policy", text:"Your information, protected — here's exactly how." }, blocks:[
      { type:"policyDoc", illus:"privacy",
        updated:"Last updated 28 June 2026",
        intro:"At DOODLY, we value your privacy and are committed to protecting your personal information. This Privacy Policy explains how we collect, use, store, disclose, and safeguard your information when you use our website, mobile application, and milk delivery services. By accessing or using our services, you agree to the practices described in this Privacy Policy.",
        sections:[
          { n:1, h:"Information We Collect", p:["We may collect the following types of information:"], subs:[
            { h:"Personal Information", list:["Full name","Mobile number","Email address","Delivery address","Billing address","Customer account details"] },
            { h:"Transaction Information", list:["Order history","Subscription details","Payment information (processed through secure payment providers)","Refund and return records"] },
            { h:"Technical Information", list:["Device information","IP address","Browser type","Operating system","Website or application usage data"] },
            { h:"Customer Support Information", list:["Feedback, complaints, and inquiries","Communications with our customer support team"] },
          ] },
          { n:2, h:"How We Use Your Information", p:["We use your information for the following purposes:"], list:["Processing and delivering orders","Managing subscriptions and recurring deliveries","Providing customer support","Processing payments, refunds, and bottle deposit adjustments","Sending order confirmations and service updates","Improving our products and services","Preventing fraud and unauthorized activities","Complying with legal and regulatory requirements"] },
          { n:3, h:"Sharing of Information", p:["DOODLY does not sell, rent, or trade your personal information to third parties.","We may share information with:"], list:["Delivery partners for order fulfillment","Payment service providers for transaction processing","Technology and service providers assisting in business operations","Government authorities or regulatory bodies when required by law"], after:["All third-party service providers are required to protect customer information and use it only for authorized purposes."] },
          { n:4, h:"Data Security", p:["We implement reasonable technical, administrative, and physical safeguards to protect your information against unauthorized access, disclosure, alteration, or destruction.","While we strive to protect your information, no method of electronic transmission or storage is completely secure, and we cannot guarantee absolute security."] },
          { n:5, h:"Data Retention", p:["We retain personal information only for as long as necessary to:"], list:["Provide services to customers","Fulfill legal and regulatory obligations","Resolve disputes","Enforce agreements and policies"], after:["When information is no longer required, it will be securely deleted or anonymized."] },
          { n:6, h:"Cookies and Tracking Technologies", p:["Our website or application may use cookies and similar technologies to:"], list:["Improve user experience","Remember user preferences","Analyze website performance","Enhance service functionality"], after:["Customers may adjust browser settings to disable cookies; however, certain features may not function properly as a result."] },
          { n:7, h:"Customer Rights", p:["Subject to applicable laws, customers may have the right to:"], list:["Access their personal information","Request correction of inaccurate information","Request deletion of information where legally permissible","Withdraw consent for certain communications","Raise concerns regarding the handling of personal information"], after:["Requests may be submitted through the contact details provided below."] },
          { n:8, h:"Children's Privacy", p:["Our services are not intended for individuals under the age of 18 without parental or guardian supervision. We do not knowingly collect personal information from children."] },
          { n:9, h:"Third-Party Links", p:["Our platform may contain links to third-party websites or services. DOODLY is not responsible for the privacy practices or content of such third-party platforms. Customers are encouraged to review their respective privacy policies."] },
          { n:10, h:"Changes to this Privacy Policy", p:["DOODLY reserves the right to modify or update this Privacy Policy at any time.","Any changes will become effective upon publication on our website, application, or official communication channels. Continued use of our services after such updates constitutes acceptance of the revised Privacy Policy."] },
          { n:11, h:"Contact Us", p:["For questions, concerns, or requests related to this Privacy Policy, please contact:"], contact:true },
        ],
        foot:"By using DOODLY's website, application, or services, you acknowledge that you have read, understood, and agreed to this Privacy Policy. 🥛🔒🌱"
      }
    ] },
    "terms":    { surface:"public", title:"Terms & Conditions", hero:{ eyebrow:"Legal", title:"Terms & Conditions", text:"The agreement that keeps every DOODLY morning fair and clear." }, blocks:[
      { type:"policyDoc", illus:"terms",
        updated:"Last updated 28 June 2026",
        intro:"Welcome to DOODLY. These Terms & Conditions govern the use of our website, mobile application, and milk delivery services. By placing an order or using our services, you agree to be bound by these terms.",
        sections:[
          { n:1, h:"General", p:["1.1 These Terms & Conditions apply to all customers who purchase products or use services offered by DOODLY.","1.2 DOODLY reserves the right to accept, reject, suspend, or cancel any order at its sole discretion.","1.3 Customers are responsible for providing accurate personal, delivery, and contact information.","1.4 DOODLY provides fresh milk and dairy products on a best-effort basis and strives to maintain the highest standards of quality, hygiene, and service.","1.5 By using our platform, you confirm that you are legally capable of entering into a binding agreement under applicable laws."] },
          { n:2, h:"Amendments", p:["2.1 DOODLY reserves the right to modify, update, or revise these Terms & Conditions at any time without prior notice.","2.2 Any amendments will become effective upon publication on our website, application, or other official communication channels.","2.3 Continued use of the platform and services after such changes constitutes acceptance of the revised Terms & Conditions.","2.4 Customers are encouraged to review these Terms & Conditions periodically."] },
          { n:3, h:"Use of Platform and Services", p:["3.1 Customers may use the platform solely for lawful purposes and for purchasing products offered by DOODLY.","3.2 Customers shall not:"], list:["Use the platform for fraudulent activities.","Provide false or misleading information.","Interfere with the operation or security of the platform.","Attempt unauthorized access to any part of the platform or systems."], after:["3.3 DOODLY reserves the right to suspend or terminate accounts involved in misuse, fraud, abusive conduct, or violation of these Terms.","3.4 Product availability may vary depending on location, inventory, weather conditions, operational requirements, and delivery feasibility."] },
          { n:4, h:"Orders and Deliveries", p:["4.1 Orders are subject to acceptance and availability.","4.2 Delivery schedules are estimated and may vary due to traffic, weather, public holidays, operational constraints, or unforeseen circumstances.","4.3 Customers must ensure someone is available to receive the delivery at the specified address.","4.4 DOODLY shall not be liable for delays caused by circumstances beyond its reasonable control."] },
          { n:5, h:"Pricing and Payments", p:["5.1 All prices are displayed in Indian Rupees (INR) and are subject to change without prior notice.","5.2 Payment must be completed through approved payment methods offered by DOODLY.","5.3 In the event of a pricing or technical error, DOODLY reserves the right to cancel or modify the affected order and issue a refund if applicable."] },
          { n:6, h:"Glass Bottle Policy", p:["6.1 Milk is supplied in reusable glass bottles to promote sustainability.","6.2 Customers are responsible for returning empty bottles during subsequent deliveries.","6.3 Any bottle deposit, if applicable, shall be refunded or adjusted according to the Refund & Return Policy.","6.4 DOODLY reserves the right to charge for bottles that are lost, damaged, or not returned."] },
          { n:7, h:"Product Quality and Customer Responsibilities", p:["7.1 Customers should inspect products at the time of delivery whenever possible.","7.2 Products must be stored under appropriate refrigeration conditions after delivery.","7.3 DOODLY shall not be responsible for deterioration in product quality resulting from improper storage or handling by the customer."] },
          { n:8, h:"Limitation of Liability", p:["8.1 DOODLY's liability shall be limited to the value of the affected order.","8.2 DOODLY shall not be liable for indirect, incidental, consequential, or special damages arising from the use of its products or services.","8.3 Nothing in these Terms limits liability where such limitation is prohibited by applicable law."] },
          { n:9, h:"Intellectual Property", p:["9.1 All content, logos, trademarks, designs, images, text, and branding associated with DOODLY are the property of DOODLY and may not be used without prior written permission.","9.2 Unauthorized reproduction, distribution, or use of any content is prohibited."] },
          { n:10, h:"Privacy", p:["10.1 Customer information collected by DOODLY shall be used in accordance with the company's Privacy Policy.","10.2 DOODLY may collect and process information necessary to provide services, manage deliveries, and improve customer experience."] },
          { n:11, h:"Force Majeure", p:["DOODLY shall not be held responsible for any failure or delay in performance resulting from events beyond its reasonable control, including natural disasters, strikes, government restrictions, transportation disruptions, power failures, or other unforeseen circumstances."] },
          { n:12, h:"Governing Law and Jurisdiction", p:["These Terms & Conditions shall be governed by and construed in accordance with the laws of India. Any disputes arising out of or relating to these Terms shall be subject to the exclusive jurisdiction of the courts in Vijayawada."] },
          { n:13, h:"Contact Information", p:["For any questions regarding these Terms & Conditions, please contact:"], contact:true },
        ],
        foot:"By placing an order or using DOODLY's services, you acknowledge that you have read, understood, and agreed to these Terms & Conditions. 🥛📄🌱"
      }
    ] },
    "refund":   { surface:"public", title:"Refund & Return Policy", hero:{ eyebrow:"Legal", title:"Refund & Return Policy", text:"Fresh quality, guaranteed — and made right if we ever fall short." }, blocks:[
      { type:"policyDoc", illus:"refund",
        updated:"Last updated 28 June 2026",
        intro:"At DOODLY, we are committed to delivering fresh, high-quality milk in reusable glass bottles directly to your doorstep. Customer satisfaction is our priority, and this Refund & Return Policy explains the conditions under which refunds, replacements, and bottle returns are handled.",
        sections:[
          { n:1, h:"Product Quality Guarantee", p:["If you receive milk that is:"], list:["Spoiled, sour, or contaminated","Leaking due to packaging damage","Incorrectly delivered","Significantly below the quality standards promised by DOODLY"], after:["Please notify us within 2 hours of delivery with clear photographs or videos of the product.","Upon verification, we may offer a replacement delivery, or a full refund for the affected product."] },
          { n:2, h:"Non-Refundable Situations", p:["Refunds will not be provided in the following cases:"], list:["The product has been consumed partially or fully.","The milk was not stored properly after delivery.","Complaints are raised after 2 hours of delivery without a valid reason.","The customer was unavailable to receive the order despite prior delivery attempts.","Change of mind after successful delivery."] },
          { n:3, h:"Glass Bottle Deposit & Returns", p:["To support sustainability, DOODLY delivers milk in reusable glass bottles."], subs:[
            { h:"Bottle Return", list:["Customers are requested to return empty glass bottles during the next scheduled delivery.","Returned bottles must be reasonably clean and free from excessive damage."] },
            { h:"Bottle Deposit — ₹100.00", p:["Any refundable bottle deposit charged at the time of purchase will be refunded or adjusted against future orders once the bottle is returned in acceptable condition."] },
            { h:"Damaged or Missing Bottles", p:["Bottles that are broken, lost, or not returned may result in forfeiture of the bottle deposit or a replacement bottle charge."] },
          ] },
          { n:4, h:"Subscription Orders", p:["For customers enrolled in recurring milk deliveries:"], list:["Order modifications, pauses, or cancellations must be requested before the daily cut-off time communicated by DOODLY.","Deliveries already processed or dispatched for the day cannot be refunded."] },
          { n:5, h:"Refund Processing", p:["Approved refunds will be processed:"], list:["To the original payment method used for purchase, or","As wallet/store credit for future orders."], after:["Refunds are generally processed within 5–7 business days after approval."] },
          { n:6, h:"Contact Us", p:["For quality concerns, refund requests, or bottle return queries, please contact:"], contact:true },
        ],
        foot:"Our promise: Every bottle of DOODLY milk is sourced, chilled, bottled, and delivered with care. If we ever fall short of our quality commitment, we will work promptly to make it right. 🥛🤝🌱"
      }
    ] },
    "shipping": { surface:"public", title:"Shipping & Delivery Policy", hero:{ eyebrow:"Legal", title:"Shipping & Delivery Policy", text:"Fresh milk and dairy, delivered to your doorstep with care." }, blocks:[
      { type:"policyDoc", illus:"delivery",
        updated:"Last updated 28 June 2026",
        intro:"At DOODLY, we are committed to delivering fresh milk and dairy products safely and efficiently to your doorstep. This Shipping & Delivery Policy outlines how we process, dispatch, and deliver orders.",
        sections:[
          { n:1, h:"Delivery Areas", p:["DOODLY currently provides home delivery services within selected serviceable locations in and around Vijayawada.","Delivery availability may vary based on:"], list:["Service location","Operational capacity","Route feasibility","Weather and local conditions"], after:["Customers can verify service availability by contacting our customer support team."] },
          { n:2, h:"Order Processing", p:["Orders are processed according to the delivery schedule communicated by DOODLY.","Subscription orders are automatically scheduled based on the selected delivery plan.","New orders received after the daily cut-off time may be scheduled for the next available delivery slot."] },
          { n:3, h:"Delivery Schedule", p:["Fresh milk and dairy products are generally delivered during designated delivery windows.","Delivery timings may vary depending on location, traffic conditions, weather, and operational requirements.","While we strive for timely deliveries, specific delivery times cannot be guaranteed."] },
          { n:4, h:"Delivery Charges", p:["Delivery charges, if applicable, will be displayed at the time of order placement.","DOODLY reserves the right to revise delivery charges based on service area, order value, or operational requirements."] },
          { n:5, h:"Customer Responsibilities", p:["Customers are responsible for:"], list:["Providing accurate delivery information.","Ensuring access to the delivery location.","Being available to receive the order or providing a safe delivery instruction.","Returning reusable glass bottles during scheduled deliveries when applicable."], after:["DOODLY shall not be responsible for delays or failed deliveries resulting from incorrect information provided by the customer."] },
          { n:6, h:"Contactless Delivery", p:["Where applicable, deliveries may be left at a designated location specified by the customer.","Once the order has been successfully delivered to the designated location, responsibility for the product transfers to the customer."] },
          { n:7, h:"Delivery Delays", p:["Delivery may be delayed due to circumstances beyond our reasonable control, including:"], list:["Extreme weather conditions","Traffic disruptions","Public holidays","Government restrictions","Natural disasters","Operational emergencies"], after:["In such situations, DOODLY will make reasonable efforts to inform affected customers."] },
          { n:8, h:"Failed Deliveries", p:["A delivery may be considered unsuccessful if:"], list:["The customer is unavailable.","The delivery location is inaccessible.","Incorrect delivery information has been provided.","The customer refuses to accept the order."], after:["DOODLY reserves the right to reschedule or cancel such deliveries based on operational feasibility."] },
          { n:9, h:"Product Inspection", p:["Customers are encouraged to inspect products upon delivery.","Any concerns regarding:"], list:["Damaged packaging","Leaking bottles","Incorrect products","Quality issues"], after:["should be reported to DOODLY Customer Support within 2 hours of delivery."] },
          { n:10, h:"Glass Bottle Returns", p:["As part of our sustainability initiative:"], list:["Milk is delivered in reusable glass bottles.","Customers are requested to return empty bottles during subsequent deliveries.","Returned bottles should be reasonably clean and free from excessive damage.","Charges may apply for bottles that are lost, broken, or not returned, as per our Refund & Return Policy."] },
          { n:11, h:"Ownership and Risk", p:["Ownership and responsibility for products transfer to the customer upon successful delivery to the provided address or designated delivery location."] },
          { n:12, h:"Contact Information", contact:true },
        ],
        foot:"At DOODLY, we take pride in delivering fresh milk from trusted farms to your doorstep with care, quality, and reliability every day. 🥛🚚🌱"
      }
    ] },

    "download": { surface:"public", title:"Download App", hero:{ eyebrow:"Get the app", title:"Your daily milk, in your pocket.", text:"Track deliveries, pause your plan, return bottles and collect rewards — all from the DOODLY app." }, blocks:[
      { type:"downloadApp" },
      { type:"cardGrid", cols:3, cards:[
        { ic:"truck", title:"Live tracking", text:"Watch your bottle arrive each morning." },
        { ic:"pause", title:"Pause anytime", text:"Vacation mode and one-tap skip." },
        { ic:"gift", title:"Rewards", text:"Earn points and refer friends." },
      ]},
    ]},

    /* ===== AUTH ===== */
    "login": { surface:"auth", title:"Log in", auth:{
      title:"Welcome back", sub:"Log in to manage your milk, deliveries and bottles.",
      fields:[{ label:"Phone or email", placeholder:"+91 98480 11234" },{ label:"Password", type:"password", placeholder:"••••••••" }],
      submit:"Log in", otpLink:true, forgot:true, alt:["New to DOODLY?","Create an account","/signup.html"] }},
    "signup": { surface:"auth", title:"Create account", auth:{
      title:"Start tomorrow morning", sub:"Create your account and set up your first delivery.",
      fields:[{ label:"Full name", placeholder:"Your name" },{ label:"Phone", type:"tel", placeholder:"+91 …" },{ label:"Email", type:"email", placeholder:"you@email.com" },{ label:"Password", type:"password", placeholder:"Create a password" }],
      submit:"Create account", terms:true, alt:["Already have an account?","Log in","/login.html"] }},
    "forgot-password": { surface:"auth", title:"Forgot password", auth:{
      title:"Reset your password", sub:"Enter your phone or email and we'll send you a code.",
      fields:[{ label:"Phone or email", placeholder:"+91 98480 11234" }],
      submit:"Send reset code", alt:["Remembered it?","Back to log in","/login.html"] }},
    "otp": { surface:"auth", title:"Verify OTP", auth:{
      title:"Enter the code", sub:"We sent a 6-digit code to your phone. It expires in 10 minutes.",
      otp:true, submit:"Verify & continue", resend:true, alt:["Wrong number?","Go back","/login.html"] }},
    "reset-password": { surface:"auth", title:"Reset password", auth:{
      title:"Choose a new password", sub:"Make it something you'll remember.",
      fields:[{ label:"New password", type:"password", placeholder:"New password" },{ label:"Confirm password", type:"password", placeholder:"Repeat password" }],
      submit:"Update password", alt:["","Back to log in","/login.html"] }},

    /* ===== CUSTOMER ===== */
    "account/dashboard": { surface:"account", title:"Dashboard", blocks:[
      head("Good morning, Ananya 👋","Here's everything about your milk today."),
      { type:"kpis", items:[
        { n:"Tomorrow 6:40 AM", l:"Next delivery" }, { n:"₹480", l:"Wallet balance" },
        { n:"2", l:"Bottles pending" }, { n:"1,240", l:"Reward points" } ]},
      { type:"quickActions", items:[
        { ic:"pause", t:"Pause plan", s:"Going away?", href:"/account/vacation.html" },
        { ic:"plus", t:"Extra milk", s:"Guests over?", href:"/account/extra-milk.html" },
        { ic:"bottle", t:"Return bottles", s:"2 pending", href:"/account/bottles.html" },
        { ic:"pin", t:"Track delivery", s:"Live now", href:"/account/tracking.html" } ]},
      { type:"columns", cols:2, items:[
        { type:"panel", title:"Current subscription", link:{label:"Manage",href:"/account/subscription.html"}, html:`<div class="deflist"><div class="row"><span class="k">Plan</span><span class="v">30-Day Morning Ritual</span></div><div class="row"><span class="k">Bottle</span><span class="v">1000 ml Family</span></div><div class="row"><span class="k">Daily price</span><span class="v">₹130 (8% off)</span></div><div class="row"><span class="k">Renews</span><span class="v">26 Jul 2026</span></div></div>` },
        { type:"timeline", dataset:"trackTimeline" } ]},
      { type:"table", dataset:"orders", toolbar:false, pager:false },
    ]},
    "account/orders": { surface:"account", title:"My Orders", blocks:[ head("My Orders","Every order you've placed with DOODLY.",[{label:"New subscription",kind:"btn-primary",href:"/subscriptions.html",icon:"plus"}]), tbl("orders",{filters:["All","Active","Completed","Refunded"]}) ]},
    "account/subscription": { surface:"account", title:"My Subscription", blocks:[
      head("My Subscription","Manage your plan, bottle size and delivery.",[{label:"Pause",kind:"btn-ghost",href:"/account/vacation.html",icon:"pause"}]),
      { type:"columns", cols:2, items:[ { type:"subSchedule" }, { type:"autopaySettings" } ]},
      { type:"columns", cols:2, items:[
        { type:"deflist", title:"Active plan", rows:[["Plan","30-Day Morning Ritual"],["Bottle","1000 ml Family"],["Daily price","₹130"],["Discount","8% (₹312 saved)"],["Status","Active"],["Renews","26 Jul 2026"]] },
        { type:"panel", title:"Manage", html:`<div class="qa-row" style="grid-template-columns:1fr 1fr"><a class="qa-tile" href="/account/vacation.html"><div class="ic">${ic("pause")}</div><div class="t">Pause / Vacation</div></a><a class="qa-tile" href="/account/extra-milk.html"><div class="ic">${ic("plus")}</div><div class="t">Extra milk</div></a><a class="qa-tile" href="/subscriptions.html"><div class="ic">${ic("refresh")}</div><div class="t">Change plan</div></a><a class="qa-tile" href="/account/subscription.html"><div class="ic">${ic("trash")}</div><div class="t">Cancel</div></a></div>` } ]},
      { type:"notice", text:"Your subscription auto-renews. You can pause, skip a day, or cancel anytime before the renewal date." },
    ]},
    "account/subscription-history": { surface:"account", title:"Subscription History", blocks:[ head("Subscription History","A record of every plan change and renewal."), { type:"timeline", items:[
      { t:"Renewed — 30-Day Morning Ritual", s:"26 Jun 2026 · ₹3,588", state:"done" },
      { t:"Upgraded 500 ml → 1000 ml", s:"01 Jun 2026", state:"done" },
      { t:"Started — 30-Day Morning Ritual", s:"02 May 2026 · ₹1,932", state:"done" },
      { t:"Completed trial pack", s:"12 Apr 2026 · ₹200", state:"done" } ]} ]},
    "account/deliveries": { surface:"account", title:"Deliveries", blocks:[ head("Deliveries","Upcoming and past deliveries.",[{label:"Track live",kind:"btn-primary",href:"/account/tracking.html",icon:"pin"}]), tbl("deliveries",{filters:["All","Scheduled","Delivered","Skipped"]}) ]},
    "account/tracking": { surface:"account", title:"Delivery Tracking", blocks:[
      head("Delivery Tracking","Your 1000 ml bottle is on the way — ETA 6:40 AM."),
      { type:"columns", cols:2, items:[
        { type:"timeline", dataset:"trackTimeline" },
        { type:"panel", title:"Driver & proof", html:`<div class="cell-user" style="margin-bottom:14px"><span class="av">RK</span><span><span class="strong">Ramesh Kumar</span><br><small class="muted">DRV-07 · 4.9★</small></span></div><div class="deflist"><div class="row"><span class="k">Delivery ID</span><span class="v">D-88142</span></div><div class="row"><span class="k">OTP</span><span class="v">4 8 2 1</span></div><div class="row"><span class="k">ETA</span><span class="v">6:40 AM</span></div></div><div class="media-card mt-2" style="min-height:160px"><div><div class="big">🗺️</div><div class="muted-sm" style="color:rgba(255,255,255,.8);margin-top:6px">Live map placeholder</div></div></div>` } ]},
    ]},
    "account/calendar": { surface:"account", title:"Delivery Calendar", blocks:[ head("Delivery Calendar","See your deliveries, skips and pauses at a glance."), { type:"calendar" } ]},
    "account/bottles": { surface:"account", title:"Bottle Tracking", blocks:[
      head("Bottle Tracking","Every glass bottle issued, returned and pending.",[{label:"Request collection",kind:"btn-primary",icon:"bottle"}]),
      { type:"kpis", items:[{n:"42",l:"Total issued"},{n:"40",l:"Returned"},{n:"2",l:"Pending"},{n:"₹120",l:"Deposit held"}] },
      { type:"notice", warn:true, text:"You have <b>2 empties</b> pending collection. Leave them out on your next delivery and we'll pick them up." },
      tbl("bottleLedger",{toolbar:false}),
    ]},
    "account/wallet": { surface:"account", title:"Wallet", blocks:[
      head("Wallet","Your DOODLY balance, top-ups and refunds.",[{label:"Add money",kind:"btn-primary",icon:"plus"}]),
      { type:"kpis", items:[{n:"₹480",l:"Balance"},{n:"₹100",l:"Rewards credited"},{n:"₹120",l:"Deposit held"},{n:"4",l:"Transactions"}] },
      tbl("wallet",{toolbar:false,pager:false}),
    ]},
    "account/invoices": { surface:"account", title:"Invoices", blocks:[ head("Invoices","Download GST invoices for every payment."), tbl("invoices",{filters:["All","Paid"]}) ]},
    "account/addresses": { surface:"account", title:"Addresses", blocks:[
      head("Addresses","Pin your exact doorstep on the map — we deliver to your GPS location."),
      { type:"addressManager" },
    ]},
    "account/notifications": { surface:"account", title:"Notifications", blocks:[ head("Notifications","Delivery updates, reminders and rewards."), { type:"feed", dataset:"notifications" } ]},
    "account/profile": { surface:"account", title:"Profile", blocks:[ head("Profile","Your personal details."), { type:"form", cols:2, fields:[
      { label:"Full name", placeholder:"Ananya Reddy" },{ label:"Phone", type:"tel", placeholder:"+91 98480 11234" },
      { label:"Email", type:"email", placeholder:"ananya.r@example.com" },{ label:"Area", placeholder:"Jubilee Hills" } ], submit:"Save profile" } ]},
    "account/settings": { surface:"account", title:"Settings", blocks:[
      head("Settings","Preferences, notifications and account."),
      { type:"tabs", items:["General","Notifications","Security","Billing"] },
      { type:"form", cols:2, fields:[
        { label:"Default delivery time", type:"select", options:["6:00 – 6:30 AM","6:30 – 7:00 AM","7:00 – 7:30 AM"] },
        { label:"Language", type:"select", options:["English","తెలుగు","हिन्दी"] },
        { label:"Contactless delivery OTP", type:"select", options:["On","Off"] },
        { label:"WhatsApp updates", type:"select", options:["On","Off"] } ], submit:"Save settings" },
    ]},
    "account/vacation": { surface:"account", title:"Pause / Vacation", blocks:[
      head("Pause & Vacation Mode","Going away? Pause deliveries and resume in one tap."),
      { type:"columns", cols:2, items:[
        { type:"form", title:"Vacation mode", cols:2, fields:[{ label:"Pause from", type:"date" },{ label:"Resume on", type:"date" }], check:"Auto-resume on the return date", submit:"Pause deliveries" },
        { type:"panel", title:"Quick controls", html:`<div class="qa-row" style="grid-template-columns:1fr 1fr"><a class="qa-tile" href="/account/subscription.html"><div class="ic">${ic("pause")}</div><div class="t">Skip tomorrow</div></a><a class="qa-tile" href="/account/subscription.html"><div class="ic">${ic("play")}</div><div class="t">Resume now</div></a></div><div class="notice mt-2">${ic("refresh",18)}<div>Paused days are never charged — your plan simply extends by the same number of days.</div></div>` } ]},
    ]},
    "account/extra-milk": { surface:"account", title:"Extra Milk Request", blocks:[
      head("Extra Milk Request","Guests over? Add a one-off bottle to tomorrow's delivery."),
      { type:"form", title:"Add extra milk", cols:2, fields:[
        { label:"Bottle size", type:"select", options:["500 ml — ₹70","1000 ml — ₹130"] },
        { label:"Quantity", type:"select", options:["1","2","3"] },
        { label:"Delivery date", type:"date", full:true } ], submit:"Add to next delivery", note:true },
    ]},
    "account/referrals": { surface:"account", title:"Referrals", blocks:[
      head("Referral Program","Give ₹100, get ₹100 for every friend who subscribes."),
      { type:"columns", cols:2, items:[
        { type:"panel", title:"Your code", html:`<div class="big-num" style="font-size:2rem;letter-spacing:.1em">ANANYA100</div><p class="muted-sm mt-1">Share this code. When a friend's first plan starts, you both get ₹100.</p><div class="mt-2"><button class="btn btn-primary">${ic("msg")} Share on WhatsApp</button></div>` },
        { type:"deflist", title:"Your impact", rows:[["Friends invited","3"],["Joined","2"],["Earned","₹200"],["Pending","₹100"]] } ]},
      tbl("referrals",{toolbar:false,pager:false}),
    ]},
    "account/rewards": { surface:"account", title:"Rewards", blocks:[
      head("Rewards","Earn points on every delivery and unlock perks."),
      { type:"kpis", items:[{n:"1,240",l:"Points"},{n:"Gold",l:"Tier"},{n:"3",l:"Badges"},{n:"₹124",l:"Redeemable"}] },
      { type:"panel", title:"Progress to Platinum", html:`<p class="muted-sm">760 points to go</p><div class="meter mt-1"><span style="width:62%"></span></div>` },
      { type:"cardGrid", cols:3, cards:[
        { ic:"award", title:"Early Bird", text:"30 deliveries before 7 AM." },
        { ic:"bottle", title:"Eco Hero", text:"Returned 40 glass bottles." },
        { ic:"gift", title:"Connector", text:"Referred 2 friends." } ]},
    ]},
    "account/support": { surface:"account", title:"Support", blocks:[
      head("Support","Raise a ticket or browse help.",[{label:"New ticket",kind:"btn-primary",icon:"plus"}]),
      tbl("tickets",{toolbar:false,pager:false}),
      { type:"cardGrid", cols:3, cards:[
        { ic:"msg", title:"Live chat", text:"Fastest way to reach us." },
        { ic:"phone", title:"Call us", text:((window.DOODLY&&window.DOODLY.brand&&window.DOODLY.brand.support&&window.DOODLY.brand.support.phone)||"+91 91177 99143") },
        { ic:"file", title:"Help articles", text:"Delivery, bottles, billing." } ]},
    ]},

    /* ===== ADMIN ===== */
    "admin/dashboard": { surface:"admin", title:"Dashboard", blocks:[
      head("Dashboard","Live overview of operations and revenue.",[{label:"Export report",kind:"btn-ghost",icon:"download"},{label:"Generate tomorrow",kind:"btn-primary",icon:"refresh"}]),
      { type:"kpis", dataset:"adminKpis" },
      { type:"columns", cols:2, items:[ { type:"bars", dataset:"revenueBars", title:"Revenue — last 7 days" }, { type:"donut", title:"Subscription mix", pct:62, center:"62%", label:"30-day" } ]},
      { type:"table", dataset:"adminOrders", toolbar:false, pager:false },
    ]},
    "admin/customers": { surface:"admin", title:"Customers", blocks:[ head("Customers","All DOODLY customers.",[{label:"Add customer",kind:"btn-primary",icon:"plus"}]), tbl("customers",{filters:["All","Active","Paused","Trial","Churned"]}) ]},
    "admin/subscriptions": { surface:"admin", title:"Subscriptions", blocks:[ head("Subscriptions","Active and lapsed subscriptions."), { type:"kpis", items:[{n:"1,284",l:"Active"},{n:"96",l:"Paused"},{n:"38",l:"New (wk)"},{n:"2.1%",l:"Churn"}] }, tbl("adminOrders",{filters:["All","Active","Paused","On hold"]}) ]},
    "admin/orders": { surface:"admin", title:"Orders", blocks:[ head("Orders","Every order across the platform."), tbl("adminOrders",{filters:["All","Active","Processing","On hold"]}) ]},
    "admin/products": { surface:"admin", title:"Products", blocks:[
      head("Products","Manage the catalogue. Flip status to launch a product.",[{label:"Add product",kind:"btn-primary",icon:"plus"}]),
      { type:"notice", icon:"tag", text:"<b>Zero-code launch:</b> set a product's status to <code>AVAILABLE</code> and it becomes orderable on the storefront instantly." },
      { type:"productAdmin" },
    ]},
    "admin/categories": { surface:"admin", title:"Categories", blocks:[ head("Categories","Organise products into categories.",[{label:"Add category",kind:"btn-primary",icon:"plus"}]), { type:"cardGrid", cols:3, cards:[
      { ic:"drop", title:"Milk", text:"1 product · live" },{ ic:"box", title:"Dairy products", text:"4 products · coming soon" },{ ic:"gift", title:"Bundles", text:"0 products" } ]} ]},
    "admin/inventory": { surface:"admin", title:"Inventory", blocks:[ head("Inventory","Stock levels and reorder alerts.",[{label:"Adjust stock",kind:"btn-primary",icon:"plus"}]), { type:"kpis", items:[{n:"640",l:"1000 ml ready"},{n:"410",l:"500 ml ready"},{n:"2",l:"Low SKUs"},{n:"1",l:"Reorder now"}] }, tbl("inventory",{filters:["All","Low","Reorder"]}) ]},
    "admin/bottle-inventory": { surface:"admin", title:"Bottle Inventory", blocks:[ head("Bottle Inventory","The glass bottle fleet and deposits."), { type:"kpis", dataset:"bottleInv" }, { type:"notice", warn:true, text:"<b>418 bottles</b> pending return (24 above target). Consider a collection reminder campaign." } ]},
    "admin/deliveries": { surface:"admin", title:"Delivery Management", blocks:[
      head("Delivery Management","Tomorrow's deliveries, zones, dispatch and executive performance.",[{label:"Generate deliveries",kind:"btn-primary",icon:"refresh"}]),
      { type:"kpis", items:[{n:"312",l:"Scheduled"},{n:"4",l:"Zones"},{n:"236 L",l:"Milk required"},{n:"4",l:"Drivers"}] },
      { type:"deliveryAnalytics" },
      tbl("routes",{toolbar:false,pager:false}),
    ]},
    "admin/drivers": { surface:"admin", title:"Drivers", blocks:[ head("Delivery Executives","Manage drivers and assignments.",[{label:"Add driver",kind:"btn-primary",icon:"plus"}]), tbl("drivers",{filters:["All","On route","Completed","Idle"]}) ]},
    "admin/routes": { surface:"admin", title:"Routes", blocks:[ head("Routes","Delivery routes by zone.",[{label:"Plan route",kind:"btn-primary",icon:"route"}]), tbl("routes",{toolbar:false,pager:false}), { type:"html", html:`<div class="media-card mt-3" style="min-height:240px"><div><div class="big">🗺️</div><div class="muted-sm" style="color:rgba(255,255,255,.8);margin-top:6px">Route map placeholder — Google Maps in production</div></div></div>` } ]},
    "admin/farmers": { surface:"admin", title:"Farmers", blocks:[ head("Farmers","Partner farms and supply.",[{label:"Add farmer",kind:"btn-primary",icon:"plus"}]), tbl("farmers",{filters:["All","Verified","Review"]}) ]},
    "admin/procurement": { surface:"admin", title:"Milk Procurement", blocks:[ head("Milk Procurement","Daily collection, testing and payments."), { type:"kpis", items:[{n:"660 L",l:"Collected today"},{n:"₹41,040",l:"Payable"},{n:"7.8%",l:"Avg fat"},{n:"3/4",l:"QC passed"}] }, tbl("procurement",{toolbar:false,pager:false}) ]},
    "admin/quality": { surface:"admin", title:"Quality Testing", blocks:[ head("Quality Testing","Batch test results and cold-chain logs."), { type:"kpis", items:[{n:"100%",l:"Batches tested"},{n:"1",l:"Flagged"},{n:"4.0°C",l:"Avg temp"},{n:"9.1",l:"Avg SNF"}] }, tbl("quality",{toolbar:false,pager:false}) ]},
    "admin/reports": { surface:"admin", title:"Reports", blocks:[
      head("Reports","Export sales, GST, bottle-loss and driver performance.",[{label:"Export CSV",kind:"btn-primary",icon:"download"}]),
      { type:"cardGrid", cols:3, cards:[
        { ic:"coins", title:"Sales report", text:"Revenue by plan, product, zone." },
        { ic:"receipt", title:"GST report", text:"Tax summary for filing." },
        { ic:"bottle", title:"Bottle-loss report", text:"Issued vs returned by customer." },
        { ic:"truck", title:"Driver performance", text:"Stops, on-time %, ratings." },
        { ic:"users", title:"Customer growth", text:"New, churned, retention." },
        { ic:"sprout", title:"Procurement report", text:"Litres and spend by farm." } ]},
      { type:"bars", dataset:"revenueBars", title:"Revenue trend" },
    ]},
    "admin/revenue": { surface:"admin", title:"Revenue", blocks:[ head("Revenue","Financial overview."), { type:"kpis", items:[{n:"₹1.84L",l:"Today"},{n:"₹2.1Cr",l:"This month"},{n:"+18%",l:"MoM growth"},{n:"₹1,640",l:"Avg order"}] }, { type:"columns", cols:2, items:[{ type:"bars", dataset:"revenueBars", title:"Daily revenue" },{ type:"donut", title:"Revenue by plan", pct:58, center:"58%", label:"30-day" }] } ]},
    "admin/payments": { surface:"admin", title:"Payments", blocks:[ head("Payments","Razorpay transactions and settlements."), { type:"kpis", items:[{n:"₹1.7L",l:"Captured today"},{n:"2",l:"Failed"},{n:"1",l:"Refunding"},{n:"₹0",l:"Disputed"}] }, tbl("payments",{filters:["All","Captured","Failed","Refunding"]}) ]},
    "admin/coupons": { surface:"admin", title:"Coupons", blocks:[ head("Coupons","Discount codes and usage.",[{label:"Create coupon",kind:"btn-primary",icon:"plus"}]), tbl("coupons",{filters:["All","Active","Scheduled","Paused"]}) ]},
    "admin/offers": { surface:"admin", title:"Offers", blocks:[ head("Offers","Campaigns and promotional banners.",[{label:"New offer",kind:"btn-primary",icon:"plus"}]), { type:"cardGrid", cols:3, cards:[
      { ic:"fire", title:"Festive 15% off", text:"90-day plan · scheduled" },{ ic:"gift", title:"Refer & earn", text:"₹100 each · live" },{ ic:"percent", title:"First-order 10%", text:"FRESH10 · live" } ]} ]},
    "admin/blogs": { surface:"admin", title:"Blogs", blocks:[ head("Blog Manager","Write and publish journal posts.",[{label:"New post",kind:"btn-primary",icon:"plus"}]), { type:"blogList" } ]},
    "admin/cms": { surface:"admin", title:"CMS", blocks:[
      head("CMS","Edit storefront content — pages, FAQs, banners, products."),
      { type:"cardGrid", cols:3, cards:[
        { ic:"tag", title:"Products & status", text:"Launch products with a status flip.", href:"/admin/products.html", link:"Open" },
        { ic:"msg", title:"FAQs", text:"Edit the customer FAQ." },
        { ic:"edit", title:"Pages", text:"About, farmers, quality copy." },
        { ic:"gift", title:"Banners", text:"Homepage hero & promos." },
        { ic:"star", title:"Testimonials", text:"Manage reviews shown publicly." },
        { ic:"file", title:"Legal", text:"Privacy, terms, refund, shipping." } ]},
    ]},
    "admin/notifications": { surface:"admin", title:"Notifications", blocks:[ head("Notifications","Send WhatsApp, SMS and push campaigns.",[{label:"New campaign",kind:"btn-primary",icon:"plus"}]), { type:"form", title:"Compose", cols:2, fields:[
      { label:"Audience", type:"select", options:["All customers","Active subscribers","Paused","Trial users"] },
      { label:"Channel", type:"select", options:["WhatsApp","SMS","Push","Email"] },
      { label:"Message", type:"textarea", placeholder:"Your message…", full:true } ], submit:"Send campaign" } ]},
    "admin/support": { surface:"admin", title:"Support Tickets", blocks:[ head("Support Tickets","Customer issues and resolutions."), { type:"kpis", items:[{n:"12",l:"Open"},{n:"3",l:"High priority"},{n:"1.2h",l:"Avg response"},{n:"94%",l:"Resolved"}] }, tbl("adminTickets",{filters:["All","Open","Resolved"]}) ]},
    "admin/roles": { surface:"admin", title:"Roles & Permissions", blocks:[ head("Roles & Permissions","Control who can do what.",[{label:"Add role",kind:"btn-primary",icon:"plus"}]), { type:"cardGrid", cols:4, cards:[
      { ic:"lock", title:"Super Admin", text:"Full access" },{ ic:"settings", title:"Admin", text:"Operations & catalogue" },{ ic:"truck", title:"Ops", text:"Deliveries & routes" },{ ic:"coins", title:"Finance", text:"Payments & reports" } ]} ]},
    "admin/audit-logs": { surface:"admin", title:"Audit Logs", blocks:[ head("Audit Logs","A live record of every sensitive action — logins, role switches, user & permission changes."), { type:"auditLog" } ]},
    "admin/users": { surface:"admin", title:"User Management", blocks:[ head("User Management","Create staff, assign roles, lock or disable accounts. Deletes are soft."), { type:"userManagement" } ]},
    "admin/permissions": { surface:"admin", title:"Permissions", blocks:[ head("Permissions","Fine-grained, per-module access for every role. Changes apply instantly."), { type:"permissionMatrix" } ]},
    "admin/settings": { surface:"admin", title:"Settings", blocks:[ head("Settings","Platform configuration."), { type:"tabs", items:["General","Payments","Delivery","Integrations","Tax"] }, { type:"form", cols:2, fields:[
      { label:"Brand name", placeholder:"DOODLY" },{ label:"Support phone", placeholder:"+91 90000 00000" },
      { label:"Razorpay key", placeholder:"rzp_live_…" },{ label:"GST number", placeholder:"36ABCDE1234F1Z5" },
      { label:"Default delivery window", type:"select", options:["6–7 AM","7–8 AM"] },{ label:"Currency", type:"select", options:["INR ₹"] } ], submit:"Save settings" } ]},
    "admin/delivery-settings": { surface:"admin", title:"Delivery Settings", blocks:[ head("Delivery Settings","Configure the order cut-off, delivery window and availability. Changes apply to the storefront instantly."), { type:"deliverySettings" } ]},
    "admin/serviceable-areas": { surface:"admin", title:"Serviceable Areas", blocks:[ head("Serviceable Areas","Manage delivery pincodes and the waitlist. Add a pincode and the storefront accepts it instantly — launch new cities with no code change."), { type:"serviceableAreas" } ]},
    "admin/billing": { surface:"admin", title:"Subscription Billing", blocks:[ head("Subscription Billing","Auto-pay customers, upcoming renewals, failures and revenue forecast."), { type:"autopayBilling" } ]},

    /* ===== DRIVER ===== */
    "driver/dashboard": { surface:"driver", title:"Dashboard", blocks:[
      head("Good morning, Ramesh 🌅","Route RT-JH-01 · Jubilee Hills · 42 stops today."),
      { type:"kpis", dataset:"driverKpis" },
      { type:"quickActions", items:[
        { ic:"route", t:"Start route", s:"42 stops", href:"/driver/route.html" },
        { ic:"truck", t:"Deliveries", s:"4 left", href:"/driver/deliveries.html" },
        { ic:"bottle", t:"Collect bottles", s:"31 to pick", href:"/driver/bottles.html" },
        { ic:"wallet", t:"Cash", s:"₹2,140", href:"/driver/cash.html" } ]},
      { type:"timeline", items:[
        { t:"Hub pickup complete", s:"5:40 AM · 42 bottles loaded", state:"done" },
        { t:"Stop 1–2 delivered", s:"6:02 AM", state:"done" },
        { t:"En route to stop 3", s:"Priya N. · Narsingi", state:"active" },
        { t:"38 stops remaining", s:"ETA finish 8:10 AM", state:"" } ]},
    ]},
    "driver/route": { surface:"driver", title:"Today's Route", blocks:[
      head("Today's Route","RT-JH-01 · 42 stops · tap a stop to navigate.",[{label:"Open in Maps",kind:"btn-primary",icon:"map"}]),
      { type:"html", html:`<div class="media-card" style="min-height:220px;margin-bottom:18px"><div><div class="big">🗺️</div><div class="muted-sm" style="color:rgba(255,255,255,.85);margin-top:6px">Route map placeholder — turn-by-turn in production</div></div></div>` },
      tbl("driverStops",{toolbar:false,pager:false}),
    ]},
    "driver/deliveries": { surface:"driver", title:"Deliveries", blocks:[ head("Deliveries","Mark each stop as you go."), tbl("driverStops",{filters:["All","Pending","Delivered"]}) ]},
    "driver/delivery": { surface:"driver", title:"Delivery Detail", blocks:[
      head("Stop 3 · Priya N.","Flat 304, My Home Avatar, Narsingi"),
      { type:"columns", cols:2, items:[
        { type:"panel", title:"Confirm delivery", html:`<div class="deflist"><div class="row"><span class="k">Item</span><span class="v">500 ml × 1</span></div><div class="row"><span class="k">Payment</span><span class="v">₹70 COD</span></div></div><div class="opt-label" style="color:var(--leaf-600)">Enter delivery OTP</div><div class="otp-row" style="max-width:260px">${"<input maxlength='1'>".repeat(4)}</div><div class="mt-2"><button class="btn btn-primary">${ic("check")} Confirm delivered</button></div>` },
        { type:"panel", title:"Bottles & remarks", html:`<div class="deflist"><div class="row"><span class="k">Empties to collect</span><span class="v">1</span></div></div><label class="check mt-1"><input type="checkbox" checked> Collected empty bottle</label><div class="field mt-2"><label>Remarks</label><textarea placeholder="e.g. left with guard"></textarea></div><div class="mt-2"><button class="btn btn-ghost">${ic("eye")} Capture proof photo</button></div>` } ]},
    ]},
    "driver/bottles": { surface:"driver", title:"Bottle Collection", blocks:[ head("Bottle Collection","Empties to pick up on today's route."), { type:"kpis", items:[{n:"31",l:"To collect"},{n:"26",l:"Collected"},{n:"5",l:"Remaining"},{n:"0",l:"Damaged"}] }, tbl("driverStops",{toolbar:false,pager:false}) ]},
    "driver/cash": { surface:"driver", title:"Cash Collection", blocks:[ head("Cash Collection","COD reconciliation for today."), { type:"kpis", items:[{n:"₹2,140",l:"Expected"},{n:"₹1,540",l:"Collected"},{n:"₹600",l:"Remaining"},{n:"8",l:"COD stops"}] }, { type:"notice", text:"Hand over collected cash at the hub at end of route. Reconciliation is automatic against delivered COD stops." } ]},
    "driver/completed": { surface:"driver", title:"Completed", blocks:[ head("Completed Deliveries","Stops you've finished today."), { type:"kpis", dataset:"driverKpis" }, tbl("driverCompleted",{toolbar:false,pager:false}) ]},
    "driver/history": { surface:"driver", title:"History", blocks:[ head("Delivery History","Your past delivery days."), tbl("driverCompleted",{filters:["All","This week","This month"]}) ]},
    "driver/profile": { surface:"driver", title:"Profile", blocks:[ head("Profile","Your driver details."), { type:"columns", cols:2, items:[
      { type:"deflist", title:"Ramesh Kumar · DRV-07", rows:[["Zone","Jubilee Hills"],["Vehicle","TS09 EZ 4421"],["Rating","4.9★"],["Joined","Feb 2026"],["Deliveries","2,840"]] },
      { type:"form", title:"Update details", fields:[{ label:"Phone", type:"tel", placeholder:"+91 …" },{ label:"Emergency contact", type:"tel", placeholder:"+91 …" }], submit:"Save" } ]} ]},

    /* ===== DELIVERY EXECUTIVE PORTAL (separate app + auth) ===== */
    "delivery/login": { surface:"auth", title:"Executive Login", auth:{
      title:"Delivery Executive", sub:"Sign in to start your route. Mobile + OTP or Employee ID + password.",
      fields:[{ label:"Employee ID or mobile", placeholder:"DRV-07 / +91 …" },{ label:"Password", type:"password", placeholder:"••••••••" }],
      submit:"Sign in", otpLink:true, forgot:true, dest:"/delivery/dashboard.html", alt:["Trouble signing in?","Contact your supervisor","/contact.html"] }},
    "delivery/dashboard": { surface:"delivery", title:"My Route", blocks:[ { type:"deliveryPortal" } ]},
    "delivery/profile": { surface:"delivery", title:"Profile", blocks:[ head("Profile","Your executive details."), { type:"columns", cols:2, items:[
      { type:"deflist", title:"Ramesh Kumar · DRV-07", rows:[["Zone","Central Vijayawada"],["Vehicle","AP16 EZ 4421"],["Rating","4.9★"],["Joined","Feb 2026"],["Deliveries","2,840"]] },
      { type:"form", title:"Update details", fields:[{ label:"Phone", type:"tel", placeholder:"+91 …" },{ label:"Emergency contact", type:"tel", placeholder:"+91 …" }], submit:"Save" } ]} ]},
  };

  /* tiny icon helper available at manifest-build time */
  function ic(n, s=22){ return window.DOODLY_BLOCKS ? window.DOODLY_BLOCKS.icon(n,s) : ""; }

  /* legal copy generator (keeps manifest compact) */
  function legal(kind){
    const intro = { privacy:"This policy explains what data DOODLY collects and how we use it.",
      terms:"These terms govern your use of DOODLY's website, app and delivery service.",
      refund:"This policy explains when and how refunds are issued.",
      shipping:"This policy explains how and when we deliver." }[kind];
    return [
      { p:[intro,"By using DOODLY you agree to the terms set out below. This is placeholder legal copy for the prototype and should be replaced with reviewed text before launch."] },
      { h:"1. Scope", p:["This applies to all customers, deliveries and payments made through DOODLY in our active service areas."] },
      { h:"2. Your responsibilities", p:["Keep your delivery address and contact details accurate so we can reach you each morning."] },
      { h:"3. Changes", p:["We may update this policy; material changes will be notified in-app and by email."] },
      { h:"4. Contact", p:[(function(){ var s=(window.DOODLY&&window.DOODLY.brand&&window.DOODLY.brand.support)||{}; return "Questions? Email "+(s.email||"doodlyoffl@gmail.com")+" or call "+(s.phone||"+91 91177 99143")+"."; })()] },
    ];
  }

  return { nav, routes };
})();
