"use client";

import { useState } from "hono/jsx";

export function Counter({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  return (
    <div class="py-24 flex flex-col items-center">
      <div class="mx-auto max-w-[43rem]">
        <div class="text-center">
          <p class="text-lg font-medium leading-8 text-indigo-600/95">
            Yo yo yo!
          </p>
          <h1 class="mt-3 text-[3.5rem] font-bold leading-[4rem] tracking-tight text-black">
            Count: {count}
          </h1>
          <p class="mt-3 text-lg leading-relaxed text-slate-400">
            This shit actually works!
          </p>
        </div>
      </div>
      <div class="mt-6 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setCount((c) => c + 1)}
          class="transform rounded-md bg-indigo-600/95 px-5 py-3 font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Increment
        </button>
      </div>
    </div>
  );
}
