function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!allowedRoles.includes(req.user.roleName)) {
      return res.status(403).json({ error: `Forbidden: requires one of [${allowedRoles.join(", ")}]` });
    }
    next();
  };
}
module.exports = { requireRole };
