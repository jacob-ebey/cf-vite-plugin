import { decode } from "@jacob-ebey/hono-server-components/runtime";
import { hydrateDocument } from "@jacob-ebey/hono-server-components/browser.vite";
import { startTransition } from "hono/jsx";

import clientModules from "virtual:client-modules";

let abortController = new AbortController();
hydrateDocument({ signal: abortController.signal }).then(() => {
  window.navigation.addEventListener("navigate", (event) => {
    if (!event.canIntercept || event.hashChange || event.downloadRequest) {
      return;
    }

    // Check if the URL is on the same origin.
    const url = new URL(event.destination.url);
    if (url.origin !== location.origin) {
      return;
    }

    event.intercept({
      focusReset: "after-transition",
      async handler() {
        const toAbort = abortController;
        abortController = new AbortController();
        const signal = abortController.signal;

        const response = await fetch(url, {
          headers: {
            RSC: "1",
          },
          credentials: "same-origin",
          signal,
          method: event.formData ? "POST" : "GET",
          body: event.formData,
        });
        if (!response.body) {
          throw new Error("No RSC body");
        }

        const decodedPromise = decode(response.body, {
          loadClientModule(id) {
            if (import.meta.env.PROD) {
              return clientModules[id]();
            }
            return import(/* @vite-ignore */ id);
          },
        });

        toAbort.abort();

        let p;
        startTransition(() => {
          p = hydrateDocument({ signal }, decodedPromise).catch(() => {});
        });
        await p;
      },
    });
  });
});
