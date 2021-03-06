const withAuth = require("../middleware");
const { setPassword } = require("../helpers");
module.exports = function(app) {
  const { uninstallFromTheme } = require("../controllers/themesController")(
    app
  );
  const { removeBill } = require("../controllers/billingController")(app);
  app.get("/install", async (req, res) => {
    const { shop, token, insales_id } = req.query;
    if (!shop || !token || !insales_id) {
      return res.status(400).send("Has no required params!");
    }
    try {
      const account = await app.locals.collection.findOne({ shop: shop });
      if (account && account.insales_id === insales_id) {
        return restore();
      }
    } catch (e) {
      console.log(e);
    }

    await install();

    async function restore() {
      try {
        const { error } = await app.locals.collection.findOneAndUpdate(
          { shop: shop },
          { $set: { password: setPassword(token), insales_id: insales_id } }
        );
        if (error) return console.log(error);
        return res.status(200).send("Ok!");
      } catch (e) {
        res.status(500).send("Something wrong on the server!");
      }
    }
    async function install() {
      try {
        const { error } = await app.locals.collection.insertOne({
          shop: shop,
          password: setPassword(token),
          insales_id: insales_id
        });
        if (error) return console.log(error);
        return res.status(200).send("Ok!");
      } catch (e) {
        res.status(500).send("Something wrong on the server!");
      }
    }
  });

  app.get("/uninstall", async (req, res) => {
    const { shop, token, insales_id } = req.query;
    if (!shop || !token || !insales_id) {
      return res.status(400).send("Has no required params!");
    }
    const account = await app.locals.collection.findOne({
      shop: shop,
      insales_id: insales_id,
      password: token
    });
    if (!account) {
      return res.status(401).send("Нет доступа для данной операции");
    }

    /** Remove build if bill not paid **/
    removeBill(req, res);

    res.user = account;
    const installedThemes = account.installedThemeVersion;
    const removedThemes = [];

    if (installedThemes && Object.keys(installedThemes).length) {
      for (let key in installedThemes) {
        if (installedThemes.hasOwnProperty(key)) {
          req.query.themeId = key;
          try {
            const theme = await uninstallFromTheme(req, res);
            removedThemes.push(theme);
            if (removedThemes.length === Object.keys(installedThemes).length) {
              return removeFromDatabase();
            }
          } catch (e) {
            console.log(e.message || e);
          }
        }
      }
    }
    await removeFromDatabase();
    res.clearCookie("af_token");
    res.status(200).send("Приложение удалено!");
    async function removeFromDatabase() {
      try {
        return await app.locals.collection.findOneAndUpdate(
          {
            shop: account.shop
          },
          {
            $unset: {
              installedThemeVersion: "",
              af_token: "",
              user_id: "",
              auth_verify_token: "",
              password: ""
            }
          }
        );
      } catch (e) {
        res.status(400).send("Что-то пошло не так");
      }
    }
  });
};
