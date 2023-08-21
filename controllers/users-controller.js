const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const HttpError = require('../models/http-error');
const User = require('../models/user');
const db = require('../models/db');

const getUsers = async (req, res, next) => {
  db.select('*')
    .from('users')
    .returning('userList')
    .then((userList) => {
      res.json({ users: userList });
    })
    .catch((err) =>
      next(new HttpError('Fetching users failed, please try again', 500))
    );

  // let users;

  // try {
  //   users = await User.find({}, '-password');
  // } catch (err) {
  //   const error = new HttpError('Fetching users failed, please try again', 500);
  //   return next(error);
  // }

  // res.json({ users: users.map((user) => user.toObject({ getters: true })) });
};

const signup = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError('Invalid inputs passed, please check your data', 422)
    );
  }

  const { name, company, email, password } = req.body;

  let existingUser;
  let hashedPassword;

  db.select('email')
    .from('login')
    .where('email', '=', email)
    .then((users) => {
      if (users.length)
        return next(new HttpError('User with that email already exists', 422));
      console.log('users: ', users);
    })
    .catch((err) =>
      next(new HttpError('Signup failed, please try again (A)', 500))
    );

  try {
    hashedPassword = await bcrypt.hash(password, 12);
    console.log('password hashed');
  } catch (err) {
    return next(
      new HttpError('Could not create new user, please try again', 500)
    );
  }

  db.transaction((trx) => {
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
            console.log(user);

            res.status(201).json({
              message: 'Signup successful!',
              userData: {
                userId: user[0].id,
                email: user[0].email,
                token: 'token',
              },
            });
          });
      })
      .then(trx.commit)
      .catch((err) => {
        trx.rollback;
        return next(
          new HttpError('Could not create new user, please try again (B)', 500)
        );
      });
  }).catch((err) =>
    next(new HttpError('Could not create new user, please try again (C)', 500))
  );

  // let existingUser;

  // try {
  //   existingUser = await User.findOne({ email: email });
  // } catch (err) {
  //   console.log(err);
  //   return next(new HttpError('Signup failed, please try again', 500));
  // }

  // if (existingUser)
  //   return next(new HttpError('User with that email already exists', 422));

  // let hashedPassword;

  // try {
  //   hashedPassword = await bcrypt.hash(password, 12);
  // } catch (err) {
  //   console.log('password hash error: ', err);
  //   return next(
  //     new HttpError('Could not create new user, please try again', 500)
  //   );
  // }

  // const createdUser = new User({
  //   name,
  //   company,
  //   email,
  //   password: hashedPassword,
  //   created: new Date().toISOString(),
  //   products: [],
  // });

  // try {
  //   await createdUser.save();
  // } catch (err) {
  //   console.log(err.message);
  //   return next(
  //     res.status(201).json({
  //   message: 'Signup successful!',
  //   userData: {
  //     userId: createdUser.id,
  //     email: createdUser.email,
  //     token: token,
  //   },
  // })
  //   );
  // }

  // let token;

  // try {
  //   token = jwt.sign(
  //     {
  //       userId: createdUser.id,
  //       email: createdUser.email,
  //     },
  //     process.env.JWT_KEY,
  //     { expiresIn: '1h' }
  //   );
  // } catch (err) {
  //   return next(new HttpError('Signup failed, please try again!', 500));
  // }

  // res.status(201).json({
  //   message: 'Signup successful!',
  //   userData: {
  //     userId: createdUser.id,
  //     email: createdUser.email,
  //     token: token,
  //   },
  // });
};

const login = async (req, res, next) => {
  const { email, password } = req.body;

  let existingUser, isValidPassword, token;

  try {
    existingUser = await User.findOne({ email: email });
  } catch (err) {
    return next(new HttpError('Login failed, please try again later', 500));
  }

  if (!existingUser)
    return next(
      new HttpError('Invalid credentials, could not log you in', 403)
    );

  try {
    isValidPassword = await bcrypt.compare(password, existingUser.password);
  } catch (err) {
    return next(
      new HttpError(
        'Could not log you in, please check credentials and try again',
        500
      )
    );
  }

  if (!isValidPassword)
    return next(
      new HttpError('Invalid credentials, unable to log you in', 401)
    );

  try {
    token = jwt.sign(
      { userId: existingUser.id, email: existingUser.email },
      process.env.JWT_KEY,
      { expiresIn: '1hr' }
    );
  } catch (err) {
    return next(new HttpError('Login failed, please try again!', 500));
  }

  res.json({
    message: 'login successful!',
    userData: {
      userId: existingUser.id,
      email: existingUser.email,
      token: token,
    },
  });
};

exports.getUsers = getUsers;
exports.signup = signup;
exports.login = login;
