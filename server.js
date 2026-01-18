require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const countriesList = require('./countries.json');

const app = express();

const allowedOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    return callback(new Error('CORS not allowed'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
 }))

 app.options('*', cors());

let lastFetch = null;
let cache = { data: null, timestamp: null, ttl: 10 * 60 * 1000 }; // 10 minutes in ms

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.get('/health', (req, res) => {
  res.json({
    status: "ok",
    last_fetch: lastFetch,
    source: "cloudflare_radar"
  });
});

app.post('/validate-token', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(400).json({ error: 'Authorization header with Bearer token is required' });
  }

  const access_token = authHeader.substring(7); // Remove 'Bearer '

  try {
    const response = await axios.get(
      `${CLOUDFLARE_API_URL}/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/tokens/verify`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to validate token', details: error.message });
  }
});

app.get('/aggregate-data', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header with Bearer token is required' });
  }

  const access_token = authHeader.substring(7);

  // Check cache
  const now = Date.now();
  if (cache.data && cache.timestamp && (now - cache.timestamp) < cache.ttl) {
    return res.json(cache.data);
  }

  try {
    // Fetch outages data
    const outagesRes = await axios.get('https://api.cloudflare.com/client/v4/radar/annotations/outages?limit=1000&dateRange=1d&format=json', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const data = outagesRes.data;

    // Check for API errors
    if (!data.success) {
      return res.status(502).json({ error: 'Cloudflare API returned errors', details: data.errors });
    }

    const annotations = data.result?.annotations || [];

    // Initialize countries with NORMAL status
    const countries = {};
    countriesList.forEach(code => {
      countries[code] = { status: 'NORMAL' };
    });

    // Collect outages per country
    const outagesByCountry = {};
    annotations.forEach(annotation => {
      if (!annotation.outage || !Array.isArray(annotation.locations)) return;

      const now = new Date();
      const endDate = annotation.endDate ? new Date(annotation.endDate) : null;
      if (endDate && endDate < now) return; // Skip if outage has ended

      annotation.locations.forEach(location => {
        if (typeof location === 'string' && countriesList.includes(location)) {
          if (!outagesByCountry[location]) {
            outagesByCountry[location] = [];
          }
          outagesByCountry[location].push(annotation);
        }
      });
    });

    // Process each country to determine the highest priority outage
    Object.keys(outagesByCountry).forEach(country => {
      const outages = outagesByCountry[country];
      let selectedOutage = null;

      // Prioritize: NATIONWIDE > REGIONAL > others
      const nationwide = outages.find(o => o.outage.outageType === 'NATIONWIDE');
      if (nationwide) {
        selectedOutage = nationwide;
      } else {
        const regional = outages.find(o => o.outage.outageType === 'REGIONAL');
        if (regional) {
          selectedOutage = regional;
        }
      }

      if (selectedOutage) {
        const outageType = selectedOutage.outage.outageType;
        const status = outageType === 'NATIONWIDE' ? 'OUTAGE' : 'DEGRADED';
        const severity = outageType === 'NATIONWIDE' ? 'HIGH' : 'MEDIUM';

        countries[country] = {
          status,
          severity,
          scope: outageType,
          cause: selectedOutage.outage.outageCause,
          since: selectedOutage.startDate,
          source: ['outages']
        };
      }
    });

    const response = {
      generated_at: new Date().toISOString(),
      as_of: "now",
      time_window: "last_24h",
      countries
    };

    // Update last fetch timestamp
    lastFetch = response.generated_at;

    // Cache the response
    cache.data = response;
    cache.timestamp = now;

    // Logging
    const activeOutages = Object.values(countries).filter(c => c.status !== 'NORMAL').length;
    console.log(`Fetch successful. Active outages: ${activeOutages}`);

    res.json(response);
  } catch (error) {
    console.log(`Fetch failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch and process outages data', details: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
