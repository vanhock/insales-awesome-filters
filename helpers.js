const crypto = require("crypto");
const setPassword = function(token) {
  const data = token + process.env.APP_SECRET;
  return crypto
    .createHash("md5")
    .update(data)
    .digest("hex");
};

const checkAuth = async (app, token) => {
  const errorMessage =
    "Ошибка авторизации. Пожалуйста, зайдите в приложение AwesomeFilters через бек-офис вашего сайта";
  try {
    const user = await app.locals.collection.findOne({
      af_token: token
    });
    if (!user) {
      return Promise.reject(errorMessage);
    }
    return user;
  } catch (e) {
    return Promise.reject(errorMessage);
  }
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

const filterObject = function(object, includes, except) {
  return Object.keys(object)
    .filter(key =>
      except && except.length ? !except.includes(key) : includes.includes(key)
    )
    .reduce((obj, key) => {
      obj[key] = object[key];
      return obj;
    }, {});
};

const insales = require("insales");
const inSalesApi = insales({
  id: process.env.APP_ID,
  secret: process.env.APP_SECRET
});

const delay = ms => new Promise(r => setTimeout(r, ms));

module.exports = {
  setPassword,
  checkAuth,
  inSalesApi,
  throttle,
  delay,
  filterObject
};
