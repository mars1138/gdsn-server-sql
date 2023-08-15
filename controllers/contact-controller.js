const { validationResult } = require('express-validator');
const HttpError = require('../models/http-error');
const ContactItem = require('../models/contactitem');

const createContactItem = async (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const error = new HttpError(
      'Invalid inputs received, please check your data'
    );
    return next(error);
  }

  const { name, company, email, phone, comments } = req.body;

  const createdContactItem = new ContactItem({
    name,
    company,
    email,
    phone: phone || null,
    comments: comments || '',
    date: new Date().toISOString(),
  });

  try {
    await createdContactItem.save();
  } catch (err) {
    const error = new HttpError(
      'Error sending contact info, please try again',
      500
    );
    return next(error);
  }

  res.status(201).json({
    message: 'Contact item created!',
    contactItem: createdContactItem.toObject({ getters: true }),
  });
};

const getContactItems = async (req, res, next) => {
  let contactItems;

  try {
    contactItems = await ContactItem.find();
  } catch (err) {
    const error = new HttpError(
      'Fetching contacts failed, please try  again',
      500
    );

    return next(error);
  }

  if (!contactItems || contactItems.length === 0) {
    const error = new HttpError('No contact items to fetch', 400);

    return next(error);
  }

  res.json({
    contact: contactItems.map((item) => item.toObject({ getter: true })),
  });
};

exports.createContactItem = createContactItem;
exports.getContactItems = getContactItems;
