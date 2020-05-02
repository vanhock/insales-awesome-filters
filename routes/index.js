const installRoutes = require("./installRoutes");
const loginRoutes = require("./loginRoutes");
const generalRoutes = require("./generalRoutes");
const billingRoutes = require("./billingRoutes");
module.exports = function(app) {
  installRoutes(app);
  loginRoutes(app);
  generalRoutes(app);
  billingRoutes(app);
};
