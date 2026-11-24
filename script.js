'use strict';

const $ = e => document.getElementById(e);

class Storage {
  static KEY = "weather-app-state";

  static save(state) {
    localStorage.setItem(Storage.KEY, JSON.stringify(state));
  }

  static load() {
    const raw = localStorage.getItem(Storage.KEY);
    return raw ? JSON.parse(raw) : null;
  }
}

class Fetcher {
  static async fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`request failed: ${res.status}`);
    }
    return await res.json();
  }
}

class Location {
  static async get() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("geolocation is not supported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        position => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }),
        error => reject(error)
      );
    });
  }
}

class City {
  static REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"; // ?lat=&lon=&format=json

  // either pass a name directly, or a {latitude, longitude} location to resolve the name later.
  constructor({ name, location } = {}) {
    this.name = name;
    this.location = location;
  }

  async getName() {
    if (this.name === undefined) {
      this.name = await this.fetchCityNameByLocation();
    }
    return this.name;
  }

  async fetchCityNameByLocation() {
    const { latitude, longitude } = this.location;
    const url = `${City.REVERSE_URL}?lat=${latitude}&lon=${longitude}&format=json`;
    const data = await Fetcher.fetchJson(url);
    const city = data.address && (data.address.city || data.address.town || data.address.village);
    if (!city) {
      throw new Error("could not resolve city name from location");
    }
    return city;
  }

  toJSON() {
    return { name: this.name };
  }
}

class Cities {
  static SUGGEST_URL = "https://geocoding-api.open-meteo.com/v1/search"; // ?name=&count=

  static async suggest(query, count = 5) {
    if (!query || query.length < 2) return [];
    const url = `${Cities.SUGGEST_URL}?name=${encodeURIComponent(query)}&count=${count}`;
    const data = await Fetcher.fetchJson(url);
    if (!data.results) return [];
    return data.results.map(r => r.name);
  }

  static async exists(name) {
    const matches = await Cities.suggest(name, 10);
    return matches.some(m => m.toLowerCase() === name.toLowerCase());
  }
}


class Weather {
  static API_KEY = "4c2a033274614ddbb34102952232208";
  static FORECAST_URL = "https://api.weatherapi.com/v1/forecast.json"; // ?key=&q=&days=

  constructor(data) {
    this.data = data;
  }

  static async fetchFor(cityName, days = 3) {
    const url = `${Weather.FORECAST_URL}?key=${Weather.API_KEY}&q=${encodeURIComponent(cityName)}&days=${days}`;
    const data = await Fetcher.fetchJson(url);
    return new Weather(data);
  }

  getLocationLabel() {
    return this.data.location ? this.data.location.name : "";
  }

  getDays() {
    return this.data.forecast.forecastday; // [{date, day: {avgtemp_c, condition: {text, icon}}}, ...]
  }
}

class ForecastView {
  constructor(container) {
    this.container = container;
  }

  renderLoading(label) {
    this.container.innerHTML = `<p>Loading weather${label ? " для " + label : ""}...</p>`;
  }

  renderError(message) {
    this.container.innerHTML = `<p class="error">Error: ${message}</p>`;
  }

  render(weather, isCurrentLocation) {
    const days = weather.getDays();
    const title = isCurrentLocation ? "Current location" : weather.getLocationLabel();

    // <img src="${d.day.condition.icon}" alt="${d.day.condition.text}" />
    const daysHtml = days.map(d => `
      <div class="forecast-day">
        <div>${d.date}</div>
        <div>${d.day.condition.text}</div>
        <div>${Math.round(d.day.avgtemp_c)}&deg;C</div>
      </div>
    `).join("");

    this.container.innerHTML = `
      <h3>${title}</h3>
      <div class="forecast-days">${daysHtml}</div>
    `;
  }
}

