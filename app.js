const path = require('path');

const express = require('express');
const bodyParser = require('body-parser');
const knex = require('knex');

const productsRoutes = require('./routes/products-routes');
const usersRoutes = require('./routes/users-routes');
const contactRoutes = require('./routes/contact-routes');

const db = knex({
  client: `${process.env.DB_CLIENT}`,
  connection: {
    host: `${process.env.DB_HOST}`,
    user: `${process.env.DB_USER}`,
    password: `${process.env.DB_PASSWORD}`,
    database: `${process.env.DB_NAME}`,
  },
});

db.select('*')
  .from('users')
  .then((data) => console.log(data));

const app = express();
const cors = require('cors');

app.use(bodyParser.json());

app.use('/uploads/images', express.static(path.join('uploads', 'images')));

app.use(
  cors({
    origin: `${process.env.CLIENT_URL}`,
    methods: ['GET', 'POST', 'DELETE', 'UPDATE', 'PUT', 'PATCH'],
  })
);

app.use('/api/products', productsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/contact', contactRoutes);

app.use((req, res, next) => {
  const error = new HttpError('Could not find this route', 404);
  throw error;
});

app.use((error, req, res, next) => {
  res.status(error.code || 500);
  res.json({ message: error.message || 'An unknown error occurred!' });
});

app.listen(process.env.PORT, () => {
  console.log(`App is listening on port ${process.env.PORT}`);
});
