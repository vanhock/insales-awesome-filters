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
        data.filter(theme => !theme["is_published"]).map(theme => ({
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
    const assetsList = await getThemeAssets(req, res);
    let installedAssets = getInstalledAssets(assetsList);
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
    const collectionFolder = req.query["template"];
    if (!themeId) {
      return res.status(400).send("Не передан theme_id");
    }
    let cdn;
    try {
      cdn = await axios.get(assetBaseUrl + "/package.json");
    } catch(e) {
      console.log(e)
    }
    const thisInstalledThemeVersion =
      (!!res.user["installedThemeVersion"] &&
        res.user["installedThemeVersion"][themeId]) ||
      0;
    const assetsList = await getThemeAssets(req, res);
    let installedAssets = getInstalledAssets(assetsList);

    if (
      cdn.data.version === thisInstalledThemeVersion &&
      installedAssets.length === assets.length
    ) {
      return res.status(400).send("Установлена последняя версия");
    }

    if(!thisInstalledThemeVersion) {
      /* If App didn't install on this theme yet */
      let layoutAssetId;
      assetsList.some(asset => {
        if(asset["inner_file_name"] === "layouts.layout.liquid") {
          return layoutAssetId = asset.id
        }
      });
      await includeRecources(layoutAssetId);
    }
    
    if (installedAssets.length) {
      removeInstalledAssets(req, res, installedAssets, () => {
        uploadAssets();
      });
    } else {
      uploadAssets();
    }

    async function uploadAssets() {
      const result = {
        report: {},
        success: false
      };
      let replace = false;
      if(collectionFolder) {
        let templateAssetId;
        assetsList.some(asset => {
          if(asset["inner_file_name"] === "collection.liquid") {
            return templateAssetId = asset.id
          }
        });
        replace = await replaceCollectionTemplate(templateAssetId, collectionFolder);
      } else {
        replace = true;
      }
      if(replace) {
        const success = [];
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
    }

    async function includeRecources(layoutAssetId) {
      const layout = await getThemeAsset(req, res, layoutAssetId);
      let replacedContent = layout.content;
      if(!replacedContent.includes("{% include 'af_assets_top' %}")) {
        replacedContent = replacedContent.replace("</head>", "{% include 'af_assets_top' %}</head>");
      }
      if(!replacedContent.includes("{% include 'af_assets_bottom' %}")) {
        replacedContent = replacedContent.replace("</body>", "{% include 'af_assets_bottom' %}</body>");
      }
      try {
        const {data} = await inSalesApi.editAsset({
          token: res.user.password,
          url: res.user.shop,
          theme: req.query["themeId"],
          assetId: layoutAssetId,
          asset: {
            content: replacedContent
          }
        });
        return data
      } catch(e) {
        console.log(e)
      }
    }

    async function replaceCollectionTemplate(assetId, folder) {
      const moment = require("moment");
      const oldCollection = await getThemeAsset(req, res, assetId);
      let newCollection;
      try {
        newCollection = await axios.get(`${assetBaseUrl}@${cdn.data.version}/dist/template/${folder}/collection.liquid`);
      } catch (e) {
        console.log(e)
      }
      try {
        await inSalesApi.uploadAsset({
          token: res.user.password,
          url: res.user.shop,
          theme: req.query["themeId"],
          asset: {
            name: `backup-${moment().format('YYYY-MM-D-HH-mm')}.collection.liquid`,
            content: oldCollection.content,
            type: "Asset::Template"
          }
        })
      } catch (e) {
        console.log(e)
      }
      
      try {
        const result = await inSalesApi.editAsset({
          token: res.user.password,
          url: res.user.shop,
          theme: req.query["themeId"],
          assetId: assetId,
          asset: {
            content: newCollection.data
          }
        });
        return result;
      } catch (e) {
        console.log(e)
      }
    }
  });

  app.get("/backup-theme", withAuth, async (req, res) => {
    /**
     * Backup theme if app not installed yet
     */
    const { themeId } = req.query;
    const assets = await getThemeAssets(req, res);
    backupTheme(req, res, assets, themeId, data => {
      res.status(200).send(data);
    });
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

function getInstalledAssets(assets) {
  return assets
    .filter(({ inner_file_name }) => inner_file_name.includes("af_"))
    .map(({ id }) => id);
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

function backupTheme(req, res, assets, themeId, cb) {
  const AdmZip = require("adm-zip");
  const zip = new AdmZip();
  const assetsBaseUrl = "https://assets.insales.ru";
  const folders = {
    configuration: "config",
    media: "media",
    snippet: "snippets",
    template: "templates"
  };
  const backup = [];
  assets.forEach(async (asset, index) => {
    const typeFolder = folders[asset.type.replace("Asset::", "").toLowerCase()];
    const url = `${assetsBaseUrl}${asset["asset_url"]}`;
    try {
      const urlResponse = await axios.get(url);
      const { data } = urlResponse;
      const size =
        Array.isArray(data) || typeof data === "string"
          ? data.length
          : typeof data === "object"
            ? Object.keys(data).length
            : 0;
      try {
        backup.push(asset);
        zip.addFile(
          `${typeFolder}/${asset["human_readable_name"]}`,
          Buffer.alloc(size, data)
        );
      } catch (e) {
        console.log(e);
      }
      if (backup.length === assets.length) {
        return cb(zip.toBuffer());
      }
    } catch (e) {
      setTimeout(async () => {
        const data = await getThemeAsset(req, res, asset.id);
        if (data) {
          zip.addFile(
            `${typeFolder}/${asset["human_readable_name"]}`,
            data.content
          );
          backup.push(asset);
          if (backup.length === assets.length) {
            try {
              const fileToSend = zip.toBuffer();
              return cb(fileToSend);
            } catch (e) {
              console.log(e)
            }
          }
        }
      }, 1000);
    }
  });
}

async function getThemeAsset(req, res, assetId) {
  try {
    const { data } = await inSalesApi.getAsset({
      token: res.user.password,
      url: res.user.shop,
      theme: req.query["themeId"],
      assetId: assetId
    });
    return data;
  } catch (e) {
    console.log(e);
  }
}

async function getThemeAssets(req, res) {
  try {
    const { data } = await inSalesApi.listAsset({
      token: res.user.password,
      url: res.user.shop,
      theme: req.query["themeId"]
    });
    return data;
  } catch ({ response }) {
    if (response.statusCode !== 422) {
      return res.status(500);
    }
    res.status(400).send(getErrors(response));
  }
}
