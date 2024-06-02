import * as assert from "node:assert/strict";
import { test } from "node:test";

import { Hono } from "hono";
import { raw } from "hono/utils/html";
import type { Child } from "hono/jsx";
import { ErrorBoundary, Suspense } from "hono/jsx";

import { decode, encode } from "./src/runtime.js";
import { jsxRenderer } from "hono/jsx-renderer";

function stringDecode(encoded: string) {
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(encoded));
      controller.close();
    },
  });
  return decode(readable);
}

async function stringEncode(value: unknown) {
  const encoded = encode(value);
  let res = "";
  await encoded.pipeThrough(new TextDecoderStream()).pipeTo(
    new WritableStream({
      write(chunk) {
        res += chunk;
      },
    })
  );
  return res;
}

async function render(value: unknown, stream?: true) {
  const app = new Hono().use(async (c, next) => {
    try {
      await next();
    } catch (reason) {
      console.log(reason);
      throw reason;
    }
  });

  if (stream) {
    app.use(
      jsxRenderer(
        ({ children }) => (
          <html>
            <body>{children}</body>
          </html>
        ),
        { stream: true }
      )
    );
    app.get("/", (c) => c.render(value as string));
  } else {
    app.get("/", (c) => c.html(value as string));
  }
  const replaced = new Map<string, number>();
  return Promise.resolve(app.fetch(new Request("http://test/")))
    .then((res) => res.text())
    .then((html) =>
      html
        // Reset counters in the HTML
        .replace(/['"](H:\d+)['"]/g, (og, match: string) => {
          if (replaced.has(match)) {
            return og.replace(match, `H:${replaced.get(match)}`);
          }
          const id = replaced.size;
          replaced.set(match, id);
          return og.replace(match, `H:${id}`);
        })
        .replace(/['"](E:\d+)['"]/g, (og, match: string) => {
          if (replaced.has(match)) {
            return og.replace(match, `E:${replaced.get(match)}`);
          }
          const id = replaced.size;
          replaced.set(match, id);
          return og.replace(match, `E:${id}`);
        })
        .replace(/<!--(E:\d+)-->/g, (og, match: string) => {
          if (replaced.has(match)) {
            return og.replace(match, `E:${replaced.get(match)}`);
          }
          const id = replaced.size;
          replaced.set(match, id);
          return og.replace(match, `E:${id}`);
        })
    );
}

function BasicComponent({ children }: { children: Child }) {
  return <div class="basic-comp">{children}</div>;
}
async function AsyncBasicComponent({
  children,
  throwError,
}: {
  children: Child;
  throwError?: boolean;
}) {
  if (throwError) {
    throw new Error("Test error");
  }
  return <div class="basic-comp">{children}</div>;
}

test("can encode basic tree", async () => {
  const toEncode = (
    <div class="basic">
      <p>Hello</p>
    </div>
  );
  const encoded = await stringEncode(toEncode);
  const decoded = await stringDecode(encoded);
  await decoded.done;

  assert.deepEqual(decoded.value, toEncode);
});

test("can encode components tree", async () => {
  const toEncode = (
    <BasicComponent>
      <p>Hello</p>
    </BasicComponent>
  );
  const encoded = await stringEncode(toEncode);
  const decoded = await stringDecode(encoded);
  await decoded.done;

  assert.equal(await render(decoded.value), await render(toEncode));
});

test("can encode nested components tree", async () => {
  const toEncode = (
    <BasicComponent>
      <p>Hello</p>
      <BasicComponent>
        <p>Child</p>
      </BasicComponent>
    </BasicComponent>
  );
  const encoded = await stringEncode(toEncode);
  const decoded = await stringDecode(encoded);
  await decoded.done;

  assert.equal(await render(decoded.value), await render(toEncode));
});

test("can encode async components tree", async () => {
  const toEncode = (
    <AsyncBasicComponent>
      <p>Hello</p>
    </AsyncBasicComponent>
  );
  const encoded = await stringEncode(toEncode);
  const decoded = await stringDecode(encoded);
  await decoded.done;

  assert.equal(await render(decoded.value, true), await render(toEncode, true));
});

test("can encode nested async components tree", async () => {
  const toEncode = (
    <AsyncBasicComponent>
      <p>Hello</p>
      <AsyncBasicComponent>
        <p>Child</p>
      </AsyncBasicComponent>
    </AsyncBasicComponent>
  );
  const encoded = await stringEncode(toEncode);
  const decoded = await stringDecode(encoded);
  await decoded.done;

  assert.equal(await render(decoded.value, true), await render(toEncode, true));
});

test("can encode suspense", async () => {
  const toEncode = (
    <Suspense fallback={<p>Fallback</p>}>
      <p>Hello</p>
      <AsyncBasicComponent>
        <p>Child</p>
      </AsyncBasicComponent>
    </Suspense>
  );
  const encoded = await stringEncode(toEncode);
  const decoded = await stringDecode(encoded);
  await decoded.done;

  assert.equal(await render(decoded.value, true), await render(toEncode, true));
});

test("can encode nested async component error in tree", async () => {
  const toEncode = (
    <ErrorBoundary fallback={<p>Oops</p>}>
      <p>Hello</p>
      <AsyncBasicComponent>
        <p>Child</p>
      </AsyncBasicComponent>
    </ErrorBoundary>
  );
  const encoded = await stringEncode(toEncode);
  const decoded = await stringDecode(encoded);
  await decoded.done;

  assert.equal(await render(decoded.value, true), await render(toEncode, true));
});

test("can encode raw", async () => {
  const toEncode = <div class="basic">{raw`<p>Hello</p>`}</div>;
  const encoded = await stringEncode(toEncode);
  const decoded = await stringDecode(encoded);
  await decoded.done;

  assert.equal(await render(decoded.value), await render(toEncode));
});
