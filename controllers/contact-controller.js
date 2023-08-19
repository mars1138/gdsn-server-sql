const { validationResult } = require('express-validator');
const HttpError = require('../models/http-error');
const ContactItem = require('../models/contactitem');
const db = require('../models/db');

const createContactItem = async (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const error = new HttpError(
      'Invalid inputs received, please check your data'
    );
    return next(error);
  }

  const { name, company, email, phone, comments } = req.body;

  db.transaction((trx) => {
    trx
      .insert({
        name,
        company,
        email,
        phone,
        comments,
        created: new Date().toISOString(),
      })
      .into('contact')
      .returning('*')
      .then((contact) => {
        res.status(201).json({
          message: 'Contact item created!',
          contactItem: { name, company, email, phone, comments },
        });
      })
      .then(trx.commit)
      .catch(trx.rollback);
  }).catch((err) =>
    next(new HttpError('Unable to register contact, please try again!', 500))
  );
};

const getContactItems = async (req, res, next) => {
  db.select('*')
    .from('contact')
    .then((contacts) => {
      if (contacts.length) res.json(contacts);
      else return next(new HttpError('No contacts to fetch', 400));
    })
    .catch((err) =>
      next(new HttpError('Fetching contacts failed, please try again', 400))
    );
};

exports.createContactItem = createContactItem;
exports.getContactItems = getContactItems;
