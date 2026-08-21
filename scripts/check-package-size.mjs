import fs from "node:fs";
import path from "node:path";

const [filePath, maximumBytesText] = process.argv.slice(2);
const maximumBytes = Number(maximumBytesText);
if (!filePath || !Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
  throw new Error("Usage: node check-package-size.mjs <file> <maximum-bytes>");
}
const resolvedPath = path.resolve(filePath);
const actualBytes = fs.statSync(resolvedPath).size;
if (actualBytes > maximumBytes) {
  throw new Error(`${filePath} is ${actualBytes} bytes; budget is ${maximumBytes} bytes.`);
}
console.log(`${filePath} size ${actualBytes} bytes is within the ${maximumBytes} byte budget.`);
