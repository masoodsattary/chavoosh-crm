export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeLocalRuntime } = await import("./lib/local-runtime");
    await initializeLocalRuntime();
  }
}
