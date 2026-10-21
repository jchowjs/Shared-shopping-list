// Turns a block of text like "milk x2, 2 dozen eggs\n- bread" into separate items,
// each with a name and an optional amount/note ("details").

const UNITS = [
  "kg", "g", "grams?", "mg", "l", "litres?", "liters?", "ml", "lbs?", "pounds?", "oz",
  "dozen", "packs?", "packets?", "pkts?", "bags?", "box(?:es)?", "bottles?", "cans?",
  "tins?", "cartons?", "loa(?:f|ves)", "bunch(?:es)?", "pcs?", "pieces?", "tubs?",
  "jars?", "rolls?", "trays?", "heads?", "slices?", "sticks?", "punnets?",
].join("|");
const NUMBER = String.raw`(?:\d+(?:[.,/]\d+)?|(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|half(?: a)?)\b)`;

// "2 dozen eggs", "500g flour", "3 x milk", "a bag of rice", "6 apples"
const LEADING = new RegExp(String.raw`^(${NUMBER}\s*(?:x\b\s*)?(?:(?:${UNITS})\b\.?)?)\s+(?:of\s+)?(.+)$`, "i");
// "milk x2", "milk x 2", "milk ×2"
const TRAILING_TIMES = /^(.+?)\s*[x×]\s*(\d+)$/i;
// "milk (full cream)", "milk - 2L", "milk: 2 bottles"
const TRAILING_NOTE = /^(.+?)\s*(?:\(([^)]+)\)|(?:\s*:|\s[-–])\s*(.+))$/;
// "milk 2L", "bananas 6"
const TRAILING_AMOUNT = new RegExp(String.raw`^(.+?)\s+(\d+(?:[.,/]\d+)?\s*(?:(?:${UNITS})\b\.?)?)$`, "i");

export function splitIntoItems(text) {
  return text
    .split(/[\n,;]+/)
    .map(cleanLine)
    .filter((line) => line && !line.endsWith(":")) // skip headings like "Groceries:"
    .map(splitAmount);
}

function cleanLine(line) {
  return line
    .replace(/^\s*(?:[-*•·▪◦>]|\[\s*[x ]?\s*\]|☐|☑|✓|✔|\d+[.)])\s*/i, "") // bullets, ticks, "1." numbering
    .replace(/\s+/g, " ")
    .trim();
}

function splitAmount(line) {
  let m;
  if ((m = line.match(TRAILING_TIMES))) return item(m[1], "x" + m[2]);
  if ((m = line.match(TRAILING_NOTE))) return item(m[1], m[2] || m[3]);
  if ((m = line.match(TRAILING_AMOUNT))) return item(m[1], m[2]);
  // "an apple" stays as it is: "a"/"an" on its own isn't an amount.
  if ((m = line.match(LEADING)) && !/^an?$/i.test(m[1].trim())) {
    return item(m[2], m[1].replace(/^(\d+)\s*x$/i, "x$1")); // "3 x milk" -> "x3"
  }
  return item(line, "");
}

function item(name, details) {
  name = name.trim();
  return {
    name: (name.charAt(0).toUpperCase() + name.slice(1)).slice(0, 100),
    details: (details || "").trim().slice(0, 100),
  };
}
