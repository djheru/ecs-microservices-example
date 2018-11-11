const axios = require('axios');
const express = require('express');
const app = express();

const serviceaUri = 'http://servicea.services-ns/a';
const version = 'v5';

app.get('/b/checka', async (req, res) => {
  const route = `${serviceaUri}/checka`;
  console.log(`serviceb@${version}:checka - ${route}`);
  let response;
  try {
    response = await axios.get(route);
  } catch (e) {
    response = { data: `Error in GET request to serviceb@${version}: ${e.data || e.message}` };
  }
  res.json(response.data);
});

app.get('/b/checkb', (req, res) => {
  console.log(`serviceb@${version}:checkb`);
  res.send(`PONG from service B@${version}`);
});

app.listen(80, () => console.log(`serviceb@${version} listening on port 80`));
