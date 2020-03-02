const axios = require("axios");
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
      .then(user => {
        if (!user) {
          return reject("Authentication failed! User does not exist!");
        }
        return resolve(user);
      })
      .catch(() => {
        return reject("Authentication failed!");
      });
  });
};

const inSalesApi = async function(
  password,
  shop,
  url,
  data = {},
  method = "GET"
) {
  try {
    return await axios.request({
      method: method,
      url: `http://${process.env.APP_ID}:${password}@${shop}/admin/${url}.json`,
      responseType: "json",
      data: data
    });
  } catch (e) {
    throw new Error(e);
  }
};

module.exports = { getPassword, checkAuth, inSalesApi };
