function notFound(req, res, next) {
  const error = new Error(`Not found - ${req.originalUrl}`);
  res.status(404);
  next(error);
}

function errorHandler(error, req, res, next) {
  let statusCode = error.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);
  let message = error.message || "Server error";

  if (error.code === 11000) {
    statusCode = 409;
    message = "Duplicate value already exists";
  }

  if (error.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(error.errors)
      .map((validationError) => validationError.message)
      .join(", ");
  }

  const response = {
    message
  };

  if (error.details) {
    response.details = error.details;
  }

  res.status(statusCode).json(response);
}

module.exports = {
  notFound,
  errorHandler
};
