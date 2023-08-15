const express = require('express');
const { check } = require('express-validator');

const productsControllers = require('../controllers/products-controller');
const checkAuth = require('../middleware/check-auth');
const fileUpload = require('../middleware/file-upload');

const router = express.Router();

router.use(checkAuth);

router.get('/:pid', productsControllers.getProductById);

router.get('/user/:uid', productsControllers.getProductsByUserId);

router.post(
  '/',
  fileUpload.single('image'),
  [
    check('name').not().isEmpty(),
    check('description').isLength({ min: 10 }),
    check('gtin').isNumeric().isLength({ min: 14, max: 14 }),
  ],
  productsControllers.createProduct
);

router.patch(
  '/:pid',
  fileUpload.single('image'),
  [
    check('name').not().isEmpty(),
    check('description').isLength({ min: 10 }),
    check('gtin').isNumeric().isLength({ min: 14, max: 14 }),
  ],
  productsControllers.updateProduct
);

router.delete('/:pid', productsControllers.deleteProduct);

module.exports = router;
