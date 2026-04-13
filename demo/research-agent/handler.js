// Research service handler — summarizes a topic using Wikipedia

export default async function handler(params) {
  const query = params.query ?? params.topic ?? params.q;
  if (!query) {
    return { error: 'Missing "query" parameter' };
  }

  const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
  const res = await fetch(searchUrl, {
    headers: { 'User-Agent': 'AgentPay-Demo/1.0' },
  });

  if (!res.ok) {
    const searchFallback = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3`;
    const fallbackRes = await fetch(searchFallback, {
      headers: { 'User-Agent': 'AgentPay-Demo/1.0' },
    });
    const fallbackData = await fallbackRes.json();
    const results = fallbackData.query?.search ?? [];
    return {
      query,
      results: results.map((r) => ({
        title: r.title,
        snippet: r.snippet.replace(/<[^>]*>/g, ''),
      })),
      source: 'wikipedia-search',
    };
  }

  const data = await res.json();
  return {
    query,
    title: data.title,
    summary: data.extract,
    url: data.content_urls?.desktop?.page,
    thumbnail: data.thumbnail?.source,
    source: 'wikipedia',
  };
}
