'use strict'

const CITIES_URL = "https://randomapi.dev/api/cities?count=";
const WEATHER_URL = "https://api.weatherapi.com/v1/forecast.json?key=4c2a033274614ddbb34102952232208&q=" // &days=

let $ = e => document.getElementById(e);
const CITIES = $("cities")
const WEATHER = $("weather")
const SUBMIT_CITY = $("submit-city");
SUBMIT_CITY.addEventListener('click', () => {
  fetchWeather(CITIES.value, 3);
});

async function fetchJson(url) {
  const res = await fetch(url);
  return await res.json();
}

async function fetchCitiesList(count) {
  const url = CITIES_URL + count;
  const cities = await fetchJson(url);

  return cities.data.map(c => c.name);
}

async function fetchWeather(city, days) {
  const url = WEATHER_URL + city + "&days=" + days;
  const weather = await fetchJson(url);

  const fcDay = weather.forecast.forecastday;

  const firstDay = document.createElement('div');
  const secondDay = document.createElement('div');
  const thirdDay = document.createElement('div');

  firstDay.innerText = "temperature today (C): " + fcDay[0].day.avgtemp_c;
  secondDay.innerText = "temperature tomorrow (C): " + fcDay[1].day.avgtemp_c;
  thirdDay.innerText = "temperature in 2 days (C): " + fcDay[2].day.avgtemp_c;

  WEATHER.appendChild(firstDay);
  WEATHER.appendChild(secondDay);
  WEATHER.appendChild(thirdDay);

}

async function updateCities() {
  const numberOfCities = 100;
  const citiesList = await fetchCitiesList(numberOfCities);

  for (let i = 0; i < numberOfCities; i++) {
    const opt = document.createElement('option');
    opt.value = citiesList[i];
    opt.innerText = citiesList[i];
    CITIES.appendChild(opt)
  }
}

function getLocation() {
  navigator.geolocation.getCurrentPosition((position) => {
    console.log(position);
  });
}

updateCities();
getLocation();

