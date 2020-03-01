const crypto = require("crypto");
const getPassword = function(token) {
  const data = token + process.env.APP_SECRET;
  return crypto
    .createHash("md5")
    .update(data)
    .digest("hex");
};

const checkAuth = function(app, token) {
  return new Promise((resolve, reject) => {
    app.locals.collection
      .findOne({
        af_token: token
      })
      .then(result => {
        return resolve(result);
      })
      .catch(() => {
        return reject("Authentication failed!");
      });
  });
};

module.exports = { getPassword, checkAuth };
