import { Hono } from "hono";

import browserEntry from "asset:/src/browser.tsx";
export { Counter } from "./counter.js";
import type { Env } from "./env.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async ({ env: { COUNTER }, html, req }) => {
  const id =
    (
      req.raw as {
        cf?: IncomingRequestCfProperties;
      }
    ).cf?.country || "global";
  const counter = COUNTER.get(COUNTER.idFromName(id));
  const count = await counter
    .fetch("https://counter/value")
    .then((res) => res.text());
  return html(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Counter</title>
      </head>
      <body>
        <h1>Count: {count}</h1>
        <script async type="module" src={browserEntry} />
      </body>
    </html>
  );
});

export default app;
