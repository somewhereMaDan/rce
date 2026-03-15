const { executePython, executeJava, executecpp } = require("../services/executor")

async function execution(req, res) {
    const { code, lang, stdin = "" } = req.body
    let output

    try {
        if (lang == 'python') {
            output = await executePython(code, stdin)
        } else if (lang == 'java') {
            output = await executeJava(code, stdin)
        } else if (lang == 'cpp') {
            output = await executecpp(code, stdin)
        }
        return res.status(200).json({ message: "Code compiled!", output: output })
    } catch (err) {
        console.log(err);

        if (err.type === 'execution') {
            return res.status(400).json({ message: "code execution failed", error: err.message })
        }
        return res.status(500).json({ message: "Internal server error" })
    }
}

module.exports = { execution }