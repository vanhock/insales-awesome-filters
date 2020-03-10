const withAuth = require("../middleware");
const { getPassword } = require("../helpers");
const { uninstallFromTheme } = require("../controllers/themesController");
module.exports = function(app) {
  app.get("/install", (req, res) => {
    const { shop, token, insales_id } = req.query;
    if (!shop || !token || !insales_id) {
      return res.status(400).send("Has no required params!");
    }
    app.locals.collection.findOne(
      { shop: shop, insales_id: insales_id },
      function(err, account) {
        if (account) return res.status(400).send("Already installed!");
      }
    );
    app.locals.collection
      .insertOne({
        shop: shop,
        password: getPassword(token),
        insales_id: insales_id
      })
      .then(({ result, error }) => {
        if (error) return console.log(error);
        return res.status(200).send("Ok!");
      })
      .catch(() => {
        return res.status(500).send("Something wrong on the server!");
      });
  });

  app.get("/uninstall", withAuth, async (req, res) => {
    const installedThemes = res.user.installedThemeVersion;
    if (installedThemes && Object.keys(installedThemes).length) {
      for (let key in installedThemes) {
        if (installedThemes.hasOwnProperty(key)) {
          req.query.themeId = key;
          try {
            await uninstallFromTheme(req, res);
          } catch (e) {
            console.log(e.message || e);
          }
        }
      }
    }
    try {
      res.locals.collection.findOneAndUpdate(
        {
          shop: res.user.shop
        },
        {
          $unset: [
            "installedThemeVersion",
            "version",
            "af_token",
            "user_id",
            "auth_verify_token",
            "insales_id",
            "password"
          ]
        }
      );
      return res.status(200);
    } catch (e) {
      res.status(400).send("Что-то пошло не так");
    }
  });
};
