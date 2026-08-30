const fs = require("fs");
const V = process.argv[2] || "20260830";
const files = fs.readdirSync(".").filter(f => f.endsWith(".html"));
let total = 0;
files.forEach(f => {
  let src = fs.readFileSync(f, "utf8");
  const before = src;
  src = src.replace(/href="assets\/styles\.css(?:\?v=[^"]*)?"/g, `href="assets/styles.css?v=${V}"`);
  src = src.replace(/src="assets\/(data|app|finder)\.js(?:\?v=[^"]*)?"/g, `src="assets/$1.js?v=${V}"`);
  if (src !== before) {
    fs.writeFileSync(f, src);
    const re = new RegExp("\\?v=" + V, "g");
    const n = (src.match(re) || []).length;
    total += n;
    console.log(f, n);
  }
});
console.log("TOTAL", total);
