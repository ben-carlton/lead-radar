import { inngest } from "./client";

// Deliberately trivial — this exists to prove the Inngest <-> Next.js <->
// Vercel wiring works end to end in production (BUILD_ORDER.md.txt step 5)
// before any real background job (crawling, classification, ...) gets
// built on top of it in later steps.
export const helloWorld = inngest.createFunction(
  { id: "hello-world", triggers: { event: "test/hello.world" } },
  async ({ event, step }) => {
    const name = (event.data?.name as string | undefined) ?? "world";

    await step.run("log-greeting", async () => {
      console.log(`Hello ${name}, from Inngest!`);
    });

    return { message: `Hello ${name}!`, ranAt: new Date().toISOString() };
  },
);
