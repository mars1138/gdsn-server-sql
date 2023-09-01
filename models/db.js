const knex = require('knex');

// PRODUCTION
const db = knex({
  client: 'pg',
  connection: {
    connectionString: `${process.env.DB_URL}`,
    ssl: {
      rejectUnauthorized: false,
    },
  },
});

// DEVELOPMENT
// const db = knex({
//   client: `${process.env.DB_CLIENT}`,
//   connection: {
//     host: `${process.env.DB_HOST}`,
//     user: `${process.env.DB_USER}`,
//     password: `${process.env.DB_PASSWORD}`,
//     database: `${process.env.DB_NAME}`,
//   },
// });

module.exports = db;
