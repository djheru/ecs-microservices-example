const axios = require('axios');
const express = require('express');
const app = express();

const servicebUri = 'http://serviceb.services-ns/b';
const version = 'v5';

app.get('/a/checka', (req, res) => {
  console.log(`servicea@${version}:checka`);
  res.send(`PONG from service A@${version}`);
});

app.get('/a/checkb', async (req, res) => {
  const route = `${servicebUri}/checkb`;
  console.log(`servicea@${version}:checkb - ${route}`);
  let response;
  try {
    response = await axios.get(route);
  } catch (e) {
    response = { data: `Error in GET request to servicea@${version}: ${e.data || e.message}` };
  }
  res.json(response.data);
});

app.listen(80, () => console.log(`servicea@${version} listening on port 80`));
