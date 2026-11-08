import { redirect } from "react-router";

import { APP_TITLE } from "@/lib/app-config";

const SEO_TITLE = `${APP_TITLE} - people and agents on one guarded action layer`;
const SEO_DESCRIPTION =
  "A banking demo built with Agent-Native: an on-device model, a cloud agent and external agents propose; one deterministic policy decides; you see and confirm every step.";

// Shared with the chat routes.
export function meta() {
  return [
    { title: SEO_TITLE },
    { name: "description", content: SEO_DESCRIPTION },
    { property: "og:title", content: SEO_TITLE },
    { property: "og:description", content: SEO_DESCRIPTION },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: SEO_TITLE },
    { name: "twitter:description", content: SEO_DESCRIPTION },
  ];
}

// Mock Bank is the app's home (app.homePath = /bank); the template's Get
// started page is retired, so old /home links land on the bank.
export function loader() {
  return redirect("/bank");
}

export function clientLoader() {
  return redirect("/bank");
}

export default function HomeRoute() {
  return null;
}
