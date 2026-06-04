# Schema produs OpenSales (pentru reproducere în n8n)

Acesta este formatul **exact** pe care off-site îl construia pentru `/import/products`
(preview/dry-run). Scopul: reproducerea lui în n8n, ca off-site să trimită doar ASIN-ul
către `https://automatizare.comandat.ro/webhook/push-to-opensales`, iar restul logicii
(fetch + asamblare) să fie în n8n.

> Câmpurile hardcodate de serverul OpenSales (secțiunea 3 din spec) NU se trimit.
> Payload-urile per-marketplace finale le calculează serverul; noi trimitem doar inputul.

---

## 1. Wrapper

```json
{ "products": [ <productObj>, ... ] }
```

Off-site trimitea un singur produs (`products[0]`). În n8n poți trimite mai multe.

---

## 2. Surse de date

| Prefix folosit mai jos | Sursă | Conținut |
|---|---|---|
| `details.*` | detaliile produsului (în off-site: `fetchProductDetailsInBulk[asin]`) | `title`, `description`, `price`, `brand`, `ean`, `images`, `other_versions[limbă]` |
| `ld.*` | `get_product_attributes_v2.listing_data` | `emag` / `temu` / `trendyol` cu `categoryId`, `attributes`, `variations` |
| `product.*` | rândul comenzii (off-site: `command.products[i]`) | `asin`, `bncondition`, `barcode` |

`other_versions` e cheiat pe **numele limbii în minuscule**: `romanian`, `bulgarian`, `hungarian`.

---

## 3. Obiectul produs (`productObj`)

| Câmp | Tip | Valoare / sursă | Reguli |
|---|---|---|---|
| `sku` | string | `${product.asin}` + `"CN"` | mereu sufix `CN` |
| `title` | string | `details.other_versions.romanian.title \|\| details.title` | `.trim()` |
| `price` | integer | `round(parseFloat(details.price) * 100)` | **minor units** (bani), RON |
| `stock` | integer | `Number(product.bncondition)` | fără fallback |
| `currency` | string | `"RON"` | constant |
| `vatRate` | number | `0` | constant |
| `description` | string | `details.other_versions.romanian.description \|\| details.description` | doar dacă truthy |
| `images` | array | din `romanian.images` (fallback `details.images`) | vezi §5; doar dacă non-gol |
| `ean` | string | `details.ean \|\| product.barcode` | `String(...)`; doar dacă truthy |
| `brand` | string | `details.brand` | doar dacă truthy |
| `offers` | array | vezi §4 | mereu prezent |

---

## 4. `offers`

### 4.1 eMAG — 3 oferte (RO / BG / HU)

Pentru fiecare pereche `(marketplace, limbă)`:
`("emag-ro","romanian")`, `("emag-bg","bulgarian")`, `("emag-hu","hungarian")`.

| Câmp | Valoare / sursă | Reguli |
|---|---|---|
| `marketplace` | `"emag-ro"` / `"emag-bg"` / `"emag-hu"` | |
| `category` | `ld.emag.categoryId` | doar dacă `!= null` |
| `brand` | `details.brand` | doar dacă truthy |
| `characteristics` | din `ld.emag.attributes` → `[{ id, value }]` | **identic la toate 3** ofertele; vezi §5 |
| `title` | `other_versions[limbă].title` | doar dacă există (altfel serverul cade pe `productObj.title`) |
| `description` | `other_versions[limbă].description` | doar dacă există |
| `images` | `other_versions[limbă].images` | vezi §5; doar dacă non-gol |

**characteristics eMAG** = `{ id: Number(cheie), value: value_name }`.

### 4.2 Temu — 1 ofertă (doar dacă `ld.temu.categoryId != null` SAU există `variations`)

| Câmp | Valoare / sursă | Reguli |
|---|---|---|
| `marketplace` | `"temu"` | |
| `category` | `ld.temu.categoryId` | doar dacă `!= null` |
| `brand` | `details.brand` | doar dacă truthy |
| `characteristics` | din `ld.temu.attributes` → `[{ refPid, vid }]` | vezi mai jos |
| `variations` | `ld.temu.variations` **as-is** | `[{ specId, specName, parentSpecId }]` |

