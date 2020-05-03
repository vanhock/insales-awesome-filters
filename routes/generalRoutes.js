const axios = require("axios");
const express = require("express");
const path = require("path");
const { checkAuth, inSalesApi, filterObject } = require("../helpers");

const withAuth = require("../middleware");

module.exports = function(app) {
  const {
    uninstallFromTheme,
    getInstalledAssets,
    removeInstalledAssets,
    backupTheme,
    getThemeAsset,
    getThemeAssets
  } = require("../controllers/themesController")(app);

  app.get("/", async (req, res) => {
    res.sendFile(path.join(__basedir + "/admin/dist/index.html"));
    return app.use(express.static(path.join(__basedir, "admin/dist/")));
  });

  app.get("/get-user", withAuth, (req, res) => {
    if (res.user) {
      return res
        .status(200)
        .send(filterObject(res.user, ["shop", "installedThemeVersion"]));
    }
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
        data
          .filter(theme => !theme["is_published"])
          .map(theme => ({
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
    try {
      const response = await uninstallFromTheme(req, res);
      res.status(200).send(response);
    } catch (e) {
      return res.status(400).send(e.message || e);
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
    } catch (e) {
      console.log(e);
    }
    const thisInstalledThemeVersion =
      (!!res.user["installedThemeVersion"] &&
        res.user["installedThemeVersion"][themeId]) ||
      0;
    const installedAssetsList = await getThemeAssets(req, res);
    let installedAssets = getInstalledAssets(installedAssetsList, [
      "js",
      "css"
    ]);

    if (
      cdn.data.version === thisInstalledThemeVersion &&
      installedAssets.length === assets.length
    ) {
      return res.status(200).send("Установлена последняя версия");
    }

    if (!thisInstalledThemeVersion) {
      /* If App didn't install on this theme yet, include theme resources links */
      let layoutAssetId;
      installedAssetsList.some(asset => {
        if (asset["inner_file_name"] === "layouts.layout.liquid") {
          return (layoutAssetId = asset.id);
        }
      });
      await includeRecources(layoutAssetId);
    }

    if (installedAssets.length) {
      /** Remove istalled assets (but .js, .css) first */
      removeInstalledAssets(req, res, installedAssets, () => {
        uploadAssets(true); /* With updateTheme flag */
      });
    } else {
      uploadAssets();
    }

    async function uploadAssets(updateTheme) {
      const result = {
        report: {},
        success: false
      };
      let replace = false;
      let assetsForUpdate = [];
      if (updateTheme) {
        assetsForUpdate = installedAssetsList.filter(
          a =>
            a["inner_file_name"].includes("af_") &&
            (a["inner_file_name"].includes(".js") ||
              a["inner_file_name"].includes(".css"))
        );
      }

      if (collectionFolder) {
        /**
         * Update collection template if collectionFolder specified
         */
        let templateAssetId;
        installedAssetsList.some(asset => {
          if (asset["inner_file_name"] === "collection.liquid") {
            return (templateAssetId = asset.id);
          }
        });
        replace = await replaceCollectionTemplate(
          templateAssetId,
          collectionFolder
        );
      } else {
        replace = true;
      }

      if (replace /* wait while collection template updated or not */) {
        const success = [];

        assets.forEach(asset => {
          setTimeout(async () => {
            /**
             * Update .js, .css resources
             **/
            if (
              (updateTheme && asset.src.includes(".js")) ||
              asset.src.includes(".css")
            ) {
              const { data } = await updateAsset(asset.src, assetsForUpdate);
              if (!data) {
                await uploadAssetToTheme(asset);
              } else {
                result.report[(data && data.inner_file_name) || asset.src] =
                  "ok";
                success.push((data && data.inner_file_name) || asset.src);
              }
            } else {
              /**
               * Upload other resources
               **/
              await uploadAssetToTheme(asset);
            }

            if (success.length === assets.length) {
              result.success = true;
            }
            if (Object.keys(result.report).length === assets.length) {
              const response = await app.locals.collection.findOne({
                shop: res.user.shop
              });
              const installedThemeVersion =
                response["installedThemeVersion"] || {};
              installedThemeVersion[themeId] = cdn.data.version;
              await app.locals.collection.updateOne(
                { shop: res.user.shop },
                {
                  $set: {
                    installedThemeVersion: installedThemeVersion
                  }
                }
              );
              return res.status(200).send(result);
            }
          }, 1000);
        });

        async function uploadAssetToTheme(asset) {
          try {
            const { data } = await inSalesApi.uploadAsset({
              token: res.user.password,
              url: res.user.shop,
              theme: req.query["themeId"],
              asset: {
                name: asset.src,
                src: `${assetBaseUrl}@${cdn.data.version}/dist/${asset.src}`,
                type: asset.type
              }
            });
            result.report[data.inner_file_name] = "ok";
            success.push(data.inner_file_name);
          } catch ({ response }) {
            if (response.statusCode !== 422) {
              return res.status(500);
            }
            result.report[response.options.body.asset.name] = getErrors(
              response
            );
            if (Object.keys(result.report).length === assets.length) {
              return res.status(200).send(result);
            }
          }
        }

        async function updateAsset(name, assetsForUpdate) {
          const asset = assetsForUpdate.filter(
            a => a["inner_file_name"] === name
          )[0];
          if (!asset) {
            return true;
          }
          const { data } = await axios.get(
            `${assetBaseUrl}@${cdn.data.version}/dist/${name}`
          );
          try {
            return await inSalesApi.editAsset({
              token: res.user.password,
              url: res.user.shop,
              theme: req.query["themeId"],
              assetId: asset.id,
              asset: {
                content: data
              }
            });
          } catch (e) {
            console.log(e);
          }
        }
      }
    }

    async function includeRecources(layoutAssetId) {
      const layout = await getThemeAsset(req, res, layoutAssetId);
      let replacedContent = layout.content;
      if (!replacedContent.includes("{% include 'af_assets_top' %}")) {
        replacedContent = replacedContent.replace(
          "</head>",
          "{% include 'af_assets_top' %}</head>"
        );
      }
      if (!replacedContent.includes("{% include 'af_assets_bottom' %}")) {
        replacedContent = replacedContent.replace(
          "</body>",
          "{% include 'af_assets_bottom' %}</body>"
        );
      }
      try {
        const { data } = await inSalesApi.editAsset({
          token: res.user.password,
          url: res.user.shop,
          theme: req.query["themeId"],
          assetId: layoutAssetId,
          asset: {
            content: replacedContent
          }
        });
        return data;
      } catch (e) {
        console.log(e);
      }
    }

    async function replaceCollectionTemplate(assetId, folder) {
      const moment = require("moment");
      const oldCollection = await getThemeAsset(req, res, assetId);
      let newCollection;
      try {
        newCollection = await axios.get(
          `${assetBaseUrl}@${cdn.data.version}/dist/template/${folder}/collection.liquid`
        );
      } catch (e) {
        console.log(e);
      }
      try {
        await inSalesApi.uploadAsset({
          token: res.user.password,
          url: res.user.shop,
          theme: req.query["themeId"],
          asset: {
            name: `backup-${moment().format(
              "YYYY-MM-D-HH-mm"
            )}.collection.liquid`,
            content: oldCollection.content,
            type: "Asset::Template"
          }
        });
      } catch (e) {
        console.log(e);
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
        console.log(e);
      }
    }
  });

  app.get("/backup-theme", withAuth, async (req, res) => {
    /**
     * Backup theme if app not installed yet
     */
    const assets = await getThemeAssets(req, res);
    backupTheme(req, res, assets, data => {
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
