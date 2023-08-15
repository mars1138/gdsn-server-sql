const express = require('express');
const { check } = require('express-validator');

const contactController = require('../controllers/contact-controller');

const router = express.Router();

router.post(
  '/',
  [
    check('name').not().isEmpty(),
    check('company').not().isEmpty(),
    check('email').not().isEmpty(),
    check('email').normalizeEmail().isEmail(),
  ],
  contactController.createContactItem
);

router.get('/', contactController.getContactItems);

module.exports = router;
