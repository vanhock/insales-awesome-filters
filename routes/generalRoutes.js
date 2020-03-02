const express = require("express");
const path = require("path");
const { checkAuth, inSalesApi } = require("../helpers");
const withAuth = require("../middleware");
module.exports = function(app) {
  app.get("/", (req, res) => {
    const af_token = req.cookies["af_token"];
    checkAuth(app, af_token)
      .then(() => {
        res.sendFile(path.join(__basedir + "/admin/dist/index.html"));
        return app.use(express.static(path.join(__basedir, "admin/dist/")));
      })
      .catch(() => {
        return res
          .status(401)
          .send(
            "Авторизуйтесь в бек-офисе вашего сайта для входа в приложение"
          );
      });
  });

  app.get("/get-user", withAuth, (req, res) => {
    if (res.user) return res.status(200).send(res.user);
    res
      .status(401)
      .send("Авторизуйтесь в бек-офисе вашего сайта для входа в приложение");
  });

  app.get("/get-themes", withAuth, async (req, res) => {
    try {
      const { data } = await inSalesApi(
        res.user.password,
        res.user.shop,
        "themes"
      );
      res.send(data);
    } catch (e) {
      console.log(e);
    }
  });

  app.get("/set-up", withAuth, (req, res) => {
    const { theme_id } = req.query;
    if (!theme_id) {
      return res.status(400).send("Не передан theme_id");
    }
  });
};
