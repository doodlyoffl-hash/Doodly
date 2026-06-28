import Script from "next/script";

/* =============================================================
   DOODLY — Analytics (placeholders, env-driven)
   Nothing loads unless the matching NEXT_PUBLIC_* env var is set,
   so dev/preview stays clean. All tags load AFTER the page is
   interactive (or lazily) so they never block first paint.
   Set in Vercel → Project → Settings → Environment Variables:
     NEXT_PUBLIC_GA_ID            G-XXXXXXXXXX   (Google Analytics 4)
     NEXT_PUBLIC_CLARITY_ID       xxxxxxxxxx     (Microsoft Clarity)
     NEXT_PUBLIC_META_PIXEL_ID    1234567890     (Meta / Facebook Pixel)
   Google Search Console verification is wired via metadata.verification.
   ============================================================= */
export function Analytics() {
  const ga = process.env.NEXT_PUBLIC_GA_ID;
  const clarity = process.env.NEXT_PUBLIC_CLARITY_ID;
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  return (
    <>
      {ga && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}',{anonymize_ip:true});`}
          </Script>
        </>
      )}

      {clarity && (
        <Script id="ms-clarity" strategy="lazyOnload">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarity}");`}
        </Script>
      )}

      {pixel && (
        <>
          <Script id="meta-pixel" strategy="lazyOnload">
            {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img height="1" width="1" style={{ display: "none" }} alt="" src={`https://www.facebook.com/tr?id=${pixel}&ev=PageView&noscript=1`} />
          </noscript>
        </>
      )}
    </>
  );
}
