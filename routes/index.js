const installRoutes = require("./installRoutes");
const loginRoutes = require("./loginRoutes");
const generalRoutes = require("./generalRoutes");
module.exports = function(app) {
  installRoutes(app);
  loginRoutes(app);
  generalRoutes(app);
};
