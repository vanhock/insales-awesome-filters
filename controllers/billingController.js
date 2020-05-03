const { inSalesApi } = require("../helpers");
module.exports = function(app) {
  const createBill = async (req, res) => {
    const appHost = req.get("host");
    try {
      const { data } = await inSalesApi.createCharge({
        token: res.user.password,
        url: res.user.shop,
        charge: {
          name: "Awesome Filters",
          price: process.env.APP_PRICE || "2700.0",
          test: process.env.APP_TEST_PAYMENT,
          return_url: `https://${appHost}/check_payment_url/%id_in_my_application%`
        }
      });
      if (!data) {
        return Promise.reject("Payment failed");
      }
      const confirmationUrl = data["confirmation_url"];
      const status = data["status"];
      await app.locals.collection.updateOne(
        { shop: res.user.shop },
        {
          $set: {
            billStatus: status,
            billId: data.id,
            paymentConfirmationUrl: confirmationUrl
          }
        }
      );
      return confirmationUrl;
    } catch (e) {
      console.log(e);
      return Promise.reject("Payment failed");
    }
  };

  const removeBill = async (req, res) => {
    const billStatus = res.user.billStatus;
    const billId = res.user.billId;
    if (billStatus === "pending") {
      try {
        const { data } = await inSalesApi.declineCharge({
          token: res.user.password,
          url: res.user.shop,
          chargeid: billId
        });
        if (data.status === "pending" || data.status === "declined") {
          await app.locals.collection.updateOne(
            { shop: res.user.shop },
            {
              $set: {
                billStatus: "not_paid",
                billId: "",
                paymentConfirmationUrl: ""
              }
            }
          );
        }
      } catch (e) {
        console.log(e);
      }
    }
  };

  const confirmPayment = async (req, res) => {
    const billId = parseInt(req.params.id);
    try {
      res.user = await app.locals.collection.findOne({ billId: billId });
    } catch (e) {
      console.log(e);
    }
    if (!res.user) {
      return res
        .status(500)
        .send("Счет на оплату не найден, переустановите приложение");
    }
    if (!billId || res.user.billId !== billId) {
      return res.redirect(`https://${res.user.shop}/admin2/applications/`);
    }
    const urlForRedirect = await checkBillStatus(req, res);
    if (urlForRedirect) return res.redirect(urlForRedirect);
  };

  const checkPayment = async (req, res) => {
    const billStatus = res.user.billStatus;
    if (!billStatus || billStatus === "not_paid" || billStatus === "declined") {
      return await createBill(req, res);
    } else if (billStatus === "pending") {
      return checkBillStatus(req, res);
    } else if (billStatus === "accepted") {
      // do nothing
    } else {
      return `https://${res.user.shop}/admin2/applications/`;
    }
  };

  return {
    createBill,
    removeBill,
    confirmPayment,
    checkPayment
  };

  async function checkBillStatus(req, res) {
    try {
      const { data } = await inSalesApi.getCharge({
        token: res.user.password,
        url: res.user.shop,
        chargeid: res.user.billId
      });
      if (data.status) {
        await app.locals.collection.updateOne(
          { shop: res.user.shop },
          {
            $set: {
              billStatus: data.status
            }
          }
        );
      }
      if (data.status === "declined") {
        return `https://${res.user.shop}/admin2/applications`;
      }
      if (data.status === "accepted") {
        res.cookie("af_token", res.user["af_token"], {
          maxAge: 900000,
          httpOnly: true
        });
        return "/";
      } else {
        return res.user.paymentConfirmationUrl;
      }
    } catch (e) {
      console.log(e);
    }
  }
};
