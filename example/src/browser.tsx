console.log("Hello, Browser!" as string);

const incrementButton = document.getElementById("increment");
if (!incrementButton) throw new Error("Element not found: increment");
incrementButton.addEventListener(
  "click",
  async () => {
    await fetch("/increment", { method: "POST" });
    location.reload();
  },
  { once: true }
);
