const installRoutes = require("./installRoutes");
const loginRoutes = require("./loginRoutes");
module.exports = function(app) {
  installRoutes(app);
  loginRoutes(app);
};
