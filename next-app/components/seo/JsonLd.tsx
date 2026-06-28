/* Renders a JSON-LD <script>. Server component — output is in the HTML
   source for crawlers, zero client JS. Pass one or many schema objects. */
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");   // prevent </script> breakout
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
