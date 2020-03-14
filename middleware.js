const withAuth = function(req, res, next) {
  req.app.locals.collection
    .findOne({
      af_token: req.cookies["af_token"]
    })
    .then(user => {
      if (!user) {
        res.clearCookie("af_token");
        return res
          .status(401)
          .send("Authentication failed! User does not exist!");
      }
      res.user = user;
      return next();
    })
    .catch(() => {
      res.clearCookie("af_token");
      return res
        .status(401)
        .send("Authentication failed! User does not exist!");
    });
};

module.exports = withAuth;
