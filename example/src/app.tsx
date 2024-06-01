import { Hono } from "hono";

import browserEntry from "asset:/src/browser.tsx";
import { durableObjectsMiddleware } from "./durable-objects.js";
import type { Env } from "./env.js";

export { Counter } from "./counter.js";

const app = new Hono<{
  Bindings: Env;
}>()
  .use(durableObjectsMiddleware)
  .get("/", async ({ get, html, req }) => {
    const id =
      (
        req.raw as {
          cf?: IncomingRequestCfProperties;
        }
      ).cf?.country || "global";

    const count = await get("counter")
      .value.$get()
      .then((res) => res.json());

    return html(
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <title>Counter</title>
        </head>
        <body>
          <h1>Count: {count}</h1>
          <button id="increment">Increment</button>
          <script async type="module" src={browserEntry} />
        </body>
      </html>
    );
  })
  .post("/increment", async ({ get, json }) => {
    const newCount = await get("counter")
      .increment.$post()
      .then((res) => res.json());

    return json(newCount);
  });

export default app;
