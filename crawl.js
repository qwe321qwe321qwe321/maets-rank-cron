const fs = require("fs");

function readCsvRankMap(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const lines = fs.readFileSync(filePath, "utf8").trim().split("\n");
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const [rank, appid] = lines[i].split(",");
    if (appid && rank) map.set(appid.trim(), parseInt(rank, 10));
  }
  return map;
}

function generateGrowthCsv(dataRows, prevMap, growthFile) {
  if (!prevMap) return;
  const totalCount = dataRows.length;
  const rows = [];
  for (const [rank, appid] of dataRows) {
    let prevRank, rankChange;
    if (prevMap.has(appid)) {
      prevRank = prevMap.get(appid);
      rankChange = prevRank - rank;
    } else {
      prevRank = "N/A";
      rankChange = totalCount - rank + 1;
    }
    rows.push([appid, rank, prevRank, rankChange]);
  }
  rows.sort((a, b) => b[3] - a[3]);
  const csv =
    ["appid,rank,prev_rank,rank_change", ...rows.map((r) => r.join(","))].join("\n") + "\n";
  fs.writeFileSync(growthFile, csv, "utf8");
  console.log(`Growth: ${rows.length} entries written to ${growthFile}.`);
}

const WISHLIST_URL =
  "https://store.steampowered.com/search/results/?query&dynamic_data=&sort_by=_ASC&snr=1_7_7_popularwishlist_7&filter=popularwishlist&infinite=1";
const TOP_SELLER_URL =
  "https://store.steampowered.com/search/results/?query&dynamic_data=&force_infinite=1&os=win&filter=globaltopsellers&ndl=1&snr=1_7_7_globaltopsellers_7&infinite=1";
const COUNT = 100;
const CONCURRENCY = 5;

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

async function fetchAll(baseUrl, starts) {
  const results = new Array(starts.length);
  for (let i = 0; i < starts.length; i += CONCURRENCY) {
    const batch = starts.slice(i, i + CONCURRENCY);
    console.log(`Fetching starts: ${batch.join(", ")}...`);
    const settled = await Promise.allSettled(
      batch.map((s) => fetchPage(baseUrl, s))
    );
    for (let j = 0; j < batch.length; j++) {
      const r = settled[j];
      if (r.status === "rejected") throw r.reason;
      results[i + j] = r.value;
    }
  }
  return results;
}

async function crawl(label, baseUrl, outputFile, growthFile) {
  console.log(`\n=== ${label} ===`);
  console.log("Fetching page 0...");
  const first = await fetchPage(baseUrl, 0);
  const totalCount = first.total_count;
  console.log(`Total: ${totalCount}`);

  const starts = [];
  for (let s = COUNT; s < totalCount; s += COUNT) starts.push(s);

  const rest = await fetchAll(baseUrl, starts);

  const dataRows = [];
  let rank = 1;
  for (const appId of parseAppIds(first.results_html)) dataRows.push([rank++, appId]);
  for (const data of rest) {
    for (const appId of parseAppIds(data.results_html)) dataRows.push([rank++, appId]);
  }

  const bakFile = outputFile + ".bak";
  if (fs.existsSync(outputFile)) fs.copyFileSync(outputFile, bakFile);

  const csv =
    ["rank,appid", ...dataRows.map((r) => r.join(","))].join("\n") + "\n";
  fs.writeFileSync(outputFile, csv, "utf8");
  console.log(`Done: ${dataRows.length} entries written to ${outputFile}.`);

  const prevMap = readCsvRankMap(bakFile);
  generateGrowthCsv(dataRows, prevMap, growthFile);
  if (fs.existsSync(bakFile)) fs.unlinkSync(bakFile);
}

async function run() {
  await crawl("Wishlist Rank", WISHLIST_URL, "wishlist_rank.csv", "wishlist_rank_growth.csv");
  await crawl("Top Seller Rank", TOP_SELLER_URL, "top_seller_rank.csv", "top_seller_rank_growth.csv");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
