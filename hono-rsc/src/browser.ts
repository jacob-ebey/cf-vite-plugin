import type { Child } from "hono/jsx";
import { render } from "hono/jsx/dom";
import { rscStream } from "rsc-html-stream/client";

import { decode } from "@jacob-ebey/hono-server-components/runtime";
import clientModules from "virtual:client-modules";

const rootPromise = decode(rscStream, {
  loadClientModule(id) {
    if (import.meta.env.PROD) {
      return clientModules[id]();
    }
    return import(/* @vite-ignore */ id);
  },
}).then((decoded) => decoded);

export function hydrateDocument() {
  return rootPromise.then(async (decoded) => {
    let run = true;
    while (run) {
      run = false;
      try {
        render(
          decoded.value as Child,
          {
            replaceChildren: (documentFragment: DocumentFragment) => {
              const viteStyles = document.head.querySelectorAll(
                "style[data-vite-dev-id]"
              );

              // copy over the <html> attributes to the current document
              const html = documentFragment.querySelector("html");
              if (html) {
                for (const attr of Array.from(
                  document.documentElement.attributes
                )) {
                  document.documentElement.removeAttribute(attr.name);
                }
                for (const attr of Array.from(html.attributes)) {
                  document.documentElement.setAttribute(attr.name, attr.value);
                }
              }

              // copy over the <head> attributes to the current document
              const head = documentFragment.querySelector("head");
              if (head) {
                for (const attr of Array.from(document.head.attributes)) {
                  document.head.removeAttribute(attr.name);
                }
                for (const attr of Array.from(head.attributes)) {
                  document.head.setAttribute(attr.name, attr.value);
                }
              }
              // copy over the <head> children to the current document
              for (const child of Array.from(document.head.children)) {
                document.head.removeChild(child);
              }
              for (const child of Array.from(head?.children || [])) {
                document.head.appendChild(child);
              }

              for (const style of Array.from(viteStyles)) {
                const id = style.getAttribute("data-vite-dev-id");
                const existingStyle = document.head.querySelector(
                  `style[data-vite-dev-id="${id}"]`
                );
                if (!existingStyle) {
                  document.head.appendChild(style);
                }
              }

              // copy over the <body> attributes to the current document
              const body = documentFragment.querySelector("body");
              if (body) {
                for (const attr of Array.from(document.body.attributes)) {
                  document.body.removeAttribute(attr.name);
                }
                for (const attr of Array.from(body.attributes)) {
                  document.body.setAttribute(attr.name, attr.value);
                }
              }

              // copy over the <body> children to the current document
              for (const child of Array.from(document.body.children)) {
                document.body.removeChild(child);
              }
              for (const child of Array.from(body?.children || [])) {
                document.body.appendChild(child);
              }
            },
          } as any
        );
      } catch (reason) {
        if (
          typeof reason === "object" &&
          reason &&
          "then" in reason &&
          typeof reason.then === "function"
        ) {
          run = true;
          await reason;
          continue;
        }

        throw reason;
      }
    }
  });
}
