import { rootPromise } from "@jacob-ebey/hono-server-components/browser";
import type { Child } from "hono/jsx";
import { render, startTransition } from "hono/jsx/dom";

rootPromise
  .then(async (decoded) => {
    // await decoded.done;
    startTransition(() => {
      console.log(decoded.value);
      render(decoded.value as Child, document.documentElement);
    });
  })
  .catch((reason) => {
    console.error(reason);
  });
