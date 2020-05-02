module.exports = function(app) {
  const { confirmPayment } = require("../controllers/billingController")(app);
  app.get("/check_payment_url", (req, res) => {
    confirmPayment(req, res);
  });
};
