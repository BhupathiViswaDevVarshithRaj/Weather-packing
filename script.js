/**
 * script.js
 * -----------------------------------------------------------------------
 * All UI logic + the rules engine. API connection details (which
 * provider, which key) are NOT here — they live in config.js so the
 * app can be repointed at a different weather API without touching
 * this file.
 * -----------------------------------------------------------------------
 */
(function(){
  "use strict";

  // ---------- state ----------
  let currentUnit = "C";                 // "C" | "F"
  let lastData = null;                   // { city, current:{...}, daily:[...] }
  const HISTORY_KEY = "weatherPlannerHistory";

  // ---------- DOM ----------
  const form = document.getElementById("searchForm");
  const cityInput = document.getElementById("cityInput");
  const submitBtn = document.getElementById("submitBtn");
  const errorBanner = document.getElementById("errorBanner");
  const skeleton = document.getElementById("skeleton");
  const emptyState = document.getElementById("emptyState");
  const ticket = document.getElementById("ticket");
  const forecastWrap = document.getElementById("forecastWrap");
  const historyRow = document.getElementById("historyRow");
  const unitCBtn = document.getElementById("unitC");
  const unitFBtn = document.getElementById("unitF");
  const geoBtn = document.getElementById("geoBtn");

  // ---------- weather code -> {category, label, icon} ----------
  // Normalizes both Open-Meteo's WMO codes and OpenWeatherMap's
  // "main" strings into one shared vocabulary the rest of the app uses.
  function classifyWmoCode(code){
    const map = {
      0:  {category:"clear",  label:"Clear sky",        icon:"☀️"},
      1:  {category:"clear",  label:"Mainly clear",     icon:"🌤️"},
      2:  {category:"clouds", label:"Partly cloudy",    icon:"⛅"},
      3:  {category:"clouds", label:"Overcast",         icon:"☁️"},
      45: {category:"clouds", label:"Fog",              icon:"🌫️"},
      48: {category:"clouds", label:"Depositing fog",   icon:"🌫️"},
      51: {category:"drizzle",label:"Light drizzle",    icon:"🌦️"},
      53: {category:"drizzle",label:"Drizzle",          icon:"🌦️"},
      55: {category:"drizzle",label:"Dense drizzle",    icon:"🌦️"},
      56: {category:"drizzle",label:"Freezing drizzle", icon:"🌦️"},
      57: {category:"drizzle",label:"Freezing drizzle", icon:"🌦️"},
      61: {category:"rain",   label:"Light rain",       icon:"🌧️"},
      63: {category:"rain",   label:"Rain",             icon:"🌧️"},
      65: {category:"rain",   label:"Heavy rain",       icon:"🌧️"},
      66: {category:"rain",   label:"Freezing rain",    icon:"🌧️"},
      67: {category:"rain",   label:"Freezing rain",    icon:"🌧️"},
      71: {category:"snow",   label:"Light snow",       icon:"🌨️"},
      73: {category:"snow",   label:"Snow",             icon:"❄️"},
      75: {category:"snow",   label:"Heavy snow",       icon:"❄️"},
      77: {category:"snow",   label:"Snow grains",      icon:"❄️"},
      80: {category:"rain",   label:"Rain showers",     icon:"🌦️"},
      81: {category:"rain",   label:"Rain showers",     icon:"🌦️"},
      82: {category:"rain",   label:"Violent showers",  icon:"🌧️"},
      85: {category:"snow",   label:"Snow showers",     icon:"🌨️"},
      86: {category:"snow",   label:"Snow showers",     icon:"🌨️"},
      95: {category:"thunderstorm", label:"Thunderstorm",       icon:"⛈️"},
      96: {category:"thunderstorm", label:"Thunderstorm + hail", icon:"⛈️"},
      99: {category:"thunderstorm", label:"Thunderstorm + hail", icon:"⛈️"}
    };
    return map[code] || {category:"clouds", label:"Unknown", icon:"❔"};
  }

  function classifyOwmMain(main, description){
    const key = (main || "").toLowerCase();
    const table = {
      clear:       {category:"clear",       icon:"☀️"},
      clouds:      {category:"clouds",      icon:"☁️"},
      rain:        {category:"rain",        icon:"🌧️"},
      drizzle:     {category:"drizzle",     icon:"🌦️"},
      thunderstorm:{category:"thunderstorm",icon:"⛈️"},
      snow:        {category:"snow",        icon:"❄️"},
      mist:        {category:"clouds",      icon:"🌫️"},
      fog:         {category:"clouds",      icon:"🌫️"},
      haze:        {category:"clouds",      icon:"🌫️"}
    };
    const hit = table[key] || {category:"clouds", icon:"❔"};
    return { category: hit.category, icon: hit.icon, label: description || main || "Unknown" };
  }

  // ---------- theming ----------
  function applyTheme(category, tempC){
    const root = document.documentElement.style;
    let bg1, bg2, accent, text = "#ffffff";

    if(category === "clear" && tempC >= 25){
      bg1 = "#ffd58a"; bg2 = "#f4772e"; accent = "#f4772e";
    } else if(category === "clear"){
      bg1 = "#bcd9f2"; bg2 = "#7fb0da"; accent = "#3d7ab5";
    } else if(category === "rain" || category === "drizzle" || category === "thunderstorm"){
      bg1 = "#6f88ac"; bg2 = "#2c3e5a"; accent = "#4a6fa5";
    } else if(category === "snow"){
      bg1 = "#f2f7fb"; bg2 = "#cfe0ec"; accent = "#6fa3c7";
      text = "#1a2233";
    } else { // clouds / fog / default
      bg1 = "#b7bec8"; bg2 = "#767f8c"; accent = "#6b7280";
    }

    root.setProperty("--bg-1", bg1);
    root.setProperty("--bg-2", bg2);
    root.setProperty("--accent-color", accent);
    root.setProperty("--text-on-accent", text);
  }

  function resetTheme(){
    const root = document.documentElement.style;
    root.setProperty("--bg-1", "#dfe5ec");
    root.setProperty("--bg-2", "#c3ccd6");
    root.setProperty("--accent-color", "#3d5a80");
    root.setProperty("--text-on-accent", "#ffffff");
  }

  // ---------- unit conversion (client-side, no re-fetch) ----------
  function cToF(c){ return c * 9/5 + 32; }
  function fmtTemp(c){
    return currentUnit === "C" ? `${Math.round(c)}°C` : `${Math.round(cToF(c))}°F`;
  }

  // ---------- packing rules engine ----------
  // data-driven: array of {test, items} evaluated in order, all matches collected (deduped)
  const PACKING_RULES = [
    { test: (d) => ["rain","drizzle","thunderstorm"].includes(d.category), items: ["☔ Pack an umbrella"] },
    { test: (d) => d.category === "thunderstorm", items: ["⚡ Avoid open areas during storms"] },
    { test: (d) => d.tempC < 10, items: ["🧥 Heavy coat", "🧤 Gloves"] },
    { test: (d) => d.tempC > 30, items: ["🩳 Light clothing", "🧴 Sunscreen"] },
    { test: (d) => d.humidity > 70, items: ["👕 Breathable fabrics recommended"] },
    { test: (d) => d.category === "snow", items: ["🥾 Waterproof boots"] }
  ];

  function getPackingSuggestions(tempC, humidity, category){
    const ctx = {tempC, humidity, category};
    const items = [];
    for(const rule of PACKING_RULES){
      if(rule.test(ctx)){
        for(const item of rule.items){
          if(!items.includes(item)) items.push(item);
        }
      }
    }
    if(items.length === 0){
      items.push("😎 Weather looks comfortable — pack normally");
    }
    return items;
  }

  // ---------- history (stretch goal) ----------
  function loadHistory(){
    try{ return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveHistory(city){
    let hist = loadHistory().filter(c => c.toLowerCase() !== city.toLowerCase());
    hist.unshift(city);
    hist = hist.slice(0, 5);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    renderHistory();
  }
  function renderHistory(){
    const hist = loadHistory();
    historyRow.innerHTML = "";
    hist.forEach(city => {
      const btn = document.createElement("button");
      btn.textContent = city;
      btn.addEventListener("click", () => {
        cityInput.value = city;
        runSearch(city);
      });
      historyRow.appendChild(btn);
    });
  }

  // ---------- UI state helpers ----------
  function showError(msg){
    errorBanner.textContent = msg;
    errorBanner.style.display = "block";
  }
  function clearError(){
    errorBanner.style.display = "none";
    errorBanner.textContent = "";
  }
  function setLoading(isLoading){
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? "Searching…" : "Search";
    skeleton.classList.toggle("show", isLoading);
    if(isLoading){
      // clear stale data immediately so nothing mismatched lingers mid-fetch
      ticket.classList.remove("show");
      forecastWrap.classList.remove("show");
      emptyState.style.display = "none";
    }
  }

  // ---------- rendering ----------
  function render(){
    if(!lastData) return;
    const { city, current, daily } = lastData;
    const info = current.info; // pre-classified by whichever provider fetched it

    applyTheme(info.category, current.tempC);

    document.getElementById("cityName").textContent = city;
    document.getElementById("condIcon").textContent = info.icon;
    document.getElementById("condLabel").textContent = info.label;
    document.getElementById("tempBig").textContent = fmtTemp(current.tempC);
    document.getElementById("humidityVal").textContent = `${current.humidity}%`;
    document.getElementById("windVal").textContent = currentUnit === "C"
      ? `${Math.round(current.windKmh)} km/h`
      : `${Math.round(current.windKmh * 0.621371)} mph`;
    document.getElementById("feelsVal").textContent = fmtTemp(current.feelsLikeC);

    const suggestions = getPackingSuggestions(current.tempC, current.humidity, info.category);
    document.getElementById("packingContext").textContent = `${info.label} · ${fmtTemp(current.tempC)}`;
    const list = document.getElementById("packingList");
    list.innerHTML = "";
    suggestions.forEach(text => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="tick"></span><span>${text}</span>`;
      list.appendChild(li);
    });

    const grid = document.getElementById("forecastGrid");
    grid.innerHTML = "";
    const dayLabels = ["Tomorrow", "Day After", "Day 3"];
    daily.forEach((d, i) => {
      const card = document.createElement("div");
      card.className = "fcard";
      card.innerHTML = `
        <div class="fday">${dayLabels[i] || `Day ${i+2}`}</div>
        <div class="ficon">${d.info.icon}</div>
        <div class="frange">${fmtTemp(d.maxC)} <span class="lo">/ ${fmtTemp(d.minC)}</span></div>
      `;
      grid.appendChild(card);
    });

    ticket.classList.add("show");
    forecastWrap.classList.add("show");
    emptyState.style.display = "none";
  }

  // ---------- Provider: Open-Meteo (no key) ----------
  const OpenMeteoProvider = {
    async geocode(cityName){
      const base = CONFIG.ENDPOINTS["open-meteo"].geocode;
      const url = `${base}?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;
      const res = await fetch(url);
      if(!res.ok) throw new Error("network");
      const data = await res.json();
      if(!data.results || data.results.length === 0){
        const err = new Error("not_found"); err.code = "not_found"; throw err;
      }
      const r = data.results[0];
      return { lat: r.latitude, lon: r.longitude, label: [r.name, r.admin1, r.country].filter(Boolean).join(", ") };
    },

    async fetchWeather(lat, lon){
      const base = CONFIG.ENDPOINTS["open-meteo"].forecast;
      const url = `${base}?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
        `&forecast_days=4&timezone=auto`;
      const res = await fetch(url);
      if(!res.ok) throw new Error("network");
      const data = await res.json();

      const current = {
        tempC: data.current.temperature_2m,
        feelsLikeC: data.current.apparent_temperature,
        humidity: data.current.relative_humidity_2m,
        windKmh: data.current.wind_speed_10m,
        info: classifyWmoCode(data.current.weather_code)
      };

      const daily = [];
      for(let i = 1; i <= 3 && i < data.daily.time.length; i++){
        daily.push({
          maxC: data.daily.temperature_2m_max[i],
          minC: data.daily.temperature_2m_min[i],
          info: classifyWmoCode(data.daily.weather_code[i])
        });
      }
      return { current, daily };
    }
  };

  // ---------- Provider: OpenWeatherMap (needs CONFIG.OPENWEATHER_API_KEY) ----------
  const OpenWeatherMapProvider = {
    async geocode(cityName){
      // OpenWeatherMap's own endpoints accept a city name directly, so
      // "geocoding" here just validates the city via the current-weather call.
      const key = CONFIG.OPENWEATHER_API_KEY;
      if(!key || key === "YOUR_API_KEY_HERE"){
        const err = new Error("missing_key"); err.code = "missing_key"; throw err;
      }
      return { cityName, label: cityName };
    },

    async fetchWeather(_lat, _lon, cityName){
      const key = CONFIG.OPENWEATHER_API_KEY;
      const { current: currentUrl, forecast: forecastUrl } = CONFIG.ENDPOINTS.openweathermap;

      const curRes = await fetch(`${currentUrl}?q=${encodeURIComponent(cityName)}&units=metric&appid=${key}`);
      if(curRes.status === 404){
        const err = new Error("not_found"); err.code = "not_found"; throw err;
      }
      if(!curRes.ok) throw new Error("network");
      const curData = await curRes.json();

      const current = {
        tempC: curData.main.temp,
        feelsLikeC: curData.main.feels_like,
        humidity: curData.main.humidity,
        windKmh: curData.wind.speed * 3.6, // m/s -> km/h
        info: classifyOwmMain(curData.weather[0].main, curData.weather[0].description)
      };

      const fRes = await fetch(`${forecastUrl}?q=${encodeURIComponent(cityName)}&units=metric&appid=${key}`);
      if(!fRes.ok) throw new Error("network");
      const fData = await fRes.json();

      // group 3-hour entries by calendar date, keep min/max + a representative code
      const byDay = {};
      fData.list.forEach(entry => {
        const date = entry.dt_txt.split(" ")[0];
        if(!byDay[date]) byDay[date] = { temps: [], codes: [] };
        byDay[date].temps.push(entry.main.temp);
        byDay[date].codes.push({ main: entry.weather[0].main, description: entry.weather[0].description, hour: entry.dt_txt.split(" ")[1] });
      });
      const today = fData.list[0].dt_txt.split(" ")[0];
      const days = Object.keys(byDay).filter(d => d !== today).slice(0, 3);
      const daily = days.map(date => {
        const bucket = byDay[date];
        const midday = bucket.codes.find(c => c.hour.startsWith("12:")) || bucket.codes[0];
        return {
          maxC: Math.max(...bucket.temps),
          minC: Math.min(...bucket.temps),
          info: classifyOwmMain(midday.main, midday.description)
        };
      });

      return { current, daily };
    }
  };

  function getProvider(){
    return CONFIG.PROVIDER === "openweathermap" ? OpenWeatherMapProvider : OpenMeteoProvider;
  }

  // ---------- search orchestration ----------
  async function runSearch(cityRaw){
    const city = cityRaw.trim();
    if(!city) return; // never fire a request on empty input

    clearError();
    setLoading(true);

    const provider = getProvider();

    try{
      const geo = await provider.geocode(city);
      const weather = await provider.fetchWeather(geo.lat, geo.lon, city);
      lastData = { city: geo.label, ...weather };
      render();
      saveHistory(geo.label.split(",")[0]);
    } catch(err){
      lastData = null;
      ticket.classList.remove("show");
      forecastWrap.classList.remove("show");
      if(err && err.code === "not_found"){
        showError(`We couldn't find "${city}". Check the spelling and try again.`);
      } else if(err && err.code === "missing_key"){
        showError("OpenWeatherMap is selected in config.js but no API key is set. Add your key to CONFIG.OPENWEATHER_API_KEY.");
      } else {
        showError("Something went wrong reaching the weather service. Please try again.");
      }
      emptyState.style.display = "block";
    } finally {
      setLoading(false);
    }
  }

  // ---------- events ----------
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runSearch(cityInput.value);
  });

  unitCBtn.addEventListener("click", () => {
    if(currentUnit === "C") return;
    currentUnit = "C";
    unitCBtn.classList.add("active");
    unitFBtn.classList.remove("active");
    render();
  });
  unitFBtn.addEventListener("click", () => {
    if(currentUnit === "F") return;
    currentUnit = "F";
    unitFBtn.classList.add("active");
    unitCBtn.classList.remove("active");
    render();
  });

  geoBtn.addEventListener("click", () => {
    if(!navigator.geolocation){
      showError("Geolocation isn't supported by your browser.");
      return;
    }
    if(CONFIG.PROVIDER === "openweathermap"){
      showError("Use-my-location currently requires the Open-Meteo provider (it geocodes by lat/lon directly).");
      return;
    }
    clearError();
    setLoading(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try{
        const weather = await OpenMeteoProvider.fetchWeather(pos.coords.latitude, pos.coords.longitude);
        lastData = { city: "My Location", ...weather };
        render();
      } catch(e){
        showError("Couldn't fetch weather for your location.");
        emptyState.style.display = "block";
      } finally {
        setLoading(false);
      }
    }, () => {
      showError("Location access was denied.");
      setLoading(false);
      emptyState.style.display = "block";
    });
  });

  // init
  resetTheme();
  renderHistory();
})();
