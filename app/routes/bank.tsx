import { lazy, Suspense, useEffect, useState } from "react";
import type { LinksFunction, MetaFunction } from "react-router";

import scopeCss from "@/bank/styles/agent-native.css?url";
import agentCss from "@/bank/styles/agent.css?url";
import appCss from "@/bank/styles/app.css?url";
import showcaseCss from "@/bank/styles/showcase.css?url";
import themeCss from "@/bank/styles/theme.css?url";
import tourCss from "@/bank/styles/tour.css?url";

// Same stylesheet order as web-demo's main.tsx, after the host reset.
export const links: LinksFunction = () =>
  [scopeCss, themeCss, appCss, agentCss, tourCss, showcaseCss].map((href) => ({ rel: "stylesheet", href }));

export const meta: MetaFunction = () => [{ title: "Agent Demo — Mock Bank" }];

// Browser-only: WebLLM, WebGPU, speech APIs and the DOM adapter never run on the server.
const BankApp = lazy(() => import("@/bank/App").then((m) => ({ default: m.App })));

export default function BankRoute() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="web-ai-bank">
      {mounted ? (
        <Suspense fallback={null}>
          <BankApp />
        </Suspense>
      ) : null}
    </div>
  );
}
