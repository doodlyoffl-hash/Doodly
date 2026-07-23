# DOODLY mobile — go-live checklist

Ordered. Do them top to bottom. Items marked **[you]** need a human with a
credit card / legal identity — I can't do them for you. Items marked **[code]**
are already done in this repo.

Rough timeline: Apple's account approval can take a few days (D-U-N-S / identity
checks), so **start the Apple sign-up first** even though you'll build Android
sooner.

---

## 0. Accounts you need to create  **[you]**

| Account | Cost | Why | Link |
|---|---|---|---|
| **Expo** (EAS) | Free tier is enough to build | Cloud builds — this is what lets you ship iOS from Windows | expo.dev |
| **Apple Developer Program** | $99 / year | Required to build, TestFlight and ship any iOS app | developer.apple.com/programs |
| **Google Play Console** | $25 one-time | Required to ship any Android app | play.google.com/console/signup |
| **Firebase** project | Free | FCM credentials for Android push (and the APNs bridge) | console.firebase.google.com |

Create an **`in.doodly`**-owned Google/Apple identity if you don't want these tied
to a personal account. Both apps' bundle ids are already `in.doodly.customer` and
`in.doodly.delivery`.

---

## 1. One-time project setup

1. **[you]** Install the CLIs on any machine with Node:
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. **[you]** From `mobile/apps/customer`, run `eas init` — it creates an EAS
   project and prints a **projectId**. Paste it into `app.json` →
   `extra.eas.projectId`. Repeat in `mobile/apps/driver`.
   *(Until this is set, push tokens can't be minted on a real build — the app
   still runs, push just no-ops.)*
3. **[code]** `eas.json` build profiles (development / preview / production) —
   already written for both apps.

---

## 2. Push notifications (Firebase + APNs)

1. **[you]** Firebase → add an **Android app** with package `in.doodly.customer`,
   download `google-services.json`. Repeat for `in.doodly.delivery`.
2. **[you]** Upload those to EAS instead of committing them:
   ```bash
   eas credentials   # Android → Google Service Account / FCM
   ```
   or place each `google-services.json` next to its `app.json` at build time
   (it's git-ignored).
3. **[you]** iOS push: EAS can generate the APNs key for you during the first iOS
   build (`eas build -p ios` walks you through it), or upload an existing
   `.p8` APNs key via `eas credentials`.
4. **[code]** Backend Expo push sender, `/api/devices` registry, and the
   `useAppServices()` client wiring — done. Set **`EXPO_ACCESS_TOKEN`** in the
   backend env only if you enable Expo's "enhanced security" for push (optional).

---

## 3. Backend environment (production)

Set these on the **backend** Vercel project (`doodly-backendstore`), then redeploy:

| Var | For | Status |
|---|---|---|
| `MSG91_SMS_TEMPLATES` | must include a `login_otp` DLT template id | **[you]** — OTP login fails in prod without it |
| `EXPO_ACCESS_TOKEN` | optional, only for enhanced-security push | [you] optional |
| `APPLE_BUNDLE_IDS` | defaults to `in.doodly.customer,in.doodly.delivery` | [you] only if different |
| `NEXT_PUBLIC_API_BASE` (in the app) | the app's backend URL; defaults to the prod backend already | [code] default set |

The DB migrations (`DeviceToken`, `OtpCode`, `User.appleSub`) are **already applied
to production**.

---

## 4. Sign in with Apple  **[you]**

1. Apple Developer → Certificates, Identifiers & Profiles → your App ID
   `in.doodly.customer` → enable **Sign in with Apple**.
2. Nothing else in code — `usesAppleSignIn: true` is set, `/api/apple` verifies
   against Apple's JWKS and checks the audience.

---

## 5. First builds

```bash
# Android internal APK to sideload/test on a real phone:
cd mobile/apps/customer && eas build -p android --profile preview
cd mobile/apps/driver   && eas build -p android --profile preview

# iOS TestFlight build (needs the Apple account):
cd mobile/apps/customer && eas build -p ios --profile production
```

Production Android bundle for the Play Store:
```bash
eas build -p android --profile production   # produces an .aab
```

---

## 6. Store listings & submission  **[you]**

1. **[code]** Listing copy + privacy answers: `store/customer-listing.md`,
   `store/driver-listing.md`.
2. **[you]** Screenshots — run each app on a device/emulator and capture the six
   suggested screens (see the listing files for sizes).
3. **[you]** Play Console → create the app → fill Data Safety, content rating,
   listing → upload the `.aab` to Internal testing first.
4. **[you]** App Store Connect → create the app → fill App Privacy → upload the
   TestFlight build (`eas submit -p ios`) → then submit for review.
5. **[you]** Provide the reviewer a **test login** (see review notes in each
   listing file) — the OTP flow will otherwise block Apple's reviewer.

---

## 7. Over-the-air updates (after launch)

JS-only fixes ship without a store review:
```bash
eas update --branch production --message "fix: …"
```
Native changes (new permission, new native module) still need a store build.