**characteristics Temu** = `{ refPid: Number(cheie), vid: value_id }`.
- `refPid` = cheia atributului (ex: `82`)
- `vid` = câmpul `value_id`
- **se sar** atributele cu `value_id: null` (free-text, ex: `"1467": "Dehobo"`)

> Titlu/descriere/imagini Temu se omit intenționat → serverul cade pe `productObj`.

### 4.3 Trendyol — 1 ofertă

| Câmp | Valoare / sursă | Reguli |
|---|---|---|
| `marketplace` | `"trendyol"` | |
| `category` | `ld.trendyol.categoryId` | doar dacă `!= null` |
| `brand` | `details.brand` | ⚠️ DE CONFIRMAT: text vs `brandId` numeric |
| `characteristics` | din `ld.trendyol.attributes` → `[{ attributeId, attributeValueId }]` | vezi mai jos |

**characteristics Trendyol** = `{ attributeId: Number(cheie), attributeValueId: value_id }`.
- `attributeId` = cheia atributului (ex: `47`)
- `attributeValueId` = câmpul `value_id`
- **se sar** atributele cu `value_id: null` (ex: `"1116": "Reîncărcabil prin USB"`)

---

## 5. Reguli de transformare (de replicat în n8n)

**Imagini** (`osCleanImages`): elimină valorile falsy → deduplică → mapează fiecare URL la `{ "url": <string> }`.

**characteristics — filtrare comună:**
- doar chei **numerice** (sare `__categoryId` și orice cheie ne-numerică)
- valoarea poate fi string `"Negru"` (vechi) sau obiect `{ value_name, value_id }` (din DB după enrichment)
- eMAG folosește `value_name`; Temu/Trendyol folosesc `value_id`
- elimină valorile goale (eMAG: `value_name` gol; Temu/Trendyol: `value_id` null)

---

## 6. Exemplu concret (pe baza datelor reale)

> Câmpurile `productObj` de nivel produs (`title`, `price`, `images`, `ean`, `brand`)
> vin din `details` — aici sunt placeholdere `<...>`. Ofertele sunt construite din
> `listing_data` real.

```json
{
  "products": [
    {
      "sku": "<ASIN>CN",
      "title": "<details.other_versions.romanian.title>",
      "price": 0,
      "stock": <product.bncondition>,
      "currency": "RON",
      "vatRate": 0,
      "description": "<details.other_versions.romanian.description>",
      "images": [{ "url": "<url1>" }],
      "ean": "<details.ean | product.barcode>",
      "brand": "<details.brand>",
      "offers": [
        {
          "marketplace": "emag-ro",
          "category": "366",
          "brand": "<details.brand>",
          "characteristics": [
            { "id": 815, "value": "Acumulator integrat" },
            { "id": 870, "value": "Buton On/Off" },
            { "id": 2988, "value": "LED" }
          ],
          "title": "<romanian.title>",
          "description": "<romanian.description>",
          "images": [{ "url": "<url1>" }]
        },
        { "marketplace": "emag-bg", "category": "366", "characteristics": [ "...identic ca emag-ro..." ] },
        { "marketplace": "emag-hu", "category": "366", "characteristics": [ "...identic ca emag-ro..." ] },
        {
          "marketplace": "temu",
          "category": "13710",
          "brand": "<details.brand>",
          "characteristics": [
            { "refPid": 82, "vid": 461745 },
            { "refPid": 98, "vid": 2294 }
          ],
          "variations": [
            { "specId": 171394460, "specName": "Standard", "parentSpecId": 18012 }
          ]
        },
        {
          "marketplace": "trendyol",
          "category": "3005",
          "brand": "<details.brand>",
          "characteristics": [
            { "attributeId": 47, "attributeValueId": 7476 },
            { "attributeId": 134, "attributeValueId": 318772 }
          ]
        }
      ]
    }
  ]
}
```

---

## 7. Puncte de confirmat înainte de portare completă

1. **Brand Trendyol**: text (`details.brand`) sau `brandId` numeric?
2. **value_id null** (Temu/Trendyol): se sar (comportament curent) sau se trimit ca text/alt câmp?
3. **Câte produse**: un singur ASIN per call sau toate ASIN-urile comenzii?
