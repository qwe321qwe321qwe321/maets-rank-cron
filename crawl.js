const fs = require("fs");

const WISHLIST_URL =
  "https://store.steampowered.com/search/results/?query&dynamic_data=&sort_by=_ASC&snr=1_7_7_popularwishlist_7&filter=popularwishlist&infinite=1";
const TOP_SELLER_URL =
  "https://store.steampowered.com/search/results/?query&dynamic_data=&force_infinite=1&os=win&filter=globaltopsellers&ndl=1&snr=1_7_7_globaltopsellers_7&infinite=1";
const COUNT = 50;

async function fetchPage(baseUrl, start, retries = 5) {
  const url = `${baseUrl}&start=${start}&count=${COUNT}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < retries) {
      const wait = 2000 * 2 ** attempt;
      console.log(`429 at start=${start}, retrying in ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`HTTP ${res.status} at start=${start}`);
  }
}

function parseAppIds(html) {
  const appIds = [];
  const re = /data-ds-appid="(\d+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    appIds.push(m[1]);
  }
  return appIds;
}

async function crawl(label, baseUrl, outputFile) {
  console.log(`\n=== ${label} ===`);
  console.log("Fetching page 0...");
  const first = await fetchPage(baseUrl, 0);
  const totalCount = first.total_count;
  console.log(`Total: ${totalCount}`);

  const rows = [["rank", "appid"]];
  let rank = 1;

  const firstIds = parseAppIds(first.results_html);
  for (const appId of firstIds) rows.push([rank++, appId]);

  const starts = [];
  for (let s = COUNT; s < totalCount; s += COUNT) starts.push(s);

  for (const start of starts) {
    console.log(`Fetching start=${start}...`);
    const data = await fetchPage(baseUrl, start);
    const ids = parseAppIds(data.results_html);
    for (const appId of ids) rows.push([rank++, appId]);
    await new Promise((r) => setTimeout(r, 1000));
  }

  const csv = rows.map((r) => r.join(",")).join("\n") + "\n";
  fs.writeFileSync(outputFile, csv, "utf8");
  console.log(`Done: ${rank - 1} entries written to ${outputFile}.`);
}

async function run() {
  await crawl("Wishlist Rank", WISHLIST_URL, "wishlist_rank.csv");
  await crawl("Top Seller Rank", TOP_SELLER_URL, "top_seller_rank.csv");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
