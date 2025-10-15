// index.js
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req,res) => {
  res.send('Hello from demo-app!');
});

app.get('/vuln', (req,res) => {
  // intentionally insecure example (for demo scanning)
  const user = req.query.user || '';
  // naive eval (unsafe) - to demonstrate a vulnerability
  try {
    const result = eval(user);
    res.send(`Eval result: ${result}`);
  } catch (e) {
    res.send('Error in eval');
  }
});

app.listen(port, ()=> console.log(`Listening on ${port}`));
