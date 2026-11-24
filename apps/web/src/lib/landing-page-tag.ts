import { googleTagHead } from "@/lib/google-tag-html";

// The website's Google tag for the plain-HTML ad landing pages under /lp (they are not React
// pages, so the site layout's <GoogleTag> does not reach them). One implementation is shared with
// the /lp route: see lib/google-tag-html.ts.
export function landingPageGoogleTag(): string {
  return googleTagHead();
}
