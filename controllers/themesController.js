module.exports = uninstallFromTheme = async (req, res) => {
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

          const installedThemeVersion = response["installedThemeVersion"] || {};
          delete installedThemeVersion[themeId];

          await app.locals.collection.updateOne(
            { shop: res.user.shop },
            {
              $set: {
                installedThemeVersion: installedThemeVersion
              }
            }
          );
          return Promise.resolve();
        }
      }, 1000);
    });
  } else {
    return Promise.reject({
      status: 400,
      message: "Нет ресурсов для удаления"
    });
  }

  /**
   * Remove snippets includes from layouts.layout.liquid
   */
  let layoutAssetId;
  assetsList.some(asset => {
    if (asset["inner_file_name"] === "layouts.layout.liquid") {
      return (layoutAssetId = asset.id);
    }
  });
  const layout = await getThemeAsset(req, res, layoutAssetId);
  let replacedContent = layout.content;
  if (replacedContent.includes("{% include 'af_assets_top' %}")) {
    replacedContent = replacedContent.replace(
      "{% include 'af_assets_top' %}",
      ""
    );
  }
  if (replacedContent.includes("{% include 'af_assets_bottom' %}")) {
    replacedContent = replacedContent.replace(
      "{% include 'af_assets_bottom' %}",
      ""
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
};

module.exports = getInstalledAssets = assets => {
  return assets
    .filter(({ inner_file_name }) => inner_file_name.includes("af_"))
    .map(({ id }) => id);
};

module.exports = removeInstalledAssets = (req, res, installedAssets, cb) => {
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
};

module.exports = backupTheme = (req, res, assets, cb) => {
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
  assets.forEach(async asset => {
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
      /*
       * If we not able to download asset by url,
       * downloading it using insales api
       */

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
              console.log(e);
            }
          }
        }
      }, 1000);
    }
  });
};

module.exports = getThemeAsset = async (req, res, assetId) => {
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
};

module.exports = getThemeAssets = async (req, res) => {
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
};
