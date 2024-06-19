import type { Child } from "hono/jsx";
import {
  jsx,
  render,
  useState,
  startTransition,
  useEffect,
  use,
} from "hono/jsx/dom";

import { decode } from "@jacob-ebey/hono-server-components/runtime";
import clientModules from "virtual:client-modules";

import { rscStream } from "@jacob-ebey/hono-server-components/browser";

let updateRoot: (root: Promise<Child>) => void;
function DocumentHydrator({ initialRoot }: { initialRoot: Promise<Child> }) {
  let [root, setRoot] = useState(initialRoot);
  useEffect(() => {
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
  }, [setRoot]);
  return <>{use(root)}</>;
}

export async function hydrateDocument(): Promise<{
  render: (root: Child) => void;
}> {
  const decodedPromise = decode(rscStream, {
    loadClientModule(id) {
      if (import.meta.env.PROD) {
        return clientModules[id]();
      }
      return import(/* @vite-ignore */ id);
    },
  });
  decodedPromise.then(
    (decoded) => decoded.done.catch(() => {}).then(),
    () => {}
  );
  const valuePromise = decodedPromise.then((d) => d.value as Child);

  const replaceChildren = (documentFragment: DocumentFragment) => {
    let viteStyles;
    if (import.meta.env.DEV) {
      viteStyles = document.head.querySelectorAll("style[data-vite-dev-id]");
    }

    // copy over the <html> attributes to the current document
    const html = documentFragment.querySelector("html");
    if (html) {
      for (const attr of Array.from(document.documentElement.attributes)) {
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
    if (document.head.innerHTML !== head?.innerHTML) {
      for (const child of Array.from(document.head.children)) {
        document.head.removeChild(child);
      }
      for (const child of Array.from(head?.children || [])) {
        document.head.appendChild(child);
      }
    }

    if (import.meta.env.DEV) {
      for (const style of Array.from(viteStyles!)) {
        const id = style.getAttribute("data-vite-dev-id");
        const existingStyle = document.head.querySelector(
          `style[data-vite-dev-id="${id}"]`
        );
        if (!existingStyle) {
          document.head.appendChild(style);
        }
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
  };

  let run = true;
  while (run) {
    run = false;
    try {
      render(
        <DocumentHydrator initialRoot={valuePromise} />,
        new Proxy(
          {
            replaceChildren,
            childNodes: [
              document.head,
              document.body,
            ] as unknown as NodeListOf<ChildNode>,
            insertBefore(documentFragment, child) {
              console.log({ documentFragment });
              // console.log({ node, child });
              // return document.documentElement.insertBefore(node, child);
              replaceChildren(documentFragment as unknown as DocumentFragment);
              return document.documentElement as unknown as typeof documentFragment;
            },
          } satisfies Partial<Element>,
          {
            get(target, p, receiver) {
              console.log("ACCESSING", p);
              return Reflect.get(target, p, receiver);
            },
          }
        ) as any
      );
    } catch (reason) {
      if (
        typeof reason === "object" &&
        reason &&
        "then" in reason &&
        typeof reason.then === "function"
      ) {
        await Promise.resolve(reason).catch(() => {});
        run = true;
        continue;
      }

      throw reason;
    }
  }

  return {
    render(root) {
      console.log("UPDATING ROOT", root);
      updateRoot(Promise.resolve(root));
    },
  };
}
