const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const HttpError = require('../models/http-error');
const User = require('../models/user');

const getUsers = async (req, res, next) => {
  let users;

  try {
    users = await User.find({}, '-password');
  } catch (err) {
    const error = new HttpError('Fetching users failed, please try again', 500);
    return next(error);
  }

  res.json({ users: users.map((user) => user.toObject({ getters: true })) });
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

  try {
    existingUser = await User.findOne({ email: email });
  } catch (err) {
    console.log(err);
    return next(new HttpError('Signup failed, please try again', 500));
  }

  if (existingUser)
    return next(new HttpError('User with that email already exists', 422));

  let hashedPassword;

  try {
    hashedPassword = await bcrypt.hash(password, 12);
  } catch (err) {
    console.log('password hash error: ', err);
    return next(
      new HttpError('Could not create new user, please try again', 500)
    );
  }

  const createdUser = new User({
    name,
    company,
    email,
    password: hashedPassword,
    created: new Date().toISOString(),
    products: [],
  });

  try {
    await createdUser.save();
  } catch (err) {
    console.log(err.message);
    return next(
      new HttpError(
        'Signup failed, unable to create user.  Please try again!',
        500
      )
    );
  }

  let token;

  try {
    token = jwt.sign(
      {
        userId: createdUser.id,
        email: createdUser.email,
      },
      process.env.JWT_KEY,
      { expiresIn: '1h' }
    );
  } catch (err) {
    return next(new HttpError('Signup failed, please try again!', 500));
  }

  res.status(201).json({
    message: 'Signup successful!',
    userData: {
      userId: createdUser.id,
      email: createdUser.email,
      token: token,
    },
  });
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
