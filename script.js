/*Función para usar las coordenadas del navegador*/
function obtenerCoordenadas() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Este navegador no soporta geolocalización."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        resolve({
          lat: posicion.coords.latitude,
          lon: posicion.coords.longitude,
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 300000, // Reutiliza ubicación en caché hasta por 5 min
      }
    );
  });
}

async function consultarClima(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    hourly: "temperature_2m,weather_code",
    timezone: "auto",
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const respuesta = await fetch(url);

  if (!respuesta.ok) {
    throw new Error(`Error al consultar Open-Meteo: ${respuesta.status}`);
  }

  return await respuesta.json();
}

async function obtenerNombreCiudad(lat, lon) {
  try {
    const params = new URLSearchParams({
      lat,
      lon,
      format: "json",
      "accept-language": "es",
      zoom: "10",
    });

    const respuesta = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`
    );

    if (!respuesta.ok) {
      throw new Error(`Error en geocodificación inversa: ${respuesta.status}`);
    }

    const data = await respuesta.json();
    const addr = data.address || {};

    const ciudad =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      data.name ||
      "Ubicación actual";

    const region = addr.state || addr.country || "";
    return region ? `${ciudad}, ${region}` : ciudad;
  } catch (error) {
    console.warn(
      "No se pudo obtener el nombre de la ciudad:",
      error.message || error
    );
    return "Ubicación actual";
  }
}

function interpretarCodigoClima(code) {
  if (code === 0) return { texto: "Despejado", icono: "☀️" };
  if (code <= 2) return { texto: "Parcialmente nublado", icono: "⛅" };
  if (code === 3) return { texto: "Nublado", icono: "☁️" };
  if (code === 45 || code === 48) return { texto: "Niebla", icono: "🌫️" };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return { texto: "Lluvia", icono: "🌧️" };
  }
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return { texto: "Nieve", icono: "❄️" };
  }
  if (code >= 95) return { texto: "Tormenta eléctrica", icono: "⛈️" };
  return { texto: "Variable", icono: "🌤️" };
}

function formatearCoordenadas(lat, lon) {
  const ns = lat >= 0 ? "N" : "S";
  const eo = lon >= 0 ? "E" : "O";
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${eo}`;
}

function formatearFechaHora(isoString, timeZone) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(isoString));
}

function prepararDatosWidget(clima, nombreUbicacion = "Ubicación actual") {
  const actual = clima.current;
  const estado = interpretarCodigoClima(actual.weather_code);

  const times = clima.hourly?.time ?? [];
  const temps = clima.hourly?.temperature_2m ?? [];
  const codes = clima.hourly?.weather_code ?? [];

  let indiceInicio = times.findIndex((t) => t >= actual.time);
  if (indiceInicio === -1) indiceInicio = 0;

  const proximasHoras = [];
  for (let i = 0; i < 5; i++) {
    const idx = indiceInicio + i;
    if (idx >= times.length) break;

    const infoHora = interpretarCodigoClima(codes[idx]);
    proximasHoras.push({
      hora: i === 0 ? "Ahora" : times[idx].slice(11, 16),
      icono: infoHora.icono,
      condicion: infoHora.texto,
      temperatura: `${Math.round(temps[idx])}°`,
      esActual: i === 0,
    });
  }

  return {
    ubicacion: nombreUbicacion,
    fechaHora: formatearFechaHora(actual.time, clima.timezone),
    temperatura: `${Math.round(actual.temperature_2m)}°`,
    sensacionTermica: `Sensación térmica ${Math.round(actual.apparent_temperature)}°`,
    condicion: estado.texto,
    icono: estado.icono,
    humedad: `${actual.relative_humidity_2m}%`,
    viento: `${Math.round(actual.wind_speed_10m)} km/h`,
    lluvia: `${Number(actual.precipitation).toFixed(1)} mm`,
    coordenadas: formatearCoordenadas(clima.latitude, clima.longitude),
    proximasHoras,
  };
}

function establecerTexto(id, valor) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = valor;
  }
}

function mostrarWidgetListo() {
  const loadingBox = document.getElementById("loading-box");
  const widgetContent = document.getElementById("widget-content");

  if (loadingBox) loadingBox.classList.add("is-hidden");
  if (widgetContent) {
    widgetContent.classList.add("is-visible");
  }
}

function pintarWidget(datos) {
  establecerTexto("location-title", datos.ubicacion);
  establecerTexto("location-meta", datos.fechaHora);
  establecerTexto("temp-value", datos.temperatura);
  establecerTexto("condition-text", datos.condicion);
  establecerTexto("feels-like", datos.sensacionTermica);

  establecerTexto("humidity-value", datos.humedad);
  establecerTexto("wind-value", datos.viento);
  establecerTexto("rain-value", datos.lluvia);
  establecerTexto("coords-text", datos.coordenadas);

  const hourlyRow = document.getElementById("hourly-row");
  if (hourlyRow) {
    hourlyRow.innerHTML = "";

    datos.proximasHoras.forEach((horaItem) => {
      const slot = document.createElement("div");
      slot.className = `hour-slot${horaItem.esActual ? " is-now" : ""}`;
      slot.innerHTML = `
        <span class="hour-time">${horaItem.hora}</span>
        <span class="hour-icon">${horaItem.icono}</span>
        <span class="hour-temp">${horaItem.temperatura}</span>
      `;
      hourlyRow.appendChild(slot);
    });
  }

  mostrarWidgetListo();
}

async function ejecutar() {
  try {
    const geo = await obtenerCoordenadas();
    const [clima, nombreCiudad] = await Promise.all([
      consultarClima(geo.lat, geo.lon),
      obtenerNombreCiudad(geo.lat, geo.lon),
    ]);
    const datosWidget = prepararDatosWidget(clima, nombreCiudad);
    pintarWidget(datosWidget);
  } catch (error) {
    console.warn(
      "Hubo un error al momento de mostrar el clima, usando ubicación de respaldo:",
      error.message || error
    );
  }
}

ejecutar();