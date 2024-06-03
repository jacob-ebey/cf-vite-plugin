import { decode } from "@jacob-ebey/hono-server-components/runtime";
import { hydrateDocument } from "@jacob-ebey/hono-server-components/browser.vite";

import clientModules from "virtual:client-modules";

let abortController = new AbortController();
hydrateDocument({ signal: abortController.signal }).then(() => {
  window.navigation.addEventListener("navigate", (event) => {
    event.intercept({
      focusReset: "after-transition",
      async handler() {
        const toAbort = abortController;
        abortController = new AbortController();
        const signal = abortController.signal;

        const response = await fetch(event.destination.url, {
          headers: {
            RSC: "1",
          },
          credentials: "same-origin",
          signal,
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

        try {
          await hydrateDocument({ signal }, decodedPromise).catch(() => {});
        } catch (reason) {
          console.error({ reason });
        }
      },
    });
  });
});
