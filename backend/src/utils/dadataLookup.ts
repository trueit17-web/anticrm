// Looks up a legal entity's short name by ИНН via DaData's free "suggestions"
// API (https://dadata.ru/api/find-party/). Requires DADATA_API_KEY; when
// it's not configured, or the lookup fails for any reason, callers get null
// rather than a thrown error so the rest of the call card still renders.
export async function lookupOrganizationByInn(inn: string): Promise<string | null> {
  const apiKey = process.env.DADATA_API_KEY;
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
