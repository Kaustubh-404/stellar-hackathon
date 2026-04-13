// Research service handler — summarizes a topic using Wikipedia
// Demonstrates a more complex paid service

export default async function handler(params: Record<string, string>) {
  const query = params.query ?? params.topic ?? params.q;
  if (!query) {
    return { error: 'Missing "query" parameter' };
  }

  // Search Wikipedia for the topic
  const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
  const res = await fetch(searchUrl, {
    headers: { 'User-Agent': 'AgentPay-Demo/1.0' },
  });

  if (!res.ok) {
    // Try search API as fallback
    const searchFallback = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3`;
    const fallbackRes = await fetch(searchFallback, {
      headers: { 'User-Agent': 'AgentPay-Demo/1.0' },
    });
    const fallbackData = await fallbackRes.json() as any;
    const results = fallbackData.query?.search ?? [];

    return {
      query,
      results: results.map((r: any) => ({
        title: r.title,
        snippet: r.snippet.replace(/<[^>]*>/g, ''),
      })),
      source: 'wikipedia-search',
    };
  }

  const data = await res.json() as any;

  return {
    query,
    title: data.title,
    summary: data.extract,
    url: data.content_urls?.desktop?.page,
    thumbnail: data.thumbnail?.source,
    source: 'wikipedia',
  };
}
