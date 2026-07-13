import fs from "node:fs";
import path from "node:path";

const WINDOWS_GUI_SUBSYSTEM = 2;
const executable = process.argv[2];

function fail(message) {
  throw new Error(`Windows GUI subsystem check failed: ${message}`);
}

if (!executable) {
  fail("pass the path to a Windows executable");
}

const resolved = path.resolve(executable);
if (!fs.existsSync(resolved)) {
  fail(`executable not found: ${resolved}`);
}

const binary = fs.readFileSync(resolved);
if (binary.length < 64 || binary.toString("ascii", 0, 2) !== "MZ") {
  fail(`${resolved} is not a valid PE executable`);
}

const peOffset = binary.readUInt32LE(0x3c);
const optionalHeaderOffset = peOffset + 24;
const subsystemOffset = optionalHeaderOffset + 68;
if (subsystemOffset + 2 > binary.length || binary.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
  fail(`${resolved} has an invalid PE header`);
}

const optionalHeaderMagic = binary.readUInt16LE(optionalHeaderOffset);
if (optionalHeaderMagic !== 0x10b && optionalHeaderMagic !== 0x20b) {
  fail(`${resolved} has an unsupported PE optional header`);
}

const subsystem = binary.readUInt16LE(subsystemOffset);
if (subsystem !== WINDOWS_GUI_SUBSYSTEM) {
  fail(`${resolved} uses subsystem ${subsystem}; expected ${WINDOWS_GUI_SUBSYSTEM} (Windows GUI)`);
}

console.log(`Windows GUI subsystem check passed: ${resolved}`);
