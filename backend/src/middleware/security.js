// Strip Mongo operators ($, .) from user-supplied keys to block NoSQL injection.
function clean(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const k of Object.keys(obj)) {
    if (k.startsWith('$') || k.includes('.')) { delete obj[k]; continue; }
    clean(obj[k]);
  }
  return obj;
}
exports.mongoSanitize = (req, _res, next) => {
  clean(req.body); clean(req.params);
  if (req.query) clean(req.query);
  next();
};
