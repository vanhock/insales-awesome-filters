const { inSalesApi } = require("../helpers");
module.exports = function(app) {
  const createBill = async (req, res) => {
    const appHost = req.get("host");
    const billId = res.user.id;
    try {
      const response = await inSalesApi.createCharge({
        token: res.user.password,
        url: res.user.shop,
        charge: {
          "application-charge": {
            name: "Awesome Filters",
            price: process.env.APP_PRICE || "2700.0",
            test: process.env.APP_TEST_PAYMENT,
            "return-url": `https://${appHost}/check_payment_url/p${billId}`
          }
        }
      });
      const confirmationUrl =
        response["application-charge"]["confirmation-url"];
      const status = response["application-charge"]["status"];
      await app.locals.collection.updateOne(
        { shop: res.user.shop },
        {
          $set: {
            billStatus: status,
            billId: billId,
            paymentConfirmationUrl: confirmationUrl
          }
        }
      );
      return res.redirect(confirmationUrl);
    } catch (e) {
      console.log(e);
    }
  };

  const removeBill = async (req, res) => {
    const billStatus = res.user.billStatus;
    const billId = res.user.billId;
    if (billStatus === "pending") {
      try {
        await inSalesApi.declineCharge({
          token: res.user.password,
          url: res.user.shop,
          chargeid: billId
        });
      } catch (e) {
        console.log(e);
      }
    }
  };

  const confirmPayment = async (req, res) => {
    const appHost = req.get("host");
    const billId = req.originalUrl.replace(
      `https://${appHost}/check_payment_url/`,
      ""
    );
    if (!billId) {
      return;
    }
    try {
      const response = await inSalesApi.getCharge({
        token: res.user.password,
        url: res.user.shop,
        chargeid: billId
      });
      const charge = response["application-charge"];
      if (charge.status === "accepted") {
        await app.locals.collection.updateOne(
          { shop: res.user.shop },
          {
            $set: {
              billStatus: charge.status
            }
          }
        );
        return res.redirect("/");
      } else {
        return res.redirect(res.user.paymentConfirmationUrl)
      }
    } catch (e) {
      console.log(e);
    }
  };

  const checkPayment = async (req, res) => {
    const billStatus = res.user.billStatus;
    if (!billStatus || billStatus === "not_paid") {
      return createBill(req, res);
    }
    if (billStatus === "pending") {
      return res.redirect(res.user.paymentConfirmationUrl);
    }
    if (billStatus === "accepted") {
      // do nothing
    }
  };

  return {
    createBill,
    removeBill,
    confirmPayment,
    checkPayment
  };
};
