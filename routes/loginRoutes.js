const { checkAuth } = require("../helpers");

const crypto = require("crypto");
module.exports = function(app) {
  app.get("/login", (req, res) => {
    const { shop, user_id } = req.query;
    const appHost = req.get("host");
    const af_token = req.cookies["af_token"];
    if (!af_token) {
      return login();
    }
    checkAuth(app, af_token)
      .then(account => {
        if (af_token === account.af_token) {
          return res.redirect("/");
        } else {
          return login();
        }
      })
      .catch(error => {
        return res.status(500).send(error);
      });
    function login() {
      const authVerifyToken = crypto.randomBytes(20).toString("hex");
      app.locals.collection
        .findOneAndUpdate(
          {
            shop: shop
          },
          {
            $set: {
              user_id: user_id,
              auth_verify_token: authVerifyToken
            }
          }
        )
        .then(() => {
          const urlForRedirect = `https://${shop}/admin/applications/${
            process.env.APP_ID
          }/login?token=${authVerifyToken}&login=https://${appHost}/autologin`;
          return res.redirect(urlForRedirect);
        });
    }
  });

  app.get("/autologin", (req, res) => {
    const {
      token3,
      user_email,
      user_name,
      user_id,
      email_confirmed
    } = req.query;
    if (!token3) {
      return res.status(500).send("Have no required params!");
    }
    app.locals.collection.findOne({ user_id: user_id }).then(user => {
      if (!user) {
        return res
          .status(400)
          .send("Ошибка авторизации, переустановите приложение");
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
        const af_token = crypto.randomBytes(20).toString("hex");
        app.locals.collection
          .findOneAndUpdate(
            { user_id: user_id },
            { $set: { af_token: af_token } }
          )
          .then(() => {
            res.cookie("af_token", af_token, {
              maxAge: 900000,
              httpOnly: true
            });
            res.redirect("/");
          });
      } else {
        res.status(400).send("Ошибка авторизации, переустановите приложение");
      }
    });
  });
};
