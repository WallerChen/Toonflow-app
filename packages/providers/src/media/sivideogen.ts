const rules = [
  { type: "input", field: "apiUrl" as const, title: "Managed service", value: "" },
  { type: "input", field: "apiKey" as const, title: "Server credential", value: "" },
] as const;

async function call(context: ProviderContext, path: string, body?: unknown) {
  const response = await context.tool.fetch(`${context.config.apiUrl}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${context.config.apiKey}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: context.signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "SiVideoGen service unavailable");
  return result;
}

export default {
  id: "sivideogen", label: "SiVideoGen", version: "1.0.0", rules,
  // The hosted launcher injects the authenticated site's current supported catalog.
  models: [],
  async getPrice(request) {
    const result = await call(this, "quote", { ...request, references: request.images?.length || (request.type === "video" && request.firstFrame ? 1 : 0) });
    return { price: `${result.credits} credits`, tips: `fal · checked ${result.checkedAt}` };
  },
  async getBalance() {
    const result = await call(this, "balance");
    return { balance: result.balance, unit: "credits" };
  },
  async generateImage(request) {
    return call(this, "generate", { type: "image", request, operationId: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
  },
  async generateVideo(request) {
    return call(this, "generate", { type: "video", request, operationId: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
  },
  async generateAudio(request) {
    return call(this, "generate", { type: "audio", request, operationId: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
  },
} satisfies ProviderDefinition<typeof rules>;
