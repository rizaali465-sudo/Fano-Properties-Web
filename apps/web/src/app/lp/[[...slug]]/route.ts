import { NextResponse } from "next/server";
import { landingPageGoogleTag } from "@/lib/landing-page-tag";

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

function toSitePage(html: string, path: string): string {
  return html
    .replace(/\b(href|src)="(\/(?!\/)[^"]*)"/g, (_m, attr: string, p: string) => `${attr}="${sitePath(p)}"`)
    .replace(/fetch\("\/api\/lead"/g, `fetch(${JSON.stringify(SOURCE + "/api/lead")}`)
    .replace("</head>", `<link rel="canonical" href="${SITE}${path}">\n${landingPageGoogleTag()}</head>`);
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
