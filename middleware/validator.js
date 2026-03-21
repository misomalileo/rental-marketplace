const { body, validationResult } = require("express-validator");

// Registration validation
const validateRegister = [
  body("name").notEmpty().withMessage("Name is required").trim(),
  body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("confirmPassword").custom((value, { req }) => value === req.body.password)
    .withMessage("Passwords do not match"),
  body("phone").optional().isString().withMessage("Valid phone number required"),
];

// Login validation
const validateLogin = [
  body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
  body("password").notEmpty().withMessage("Password required"),
];

// House creation/update validation
const validateHouse = [
  body("name").notEmpty().withMessage("House name required").trim(),
  body("location").notEmpty().withMessage("Location required").trim(),
  body("price").isNumeric().withMessage("Price must be a number"),
  body("phone").optional().isString().withMessage("Valid phone number required"),
  body("type").optional().isIn(["Apartment", "House", "Room", "Hostel", "Office"]),
  body("condition").optional().isIn(["Good", "Fair", "Needs renovation"]),
  body("bedrooms").optional().isInt({ min: 0 }),
  body("bathrooms").optional().isInt({ min: 0 }),
  body("vacancies").optional().isInt({ min: 0 }),
];

// Password reset validation
const validateResetPassword = [
  body("token").notEmpty().withMessage("Token required"),
  body("newPassword").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
];

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateHouse,
  validateResetPassword,
  handleValidationErrors,
};