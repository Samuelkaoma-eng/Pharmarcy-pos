// Clients for two public United States National Library of Medicine services.
// Neither needs an API key.
//
//   openFDA NDC  — https://open.fda.gov/apis/drug/ndc/   (~1,000 req/day per IP)
//   RxNav        — https://rxnav.nlm.nih.gov/            (RxNorm interactions)
//
// These are reference data, not clinical authority. openFDA describes products
// registered in the United States, so a Zambian catalogue entry it fills in
// still needs a pharmacist's eye before it is trusted, and an interaction
// result is a prompt to check, never an instruction to refuse.

const FDA_BASE = process.env.FDA_BASE_URL || 'https://api.fda.gov/drug/ndc.json';
const RXNAV_BASE = process.env.RXNAV_BASE_URL || 'https://rxnav.nlm.nih.gov/REST';

const TIMEOUT_MS = 8000;

// A slow or unreachable directory must never hold up the till, so every call
// is bounded and failure is reported rather than thrown.
const fetchJson = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) return { notFound: true };
    if (!res.ok) return { error: `Directory responded ${res.status}` };
    return { data: await res.json() };
  } catch (err) {
    return { error: err.name === 'AbortError' ? 'Directory timed out' : err.message };
  } finally {
    clearTimeout(timer);
  }
};

// Searches the openFDA NDC directory by brand or generic name.
const searchDrugs = async (query, limit = 10) => {
  const capped = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 20);
  const term = encodeURIComponent(`"${query}"`);
  const url = `${FDA_BASE}?search=(brand_name:${term}+generic_name:${term})&limit=${capped}`;

  const { data, error, notFound } = await fetchJson(url);
  if (error) return { error };
  if (notFound || !data?.results) return { results: [] };

  return {
    results: data.results.map((p) => ({
      ndc: p.product_ndc,
      brand_name: p.brand_name,
      generic_name: p.generic_name,
      dosage_form: p.dosage_form,
      route: Array.isArray(p.route) ? p.route.join(', ') : p.route,
      manufacturer: p.labeler_name,
      active_ingredients: (p.active_ingredients || []).map((a) => ({
        name: a.name,
        strength: a.strength
      })),
      packaging: p.packaging?.[0]?.description || null
    }))
  };
};

// Resolves a drug name to its RxNorm concept id. This part of RxNav is alive
// and is what makes brand and generic names comparable.
const findRxcui = async (name) => {
  const url = `${RXNAV_BASE}/rxcui.json?name=${encodeURIComponent(name)}&search=2`;
  const { data, error } = await fetchJson(url);
  if (error) return { error };
  return { rxcui: data?.idGroup?.rxnormId?.[0] || null };
};

// Interaction checking, and why this returns what it does.
//
// The NLM retired the RxNav drug-drug interaction API on 2 January 2024 with
// no replacement, and the endpoint now answers 404. The obvious port of that
// call treats the 404 as an empty result, which in a pharmacy means telling a
// dispenser "no known interactions" when nothing was ever checked. A false
// negative here is worse than no feature at all, so this fails closed: with no
// interaction source configured it reports that it could not check, and never
// reports safety it has not established.
//
// INTERACTION_API_URL can point at a licensed source (DrugBank and similar are
// commercial) whose response is mapped below.
const INTERACTION_API_URL = process.env.INTERACTION_API_URL || null;

const normaliseSeverity = (raw) => {
  const value = (raw || '').toLowerCase();
  if (value.includes('high') || value.includes('contraindicat')) return 'HIGH';
  if (value.includes('moderate')) return 'MODERATE';
  return 'LOW';
};

const checkInteractions = async (names) => {
  const unique = [...new Set((names || []).map((n) => String(n || '').trim()).filter(Boolean))];

  if (unique.length < 2) {
    return { available: true, interactions: [], checked: unique.length };
  }

  if (!INTERACTION_API_URL) {
    return {
      available: false,
      reason:
        'No interaction data source is configured. The NLM retired its free drug interaction API in January 2024; a licensed source must be supplied before baskets can be screened.',
      checked: 0
    };
  }

  const resolved = [];
  const unresolved = [];
  for (const name of unique) {
    const { rxcui, error } = await findRxcui(name);
    if (error) return { available: false, reason: error, checked: 0 };
    if (rxcui) resolved.push({ name, rxcui });
    else unresolved.push(name);
  }

  if (resolved.length < 2) {
    return {
      available: false,
      reason: 'Too few medicines could be identified to screen the basket.',
      unresolved,
      checked: resolved.length
    };
  }

  const url = `${INTERACTION_API_URL}?rxcuis=${resolved.map((r) => r.rxcui).join('+')}`;
  const { data, error, notFound } = await fetchJson(url);
  if (error || notFound) {
    return { available: false, reason: error || 'Interaction source returned no route', checked: 0 };
  }

  const interactions = [];
  for (const group of data?.fullInteractionTypeGroup || []) {
    for (const type of group.fullInteractionType || []) {
      for (const pair of type.interactionPair || []) {
        interactions.push({
          severity: normaliseSeverity(pair.severity),
          description: pair.description,
          drugs: (pair.interactionConcept || []).map((c) => c.minConceptItem?.name).filter(Boolean)
        });
      }
    }
  }

  const order = { HIGH: 0, MODERATE: 1, LOW: 2 };
  interactions.sort((a, b) => order[a.severity] - order[b.severity]);

  return { available: true, interactions, checked: resolved.length, unresolved };
};

module.exports = { searchDrugs, checkInteractions, findRxcui };
