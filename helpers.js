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
          return reject("Ошибка авторизации, зайдите в приложение через бек-офис сайта");
        }
        return resolve(user);
      })
      .catch(() => {
        return reject("Authentication failed!");
      });
  });
};

const throttle = function(func, wait = 100) {
  let timer = null;
  return function(...args) {
    if (timer === null) {
      timer = setTimeout(() => {
        func.apply(this, args);
        timer = null;
      }, wait);
    }
  };
};

const insales = require("insales");
const inSalesApi = insales({
  id: process.env.APP_ID,
  secret: process.env.APP_SECRET
});

module.exports = { getPassword, checkAuth, inSalesApi, throttle };
