function attachResHelpers(req, res) {
  if (!res.status) {
    res.status = function(code) {
      this.statusCode = code;
      return this;
    };
  }
  if (!res.json) {
    res.json = function(data) {
      this.setHeader('Content-Type', 'application/json; charset=utf-8');
      this.end(JSON.stringify(data));
      return this;
    };
  }
  if (!req.query) {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      req.query = Object.fromEntries(urlObj.searchParams);
    } catch (e) {
      req.query = {};
    }
  }
}

module.exports = { attachResHelpers };
