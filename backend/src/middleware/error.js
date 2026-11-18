const { ZodError } = require('zod');

exports.notFound = (req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });

// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    const errors = {};
    err.issues.forEach((i) => { errors[i.path.join('.') || '_'] = i.message; });
    return res.status(400).json({ message: 'Validation failed', errors });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    return res.status(409).json({ message: `${field} already exists`, errors: { [field]: 'Already in use' } });
  }
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id' });
  if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'File too large (max 5 MB)' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ message: status >= 500 ? 'Internal server error' : err.message, code: err.code });
};
