const express = require('express');
const { check } = require('express-validator');

const usersControllers = require('../controllers/users-controller');
const router = express.Router();

router.options('*', (req, res) => res.sendStatus(200));

router.get('/', usersControllers.getUsers);

router.post(
  '/signup',
  [
    check('name').not().isEmpty(),
    check('company').not().isEmpty(),
    check('email').normalizeEmail().isEmail(),
    check('password').isLength({ min: 6 }),
  ],
  usersControllers.signup
);

router.post(
  '/login',
  [check('email').normalizeEmail().isEmail()],
  usersControllers.login
);

module.exports = router;
