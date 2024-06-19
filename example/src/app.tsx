import { rscRenderer } from "@jacob-ebey/hono-server-components";
import { Hono } from "hono";
import { Suspense } from "hono/jsx";
import { withSWR } from "workers-swr";

import { durableObjectsMiddleware } from "./durable-objects.js";
import type { Env } from "./env.js";
import { Counter } from "./components/counter/client.js";
import type { SessionVariables } from "./session.js";
import { sessionMiddleware, setSessionId } from "./session.js";

async function AsyncHello() {
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 1000));
  return <p>Hello, World!</p>;
}

export const app = new Hono<{
  Bindings: Env & { state: DurableObjectState };
  Variables: SessionVariables;
}>()
  .use(sessionMiddleware)
  .use(durableObjectsMiddleware)
  .use(
    rscRenderer(({ children }) => (
      <>
        <ul>
          <li>
            <a href="/">Home</a>
          </li>
          <li>
            <a href="/about">About</a>
          </li>
        </ul>
        {children}
      </>
    ))
  )
  .on(["GET", "POST"], "/", async (c) => {
    const { env, executionCtx, get, header, render, req } = c;

    return withSWR(async () => {
      if (req.method === "POST") {
        const formData = await req.formData();
        const email = String(formData.get("email") || "");
        if (email) {
          await setSessionId(c, email);
        }
      } else {
        header("Cache-Control", "s-maxage=5, stale-while-revalidate=1");
        header("Vary", "Cookie");
      }

      const count = await get("counter")
        .value.$get()
        .then((res) => res.json());

      return render(
        <main>
          <div class="py-24 flex flex-col items-center">
            <h1 class="text-4xl font-bold">Hello, World!!</h1>
            <Counter initialCount={count} />
            <Suspense fallback={<p>Suspended...</p>}>
              <AsyncHello />
            </Suspense>
          </div>
          <form method="POST">
            <input name="email" type="email" placeholder="Email" required />
            <button type="submit">Submit</button>
          </form>
        </main>
      );
    })(req.raw, env, executionCtx);
  })
  .on(
    ["GET", "POST"],
    "/about",
    async ({ env, executionCtx, get, render, req }) => {
      return withSWR(async () => {
        const id =
          (
            req.raw as {
              cf?: IncomingRequestCfProperties;
            }
          ).cf?.country || "global";

        if (req.method === "POST") {
          await get("counter").increment.$post();
        }

        const count = await get("counter")
          .value.$get()
          .then((res) => res.json());

        return render(
          <main>
            <div class="py-24 flex flex-col items-center">
              <h1 class="text-4xl font-bold">About!!</h1>
              <Counter initialCount={count} />
              <Suspense fallback={<p>Suspended...</p>}>
                <AsyncHello />
              </Suspense>
              <form method="post" action="/about">
                <button type="submit">Increment</button>
              </form>
            </div>
          </main>
        );
      })(req.raw, env, executionCtx);
    }
  );
