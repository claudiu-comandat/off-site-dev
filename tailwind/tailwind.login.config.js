// Config pentru css/login.css (folosit de index.html) — vezi tailwind/README.md
// pentru cum se regenerează.
const path = require('path');
const PROJECT = path.resolve(__dirname, '..');

module.exports = {
  content: [`${PROJECT}/index.html`],
  theme: { extend: {} },
  corePlugins: { preflight: true },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
};
