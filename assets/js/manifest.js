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
      { label:"Careers", href:"/careers.html" },
      { label:"Contact", href:"/contact.html" },
    ],
    footer: [
      { h:"Products", links:[["A2 Buffalo Milk","/products/milk.html"],["Buffalo Pot Curd","/products/curd.html","Soon"],["Malai Paneer","/products/paneer.html","Soon"],["Buffalo Ghee","/products/ghee.html","Soon"],["Palkova","/products/kova.html","Soon"]] },
      { h:"Customer", links:[["My Account","/account/dashboard.html"],["Orders","/account/orders.html"],["Subscription","/account/subscription.html"],["Delivery Tracking","/account/tracking.html"],["Bottle Returns","/bottle-return.html"],["Puzzle Challenge","/puzzle.html"]] },
      { h:"Company", links:[["About","/about.html"],["Farmers","/farmers.html"],["Contact","/contact.html"],["Help Center","/help.html"],["FAQs","/faq.html"],["Careers","/careers.html"]] },
      { h:"Legal", links:[["Privacy Policy","/privacy.html"],["Terms & Conditions","/terms.html"],["Refund Policy","/refund.html"],["Shipping Policy","/shipping.html"],["Referral Policy","/referral-policy.html"]] },
    ],
    account: [
      { h:"Overview", items:[["Home","/","home"],["Dashboard","/account/dashboard.html","chart"]] },
      { h:"Orders & plans", items:[["My Orders","/account/orders.html","box"],["My Subscription","/account/subscription.html","refresh"],["Subscription History","/account/subscription-history.html","clock"]] },
      { h:"Deliveries", items:[["Deliveries","/account/deliveries.html","truck"],["Delivery Tracking","/account/tracking.html","pin"],["Calendar","/account/calendar.html","cal"]] },
      { h:"Bottles & money", items:[["Bottle Tracking","/account/bottles.html","bottle"],["Wallet","/account/wallet.html","wallet"],["Invoices","/account/invoices.html","receipt"]] },
      { h:"Rewards", items:[["Referrals","/account/referrals.html","gift"],["Rewards","/account/rewards.html","award"],["Support","/account/support.html","msg"],["Help Center","/help.html","help"]] },
      { h:"Account", items:[["Addresses","/account/addresses.html","pin"],["Notifications","/account/notifications.html","bell"],["Profile","/account/profile.html","user"],["Settings","/account/settings.html","settings"]] },
      { h:"Workplace", hrOnly:true, items:[["My HR","/account/my-hr.html","users"]] },
    ],
    admin: [
      { h:"Overview", items:[["Dashboard","/admin/dashboard.html","chart"]] },
      { h:"Commerce", items:[["Orders","/admin/orders.html","box"],["Invoices","/admin/invoices.html","receipt"],["B2B Orders","/admin/b2b.html","factory"],["B2B Pricing","/admin/b2b-pricing.html","tag"],["Business Invoices","/admin/invoice-b2b.html","receipt"],["Subscriptions","/admin/subscriptions.html","refresh"],["Subscription Billing","/admin/billing.html","card"],["Customers","/admin/customers.html","users"],["Payments","/admin/payments.html","card"]] },
      { h:"Catalogue", items:[["Products","/admin/products.html","tag"],["Categories","/admin/categories.html","clipboard"],["Inventory","/admin/inventory.html","pkg"],["Bottle Inventory","/admin/bottle-inventory.html","bottle"],["Delivery Settings","/admin/delivery-settings.html","clock"]] },
      { h:"Operations", items:[["Delivery Mgmt","/admin/deliveries.html","truck"],["Daily Cut-Off","/admin/cutoff.html","clock"],["Delivery Calendar","/admin/delivery-calendar.html","cal"],["Packing","/admin/packing.html","box"],["Auto Assignment","/admin/assignment.html","route"],["Late Deliveries","/admin/late-deliveries.html","clock"],["Address Changes","/admin/scheduled-address-changes.html","pin"],["Serviceable Areas","/admin/serviceable-areas.html","pin"],["Drivers","/admin/drivers.html","user"],["Routes","/admin/routes.html","route"]] },
      { h:"Supply", items:[["Farmers","/admin/farmers.html","sprout"],["Procurement","/admin/procurement.html","factory"],["Milk Tankers","/admin/milk-tankers.html","truck"],["Profit Center","/admin/profit-center.html","chart"],["Quality Testing","/admin/quality.html","beaker"]] },
      { h:"Finance", items:[["Daily Expenses","/admin/expenses.html","coins"],["Wallet Management","/admin/wallet.html","wallet"]] },
      { h:"Growth", items:[["Reports","/admin/reports.html","file"],["Revenue","/admin/revenue.html","coins"],["Search Insights","/admin/search-insights.html","search"],["Referrals","/admin/referrals.html","gift"],["Pure Rewards","/admin/loyalty.html","award"],["Coupons","/admin/coupons.html","percent"],["Offers","/admin/offers.html","gift"],["Puzzle Challenge","/admin/puzzles.html","award"]] },
      { h:"Content", items:[["Blogs","/admin/blogs.html","edit"],["CMS","/admin/cms.html","clipboard"],["Brand Story","/admin/brand-story.html","edit"],["Help Center","/admin/help-center.html","help"],["Notifications","/admin/notifications.html","bell"],["Reviews","/admin/reviews.html","msg"]] },
      { h:"System", items:[["Support Tickets","/admin/support.html","msg"],["Chat Support","/admin/chat-support.html","msg"],["User Management","/admin/users.html","users"],["Roles & Permissions","/admin/roles.html","lock"],["Permissions","/admin/permissions.html","lock"],["Audit Logs","/admin/audit-logs.html","eye"],["GST Management","/admin/gst.html","percent"],["Settings","/admin/settings.html","settings"]] },
      { h:"People", items:[["Careers","/admin/careers.html","users"]] },
      { h:"Human Resources", items:[["HR Dashboard","/admin/hr-dashboard.html","chart"],["Employees","/admin/employees.html","users"],["Attendance","/admin/attendance.html","check"],["Leave","/admin/leave.html","calendar"],["Salary Advances","/admin/advances.html","coins"],["Payroll","/admin/payroll.html","receipt"]] },
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
  const formHTML = (o) => (window.DOODLY_BLOCKS && window.DOODLY_BLOCKS.R ? window.DOODLY_BLOCKS.R.form(o) : "");  // build a functional form HTML string at recipe-build time

  /* ---------------- Routes ---------------- */
  const routes = {

    /* ===== PUBLIC ===== */
    "home": { surface:"public", title:"Home", full:true, blocks:[
      { type:"storeHero" }, { type:"whyGrid" }, { type:"stepsRow" },
      { type:"puzzleHighlight" },
      { type:"productGrid" }, { type:"builderSection" }, { type:"plansCompare" },
      { type:"testimonialGrid" }, { type:"faqSection" }, { type:"downloadApp" }, { type:"ctaBand" },
    ]},

    "about": { surface:"public", title:"About Us", hero:{ eyebrow:"Our story", title:"Fresh milk, the way it used to be.", text:"DOODLY is built on a simple idea: milk you can trace. A small circle of family-run farms, every batch tested, kept cold through the chain, bottled in glass — at your door before 7." }, blocks:[
      { type:"aboutPage" },
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
      { type:"kpis", items:[{n:"4°C",l:"Cold chain"},{n:"~12 hrs",l:"Farm to door"},{n:"100%",l:"Batch tested"},{n:"Glass",l:"Packaging"}] },
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

    "careers": { surface:"public", title:"Careers", hero:{ eyebrow:"Careers at DOODLY", title:"Build the future of fresh dairy.", text:"Every bottle we deliver represents trust, quality, and the dedication of local farmers. We're building a team of people who want to make a meaningful impact through honest work. If you believe great products begin with great people, we'd love to hear from you." }, blocks:[
      { type:"careers" },
      { type:"ctaBand", title:"Build your career with DOODLY. Deliver freshness. Create impact." },
    ]},

    "puzzle": { surface:"public", title:"Monthly Puzzle Challenge", blocks:[
      { type:"puzzlePage" },
    ]},
    "puzzle-terms": { surface:"public", title:"Puzzle Challenge — Terms", blocks:[
      { type:"puzzleTerms" },
    ]},

    "farmers": { surface:"public", title:"Our Farmers", hero:{ eyebrow:"Our farmers", title:"We know every farm by name.", text:"DOODLY works with a small circle of family-run buffalo farms — no middlemen, no pooled milk from a hundred herds." }, blocks:[
      { type:"farmersPage" },
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
      { type:"bottleReturnPage" },
      { type:"ctaBand", title:"Fresh milk, zero plastic. Start your glass loop." },
    ]},

    "quality": { surface:"public", title:"Quality & Safety", hero:{ eyebrow:"Quality & safety", title:"Tested before it's trusted.", text:"Every batch is screened for fat, SNF, temperature and adulteration. If it doesn't pass, it doesn't ship." }, blocks:[
      { type:"kpis", items:[{n:"6%",l:"Min fat"},{n:"9%",l:"Min SNF"},{n:"4°C",l:"Cold chain"},{n:"100%",l:"Batch tested"}] },
      { type:"split", eyebrow:"Testing", title:"What we check, every morning.", p:["Lactometer reading, fat and SNF percentage, temperature at collection and dispatch, and adulteration screening — recorded per batch."], bullets:["Fat & SNF on every batch","Temperature logged end-to-end","Adulteration screening"], media:"🧪" },
      { type:"split", rev:true, eyebrow:"Cold chain", title:"Cold from farm to door.", p:["Milk never warms up between the farm and your fridge — bulk coolers, insulated transport, and chilled delivery."], bullets:["<30 min to 4°C","Insulated transport","Chilled handover"], media:"❄️" },
      { type:"notice", icon:"shield", text:"<b>Certifications & reports:</b> FSSAI compliant. Monthly quality reports are published to your account." },
    ]},

    "blog": { surface:"public", title:"Blog", hero:{ eyebrow:"DOODLY journal", title:"Milk, farmers, and fresh thinking.", text:"Stories from the farm, nutrition deep-dives, and the craft behind your daily bottle." }, blocks:[
      { type:"html", html:`<div class="chips-row"><span class="chip-f active">All</span><span class="chip-f">Nutrition</span><span class="chip-f">Our farmers</span><span class="chip-f">Sustainability</span><span class="chip-f">Quality</span><span class="chip-f">Recipes</span></div>` },
      { type:"blogList" },
    ]},
    "blog/read": { surface:"public", title:"DOODLY Journal", blocks:[
      { type:"blogReader" },
    ]},
    // "blog/why-a2" REMOVED 2026-07-17 — the article's thesis was a health claim
    // ("Why A2 buffalo milk is easier to digest", filed under Nutrition, citing
    // "the science" and "your gut"). It could not be reworded: delete the claim
    // and there is no article. FSSAI/ASCI require substantiation for the claim,
    // not for the hedge ("many people find"), and we hold no such evidence.
    // blog/why-a2.html deleted with it; /blog/why-a2.html now 404s by design.
    // We describe what the milk IS, never what it does to your body.

    "contact": { surface:"public", title:"Contact Us", hero:{ eyebrow:"Contact", title:"We'd love to hear from you.", text:"Questions about milk, delivery, or your subscription? Reach out — we usually reply within a few hours." }, blocks:[
      { type:"columns", cols:2, items:[
        { type:"form", key:"contact", title:"Send us a message", cols:2, fields:[
          { label:"Full name", placeholder:"Your name", req:true },
          { label:"Phone", type:"tel", placeholder:"+91 …" },
          { label:"Email", type:"email", placeholder:"you@email.com", full:true, req:true },
          { label:"Subject", type:"select", options:["General enquiry","Delivery issue","Subscription help","Partnership"], full:true },
          { label:"Message", type:"textarea", placeholder:"How can we help?", full:true, req:true },
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

    "faq": { surface:"public", title:"FAQ", hero:{ eyebrow:"Help centre", title:"Frequently asked questions", text:"Search common questions about milk, delivery, bottles and billing — answers update the moment our team edits them." }, blocks:[
      { type:"faqHub" },
      { type:"ctaBand", title:"Question answered? Start your fresh-milk morning." },
    ]},

    "help": { surface:"public", title:"Help Center", blocks:[
      { type:"helpCenter" },
    ]},

    "search": { surface:"public", title:"Search", blocks:[
      { type:"searchResults" },
    ]},

    "referral-policy": { surface:"public", title:"Referral Policy", hero:{ eyebrow:"Legal", title:"Doodly Referral Program — Terms & Conditions", text:"How referral codes, eligibility and the ₹100 reward work." }, blocks:[
      { type:"referralPolicy" },
    ]},

    "invoice": { surface:"public", title:"Invoice", full:true, blocks:[
      { type:"invoiceB2C" },
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
      title:"Customer login", sub:"Manage your subscriptions, orders, deliveries, invoices and account.",
      fields:[{ label:"Mobile number or email", placeholder:"+91 98480 11234" },{ label:"Password", type:"password", placeholder:"••••••••" }],
      submit:"Log in", otpLink:true, forgot:true, guest:true, loginRole:"customer", dest:"/",
      alt:["New to DOODLY?","Create an account","/signup.html"],
      secondaryLinks:[
        { q:"Looking for the delivery app?", label:"Executive login", href:"/delivery/login.html" },
        { q:"Working at DOODLY?", label:"Admin & Staff login", href:"/login/admin.html" },
      ] }},
    "login/customer": { surface:"auth", title:"Customer Login", auth:{
      title:"Customer login", sub:"Manage your subscriptions, orders, deliveries, invoices and account.",
      fields:[{ label:"Mobile number or email", placeholder:"+91 98480 11234" },{ label:"Password", type:"password", placeholder:"••••••••" }],
      submit:"Login as Customer", otpLink:true, forgot:true, guest:true, loginRole:"customer", dest:"/",
      back:["/login.html","Back to login options"], alt:["New to DOODLY?","Create an account","/signup.html"] }},
    "login/admin": { surface:"auth", title:"Admin / Staff Login", auth:{
      title:"Admin & staff login", sub:"Authorized staff only — you'll be routed to your dashboard automatically.",
      fields:[{ label:"Username or email", type:"email", placeholder:"you@doodly.in" },{ label:"Password", type:"password", placeholder:"••••••••" }],
      submit:"Login as Admin", forgot:true, adminLogin:true, twofa:true, dest:"/admin/dashboard.html",
      back:["/login.html","Back to login options"] }},
    "signup": { surface:"auth", title:"Create account", auth:{
      title:"Start tomorrow morning", sub:"Create your account and set up your first delivery.",
      fields:[{ label:"Full name", placeholder:"Your name" },{ label:"Phone", type:"tel", placeholder:"+91 …" },{ label:"Email", type:"email", placeholder:"you@email.com" },{ label:"Password", type:"password", placeholder:"Create a password" },{ label:"Confirm password", type:"password", placeholder:"Re-enter your password" },{ label:"Have a Referral Code? (Optional)", placeholder:"Optional — e.g. DOODLY8F4XK", hint:"Enter a referral code if someone invited you. You can leave this blank if you don't have one." }],
      submit:"Create account", terms:true, alt:["Already have an account?","Log in","/login.html"] }},
    "forgot-password": { surface:"auth", title:"Forgot password", auth:{
      title:"Reset your password", sub:"Enter your account email and we'll send you a reset link.",
      fields:[{ label:"Email", type:"email", placeholder:"you@example.com" }],
      submit:"Send reset link", alt:["Remembered it?","Back to log in","/login.html"] }},
    "otp": { surface:"auth", title:"Verify OTP", auth:{
      title:"Enter the code", sub:"We sent a 6-digit code to your phone. It expires in 10 minutes.",
      otp:true, submit:"Verify & continue", resend:true, alt:["Wrong number?","Go back","/login.html"] }},
    "reset-password": { surface:"auth", title:"Reset password", auth:{
      title:"Choose a new password", sub:"Make it something you'll remember.",
      fields:[{ label:"New password", type:"password", placeholder:"New password" },{ label:"Confirm password", type:"password", placeholder:"Repeat password" }],
      submit:"Update password", alt:["","Back to log in","/login.html"] }},

    /* ===== CUSTOMER ===== */
    "account/dashboard": { surface:"account", title:"Dashboard", blocks:[
      head("Good morning 👋","Here's everything about your milk today."),
      { type:"customerKpis", page:"dashboard" },
      { type:"quickActions", items:[
        { ic:"pause", t:"Pause plan", s:"Going away?", href:"/account/vacation.html" },
        { ic:"plus", t:"Extra milk", s:"Guests over?", href:"/account/extra-milk.html" },
        { ic:"bottle", t:"Return bottles", s:"Manage empties", href:"/account/bottles.html" },
        { ic:"pin", t:"Track delivery", s:"Live now", href:"/account/tracking.html" } ]},
      { type:"loyaltyCard" },
      { type:"puzzleCard" },
      { type:"customerSub" },
      { type:"table", dataset:"orders", toolbar:false, pager:false },
    ]},
    "account/orders": { surface:"account", title:"My Orders", blocks:[ head("My Orders","Every order you've placed with DOODLY.",[{label:"New subscription",kind:"btn-primary",href:"/subscriptions.html",icon:"plus"}]), tbl("orders",{filters:["All","Active","Completed","Refunded"]}), { type:"reviewsPanel" } ]},
    "account/subscription": { surface:"account", title:"My Subscription", blocks:[
      head("My Subscription","Manage your plan, bottle size and delivery.",[{label:"Pause",kind:"btn-ghost",href:"/account/vacation.html",icon:"pause"}]),
      { type:"columns", cols:2, items:[ { type:"subSchedule" }, { type:"autopaySettings" } ]},
      { type:"panel", title:"Manage", html:`<div class="qa-row" style="grid-template-columns:repeat(4,1fr)"><a class="qa-tile" href="/account/vacation.html"><div class="ic">${ic("pause")}</div><div class="t">Pause / Vacation</div></a><a class="qa-tile" href="/account/extra-milk.html"><div class="ic">${ic("plus")}</div><div class="t">Extra milk</div></a><a class="qa-tile" href="/subscriptions.html"><div class="ic">${ic("refresh")}</div><div class="t">Change plan</div></a><a class="qa-tile" href="/account/subscription.html"><div class="ic">${ic("trash")}</div><div class="t">Cancel</div></a></div>` },
      { type:"notice", text:"Your subscription auto-renews. You can pause, skip a day, or cancel anytime before the renewal date." },
    ]},
    "account/subscription-history": { surface:"account", title:"Subscription History", blocks:[ head("Subscription History","A record of every plan change and renewal."),
      { type:"panel", html:`<div id="subHistoryMount"><div class="state"><div class="ic">${ic("refresh")}</div><h3>No subscription history yet</h3><p>Your plan changes and renewals will appear here once you subscribe.</p></div></div>` } ]},
    "account/deliveries": { surface:"account", title:"Deliveries", blocks:[ head("Deliveries","Upcoming and past deliveries.",[{label:"Track live",kind:"btn-primary",href:"/account/tracking.html",icon:"pin"}]), { type:"lateCustomerStats" }, tbl("deliveries",{filters:["All","Scheduled","Delivered","Skipped"]}) ]},
    "account/tracking": { surface:"account", title:"Delivery Tracking", blocks:[
      head("Delivery Tracking","Track your delivery in real time."),
      { type:"columns", cols:2, items:[
        { type:"timeline", dataset:"trackTimeline" },
        { type:"panel", title:"Driver & proof", html:`<div class="cell-user" style="margin-bottom:14px"><span class="av">··</span><span><span class="strong">Assigning…</span><br><small class="muted">Your delivery executive</small></span></div><div class="deflist"><div class="row"><span class="k">Delivery ID</span><span class="v">—</span></div><div class="row"><span class="k">Status</span><span class="v">—</span></div><div class="row"><span class="k">ETA</span><span class="v">Before 7 AM</span></div></div><div class="media-card mt-2" style="min-height:160px"><div><div class="big">🗺️</div><div class="muted-sm" style="color:rgba(255,255,255,.8);margin-top:6px">Live map appears here when a delivery is on the way</div></div></div>` } ]},
    ]},
    "account/calendar": { surface:"account", title:"Delivery Calendar", blocks:[ head("Delivery Calendar","See your deliveries, skips and pauses at a glance."), { type:"calendar" } ]},
    "account/bottles": { surface:"account", title:"Bottle Tracking", blocks:[
      head("Bottle Tracking","Every glass bottle issued, returned and pending.",[{label:"Request collection",kind:"btn-primary",icon:"bottle",href:"/bottle-return.html"}]),
      { type:"customerKpis", page:"bottles" },
      { type:"notice", warn:true, text:"You have empties pending collection. Leave them out on your next delivery and we'll pick them up." },
      tbl("bottleLedger",{toolbar:false}),
    ]},
    "account/wallet": { surface:"account", title:"Wallet", blocks:[
      head("DOODLY Wallet","Your balance, Trial Pack cashback, rewards and full transaction history."),
      { type:"walletPanel" },
    ]},
    "account/invoices": { surface:"account", title:"Invoices", blocks:[ head("Invoices","Download GST invoices for every payment."), tbl("invoices",{filters:["All","Paid"]}) ]},
    "account/addresses": { surface:"account", title:"Addresses", blocks:[
      head("Addresses","Pin your exact doorstep on the map — we deliver to your GPS location."),
      { type:"addressManager" },
    ]},
    "account/notifications": { surface:"account", title:"Notifications", blocks:[ head("Notifications","Delivery updates, reminders and rewards."), { type:"feed", dataset:"notifications" } ]},
    "account/profile": { surface:"account", title:"Profile", blocks:[ head("Profile","Your personal details."), { type:"form", cols:2, fields:[
      { label:"Full name", placeholder:"e.g. Vivek Devineni" },{ label:"Phone", type:"tel", placeholder:"+91 91177 99143" },
      { label:"Email", type:"email", placeholder:"you@example.com" },{ label:"Area", placeholder:"e.g. Benz Circle, Vijayawada" } ], submit:"Save profile" } ]},
    "account/my-hr": { surface:"account", title:"My HR", blocks:[ head("My HR","Your attendance, salary slips, leave and advances."), { type:"hrSelf" } ]},
    "account/settings": { surface:"account", title:"Settings", blocks:[
      head("Settings","Preferences, notifications and account."),
      { type:"tabs", items:["General","Notifications","Security","Billing","Sounds"], panels:[
        formHTML({ key:"settings-general", cols:1, submit:"Save settings", sub:"Your language preference. More Indian languages are coming soon.", fields:[
          { label:"Language", type:"select", options:["English", { label:"తెలుగు — coming soon", disabled:true }, { label:"हिन्दी — coming soon", disabled:true }] } ] }),
        formHTML({ key:"settings-notif", cols:2, submit:"Save notifications", sub:"Choose how you'd like to hear from us.", fields:[
          { label:"Email updates", type:"select", options:["On","Off"] },
          { label:"SMS updates", type:"select", options:["On","Off"] },
          { label:"WhatsApp updates", type:"select", options:["On","Off"] },
          { label:"Push notifications", type:"select", options:["On","Off"] },
          { label:"Promotions & offers", type:"select", options:["On","Off"] } ] }),
        `<div class="panel panel-pad reveal"><h3 style="font-family:'Fraunces',serif;color:var(--forest);font-size:1.2rem;margin-bottom:6px">Change password</h3><p class="muted-sm" style="margin-bottom:16px">Update your password. For your security, you'll be signed out on all devices afterwards.</p><div class="form-grid" style="max-width:460px"><div class="field"><label>Current password</label><input type="password" id="secCur" autocomplete="current-password" placeholder="Your current password"></div><div class="field"><label>New password</label><input type="password" id="secNew" autocomplete="new-password" placeholder="At least 8 characters"></div><div class="field"><label>Confirm new password</label><input type="password" id="secConf" autocomplete="new-password" placeholder="Re-enter new password"></div></div><div class="form-msg" id="secMsg" role="status" aria-live="polite" hidden></div><div class="mt-2"><button class="btn btn-primary" id="secPwBtn" type="button">Update password</button></div><hr style="border:none;border-top:1px solid var(--line,#ececec);margin:22px 0"><h3 style="font-family:'Fraunces',serif;color:var(--forest);font-size:1.2rem;margin-bottom:6px">Active sessions</h3><p class="muted-sm" style="margin-bottom:14px">Signed in on a device you don't recognise? Sign out of every device — you'll need to sign in again here too.</p><button class="btn btn-ghost" id="secSignoutAll" type="button">${ic("shield",16)} Sign out of all devices</button><p class="muted-sm" style="margin-top:16px">Forgot your current password? <a class="link" href="/forgot-password.html" style="color:var(--leaf-600);font-weight:700">Reset it via email →</a></p></div>`,
        `<div class="panel panel-pad reveal"><h3 style="font-family:'Fraunces',serif;color:var(--forest);font-size:1.2rem;margin-bottom:6px">Billing</h3><p class="muted-sm" style="margin-bottom:14px">Manage your plan, payment method and invoices.</p><div class="qa-row" style="grid-template-columns:repeat(3,1fr)"><a class="qa-tile" href="/account/subscription.html"><div class="ic">${ic("refresh")}</div><div class="t">Subscription</div></a><a class="qa-tile" href="/account/wallet.html"><div class="ic">${ic("card")}</div><div class="t">Wallet</div></a><a class="qa-tile" href="/account/invoices.html"><div class="ic">${ic("receipt")}</div><div class="t">Invoices</div></a></div></div>`,
        `<div class="panel panel-pad reveal"><div id="soundSettingsMount"></div></div>`
      ] },
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
      head("Referral Program","Refer a friend — earn ₹100 when they subscribe to a 30-day or longer plan."),
      { type:"referralPanel" },
    ]},
    "account/rewards": { surface:"account", title:"Rewards", blocks:[
      head("DOODLY Pure Rewards","The more you stay fresh, the more you're rewarded."),
      { type:"loyaltyProgram" },
      { type:"puzzleCard" },
    ]},
    "account/support": { surface:"account", title:"Support", blocks:[
      head("Support","Raise a ticket or browse help."),
      { type:"form", title:"Raise a ticket", cols:2, key:"support-ticket", submit:"Submit ticket", fields:[
        { label:"Subject", req:true, placeholder:"Brief summary of your issue" },
        { label:"Category", type:"select", options:["Delivery issue","Billing & payments","Bottle return","Subscription","Product quality","Other"] },
        { label:"Message", type:"textarea", full:true, req:true, placeholder:"Describe your issue in detail…" } ] },
      tbl("tickets",{toolbar:false,pager:false}),
      { type:"cardGrid", cols:3, cards:[
        { ic:"msg", title:"Live chat", text:"Fastest way to reach us.", link:"Start chat", href:"https://wa.me/919117799143" },
        { ic:"phone", title:"Call us", text:((window.DOODLY&&window.DOODLY.brand&&window.DOODLY.brand.support&&window.DOODLY.brand.support.phone)||"+91 91177 99143"), link:"Call now", href:"tel:+919117799143" },
        { ic:"file", title:"Help articles", text:"Delivery, bottles, billing.", link:"Browse", href:"/help.html" } ]},
    ]},

    /* ===== ADMIN ===== */
    "admin/dashboard": { surface:"admin", title:"Dashboard", blocks:[
      head("Dashboard","Live operations & revenue command center — real-time KPIs, drill-downs, charts and alerts."),
      { type:"opsDashboard" },
    ]},
    "admin/customers": { surface:"admin", title:"Customers", blocks:[ head("Customers","All DOODLY customers.",[{label:"Add customer",kind:"btn-primary",icon:"plus"}]), tbl("customers",{filters:["All","Active","Paused","Trial","Churned"]}) ]},
    "admin/subscriptions": { surface:"admin", title:"Subscriptions", blocks:[ head("Subscriptions","Active and lapsed subscriptions."), { type:"kpis", items:[{n:"1,284",l:"Active"},{n:"96",l:"Paused"},{n:"38",l:"New (wk)"},{n:"2.1%",l:"Churn"}] }, tbl("adminOrders",{filters:["All","Active","Paused","On hold"]}) ]},
    "admin/orders": { surface:"admin", title:"Orders", blocks:[ head("Orders","Every order across the platform."), tbl("adminOrders",{filters:["All","Active","Processing","On hold"]}) ]},
    "admin/invoices": { surface:"admin", title:"Invoices", blocks:[ head("Customer Invoices","GST invoices auto-generated for every paid order — search, view and download the PDF, or email is sent automatically."), { type:"invoicesAdmin" } ]},
    "admin/products": { surface:"admin", title:"Products", blocks:[
      head("Products","Manage the catalogue. Flip status to launch a product.",[{label:"Recommendations",kind:"btn-ghost",icon:"award"},{label:"Add product",kind:"btn-primary",icon:"plus"}]),
      { type:"notice", icon:"tag", text:"<b>Zero-code launch:</b> set a product's status to <code>AVAILABLE</code> and it becomes orderable on the storefront instantly." },
      { type:"productAdmin" },
    ]},
    "admin/categories": { surface:"admin", title:"Categories", blocks:[ head("Categories","Organise products into categories.",[{label:"Add category",kind:"btn-primary",icon:"plus"}]), { type:"cardGrid", cols:3, cards:[
      { ic:"drop", title:"Milk", text:"1 product · live" },{ ic:"box", title:"Dairy products", text:"4 products · coming soon" },{ ic:"gift", title:"Bundles", text:"0 products" } ]} ]},
    "admin/inventory": { surface:"admin", title:"Inventory", blocks:[ head("Inventory","Stock levels and reorder alerts.",[{label:"Adjust stock",kind:"btn-primary",icon:"plus"}]), { type:"kpis", items:[{n:"640",l:"1000 ml ready"},{n:"410",l:"500 ml ready"},{n:"2",l:"Low SKUs"},{n:"1",l:"Reorder now"}] }, tbl("inventory",{filters:["All","Low","Reorder"]}) ]},
    "admin/bottle-inventory": { surface:"admin", title:"Bottle Inventory", blocks:[ head("Bottle Inventory","The glass bottle fleet and deposits.",[{label:"Record movement",kind:"btn-primary",icon:"refresh"}]), { type:"kpis", dataset:"bottleInv" }, { type:"notice", text:"Track the glass-bottle fleet and deposits here. When pending returns run above target, send customers a collection reminder to recover empties." }, tbl("bottleMoves",{filters:["All"]}) ]},
    "admin/deliveries": { surface:"admin", title:"Delivery Management", blocks:[
      head("Delivery Management","Pick a date to view that day's deliveries, zones, dispatch and executive performance.",[{label:"Generate deliveries",kind:"btn-primary",icon:"refresh"}]),
      { type:"opsCutoffAlert" },
      { type:"deliveryDateBar" },
      { type:"kpis", items:[{n:"312",l:"Scheduled"},{n:"4",l:"Zones"},{n:"236 L",l:"Milk required"},{n:"4",l:"Drivers"}] },
      { type:"deliveryAnalytics" },
      tbl("adminDeliveries",{filters:["All","Scheduled","Assigned","Out for delivery","Delivered","Failed"]}),
      tbl("routes",{toolbar:false,pager:false}),
    ]},
    "admin/assignment": { surface:"admin", title:"Auto Assignment", blocks:[ head("Auto Delivery Assignment","Pick a date to view that day's live assignment state and run auto-assignment for it — capacity-based (45 bottles/executive), pending queue, return-trip re-assignment and drag-and-drop manual override."), { type:"asgnDateBar" }, { type:"assignment" }, { type:"assignmentOrders" } ]},
    "admin/cutoff": { surface:"admin", title:"Daily Cut-Off", blocks:[
      head("Daily Cut-Off","When the ordering window closes each evening, tomorrow's delivery cycle is prepared and ops are notified — so no confirmed order is ever missed."),
      { type:"opsCutoffAlert" },
      { type:"notice", icon:"clock", text:"<b>Settings</b> holds the cut-off time, the email and WhatsApp recipients, which alerts go out, and <b>Test WhatsApp summary</b>. Changing them needs Super Admin." },
    ]},
    "admin/delivery-calendar": { surface:"admin", title:"Delivery Calendar", blocks:[ head("Delivery Calendar","Every delivery day at a glance — pick a day to open that day's board."), { type:"deliveryCalendar" } ]},
    "admin/packing": { surface:"admin", title:"Packing", blocks:[ head("Packing Workflow","Pick a date to pack that day's deliveries — advance each stop Pending → Packing → Packed → Ready for Dispatch, or mark a batch at once."), { type:"packDateBar" }, { type:"packingBoard" } ]},
    "admin/late-deliveries": { surface:"admin", title:"Late Delivery Monitoring", blocks:[ head("Late Delivery Monitoring","Protects the 7:00 AM morning promise — auto-detects late deliveries, sends customer apologies, scores executives, escalates and reports."), { type:"lateDeliveries" } ]},
    "admin/scheduled-address-changes": { surface:"admin", title:"Scheduled Address Changes", blocks:[ head("Scheduled Address Changes","Tenant-friendly delivery-address changes — immediate or future-dated. Monitor, search, cancel, or (Super Admin) force-apply a switch."), { type:"scheduledAddressChanges" } ]},
    "admin/invoice-b2b": { surface:"admin", title:"Business Invoices", blocks:[ head("Business Partner Statement","Premium B2B statement — supply analytics, financial summary, outstanding tracker, payment history and credit insights. Print, PDF, Excel, email or WhatsApp."), { type:"invoiceB2B" } ]},
    "admin/drivers": { surface:"admin", title:"Drivers", blocks:[ head("Delivery Executives","Manage drivers and assignments.",[{label:"Add driver",kind:"btn-primary",icon:"plus"}]), tbl("drivers",{filters:["All","On route","Completed","Idle"]}) ]},
    "admin/routes": { surface:"admin", title:"Routes", blocks:[ head("Routes","Delivery routes by day and zone — pick a date to see that day's routes.",[{label:"Plan route",kind:"btn-primary",icon:"route"}]), { type:"routesDateBar" }, tbl("routes",{toolbar:false,pager:false}), { type:"html", html:`<div class="mt-3" style="position:relative"><div id="rtOverviewMap" style="min-height:240px;border-radius:16px;overflow:hidden;display:none"></div><div class="media-card" id="rtOverviewPh" style="min-height:240px"><div><div class="big">🗺️</div><div class="muted-sm" id="rtOverviewCap" style="color:rgba(255,255,255,.8);margin-top:6px">Open a route below to see its delivery map — stops appear once their addresses are geocoded.</div></div></div></div>` } ]},
    "admin/farmers": { surface:"admin", title:"Farmers", blocks:[ head("Farmers","Partner farms and supply.",[{label:"Add farmer",kind:"btn-primary",icon:"plus"}]), tbl("farmers",{filters:["All","Verified","Review"]}) ]},
    "admin/procurement": { surface:"admin", title:"Milk Procurement", blocks:[ head("Milk Procurement","Daily collection, testing and payments.",[{label:"New procurement",kind:"btn-primary",icon:"plus"}]), { type:"kpis", items:[{n:"660 L",l:"Collected today"},{n:"₹41,040",l:"Payable"},{n:"7.8%",l:"Avg fat"},{n:"3/4",l:"QC passed"}] }, tbl("procurement",{toolbar:false,pager:false}) ]},
    "admin/quality": { surface:"admin", title:"Quality Testing", blocks:[ head("Quality Testing","Batch test results and cold-chain logs.",[{label:"Record test",kind:"btn-primary",icon:"plus"},{label:"Quality rules",kind:"btn-ghost",icon:"clipboard"}]), { type:"kpis", items:[{n:"100%",l:"Batches tested"},{n:"1",l:"Flagged"},{n:"4.0°C",l:"Avg temp"},{n:"9.1",l:"Avg SNF"}] }, tbl("quality",{toolbar:false,pager:false}) ]},
    "admin/milk-tankers": { surface:"admin", title:"Milk Tankers", blocks:[ head("Milk Procurement & Profit Center","Enter each day's tanker in KG — cost, litres and FIFO inventory are computed automatically. Sales draw milk down oldest-first."), { type:"milkTankers" } ]},
    "admin/profit-center": { surface:"admin", title:"Profit Center", blocks:[ head("Milk Profit & Loss","Daily and monthly profit after procurement (FIFO cost of milk sold) and expenses. Edit the seasonal rates below."), { type:"profitCenter" } ]},
    "admin/reports": { surface:"admin", title:"Reports", blocks:[
      head("Reports","Live business intelligence — sales, customers, subscriptions, finance, operations, procurement & marketing."),
      { type:"reportsBoard" },
    ]},
    "admin/revenue": { surface:"admin", title:"Revenue", blocks:[ head("Revenue","Live revenue analytics & recognition — by source, product, payment method, with a full transaction ledger."), { type:"revenueBoard" } ]},
    "admin/payments": { surface:"admin", title:"Payments", blocks:[ head("Payments","Razorpay transactions and settlements."), { type:"kpis", items:[{n:"₹1.7L",l:"Captured today"},{n:"2",l:"Failed"},{n:"1",l:"Refunding"},{n:"₹0",l:"Disputed"}] }, tbl("payments",{filters:["All","Captured","Failed","Refunding"]}) ]},
    "admin/coupons": { surface:"admin", title:"Coupons", blocks:[ head("Coupons","Discount codes and usage.",[{label:"Create coupon",kind:"btn-primary",icon:"plus"}]), tbl("coupons",{filters:["All","Active","Scheduled","Paused"]}) ]},
    "admin/offers": { surface:"admin", title:"Offers", blocks:[ head("Offers","Campaign-driven promotions — typed, prioritised, scheduled. Create, schedule, pause & track live.",[{label:"New offer",kind:"btn-primary",icon:"plus"}]), { type:"offersBoard" } ]},
    "admin/blogs": { surface:"admin", title:"Blogs", blocks:[ head("Blog Manager","Write, schedule and publish journal posts — full lifecycle, SEO, reading-time & views, backed by the DOODLY database.",[{label:"New post",kind:"btn-primary",icon:"plus"}]), { type:"blogBoard" } ]},
    "admin/cms": { surface:"admin", title:"CMS", blocks:[
      head("CMS","Edit storefront content — pages, FAQs, banners, products."),
      { type:"cardGrid", cols:3, cards:[
        { ic:"tag", title:"Products & status", text:"Launch products with a status flip.", href:"/admin/products.html", link:"Open" },
        { ic:"msg", title:"FAQs", text:"Edit the customer FAQ." },
        { ic:"edit", title:"Pages", text:"About, farmers, quality copy." },
        { ic:"gift", title:"Banners", text:"Homepage hero & promos." },
        { ic:"star", title:"Testimonials", text:"Manage reviews shown publicly." },
        { ic:"file", title:"Legal", text:"Privacy, terms, refund, shipping." } ]},
      { type:"cmsBoard" },
    ]},
    "admin/notifications": { surface:"admin", title:"Notifications", blocks:[ head("Notifications","Compose and send WhatsApp, SMS, push and email campaigns to a live audience — recorded and delivered from the DOODLY database.",[{label:"New campaign",kind:"btn-primary",icon:"plus"}]), { type:"notificationsBoard" } ]},
    "admin/support": { surface:"admin", title:"Support Tickets", blocks:[ head("Support Tickets","Customer issues and resolutions — full ticket desk with SLA, assignment, internal notes, customer replies and lifecycle, backed by the DOODLY database.",[{label:"New ticket",kind:"btn-primary",icon:"plus"}]), { type:"supportBoard" } ]},
    "admin/roles": { surface:"admin", title:"Roles & Permissions", blocks:[ head("Roles & Permissions","Enterprise access control — role defaults plus per-user permission overrides. Super Admin only."), { type:"rolesAdmin" } ]},
    "admin/audit-logs": { surface:"admin", title:"Audit Logs", blocks:[ head("Audit Logs","A live record of every sensitive action — logins, role switches, user & permission changes."), { type:"auditLog" } ]},
    "admin/chat-support": { surface:"admin", title:"Chat Support", blocks:[ head("AI Chat Support","Manage Doodly Assistant conversations — active, resolved and escalated chats, satisfaction, response time, canned responses and the knowledge base."), { type:"chatSupport" } ]},
    "admin/users": { surface:"admin", title:"User Management", blocks:[ head("User Management","Create staff, assign roles, lock or disable accounts. Deletes are soft."), { type:"userStats" }, { type:"userManagement" } ]},
    "admin/hr-dashboard": { surface:"admin", title:"HR Dashboard", blocks:[ head("Human Resources","Headcount, attendance, payroll and advances at a glance."), { type:"hrDashboard" } ]},
    "admin/employees": { surface:"admin", title:"Employees", blocks:[ head("Employee Master","Manage staff records, employment details and identity documents."), { type:"hrEmployees" } ]},
    "admin/attendance": { surface:"admin", title:"Attendance", blocks:[ head("Attendance","Daily register, corrections, bulk marking and monthly calendar."), { type:"hrAttendance" } ]},
    "admin/leave": { surface:"admin", title:"Leave", blocks:[ head("Leave Management","Apply, approve and track staff leave and balances."), { type:"hrLeave" } ]},
    "admin/advances": { surface:"admin", title:"Salary Advances", blocks:[ head("Salary Advances","Request, approve and recover staff salary advances."), { type:"hrAdvances" } ]},
    "admin/payroll": { surface:"admin", title:"Payroll", blocks:[ head("Payroll","Generate monthly payroll, salary slips and bank transfer reports."), { type:"hrPayroll" } ]},
    "admin/permissions": { surface:"admin", title:"Permissions", blocks:[ head("Permissions","Fine-grained, per-module access for every role. Changes apply instantly."), { type:"permissionMatrix" } ]},
    "admin/settings": { surface:"admin", title:"Settings", blocks:[ head("Settings","Platform configuration — general, notifications and security. Saved to the DOODLY database and applied where used. Super Admin edits; others view."), { type:"settingsBoard" } ]},
    "admin/careers": { surface:"admin", title:"Careers", blocks:[ head("Careers — Applications","Every job application submitted from the website — review, rate, move through the hiring pipeline and download resumes.",[{label:"Export",kind:"btn-ghost",icon:"download"}]), { type:"careersBoard" } ]},
    "admin/puzzles": { surface:"admin", title:"Puzzle Challenge", blocks:[ head("Monthly Puzzle Challenge","One puzzle every month — schedule, participants, winners and prizes, with the option to extend the campaign month by month. The winner is decided automatically: fewest moves, then fastest time, earliest finish, secure random."), { type:"puzzleAdmin" } ]},
    "admin/gst": { surface:"admin", title:"GST Management", blocks:[ head("GST Management","Centralised, Super-Admin-controlled tax rates — create, assign to products, auto-calculate, and keep historical invoices accurate. View-only for other roles."), { type:"gstAdmin" } ]},
    "admin/loyalty": { surface:"admin", title:"DOODLY Pure Rewards", blocks:[ head("DOODLY Pure Rewards","Configure earning rates, tiers, redemption, expiry and campaigns — and manage members' points. Every change is audited."), { type:"loyaltyAdmin" } ]},
    "admin/reviews": { surface:"admin", title:"Customer Reviews", blocks:[ head("Customer Reviews","All ratings (1–5★) for quality monitoring — only APPROVED 5★ verified reviews appear on the public site."), { type:"reviewsAdmin" } ]},
    "admin/delivery-settings": { surface:"admin", title:"Delivery Settings", blocks:[ head("Delivery Settings","Configure the order cut-off, delivery window and availability. Changes apply to the storefront instantly."), { type:"deliverySettings" } ]},
    "admin/serviceable-areas": { surface:"admin", title:"Serviceable Areas", blocks:[ head("Serviceable Areas","Manage delivery pincodes and the waitlist. Add a pincode and the storefront accepts it instantly — launch new cities with no code change."), { type:"serviceableAreas" } ]},
    "admin/billing": { surface:"admin", title:"Subscription Billing", blocks:[ head("Subscription Billing","Auto-pay customers, upcoming renewals, failures and revenue forecast."), { type:"autopayBilling" } ]},
    "admin/b2b": { surface:"admin", title:"B2B Order Management", blocks:[ head("B2B Order Management","Register commercial customers, create bulk orders, track delivery, payments and invoices — Admin & Super Admin only."), { type:"b2b" } ]},
    "admin/b2b-pricing": { surface:"admin", title:"B2B Pricing Management", blocks:[ head("Dynamic B2B Pricing","Give every business its own negotiated product prices, quantity slabs and effective dates. Authorized users can override a price for a single order without ever changing the default. Full history, bulk tools, reports and audit — Super Admin manages."), { type:"b2bPricing" } ]},
    "admin/expenses": { surface:"admin", title:"Daily Expenses", blocks:[ head("Daily Expenses","Record, approve, track and report all business expenses — Admin, Accountant & Super Admin only."), { type:"expenses" } ]},
    "admin/wallet": { surface:"admin", title:"Wallet Management", blocks:[ head("Wallet Management","Customer wallet balances, manual credit/debit, reversals, Trial-Pack cashback reports and configuration."), { type:"walletAdmin" } ]},
    "admin/brand-story": { surface:"admin", title:"Brand Story", blocks:[ head("Brand Story — Unfold Pure","Edit the /doodly story hero & CTAs and download the packaging QR. Changes go live instantly — no code change."), { type:"brandStoryAdmin" } ]},
    "admin/help-center": { surface:"admin", title:"Help Center", blocks:[ head("Help Center","Manage FAQs, categories, video guides and illustrations, and review help analytics. Changes publish instantly — no code change."), { type:"helpCenterAdmin" } ]},
    "admin/search-insights": { surface:"admin", title:"Search Insights", blocks:[ head("Search Insights","Live global-search analytics — volume, keywords, zero-result queries, device & conversion, a full event ledger, and trending management."), { type:"searchInsightsBoard" } ]},
    "admin/referrals": { surface:"admin", title:"Referrals", blocks:[ head("Referral Management","Codes, relationships, one-time ₹100 rewards, fraud alerts and reports. Approve, reject or reverse — Super Admin controls."), { type:"referralAdmin" } ]},
    "doodly": { surface:"public", title:"DOODLY — Unfold Pure", blocks:[ { type:"unfoldPure" } ]},
    "unfold-pure": { surface:"public", title:"DOODLY — Unfold Pure", blocks:[ { type:"unfoldPure" } ]},

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
