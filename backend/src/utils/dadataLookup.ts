export interface OrganizationLookupResult {
  name: string | null;
  managerName: string | null;
  region: string | null;
}

// Looks up a legal entity's short name + director's ФИО + region by ИНН via
// DaData's free "suggestions" API (https://dadata.ru/api/find-party/) — the
// director comes from the same response's `data.management.name`, the
// region from `data.address.data.region_with_type`.
// `apiKey` comes from the calling branch's override (falling back to the
// DADATA_API_KEY env var — see branches.service.ts's getDadataApiKey).
// When there's no key configured anywhere, or the lookup fails for any
// reason, callers get nulls rather than a thrown error so the rest of the
// call card still renders.
export async function lookupOrganizationByInn(
  inn: string,
  apiKey: string | null
): Promise<OrganizationLookupResult> {
  if (!apiKey) return { name: null, managerName: null, region: null };

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
    if (!res.ok) return { name: null, managerName: null, region: null };
    const body = (await res.json()) as {
      suggestions?: {
        value?: string;
        data?: { management?: { name?: string }; address?: { data?: { region_with_type?: string } } };
      }[];
    };
    const suggestion = body.suggestions?.[0];
    return {
      name: suggestion?.value ?? null,
      managerName: suggestion?.data?.management?.name ?? null,
      region: suggestion?.data?.address?.data?.region_with_type ?? null,
    };
  } catch {
    return { name: null, managerName: null, region: null };
  }
}
