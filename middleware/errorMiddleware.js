const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;

  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = 'Resource not found';
  }
   if (err.name === 'ValidationError') {
       statusCode = 400;
       const errors = Object.values(err.errors).map(el => el.message);
       message = `Validation Error: ${errors.join(', ')}`;
   }
    if (err.code === 11000) {
       statusCode = 400;
       message = `Duplicate field value entered: ${Object.keys(err.keyValue)} already exists.`;
    }


  console.error("ERROR STACK: ", err.stack);

  if (req.accepts('html')) {
      res.status(statusCode).render('error', {
          title: 'Error',
          message: message,
          stack: process.env.NODE_ENV === 'development' ? err.stack : null,
          statusCode: statusCode
      });
  } else {
      res.status(statusCode).json({
          message: message,
          stack: process.env.NODE_ENV === 'development' ? err.stack : null,
      });
  }
};

module.exports = { notFound, errorHandler };
