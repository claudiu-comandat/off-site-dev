// Config pentru css/app.css (folosit de main.html) — vezi tailwind/README.md
// pentru cum se regenerează.
const path = require('path');
const PROJECT = path.resolve(__dirname, '..');

module.exports = {
  content: [
    `${PROJECT}/main.html`,
    `${PROJECT}/scripts/templates.js`,
    `${PROJECT}/scripts/product-details.js`,
  ],
  theme: { extend: {} },
  corePlugins: { preflight: true },
  plugins: [],
};
