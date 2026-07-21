// Looks up a legal entity's short name by ИНН via DaData's free "suggestions"
// API (https://dadata.ru/api/find-party/). `apiKey` comes from the calling
// branch's override (falling back to the DADATA_API_KEY env var — see
// branches.service.ts's getDadataApiKey). When there's no key configured
// anywhere, or the lookup fails for any reason, callers get null rather
// than a thrown error so the rest of the call card still renders.
export async function lookupOrganizationByInn(inn: string, apiKey: string | null): Promise<string | null> {
  if (!apiKey) return null;

  try {
    const res = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Token ${apiKey}`,
      },
      body: JSON.stringify({ query: inn }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { suggestions?: { value?: string }[] };
    return body.suggestions?.[0]?.value ?? null;
  } catch {
    return null;
  }
}
