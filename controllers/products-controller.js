const uuid = require('uuid').v4;

const { validationResult } = require('express-validator');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const HttpError = require('../models/http-error');
const db = require('../models/db');

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

const getProductById = (req, res, next) => {
  const prodId = req.params.pid;

  db.select('*')
    .from('products')
    .where('gtin', '=', prodId)
    .then((product) => {
      res.json({ product: product[0] });
    })
    .catch((err) =>
      next(new HttpError('Something went wrong, could not find product', 500))
    );
};

const getProductsByUserId = (req, res, next) => {
  const userId = req.params.uid;
  let returnProducts = [];

  db.select('*')
    .from('products')
    .where('owner', '=', userId)
    .then(async (prods) => {
      prods.forEach((prod) => {
        adjProd = {
          name: prod.name,
          description: prod.description,
          gtin: +prod.gtin,
          category: prod.category,
          type: prod.type,
          image: prod.image,
          height: prod.height,
          width: prod.width,
          depth: prod.depth,
          weight: prod.weight,
          packagingType: prod.packagingtype,
          tempUnits: prod.tempunits,
          minTemp: prod.mintemp,
          maxTemp: prod.maxtemp,
          storageInstructions: prod.storageinstructions,
          subscribers: prod.subscribers,
          dateAdded: prod.dateadded,
          datePublished: prod.datepublished,
          dateInactive: prod.dateinactive,
          dateModified: prod.datemodified,
          owner: prod.owner,
        };

        returnProducts.push(adjProd);
      });

      if (!returnProducts.length)
        throw new HttpError('User Id not valid for any products', 404);

      for (product of returnProducts) {
        if (product.image) {
          product.image = await getSignedUrl(
            s3,
            new GetObjectCommand({
              Bucket: bucketName,
              Key: product.image,
            }),
            { expiresIn: 3600 } // 60 seconds
          );
        }
      }

      res.json({ products: returnProducts });
    })
    .catch((err) =>
      next(
        err ||
          new HttpError('Could not find products for the provided user id', 404)
      )
    );
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
    packagingType: packagingtype,
    tempUnits: tempunits,
    minTemp: mintemp,
    maxTemp: maxtemp,
    storageInstructions: storageinstructions,
  } = req.body;

  const fileType = req.file.mimetype.split('/')[1];
  const imageName = `${uuid()}.${fileType}`;

  db.select('*')
    .from('products')
    .where('gtin', '=', gtin)
    .then((existingProd) => {
      // console.log('existingProd: ', existingProd);
      if (existingProd.length) {
        throw new HttpError('Product gtin already exists in database', 403);
      }

      return db
        .transaction((trx) => {
          let fileType, newImage;
          if (req.file) {
            fileType = req.file.mimetype.split('/')[1];
            newImage = `${uuid()}.${fileType}`;
          }

          const newProd = {
            name,
            description,
            gtin,
            category,
            type,
            image: req.file ? newImage : null,
            height,
            width,
            depth,
            weight,
            packagingtype,
            tempunits,
            mintemp,
            maxtemp,
            storageinstructions,
            subscribers: [],
            dateadded: new Date().toISOString(),
            datepublished: null,
            dateinactive: null,
            datemodified: null,
            owner: req.userData.userId,
          };

          trx
            .insert(newProd)
            .into('products')
            .returning('id')
            .then((prodId) => {
              // console.log('prodId: ', prodId);
              return trx('users')
                .where('id', '=', req.userData.userId)
                .update({
                  products: db.raw('array_append(products, ?)', [prodId[0].id]),
                })
                .then(() => {
                  return trx('products').then(async () => {
                    if (req.file) {
                      //save image to S3
                      saveParams = {
                        Bucket: bucketName,
                        Key: newImage,
                        Body: req.file.buffer,
                        ContentType: req.file.mimetype,
                      };
                      const imgSaved = await s3.send(
                        new PutObjectCommand(saveParams)
                      );

                      if (imgSaved.$metadata.httpStatusCode !== 200)
                        throw new HttpError(
                          'Could not update, please try again',
                          500
                        );
                    }
                    res.status(200).json({ updated: existingProd });
                  });
                })
                .catch((err) => next(err));
            })
            .then(trx.commit)
            .catch(trx.rollback);
        })
        .catch((err) => {
          return next(err || new HttpError('Unable to register product', 500));
        });
    })
    .catch((err) => {
      return next(err || new HttpError('Unable to create product', 500));
    });
};

