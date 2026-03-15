const { execution } = require("../controller/execute.controller")

module.exports = (app) => {
    app.post('/submit', execution)
}