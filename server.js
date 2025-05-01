const express = require('express');
const fs = require('fs');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const session = require('express-session');
const path = require('path');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
require('dotenv').config();

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('Mongo error:', err));

// Sessions stored in MongoDB
app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI })
}));

// Load & Save JSON helpers
const usersFile = 'users.json';
const productsFile = 'products.json';
const loadJSON = file => JSON.parse(fs.existsSync(file) ? fs.readFileSync(file) : '[]');
const saveJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// AUTH
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = loadJSON(usersFile);
  const user = users.find(u => u.username === username);
  if (user && bcrypt.compareSync(password, user.password)) {
    req.session.user = user.username;
    res.redirect(user.username === process.env.ADMIN_KEY ? '/admin.html' : '/checkout.html');
  } else {
    res.redirect('/login.html?error=1');
  }
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const users = loadJSON(usersFile);
  if (users.some(u => u.username === username)) {
    return res.redirect('/login.html?exists=1');
  }
  const hashed = await bcrypt.hash(password, 10);
  users.push({ username, password: hashed, orders: [] });
  saveJSON(usersFile, users);
  req.session.user = username;
  res.redirect('/checkout.html');
});

app.get('/session', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// PRODUCTS
app.get('/get-products', (req, res) => {
  const products = loadJSON(productsFile);
  res.json(products);
});

app.post('/add-product', (req, res) => {
  const { name, price, image } = req.body;
  const products = loadJSON(productsFile);
  products.push({ name, price: parseFloat(price), image });
  saveJSON(productsFile, products);
  res.json({ success: true });
});

app.post('/delete-product', (req, res) => {
  const { name } = req.body;
  let products = loadJSON(productsFile);
  products = products.filter(p => p.name !== name);
  saveJSON(productsFile, products);
  res.json({ success: true });
});

// STRIPE
app.post('/create-checkout-session', async (req, res) => {
  if (!req.session.user) return res.redirect('/login.html');
  const cart = req.body.cart || [];
  const line_items = cart.map(item => ({
    price_data: {
      currency: 'usd',
      product_data: { name: item.name },
      unit_amount: Math.round(item.price * 100)
    },
    quantity: 1
  }));
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items,
    mode: 'payment',
    success_url: `${process.env.DOMAIN}/success.html`,
    cancel_url: `${process.env.DOMAIN}/cart.html`,
  });
  res.json({ id: session.id });
});

// Catch-all fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Live at http://localhost:${PORT}`));