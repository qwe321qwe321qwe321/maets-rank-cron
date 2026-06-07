const fs = require("fs");

const BASE_URL =
  "https://store.steampowered.com/search/results/?query&dynamic_data=&sort_by=_ASC&snr=1_7_7_popularwishlist_7&filter=popularwishlist&infinite=1";
const COUNT = 50;

async function fetchPage(start) {
  const url = `${BASE_URL}&start=${start}&count=${COUNT}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} at start=${start}`);
  return res.json();
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

async function run() {
  console.log("Fetching page 0...");
  const first = await fetchPage(0);
  const totalCount = first.total_count;
  console.log(`Total: ${totalCount}`);

  const rows = [["rank", "appid"]];
  let rank = 1;

  const firstIds = parseAppIds(first.results_html);
  for (const appId of firstIds) rows.push([rank++, appId]);

  const starts = [];
  for (let s = COUNT; s < totalCount; s += COUNT) starts.push(s);

  // fetch remaining pages sequentially to avoid rate limiting
  for (const start of starts) {
    console.log(`Fetching start=${start}...`);
    const data = await fetchPage(start);
    const ids = parseAppIds(data.results_html);
    for (const appId of ids) rows.push([rank++, appId]);
    await new Promise((r) => setTimeout(r, 300));
  }

  const csv = rows.map((r) => r.join(",")).join("\n") + "\n";
  fs.writeFileSync("wishlist_rank.csv", csv, "utf8");
  console.log(`Done: ${rank - 1} entries written.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
