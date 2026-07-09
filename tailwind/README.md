# CSS Tailwind — build static

Am renunțat la `cdn.tailwindcss.com` (JIT compilat live în browser, la fiecare
încărcare de pagină — anti-pattern recunoscut oficial de Tailwind pentru
producție). În loc de asta, `css/login.css` și `css/app.css` sunt fișiere
**statice**, generate o singură dată cu Tailwind CLI și verificate direct în
git — nu există build automat la deploy.

- `css/login.css` ← scanează `index.html` (plugins: `forms`, `container-queries`,
  la fel ca CDN-ul folosit anterior de pagina de login)
- `css/app.css` ← scanează `main.html`, `scripts/templates.js`,
  `scripts/product-details.js` (fără plugins, la fel ca CDN-ul folosit anterior
  de main.html)

## Când trebuie regenerat

Proiectul NU mai compilează Tailwind automat. Dacă adaugi/modifici clase
Tailwind în `index.html`, `main.html`, `scripts/templates.js` sau
`scripts/product-details.js`, clasa nouă **nu va avea efect** până nu rulezi
manual comenzile de mai jos și nu dai commit la CSS-ul regenerat.

## Cum regenerezi

Din rădăcina proiectului (necesită Node/npm, doar temporar — nu se instalează
nimic permanent în proiect):

```sh
cd tailwind
npm install --no-save tailwindcss@3 @tailwindcss/forms @tailwindcss/container-queries
npx tailwindcss -c tailwind.login.config.js -i input.css -o ../css/login.css --minify
npx tailwindcss -c tailwind.app.config.js  -i input.css -o ../css/app.css   --minify
```

Verifică vizual (`/index.html` și `/main.html`) înainte de commit.
