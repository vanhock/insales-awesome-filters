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
        .insertOne({
          shop: shop,
          user_id: user_id,
          auth_verify_token: authVerifyToken
        })
        .then(() => {
          return res.redirect(
            `https://${shop}/admin/application/${
              process.env.APP_ID
            }/login?token=${authVerifyToken}&login=${appHost}/autologin`
          );
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
    app.locals.collection.findOneAndDelete({ user_id: user_id }).then(user => {
      const isAuthValid =
        crypto
          .createHash("md5")
          .update(
            user.value.auth_verify_token +
              user_email +
              user_name +
              user_id +
              email_confirmed
          )
          .digest("hex") === token3;
      if (isAuthValid) {
        const af_token = crypto.randomBytes(20).toString("hex");
        app.locals.collection
          .findOneAndUpdate({ shop: user.value.shop }, { af_token: af_token })
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

  app.get("/check-auth", (req, res) => {
    const af_token = req.cookies["af_token"];
    checkAuth(app, af_token)
      .then(account => {
        if (af_token === account.af_token) {
          return res.status(200);
        }
        return res
          .status(401)
          .send(
            "Авторизуйтесь в бек-офисе вашего сайта для входа в приложение"
          );
      })
      .catch(() => {
        return res
          .status(401)
          .send(
            "Авторизуйтесь в бек-офисе вашего сайта для входа в приложение"
          );
      });
  });
};