const updateProduct = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError('Invalid inputs passed, please check your data', 422)
    );
  }
  // console.log(req.file);

  const requestedGtin = req.params.pid;
  let existingProd;

  db.select('*')
    .from('products')
    .where('gtin', '=', requestedGtin)
    .then((prod) => {
      if (!prod.length) throw new HttpError('Product not found', 404);
      if (req.userData.userId !== prod[0].owner)
        throw new HttpError(
          'You are not authorized to edit this product.',
          401
        );

      existingProd = prod[0];

      return db
        .transaction((trx) => {
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

          if (name) existingProd.name = name;
          if (description) existingProd.description = description;
          if (category) existingProd.category = category;
          if (height) existingProd.height = height;
          if (width) existingProd.width = width;
          if (depth) existingProd.depth = depth;
          if (weight) existingProd.weight = weight;
          if (packagingType) existingProd.packagingtype = packagingType;
          if (tempUnits) existingProd.tempunits = tempUnits;
          if (minTemp) existingProd.mintemp = minTemp;
          if (maxTemp) existingProd.maxtemp = maxTemp;
          if (storageInstructions)
            existingProd.storageinstructions = storageInstructions;

          let fileType, oldImage, newImage;
          if (req.file) {
            fileType = req.file.mimetype.split('/')[1];
            oldImage = existingProd.image;
            newImage = `${uuid()}.${fileType}`;
            // console.log(newImage);
            existingProd.image = newImage;
            // console.log(existingProd.image);
          }

          // console.log('subs: ', subscribers);
          if (subscribers[0]) {
            const subArray = subscribers.split(',');
            existingProd.subscribers = [];
            subArray.forEach((sub) => existingProd.subscribers.push(+sub));
            existingProd.datepublished = new Date().toISOString();
            // }
          }

          if (!subscribers[0] || !subscribers) {
            existingProd.subscribers = [];
            existingProd.datepublished = null;
          }

          if (dateInactive === new Date(0).toISOString()) {
            existingProd.dateinactive = null;
          } else {
            existingProd.dateinactive = dateInactive;
          }

          existingProd.datemodified = new Date().toISOString();

          // console.log('existingProd: ', existingProd);

          trx('products')
            .where('id', '=', existingProd.id)
            .update({
              name: existingProd.name,
              description: existingProd.description,
              image: existingProd.image,
              category: existingProd.category,
              height: existingProd.height,
              width: existingProd.width,
              depth: existingProd.depth,
              weight: existingProd.weight,
              packagingtype: existingProd.packagingtype,
              tempunits: existingProd.tempunits,
              mintemp: existingProd.mintemp,
              maxtemp: existingProd.maxtemp,
              storageinstructions: existingProd.storageinstructions,
              subscribers: existingProd.subscribers,
              datemodified: existingProd.datemodified,
              datepublished: existingProd.datepublished,
              dateinactive: existingProd.dateinactive,
            })
            .then(() => {
              return trx('products')
                .then(async () => {
                  if (req.file) {
                    //save new image
                    saveParams = {
                      Bucket: bucketName,
                      Key: newImage,
                      Body: req.file.buffer,
                      ContentType: req.file.mimetype,
                    };

                    const imgSaved = await s3.send(
                      new PutObjectCommand(saveParams)
                    );

                    if (imgSaved.$metadata.httpStatusCode !== 200)
                      throw new HttpError(
                        'Could not update, please try again',
                        500
                      );
                  }
                })
                .then(() => {
                  return trx('products')
                    .then(async () => {
                      if (req.file) {
                        //delete old image
                        deleteParams = {
                          Bucket: bucketName,
                          Key: oldImage,
                        };
                        const imgDeleted = await s3.send(
                          new DeleteObjectCommand(deleteParams)
                        );

                        if (imgDeleted.$metadata.httpStatusCode !== 204)
                          throw new HttpError(
                            'Could not update, please try again',
                            500
                          );
                      }
                      res.status(200).json({ updated: existingProd });
                    })
                    .catch((err) => next(err));
                })
                .catch((err) => next(err));
            })
            .then(trx.commit)
            .catch(trx.rollback);
        })
        .catch((err) =>
          next(err || new HttpError('Unable to update product', 500))
        );
    })
    .catch((err) =>
      next(err || new HttpError('Could not update product', 500))
    );
};

const deleteProduct = async (req, res, next) => {
  const requestedGtin = req.params.pid;
  let deleteProd;

  db.select('*')
    .from('products')
    .where('gtin', '=', requestedGtin)
    .then((prod) => {
      if (!prod.length) throw new HttpError('Product not found', 404);
      if (req.userData.userId !== prod[0].owner)
        throw new HttpError(
          'You are not authorized to edit this product.',
          401
        );

      deleteProd = prod[0];

      return db
        .transaction((trx) => {
          trx('products')
            .where('gtin', '=', requestedGtin)
            .del()
            .then(() => {
              return trx('users')
                .where('id', '=', deleteProd.owner)
                .then((user) => {
                  // console.log('prod owner: ', user);
                  const newList = user[0].products.filter(
                    (itemId) => +itemId !== deleteProd.id
                  );
                  // console.log('new list: ', newList);

                  return trx('users')
                    .where('id', '=', deleteProd.owner)
                    .update({ products: newList })
                    .then(() => {
                      return trx('products')
                        .then(async () => {
                          if (deleteProd.image) {
                            //delete old image
                            deleteParams = {
                              Bucket: bucketName,
                              Key: deleteProd.image,
                            };

                            const imgDeleted = await s3.send(
                              new DeleteObjectCommand(deleteParams)
                            );

                            if (imgDeleted.$metadata.httpStatusCode !== 204)
                              throw new HttpError(
                                'Could not update, please try again',
                                500
                              );
                          }

                          res.status(200).json({
                            message: `Product ${requestedGtin} ${deleteProd.name} has been deleted`,
                          });
                        })
                        .catch((err) => next(err));
                    })
                    .catch((err) => next(err));
                })
                .catch(
                  (err) =>
                    err ||
                    next(
                      new HttpError('Could not perform product deletion', 500)
                    )
                );
            })
            .then(trx.commit)
            .catch(trx.rollback);
        })
        .catch((err) =>
          next(err || new HttpError('Unable to delete product', 500))
        );
    })
    .catch((err) =>
      next(err || new HttpError('Unable to delete product', 500))
    );
};

exports.getProductById = getProductById;
exports.getProductsByUserId = getProductsByUserId;
exports.createProduct = createProduct;
exports.updateProduct = updateProduct;
exports.deleteProduct = deleteProduct;
