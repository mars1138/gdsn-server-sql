const uuid = require('uuid').v4;

const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const HttpError = require('../models/http-error');
const Product = require('../models/product');
const User = require('../models/user');

const bucketName = `${process.env.BUCKET_NAME}`;
const bucketRegion = `${process.env.BUCKET_REGION}`;
const accessKey = `${process.env.ACCESS_KEY}`;
const secretAccessKey = `${process.env.SECRET_ACCESS_KEY}`;

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

const getProductById = async (req, res, next) => {
  const prodId = req.params.pid;

  let product;

  try {
    prodId = await Product.find({ gtin: prodId });
  } catch (err) {
    return next(
      new HttpError('Something went wrong, could not find product', 500)
    );
  }

  if (!product)
    return next(
      new HttpError('Could not find a place for the provided id', 404)
    );

  res.json({ product: product[0].toObject({ getters: true }) });
};

const getProductsByUserId = async (req, res, next) => {
  const userId = req.params.uid;

  let userWithProducts;

  try {
    userWithProducts = await User.findById(userId).populate('products');
  } catch (err) {
    return next(
      new HttpError('Fetching user products failed, please try again', 500)
    );
  }

  if (!userWithProducts)
    return next(
      new HttpError('Could not find products for the provided user id', 404)
    );

  const returnProducts = userWithProducts.products.map((prod) =>
    prod.toObject({ getters: true })
  );

  for (product of returnProducts) {
    product.image = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: bucketName,
        Key: product.image,
      }),
      { expiresIn: 3600 } // 60 seconds
    );
  }

  res.json(returnProducts);
};

const createProduct = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return next(
      new HttpError('Invalid inputs passed, please check your data.', 422)
    );

  const {
    name,
    description,
    gtin,
    category,
    type,
    image,
    height,
    width,
    depth,
    weight,
    packagingType,
    tempUnits,
    minTemp,
    maxTemp,
    storageInstructions,
  } = req.body;

  const fileType = req.file.mimetype.split('/')[1];
  const imageName = `${uuid()}.${fileType}`;

  const createdProd = new Product({
    name,
    description,
    gtin,
    category,
    type,
    image: req.file ? imageName : null,
    height,
    width,
    depth,
    weight,
    packagingType,
    tempUnits,
    minTemp,
    maxTemp,
    storageInstructions,
    subscribers: [],
    dateAdded: new Date().toISOString(),
    datePublished: null,
    dateInactive: null,
    dateModified: null,
    owner: req.userData.userId,
  });
  console.log('createdProd: ', createdProd);
  let params, user;

  try {
    user = await User.findById(req.userData.userId);
  } catch (err) {
    return next(new HttpError('Creating place failed, please try again', 500));
  }

  if (!user)
    return next(new HttpError('Could not find user for provided id', 404));

  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await createdProd.save({ session: sess }), user.products.push(createdProd);
    await user.save({ session: sess });
    await sess.commitTransaction();

    if (req.file) {
      params = {
        Bucket: bucketName,
        Key: imageName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      };
      await s3.send(new PutObjectCommand(params));
    }
  } catch (err) {
    return next(new HttpError('Creating place failed, please try again!', 500));
  }

  res.status(201).json({ product: createdProd.toObject({ getters: true }) });
};

const updateProduct = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError('Invalid inputs passed, please check your data', 422)
    );
  }

  const prodId = req.params.pid;
  let product;

  try {
    product = await Product.find({ gtin: prodId });
  } catch (err) {
    return next(
      new HttpError('Something went wrong, could not update product', 500)
    );
  }

  if (product[0].owner != req.userData.userId) {
    const error = new HttpError(
      'You are not authorized to edit this place.',
      401
    );
    return next(error);
  }

  const {
    name,
    description,
    category,
    height,
    width,
    depth,
    weight,
    packagingType,
    tempUnits,
    minTemp,
    maxTemp,
    storageInstructions,
    subscribers,
    dateInactive,
  } = req.body;

  if (name) product[0].name = name;
  if (description) product[0].description = description;
  if (category) product[0].category = category;
  if (height) product[0].height = height;
  if (width) product[0].width = width;
  if (depth) product[0].depth = depth;
  if (weight) product[0].weight = weight;
  if (packagingType) product[0].packagingType = packagingType;
  if (tempUnits) product[0].tempUnits = tempUnits;
  if (minTemp) product[0].minTemp = minTemp;
  if (maxTemp) product[0].maxTemp = maxTemp;
  if (storageInstructions) product[0].storageInstructions = storageInstructions;

  let fileType, oldImage, newImage;

  if (req.file) {
    fileType = req.file.mimetype.split('/')[1];
    oldImage = product[0].image;
    newImage = `${uuid}.${fileType}`;
    product[0].image = newImage;
  }

  if (subscribers[0]) {
    const subArray = subscribers.split(',');
    product[0].subscribers = [];
    subArray.forEach((sub) => product[0].subscribers.push(+sub));
    product[0].datePublished = new Date().toISOString();
  }

  if (!subscribers[0] || !subscribers) {
    product[0].subscribers = [];
    product[0].datePublished = null;
  }

  if (dateInactive === new Date(0).toISOString()) {
    product[0].dateInactive = null;
  } else {
    product[0].dateInactive = dateInactive;
  }

  product[0].dateModified = new Date().toISOString();

  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await product[0].save();
    await sess.commitTransaction();

    if (req.file) {
      //save new image
      saveParams = {
        Bucket: bucketName,
        Key: newImage,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      };
      await s3.send(new PutObjectCommand(saveParams));

      //delete old image
      deleteParams = {
        Bucket: bucketName,
        Key: oldImage,
      };
      await s3.send(new DeleteObjectCommand(deleteParams));
    }
  } catch (err) {
    return next(
      new HttpError('Something went wrong, could not update product', 500)
    );
  }

  res.status(200).json({ product: product[0].toObject({ getters: true }) });
};

const deleteProduct = async (req, res, next) => {
  const prodId = req.params.pid;

  let deleteProd, deleteUser;

  try {
    deleteProd = await Product.find({ gtin: prodId });
    deleteUser = await User(deleteProd[0].owner);
  } catch (err) {
    return next(
      new HttpError('Something went wrong, could not delete product', 500)
    );
  }

  if (!deleteProd || deleteProd.length === 0)
    return next(new HttpError('Could not find product for this id', 404));

  if (deleteProd[0].owner !== req.userData.userId)
    return next(
      new HttpError('You are not authorized to delete this product.', 401)
    );

  const deleteProdImage = deleteProd[0].image;

  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await deleteProd[0].remove({ session: sess });
    deleteUser.products.pull(deleteProd[0].id);
    await deleteUser.save({ session: sess });
    await sess.commitTransaction();

    if (deleteProdImage) {
      const params = {
        Bucket: bucketName,
        Key: deleteProdImage,
      };
      await s3.send(new DeleteObjectCommand(params));
    }
  } catch (err) {
    return next(
      new HttpError(
        'Something went wrong, could not complete product delete',
        500
      )
    );
  }

  res.status(200).json({
    message: `Product ${prodId} ${deleteProd[0].name} has been deleted`,
  });
};

exports.getProductById = getProductById;
exports.getProductsByUserId = getProductsByUserId;
exports.createProduct = createProduct;
exports.updateProduct = updateProduct;
exports.deleteProduct = deleteProduct;
