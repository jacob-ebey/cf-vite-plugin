import type { Context, Env } from "hono";
import { createMiddleware } from "hono/factory";
import { html } from "hono/html";
import type { Child, FC, JSXNode } from "hono/jsx";
import { Fragment, jsx } from "hono/jsx";
import { RequestContext } from "hono/jsx-renderer";
import { renderToReadableStream } from "hono/jsx/streaming";
import type { HtmlEscapedString } from "hono/utils/html";
import { raw } from "hono/utils/html";
import { injectRSCPayload } from "rsc-html-stream/server";

import { decode, encode } from "@jacob-ebey/hono-server-components/runtime";

function defaultLoadClientModule(id: string) {
  return import(/* @vite-ignore */ id);
}

export function rscRenderer(Component?: FC<{ children: Child }>) {
  return createMiddleware(async (c, next) => {
    const Layout = (c.getLayout() ?? Fragment) as FC;
    if (Component) {
      c.setLayout((props) => {
        return Component(
          { ...props, Layout },
          // @ts-expect-error - This is to satisfy Hono's runtime API
          c
        );
      });
    }
    c.setRenderer(createRenderer(c, Layout, Component) as any);
    return next();
  });
}

export type LoadClientModuleFunction = (
  id: string
) => Promise<Record<string, unknown>>;

export function rscConsumer<E extends Env = {}>({
  fetchRSC,
  loadClientModule,
}: {
  fetchRSC: (c: Context<E>) => Promise<Response>;
  loadClientModule?: LoadClientModuleFunction;
}) {
  return createMiddleware(async (c, next) => {
    const response = await fetchRSC(c as unknown as Context<E>);
    if (!response.body) {
      throw new Error("No body in RSC response");
    }
    if (c.req.header("RSC") === "1") {
      for (const [key, value] of response.headers) {
        if (key.toLowerCase() === "set-cookie") continue;
        c.header(key, value, { append: true });
      }
      for (const cookie of response.headers.getSetCookie()) {
        c.header("Set-Cookie", cookie, { append: true });
      }
      c.header("Vary", "RSC", { append: true });
      return c.body(response.body);
    }
    const [rscStreamA, rscStreamB] = response.body.tee();

    const decoded = await decode(rscStreamA, {
      loadClientModule: loadClientModule || defaultLoadClientModule,
    });
    c.executionCtx.waitUntil(decoded.done.catch(() => {}));

    const body = html`${raw("<!DOCTYPE html>")}${jsx(
      RequestContext.Provider,
      { value: c },
      decoded.value as HtmlEscapedString
    )}`;

    c.header("Transfer-Encoding", "chunked");
    c.header("Content-Type", "text/html; charset=UTF-8");

    const htmlStream = renderToReadableStream(body, console.error);

    return c.body(htmlStream.pipeThrough(injectRSCPayload(rscStreamB)));
  });
}

function createRenderer(
  c: Context,
  Layout: FC,
  Component?: FC<{ children: Child }>
) {
  return async (children: JSXNode) => {
    const currentLayout = Component
      ? jsx(
          (props: any) =>
            Component(
              props,
              // @ts-expect-error - This is to satisfy Hono's runtime APIƒ
              c
            ),
          {
            Layout,
          },
          children as any
        )
      : children;

    const rscStream = encode(currentLayout);

    c.header("Transfer-Encoding", "chunked");
    c.header("Content-Type", "text/x-component; charset=UTF-8");
    return c.body(rscStream);
  };
}
