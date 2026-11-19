import { NextResponse } from "next/server";
import { CONSENT_COUNTRIES } from "@/lib/analytics";

// Landing pages for the Google Ads campaigns, one per property in English and Arabic:
//   /lp/en                English index of every property      /lp/ar               Arabic investor page
//   /lp/en/<property>     English property page                /lp/ar/<property>    Arabic property page
//
// The pages are built and kept up to date in the Fano team app (a Cloudflare Worker), so a
// change there shows here within minutes without a website deploy. This route serves them on
// fanoproperties.com, so the ads show the website's address: page links are switched to /lp/...,
// the styles keep loading from the team app, and the website's Google tag is added.
// Enquiries go from the visitor's browser straight to the team app's Lead inbox, which accepts
// sends from fanoproperties.com.

// LANDING_PAGES_SOURCE can point at another copy of the team app (for example in a local test)
const SOURCE = (process.env.LANDING_PAGES_SOURCE ?? "https://fano-ai.fanoproperties.workers.dev").replace(/\/$/, "");
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://fanoproperties.com").replace(/\/$/, "");
const KEY = /^[a-z0-9-]{1,60}$/;
const REFRESH_SECONDS = 300;

// Same consent rules as the rest of the site (components/analytics/google-tag.tsx): ads and
// analytics cookies are off in the EEA, UK and Switzerland unless the visitor accepted them on
// fanoproperties.com, and on everywhere else.
const GRANTED = { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted", analytics_storage: "granted" };
const DENIED = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" };

const tagId = (value: string | undefined, prefix: string) =>
  value && new RegExp(`^${prefix}-[A-Z0-9-]+$`).test(value.trim()) ? value.trim() : undefined;

/** /lp/en/sol-luxe -> /en/sol-luxe on the team app. The Symphony's English page lives at /symphony there. */
function sourcePath(slug: string[]): string | null {
  const [lang, key, ...rest] = slug;
  if (rest.length || (lang !== "en" && lang !== "ar")) return null;
  if (key === undefined) return `/${lang}`;
  if (!KEY.test(key)) return null;
  return lang === "en" && key === "symphony" ? "/symphony" : `/${lang}/${key}`;
}

/** Page links become /lp/... on this site; anything else the page loads stays on the team app. */
function sitePath(p: string): string {
  const m = /^\/(?:(en|ar)(?:\/([a-z0-9-]+))?|(symphony))(?=$|[#?])(.*)$/.exec(p);
  if (!m) return SOURCE + p;
  if (m[3]) return `/lp/en/symphony${m[4]}`;
  return `/lp/${m[1]}${m[2] ? `/${m[2]}` : ""}${m[4]}`;
}

function googleTag(): string {
  const ids = [tagId(process.env.GA_MEASUREMENT_ID, "G"), tagId(process.env.GOOGLE_ADS_ID, "AW")].filter(Boolean) as string[];
  if (!ids.length) return "";
  const j = JSON.stringify;
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${ids[0]}"></script>
<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;
gtag('consent','default',${j({ ...DENIED, region: CONSENT_COUNTRIES, wait_for_update: 500 })});
gtag('consent','default',${j(GRANTED)});
try{if(localStorage.getItem('fano-cookie-consent')==='granted')gtag('consent','update',${j(GRANTED)});}catch(e){}
gtag('js',new Date());
${ids.map((id) => `gtag('config',${j(id)});`).join("\n")}
(function(){
  // Calls and WhatsApp taps count as conversions, as on the rest of the site. The page reports its own
  // WhatsApp buttons (data-wa), so only the other WhatsApp links are reported here.
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;
    var h=a.getAttribute('href')||'';
    if(h.indexOf('tel:')===0)gtag('event','click_to_call',{link_url:h,page_path:location.pathname});
    else if(h.indexOf('wa.me/')>-1&&!a.hasAttribute('data-wa'))gtag('event','whatsapp_click',{page_path:location.pathname});
  });
  // Hand the enquirer's email and phone to the Google tag before the page reports the lead
  // (same as trackLead in lib/analytics.ts), so Google Ads can match the lead to the ad click.
  function e164(raw){var t=String(raw||'').trim(),d=t.replace(/\\D/g,''),p;if(!d)return;
    if(t.charAt(0)==='+')p='+'+d;else if(d.indexOf('00')===0)p='+'+d.slice(2);else if(d.indexOf('971')===0)p='+'+d;
    else{if(d.charAt(0)==='0')d=d.slice(1);p=(d.length===8||d.length===9)?'+971'+d:'+'+d;}
    return p.length>=9&&p.length<=16?p:undefined;}
  document.addEventListener('submit',function(e){
    var f=e.target;if(!f||f.id!=='lead-form')return;var u={};
    var m=f.email&&String(f.email.value||'').trim().toLowerCase();if(m)u.email=m;
    var ph=f.phone&&e164(String(f.phone.value||'').replace(/[٠-٩]/g,function(c){return String(c.charCodeAt(0)-0x660)}));if(ph)u.phone_number=ph;
    if(u.email||u.phone_number)gtag('set','user_data',u);
  },true);
})();
</script>
`;
}

function toSitePage(html: string, path: string): string {
  return html
    .replace(/\b(href|src)="(\/(?!\/)[^"]*)"/g, (_m, attr: string, p: string) => `${attr}="${sitePath(p)}"`)
    .replace(/fetch\("\/api\/lead"/g, `fetch(${JSON.stringify(SOURCE + "/api/lead")}`)
    .replace("</head>", `<link rel="canonical" href="${SITE}${path}">\n${googleTag()}</head>`);
}

export async function GET(req: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  const path = `/lp/${slug.join("/")}`.replace(/\/$/, "");
  const from = sourcePath(slug);
  if (!from) return NextResponse.redirect(new URL("/lp/en", req.url), 302);

  let res: Response;
  try {
    res = await fetch(SOURCE + from, { next: { revalidate: REFRESH_SECONDS }, signal: AbortSignal.timeout(8000) });
  } catch {
    // The team app can't be reached: send the visitor to the same page on its own address
    return NextResponse.redirect(SOURCE + from, 302);
  }
  if (res.status === 404) return NextResponse.redirect(new URL(from.startsWith("/ar") ? "/lp/ar" : "/lp/en", req.url), 302);
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) return NextResponse.redirect(SOURCE + from, 302);

  return new NextResponse(toSitePage(await res.text(), path), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}
