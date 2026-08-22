module.exports = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Cet espace est réservé aux administrateurs.' });
  }
  next();
};
