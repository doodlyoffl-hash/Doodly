# DOODLY Delivery — store listing copy

The Delivery Executive app is an INTERNAL / employee app. You have two options:

1. **Closed testing / internal distribution** (recommended) — Play Console
   "Internal testing" track + Apple TestFlight internal testers. No public store
   listing, no review of business justification, fastest to your drivers.
2. **Public listing** — if you want drivers to self-install from the store. Then
   use the copy below and expect Apple to ask why a delivery-staff app is public.

---

## Google Play Console

**App name:** `DOODLY Delivery`
**Short description:** `Delivery app for DOODLY delivery executives.`
**Full description:**
```
DOODLY Delivery is the tool DOODLY delivery executives use on their morning round.

• See today's route and every stop in order
• Navigate to each address in one tap
• Record deliveries, failed attempts and customer-not-available
• Track bottles handed over and empties collected
• Works offline — updates sync automatically when signal returns
• Get notified of new assignments and route changes

This app is for onboarded DOODLY delivery executives. You'll need an account
provided by the DOODLY operations team to sign in.
```
**Category:** Business
**Content rating:** Everyone
**Privacy policy:** https://doodly.in/privacy.html

**Data safety — key answers**
- Collects: employee identity, precise + background location (during an active
  delivery run), delivery/route data.
- Purpose: app functionality (route + delivery recording), and sharing the
  executive's live location with operations while a delivery is in progress.
- Encrypted in transit: Yes. Deletion requests: via ⟨support@doodly.in⟩.

**⚠️ Background location:** this app requests `ACCESS_BACKGROUND_LOCATION`. Google
requires a short screencast + written justification at review: "Location is shared
with the operations team and customers only while the executive is on an active
delivery run, so customers can see their delivery approaching. It is not collected
when the executive is off shift."

---

## Apple App Store Connect (or TestFlight)

**App name:** `DOODLY Delivery`
**Subtitle:** `For DOODLY executives`
**Description:** reuse the Play full description above.
**Keywords:** `doodly,delivery,executive,route,logistics`
**Primary category:** Business
**Age rating:** 4+

**App Privacy — key answers**
- Data linked to user: Name/employee id, Precise Location, delivery data.
- Location: used in the background during a delivery run (declare "Location" →
  "App Functionality"). Add the background-location justification in review notes.
- No tracking across other companies' apps.

**Review notes (important):**
```
This is an internal app for DOODLY's delivery staff. Reviewer test account:
employee email ⟨driver-test@doodly.in⟩ / password ⟨…⟩ (role: delivery_executive).
Background location is used only while a delivery is actively out-for-delivery, to
show customers their approaching delivery; it stops when the executive ends their
shift.
```

**Background location capability:** the app declares `UIBackgroundModes: location`.
Be ready to justify it as above; Apple scrutinises this.
