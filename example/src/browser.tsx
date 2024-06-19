import type { Child } from "hono/jsx";
import {
  jsx,
  render,
  useState,
  startTransition,
  useEffect,
  use,
  Suspense
} from "hono/jsx/dom";

import { decode } from "@jacob-ebey/hono-server-components/runtime";
import { rscStream } from "@jacob-ebey/hono-server-components/browser";

import clientModules from "virtual:client-modules";

let updateRoot: (root: Promise<Child>) => void;
function DocumentHydrator({ initialRoot }: { initialRoot: Promise<Child> }) {
  let [root, setRoot] = useState(initialRoot);
  // useEffect(() => {
    updateRoot = (newRoot) => {
      startTransition(() => {
        try {
          setRoot(newRoot);
        } catch (reason) {
          console.log({ reason });
          if (
            typeof reason === "object" &&
            reason &&
            "then" in reason &&
            typeof reason.then === "function"
          ) {
            reason.then(
              () => updateRoot(newRoot),
              () => {}
            );

            return;
          }
          throw reason;
        }
      });
    };
  // }, [setRoot]);
  // console.log({ root });
  return <Suspense fallback="">{use(root)}</Suspense>;
}

const decodePromise = decode(rscStream, {
  loadClientModule(id) {
    if (import.meta.env.PROD) {
      return clientModules[id]();
    }
    return import(/* @vite-ignore */ id);
  },
}).then((decoded) => decoded.value as Child);

render(
  <DocumentHydrator initialRoot={decodePromise} />,
  document.getElementById("app")!
);

let abortController = new AbortController();
// hydrateDocument().then(({ render }) => {
window.navigation.addEventListener("navigate", (event) => {
  if (!event.canIntercept || event.hashChange || event.downloadRequest) {
    return;
  }

  // Check if the URL is on the same origin.
  const url = new URL(event.destination.url);
  if (url.origin !== location.origin) {
    return;
  }

  console.log("INERCEPTED", event)

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

      const decoded = await decode(response.body, {
        loadClientModule(id) {
          if (import.meta.env.PROD) {
            return clientModules[id]();
          }
          return import(/* @vite-ignore */ id);
        },
      });
      decoded.done.catch(() => {});
      updateRoot(Promise.resolve(decoded.value as Child));

      toAbort.abort();
      await decoded.done;
    },
  });
});
// });
