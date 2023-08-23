const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const HttpError = require('../models/http-error');
const User = require('../models/user');
const db = require('../models/db');

const getUsers = (req, res, next) => {
  db.select('*')
    .from('users')
    .returning('userList')
    .then((userList) => {
      res.json({ users: userList });
    })
    .catch((err) =>
      next(new HttpError('Fetching users failed, please try again', 500))
    );
};

const signup = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError('Invalid inputs passed, please check your data', 422)
    );
  }

  const { name, company, email, password } = req.body;
  let hashedPassword;
  let token = null;

  db.select('email')
    .from('login')
    .where('email', '=', email)
    .then(async (users) => {
      console.log('users: ', users);
      if (users.length) {
        throw new HttpError('User with that name already exists.', 422);
      } else {
        console.log('user check passed');

        hashedPassword = await bcrypt.hash(password, 12).catch((err) => {
          throw new HttpError('Could not create new user', 500);
        });

        console.log('hashedPassword: ', hashedPassword);

        return db
          .transaction((trx) => {
            trx
              .insert({
                hash: hashedPassword,
                email: email,
              })
              .into('login')
              .returning('email')
              .then((loginEmail) => {
                console.log('accessing users table');
                return trx('users')
                  .returning('*')
                  .insert({
                    name: name,
                    company: company,
                    email: loginEmail[0].email,
                    created: new Date().toISOString(),
                    products: {},
                  })
                  .then((user) => {
                    token = jwt.sign(
                      {
                        userId: user[0].id,
                        email: user[0].email,
                      },
                      process.env.JWT_KEY,
                      { expiresIn: '1h' }
                    );

                    if (!token) {
                      console.log('bad token: ', token);
                      throw new HttpError('Signup unsucessful (token)');
                    }

                    res.status(201).json({
                      message: 'Signup successful!',
                      userData: {
                        userId: user[0].id,
                        email: user[0].email,
                        token: token,
                      },
                    });
                  })
                  .catch((err) =>
                    next(
                      err ||
                        new HttpError(
                          'Signup failed, please try again! (token)',
                          500
                        )
                    )
                  );
              })
              .then(trx.commit)
              .catch((err) => {
                trx.rollback;
                return next(
                  new HttpError(
                    'Could not create new user, please try again (A)',
                    500
                  )
                );
              });
          })
          .catch((err) =>
            next(
              new HttpError(
                'Could not create new user, please try again (B)',
                500
              )
            )
          );
      }
    })
    .catch((err) => {
      return next(err ? err : new HttpError('Unable to create new user.', 500));
    });
};

const login = (req, res, next) => {
  const { email, password } = req.body;
  let token = null;

  if (!email || !password)
    return next(new HttpError('Incorrect Form Submission!', 400));

  db.select('email', 'hash')
    .from('login')
    .where('email', '=', email)
    .then(async (data) => {
      console.log('data: ', data);
      const isValid = await bcrypt.compare(password, data[0].hash);
      console.log('isValid: ', isValid);

      if (isValid) {
        return db
          .select('*')
          .from('users')
          .where('email', '=', email)
          .then((user) => {
            console.log('retrieved user: ', user);

            token = jwt.sign(
              {
                userId: user[0].id,
                email: user[0].email,
              },
              process.env.JWT_KEY,
              { expiresIn: '1h' }
            );

            if (!token) {
              console.log('bad token: ', token);
              throw new HttpError('error token!', 500);
            }

            res.json({
              message: 'login successful!',
              userData: {
                userId: user[0].id,
                email: user[0].email,
                token: token,
              },
            });
          })
          .catch((err) =>
            next(new HttpError('Signup failed, please try again! (token)', 500))
          );
      } else {
        throw new Error();
      }
    })
    .catch((err) =>
      next(new HttpError('Invalid credentials, please try again!', 500))
    );
};

exports.getUsers = getUsers;
exports.signup = signup;
exports.login = login;
