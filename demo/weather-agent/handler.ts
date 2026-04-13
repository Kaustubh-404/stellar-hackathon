// Weather service handler — returns weather data for a given city
// This is a real handler that an agent developer would write

export default async function handler(params: Record<string, string>) {
  const city = params.city ?? params.location ?? 'San Francisco';

  // Fetch real weather data from Open-Meteo (free, no API key needed)
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
  const geoRes = await fetch(geoUrl);
  const geoData = await geoRes.json() as any;

  if (!geoData.results?.length) {
    return { error: `City '${city}' not found`, city };
  }

  const { latitude, longitude, name, country } = geoData.results[0];

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`;
  const weatherRes = await fetch(weatherUrl);
  const weatherData = await weatherRes.json() as any;

  const current = weatherData.current;

  const weatherCodes: Record<number, string> = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle',
    55: 'Dense drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
    71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 80: 'Rain showers',
    95: 'Thunderstorm',
  };

  return {
    city: name,
    country,
    temperature: `${current.temperature_2m}°C`,
    humidity: `${current.relative_humidity_2m}%`,
    windSpeed: `${current.wind_speed_10m} km/h`,
    condition: weatherCodes[current.weather_code] ?? `Code ${current.weather_code}`,
    timestamp: current.time,
  };
}
