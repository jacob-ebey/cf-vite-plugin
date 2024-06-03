import type { Context } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

import { durableObjectsMiddleware } from "./durable-objects.js";

export type SessionVariables = {
  sessionId: string;
};

type HonoEnv = {
  Bindings: {
    COOKIE_SECRET: string;
  };
  Variables: SessionVariables;
};

export const sessionMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const session = await getSignedCookie(c, c.env.COOKIE_SECRET, "_session");
  c.set("sessionId", session || "global");

  await next();
});

export async function setSessionId(c: Context, sessionId: string) {
  c.set("sessionId", sessionId);
  await setSignedCookie(c, "_session", sessionId, c.env.COOKIE_SECRET, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: c.req.url.startsWith("https://") || c.req.url.startsWith("wss://"),
  });
  await durableObjectsMiddleware(c, () => Promise.resolve());
}
