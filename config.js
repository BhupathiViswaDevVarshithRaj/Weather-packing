/**
 * config.js
 * -----------------------------------------------------------------------
 * All API connection settings live here so the rest of the app never
 * needs to touch a key directly.
 *
 * DEFAULT: Open-Meteo (https://open-meteo.com) — completely free,
 * no signup, no API key required. The app works out of the box.
 *
 * SWITCHING TO OPENWEATHERMAP:
 * 1. Get a free key at https://openweathermap.org/api
 * 2. Paste it into OPENWEATHER_API_KEY below
 * 3. Set PROVIDER to "openweathermap"
 * script.js reads this file and calls the matching fetch functions —
 * no other file needs to change.
 * -----------------------------------------------------------------------
 */

const CONFIG = {
  // "open-meteo" (no key needed) | "openweathermap" (key required)
  PROVIDER: "open-meteo",

  // Paste your OpenWeatherMap key here if you switch providers.
  // Never commit a real key to a public repo — use an .env / secrets
  // manager in a real deployment instead of hardcoding it.
  OPENWEATHER_API_KEY: "YOUR_API_KEY_HERE",

  // Base endpoints
  ENDPOINTS: {
    "open-meteo": {
      geocode: "https://geocoding-api.open-meteo.com/v1/search",
      forecast: "https://api.open-meteo.com/v1/forecast"
    },
    "openweathermap": {
      // current weather + 5day/3hour forecast (needs OPENWEATHER_API_KEY)
      current: "https://api.openweathermap.org/data/2.5/weather",
      forecast: "https://api.openweathermap.org/data/2.5/forecast"
    }
  }
};
