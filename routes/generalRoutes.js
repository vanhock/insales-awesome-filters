const axios = require("axios");
const express = require("express");
const path = require("path");
const { checkAuth, inSalesApi, throttle } = require("../helpers");

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
      const { data } = await inSalesApi.listThemes({
        token: res.user.password,
        url: res.user.shop
      });
      res.send(
        data.map(theme => ({
          ...theme,
          installed:
            (!!res.user["installedThemeVersion"] &&
              res.user["installedThemeVersion"][theme.id]) ||
            false
        }))
      );
    } catch (e) {
      console.log(e);
    }
  });

  app.post("/uninstall-from-theme", withAuth, async (req, res) => {
    const themeId = req.query["themeId"];
    let installedAssets = await getInstalledAssets(req, res);
    let removedAssets = 0;
    if (installedAssets.length) {
      installedAssets.forEach(id => {
        setTimeout(async () => {
          await inSalesApi.removeAsset({
            token: res.user.password,
            url: res.user.shop,
            theme: themeId,
            assetId: id
          });
          ++removedAssets;
          if (removedAssets === installedAssets.length) {
            const response = await app.locals.collection.findOne({
              shop: res.user.shop
            });

            const installedThemeVersion =
              response["installedThemeVersion"] || {};
            delete installedThemeVersion[themeId];

            await app.locals.collection.updateOne(
              { shop: res.user.shop },
              {
                $set: {
                  installedThemeVersion: installedThemeVersion
                }
              }
            );
            return res.status(200);
          }
        }, 1000);
      });
    } else {
      return res.status(400).send("Нет ресурсов для удаления");
    }
  });

  app.post("/install-to-theme", withAuth, async (req, res) => {
    const assets = require("../assets");
    const assetBaseUrl = process.env.CDN_URL;
    const themeId = req.query["themeId"];
    if (!themeId) {
      return res.status(400).send("Не передан theme_id");
    }
    const cdn = await axios.get(assetBaseUrl + "/package.json");
    const thisInstalledThemeVersion =
      (!!res.user["installedThemeVersion"] &&
        res.user["installedThemeVersion"][themeId]) ||
      0;
    let installedAssets = await getInstalledAssets(req, res);
    if (
      cdn.data.version === thisInstalledThemeVersion &&
      installedAssets.length === assets.length
    ) {
      return res.status(400).send("Установлена последняя версия");
    }
    removeInstalledAssets(req, res, installedAssets, () => {
      uploadAssets()
    });
    const result = {
      report: {},
      success: false
    };
    const success = [];
    function uploadAssets() {
      assets.forEach(asset => {
        setTimeout(() => {
          inSalesApi
            .uploadAsset({
              token: res.user.password,
              url: res.user.shop,
              theme: themeId,
              asset: {
                name: asset.src,
                src: `${assetBaseUrl}@${cdn.data.version}/dist/${asset.src}`,
                type: asset.type
              }
            })
            .then(({ data }) => {
              result.report[data.inner_file_name] = "ok";
              success.push(data.inner_file_name);
              if (success.length === assets.length) {
                result.success = true;
                app.locals.collection
                  .findOne({ shop: res.user.shop })
                  .then(response => {
                    const installedThemeVersion =
                      response["installedThemeVersion"] || {};
                    installedThemeVersion[themeId] = cdn.data.version;
                    app.locals.collection.updateOne(
                      { shop: res.user.shop },
                      {
                        $set: {
                          installedThemeVersion: installedThemeVersion
                        }
                      }
                    );
                  });
              }
              if (Object.keys(result.report).length === assets.length) {
                return res.status(200).send(result);
              }
            })
            .catch(({ response }) => {
              if (response.statusCode !== 422) {
                return res.status(500);
              }
              result.report[response.options.body.asset.name] = getErrors(
                response
              );
              if (Object.keys(result.report).length === assets.length) {
                return res.status(200).send(result);
              }
            });
        }, 1000);
      });
    }
  });
};

function getErrors(response) {
  let errors = "";
  for (let error in response.error) {
    if (response.error.hasOwnProperty(error)) {
      const delimiter = errors.length ? ", " : "";
      response.error[error].forEach(e => (errors += `${delimiter}${e}`));
    }
  }
  return errors;
}

async function getInstalledAssets(req, res) {
  try {
    const { data } = await inSalesApi.listAsset({
      token: res.user.password,
      url: res.user.shop,
      theme: req.query["themeId"]
    });
    return await data
      .filter(({ inner_file_name }) => inner_file_name.includes("af_"))
      .map(({ id }) => id);
  } catch ({ response }) {
    if (response.statusCode !== 422) {
      return res.status(500);
    }
    res.status(400).send(getErrors(response));
  }
}

function removeInstalledAssets(req, res, installedAssets, cb) {
  let removedAssets = 0;
  if (installedAssets.length) {
    installedAssets.forEach(id => {
      setTimeout(() => {
        inSalesApi
          .removeAsset({
            token: res.user.password,
            url: res.user.shop,
            theme: req.query["themeId"],
            assetId: id
          })
          .then(() => {
            ++removedAssets;
            if (removedAssets === installedAssets.length) {
              cb();
            }
          });
      }, 1000);
    });
  } else {
    cb();
  }
}
