const { checkAuth } = require("../helpers");
const crypto = require("crypto");
module.exports = function(app) {
  const { checkPayment } = require("../controllers/billingController")(app);

  app.get("/login", async (req, res) => {
    const { shop, user_id } = req.query;
    const appHost = req.get("host");
    const af_token = req.cookies["af_token"];
    if (!af_token) {
      return login();
    }
    try {
      const account = await checkAuth(app, af_token);
      if (af_token === account.af_token) {
        return res.redirect("/");
      } else {
        return login();
      }
    } catch (e) {
      return res.redirect("/#/unauthorized");
    }

    async function login() {
      const authVerifyToken = crypto.randomBytes(20).toString("hex");
      try {
        await app.locals.collection.findOneAndUpdate(
          {
            shop: shop
          },
          {
            $set: {
              user_id: user_id,
              auth_verify_token: authVerifyToken
            }
          }
        );
        const urlForRedirect = `https://${shop}/admin/applications/${process.env.APP_ID}/login?token=${authVerifyToken}&login=https://${appHost}/autologin`;
        return res.redirect(urlForRedirect);
      } catch (e) {
        console.log(e);
      }
    }
  });

  app.get("/autologin", async (req, res) => {
    const {
      token3,
      user_email,
      user_name,
      user_id,
      email_confirmed
    } = req.query;
    if (!token3) {
      res.clearCookie("af_token");
      return res.redirect("/#/unauthorized");
    }
    const user = await app.locals.collection.findOne({ user_id: user_id });
    if (!user) {
      res.clearCookie("af_token");
      return res.redirect("/#/unauthorized");
    }
    const isAuthValid =
      crypto
        .createHash("md5")
        .update(
          user.auth_verify_token +
            user_email +
            user_name +
            user_id +
            email_confirmed +
            user.password
        )
        .digest("hex") === token3;
    if (isAuthValid) {
      res.user = user;
      const af_token = crypto.randomBytes(20).toString("hex");
      await app.locals.collection.findOneAndUpdate(
        { user_id: user_id },
        { $set: { af_token: af_token } }
      );
      /** First of all, need to check app paid or not **/
      try {
        const { redirectUrl, status } = await checkPayment(req, res);
        if (redirectUrl) {
          return res.redirect(redirectUrl);
        }
        if (status === "accepted") {
          res
            .cookie("af_token", af_token, {
              maxAge: 900000,
              httpOnly: true
            })
            .redirect("/");
        }
      } catch (e) {
        return res.redirect("/#/unauthorized");
      }
    } else {
      res.clearCookie("af_token");
      return res.redirect("/#/unauthorized");
    }
  });
};
