/**
 * Generates the PDF fixtures used by the migration verification scripts.
 *
 *   node test/make-fixtures.js [outputDir]
 *
 * Produces:
 *   grantos-e2e.pdf   a multi-paragraph agreement with a real text layer
 *   grantos-scan.pdf  a structurally valid page with no text at all,
 *                     standing in for a scanned/image-only document
 *
 * jsPDF lives in the frontend's dependencies, so this resolves it from there
 * rather than adding a backend dependency that only tests need.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createRequire } = require('node:module');
const frontendRequire = createRequire(
  path.join(__dirname, '..', '..', 'frontend', 'package.json'),
);
const { jsPDF } = frontendRequire('jspdf');

const AGREEMENT_LINES = [
  'GRANT AGREEMENT - DEMONSTRATION DOCUMENT',
  '',
  'This grant agreement is made between Meridian Development Foundation',
  '(the "Funder") and eGov Foundation (the "Recipient").',
  '',
  'ANNEX B | DISBURSEMENT SCHEDULE',
  'Tranche 1 - Mobilisation: USD 125,000 payable on 2026-03-31.',
  'Tranche 2 - Pilot Delivery: USD 375,000 payable on 2026-09-30.',
  'Tranche 3 - Scale-up: USD 500,000 payable on 2027-03-31.',
  '',
  'REPORTING REQUIREMENTS',
  'Inception Report due within 30 days of the effective date.',
  'Interim Progress Report due 2026-07-15.',
  'Final Report due 2027-04-30.',
  '',
  'PROJECT DELIVERABLES',
  'Identity resolution service, data protection impact assessment,',
  'and a field operations handbook for the DPI Centre programme.',
  '',
  'NOTICES',
  'Anita Raghavan, Programme Director, anita.raghavan@grantos.local',
  'Daniel Okoye, Grant Manager, daniel.okoye@grantos.local',
];

function buildTextPdf() {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(AGREEMENT_LINES[0], 20, 20);
  doc.setFontSize(10);
  let y = 32;
  for (const line of AGREEMENT_LINES.slice(1)) {
    doc.text(line || ' ', 20, y);
    y += 6;
  }
  return Buffer.from(doc.output('arraybuffer'));
}

function buildScannedPdf() {
  // A page containing only vector shapes: valid PDF, zero text layer.
  const doc = new jsPDF();
  doc.setDrawColor(40);
  doc.rect(20, 20, 170, 100);
  doc.line(20, 140, 190, 140);
  doc.circle(60, 180, 20);
  return Buffer.from(doc.output('arraybuffer'));
}

const outDir = process.argv[2] || os.tmpdir();
fs.mkdirSync(outDir, { recursive: true });

const textPdf = buildTextPdf();
const scanPdf = buildScannedPdf();
fs.writeFileSync(path.join(outDir, 'grantos-e2e.pdf'), textPdf);
fs.writeFileSync(path.join(outDir, 'grantos-scan.pdf'), scanPdf);

console.log(`grantos-e2e.pdf   ${textPdf.length} bytes (text layer)`);
console.log(`grantos-scan.pdf  ${scanPdf.length} bytes (no text layer)`);
console.log(`written to ${outDir}`);
