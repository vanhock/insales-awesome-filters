const withAuth = function(req, res, next) {
  if (!req.cookies["af_token"]) {
    onAuthFail();
  }
  req.app.locals.collection
    .findOne({
      af_token: req.cookies["af_token"]
    })
    .then(user => {
      if (!user) {
        onAuthFail();
      }
      res.user = user;
      return next();
    })
    .catch(() => {
      onAuthFail();
    });

  function onAuthFail() {
    res.clearCookie("af_token");
    return res.status(401).send("Authentication failed! User does not exist!");
  }
};

module.exports = withAuth;
