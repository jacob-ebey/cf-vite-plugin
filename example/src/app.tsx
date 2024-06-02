import { rscConsumer } from "@jacob-ebey/hono-server-components";
import { Hono } from "hono";

import { durableObjectsMiddleware } from "./durable-objects.js";
import type { Env } from "./env.js";

type HonoEnv = { Bindings: Env };

const app = new Hono<HonoEnv>().use(durableObjectsMiddleware).use(
  rscConsumer<HonoEnv>({
    fetchRSC({ env: { SERVER_COMPONENTS }, req }) {
      const stub = SERVER_COMPONENTS.get(
        SERVER_COMPONENTS.idFromName("global")
      );

      return stub.fetch(req.raw);
    },
  })
);

export default app;
