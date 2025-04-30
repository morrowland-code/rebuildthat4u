const express = require('express');
const fs = require('fs');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(session({ secret: 'keyboard cat', resave: false, saveUninitialized: true }));

// Load users and products
const loadJSON = file => JSON.parse(fs.readFileSync(file));
const saveJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
const usersFile = 'users.json';
const productsFile = 'products.json';

// ROUTES
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = loadJSON(usersFile);
  const user = users.find(u => u.username === username);
  if (user && bcrypt.compareSync(password, user.password)) {
    req.session.user = user.username;
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const users = loadJSON(usersFile);
  if (users.some(u => u.username === username)) {
    return res.json({ success: false });
  }
  const hashed = await bcrypt.hash(password, 10);
  users.push({ username, password: hashed, balance: 0, revenue: 0, payoutPending: 0, orders: [] });
  saveJSON(usersFile, users);
  res.json({ success: true });
});

app.get('/session', (req, res) => {
  const users = loadJSON(usersFile);
  const user = users.find(u => u.username === req.session.user);
  res.json(user || {});
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.post('/add-order', (req, res) => {
  const users = loadJSON(usersFile);
  const user = users.find(u => u.username === req.session.user);
  if (!user) return res.json({ success: false });
  const id = Math.floor(Math.random() * 10000);
  const amount = Math.floor(Math.random() * 100) + 10;
  user.orders.push({ id, amount });
  user.revenue = (user.revenue || 0) + amount;
  user.balance += amount;
  user.payoutPending = (user.payoutPending || 0) + amount;
  saveJSON(usersFile, users);
  res.json({ success: true });
});

app.post('/add-product', (req, res) => {
  const products = loadJSON(productsFile);
  const { name, price, image } = req.body;
  products.push({ name, price: parseFloat(price), image });
  saveJSON(productsFile, products);
  res.json({ success: true });
});

app.get('/get-products', (req, res) => {
  const products = loadJSON(productsFile);
  res.json(products);
});

app.post('/save-cart', (req, res) => {
  fs.writeFileSync('cart.json', JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

app.post('/create-checkout-session', async (req, res) => {
  const cart = JSON.parse(fs.readFileSync('cart.json'));
  const line_items = cart.map(product => ({
    price_data: {
      currency: 'usd',
      product_data: { name: product.name },
      unit_amount: Math.round(parseFloat(product.price) * 100),
    },
    quantity: 1,
  }));

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items,
    mode: 'payment',
    success_url: `${req.protocol}://${req.get('host')}/success.html`,
    cancel_url: `${req.protocol}://${req.get('host')}/cart.html`,
  });

  res.json({ id: session.id });
});

// Static fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', req.path));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Live at http://localhost:${PORT}`));