/**
 * Список Ассетов темы, необходимых для работы приложения.
 * Может применяться для обновления темы дизайна.
 * @type {*[]}
 */
module.exports = [
  {
    src: "af_app.js",
    type: "Asset::Media"
  },
  {
    src: "af_app.css",
    type: "Asset::Media"
  },
  {
    src: "af_chunk-vendors.js",
    type: "Asset::Media"
  },
  {
    src: "af_assets_top.liquid",
    type: "Asset::Snippet"
  },
  {
    src: "af_assets_bottom.liquid",
    type: "Asset::Snippet"
  },
  {
    src: "af_json_filters.liquid",
    type: "Asset::Snippet"
  },
  {
    src: "af_json_filters_property.liquid",
    type: "Asset::Snippet"
  },
  {
    src: "af_json_filters_price.liquid",
    type: "Asset::Snippet"
  },
  {
    src: "af_json_filters_option.liquid",
    type: "Asset::Snippet"
  }
];