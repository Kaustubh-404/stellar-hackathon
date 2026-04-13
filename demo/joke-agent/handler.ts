// Joke service handler — returns a random joke
// Simple example to show how easy it is to monetize any skill

export default async function handler(params: Record<string, string>) {
  const category = params.category ?? 'Any';

  const url = `https://v2.jokeapi.dev/joke/${encodeURIComponent(category)}?safe-mode&type=twopart`;
  const res = await fetch(url);
  const data = await res.json() as any;

  if (data.error) {
    return { error: data.message ?? 'Failed to fetch joke', category };
  }

  return {
    category: data.category,
    setup: data.setup,
    delivery: data.delivery,
    id: data.id,
  };
}
