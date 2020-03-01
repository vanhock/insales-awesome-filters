const { getPassword } = require("../helpers");
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

  app.get("/uninstall", (req, res) => {
    const { shop, token, insales_id } = req.query;
    app.locals.collection
      .findOneAndDelete({
        shop: shop,
        insales_id: insales_id,
        password: token
      })
      .then(({ value }) => {
        if (!value || !Object.keys(value).length) {
          return res.status(400).send("Wrong credentials");
        }
        return res.status(200).send("Ok!");
      })
      .catch(() => {
        return res.status(500).send("Something wrong on the server!");
      });
  });
};
