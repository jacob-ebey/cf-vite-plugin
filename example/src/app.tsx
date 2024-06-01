import { Hono } from "hono";
import { createElement } from "hono/jsx";

export { Counter } from "./counter.js";
import { durableObjectsMiddleware } from "./durable-objects.js";
import type { Env } from "./env.js";

import browserEntry from "bridge:./browser.js";
import stylesEntry from "bridge:./global.css";

function Entry({ entry }: { entry: string }) {
  const baseId = entry.replace(/\?.*$/, "");
  if (import.meta.env.PROD && baseId.endsWith(".css")) {
    return <link rel="stylesheet" href={entry} />;
  }
  return <script async type="module" src={entry} />;
}

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
          <Entry entry={stylesEntry} />
        </head>
        <body>
          <Entry entry={browserEntry} />

          <section class="py-24 flex flex-col items-center min-h-screen justify-center bg-white">
            <div class="mx-auto max-w-[43rem]">
              <div class="text-center">
                <p class="text-lg font-medium leading-8 text-indigo-600/95">
                  Yo yo yo!
                </p>
                <h1 class="mt-3 text-[3.5rem] font-bold leading-[4rem] tracking-tight text-black">
                  Count: {count}
                </h1>
                <p class="mt-3 text-lg leading-relaxed text-slate-400">
                  This shit actually works!
                </p>
              </div>
            </div>
            <div class="mt-6 flex items-center justify-center gap-4">
              <button
                id="increment"
                class="transform rounded-md bg-indigo-600/95 px-5 py-3 font-medium text-white transition-colors hover:bg-indigo-700"
              >
                Increment
              </button>
            </div>
          </section>
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
