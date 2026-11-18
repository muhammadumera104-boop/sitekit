const { AuditLog } = require('../models');
const { clientIp } = require('../utils/helpers');

exports.audit = async (req, action, { tenantId, userId, details } = {}) => {
  try {
    await AuditLog.create({
      action,
      details,
      userId: userId || req.user?._id,
      tenantId: tenantId !== undefined ? tenantId : req.tenantId || req.user?.tenantId || null,
      ip: clientIp(req),
    });
  } catch (e) { console.error('audit failed', e.message); }
};