class CityCard {
  constructor(cityName, { isCurrentLocation = false, onRemove = null } = {}) {
    this.cityName = cityName;
    this.isCurrentLocation = isCurrentLocation;
    this.onRemove = onRemove;

    this.element = document.createElement("div");
    this.element.className = "city-card";

    this.viewContainer = document.createElement("div");
    const view = new ForecastView(this.viewContainer);
    this.view = view;

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.textContent = "Refresh";
    refreshBtn.addEventListener("click", () => this.load());

    this.element.appendChild(this.viewContainer);
    this.element.appendChild(refreshBtn);

    if (!isCurrentLocation && onRemove) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => this.onRemove(this));
      this.element.appendChild(removeBtn);
    }
  }

  async load() {
    this.view.renderLoading(this.cityName);
    try {
      const weather = await Weather.fetchFor(this.cityName, 3);
      this.view.render(weather, this.isCurrentLocation);
    } catch (err) {
      this.view.renderError(err.message);
    }
  }
}

class App {
  constructor() {
    this.forecastContainer = $("forecast");
    this.citySelect = $("cities");
    this.submitBtn = $("submit-city");

    this.currentLocationCard = null;
    this.extraCards = [];
  }

  async init() {
    this.submitBtn.addEventListener("click", () => this.onAddCity());
    this.citySelect.addEventListener("input", () => this.onCityInput());

    const saved = Storage.load();

    if (saved && saved.primaryCity) {
      this.setPrimaryCard(saved.primaryCity, saved.isCurrentLocation);
    } else {
      await this.resolvePrimaryCity();
    }

    if (saved && Array.isArray(saved.extraCities)) {
      for (const name of saved.extraCities) {
        this.addExtraCard(name, false);
      }
    }
  }

  async resolvePrimaryCity() {
    try {
      const location = await Location.get();
      const city = new City({ location });
      const name = await city.getName();
      this.setPrimaryCard(name, true);
    } catch (err) {
      this.promptManualCity();
    }
  }

  promptManualCity() {
    this.forecastContainer.innerHTML = `
      <p>Couldn't retrieve geolocation. Input city name:</p>
      <input id="manual-city-input" type="text" placeholder="City" />
      <button id="manual-city-submit" type="button">Submit</button>
      <div id="manual-city-error" class="error"></div>
    `;
    $("manual-city-submit").addEventListener("click", async () => {
      const name = $("manual-city-input").value.trim();
      const errorBox = $("manual-city-error");
      errorBox.textContent = "";
      if (!name) return;
      const ok = await Cities.exists(name);
      if (!ok) {
        errorBox.textContent = "City not found";
        return;
      }
      this.setPrimaryCard(name, false);
    });
  }

  setPrimaryCard(name, isCurrentLocation) {
    this.currentLocationCard = new CityCard(name, { isCurrentLocation });
    this.forecastContainer.innerHTML = "";
    this.forecastContainer.appendChild(this.currentLocationCard.element);
    this.currentLocationCard.load();
    this.persist();
  }

  addExtraCard(name, persist = true) {
    const card = new CityCard(name, {
      isCurrentLocation: false,
      onRemove: (cardToRemove) => this.removeExtraCard(cardToRemove)
    });
    this.extraCards.push(card);
    this.forecastContainer.appendChild(card.element);
    card.load();
    if (persist) this.persist();
  }

  removeExtraCard(card) {
    this.extraCards = this.extraCards.filter(c => c !== card);
    card.element.remove();
    this.persist();
  }

  async onAddCity() {
    const name = this.citySelect.value.trim();
    if (!name) return;
    const ok = await Cities.exists(name);
    if (!ok) {
      alert("City not found");
      return;
    }
    this.addExtraCard(name);
    this.citySelect.value = "";
    this.clearSuggestions();
  }

  async onCityInput() {
    const query = this.citySelect.value.trim();
    const names = await Cities.suggest(query);
    this.renderSuggestions(names);
  }

  renderSuggestions(names) {
    this.clearSuggestions();
    if (names.length === 0) return;
    const list = document.createElement("datalist");
    list.id = "city-suggestions";
    names.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      list.appendChild(opt);
    });
    this.citySelect.setAttribute("list", "city-suggestions");
    this.citySelect.insertAdjacentElement("afterend", list);
  }

  clearSuggestions() {
    const existing = $("city-suggestions");
    if (existing) existing.remove();
  }

  persist() {
    Storage.save({
      primaryCity: this.currentLocationCard ? this.currentLocationCard.cityName : null,
      isCurrentLocation: this.currentLocationCard ? this.currentLocationCard.isCurrentLocation : false,
      extraCities: this.extraCards.map(c => c.cityName)
    });
  }
}

async function main() {
  const app = new App();
  await app.init();
}

main();
