// Netlify Function: myAir EU proxy
// Omzeilt CORS door server-side in te loggen bij myAir

exports.handler = async function(event) {
const headers = {
“Access-Control-Allow-Origin”: “*”,
“Access-Control-Allow-Headers”: “Content-Type”,
“Content-Type”: “application/json”
};

if (event.httpMethod === “OPTIONS”) {
return { statusCode: 200, headers, body: “” };
}

if (event.httpMethod !== “POST”) {
return { statusCode: 405, headers, body: JSON.stringify({ error: “Method not allowed” }) };
}

let username, password, date;
try {
const body = JSON.parse(event.body || “{}”);
username = body.username;
password = body.password;
date = body.date || new Date().toISOString().split(“T”)[0];
} catch(e) {
return { statusCode: 400, headers, body: JSON.stringify({ error: “Ongeldige invoer” }) };
}

if (!username || !password) {
return { statusCode: 400, headers, body: JSON.stringify({ error: “Gebruikersnaam en wachtwoord vereist” }) };
}

try {
// Stap 1: Inloggen bij myAir EU
const loginRes = await fetch(“https://myair-eu.resmed.com/api/v2/account/signin”, {
method: “POST”,
headers: { “Content-Type”: “application/json”, “Accept”: “application/json” },
body: JSON.stringify({ username, password })
});

```
if (!loginRes.ok) {
  const errText = await loginRes.text();
  return { statusCode: 401, headers, body: JSON.stringify({ error: "Inloggen mislukt: " + loginRes.status }) };
}

const loginData = await loginRes.json();
const token = loginData.token || loginData.access_token || loginData.accessToken;

if (!token) {
  return { statusCode: 401, headers, body: JSON.stringify({ error: "Geen token ontvangen van myAir" }) };
}

// Stap 2: Slaapdata ophalen voor de gevraagde datum
const dataRes = await fetch(`https://myair-eu.resmed.com/api/v2/score/dashboard?from=${date}&to=${date}`, {
  headers: {
    "Authorization": "Bearer " + token,
    "Accept": "application/json"
  }
});

if (!dataRes.ok) {
  return { statusCode: dataRes.status, headers, body: JSON.stringify({ error: "Data ophalen mislukt: " + dataRes.status }) };
}

const rawData = await dataRes.json();

// Stap 3: Data verwerken naar ons formaat
// myAir geeft score.sleepRecords of score.dailyScores terug
const records = rawData.sleepRecords || rawData.dailyScores || rawData.items || [];
const record = Array.isArray(records) ? records[0] : records;

if (!record) {
  return { statusCode: 404, headers, body: JSON.stringify({ error: "Geen data gevonden voor " + date }) };
}

// Vertaal myAir velden naar ons formaat
const ahi = record.ahi ?? record.ahiValue ?? record.averageAHI ?? null;
const maskHours = record.maskPairCount ?? record.usageHours ?? null;
const maskLeak = record.leakPercentile ?? record.sealPercentage ?? null;
const sleepScore = record.myAIRScore ?? record.score ?? null;

// Bereken maskUren formaat (bijv. "7:23")
let maskUren = null;
if (maskHours != null) {
  const h = Math.floor(maskHours);
  const m = Math.round((maskHours - h) * 60);
  maskUren = h + ":" + String(m).padStart(2, "0");
}

// Maskerdichting beoordelen
let seal = null;
if (maskLeak != null) {
  seal = maskLeak >= 95 ? "goed" : maskLeak >= 80 ? "afstellen" : "slecht";
}

return {
  statusCode: 200,
  headers,
  body: JSON.stringify({
    success: true,
    date,
    ahi: ahi != null ? Math.round(ahi * 10) / 10 : null,
    maskUren,
    seal,
    sleepScore,
    raw: record // voor debuggen
  })
};
```

} catch(e) {
return {
statusCode: 500,
headers,
body: JSON.stringify({ error: “Serverfout: “ + e.message })
};
}
};