/** Generates the app and favicon icon formats from the canonical brand-mark SVG. */
import {
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Icns, IcnsImage } from '@fiahfy/icns';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';
import ts from 'typescript';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const componentPath = join(repositoryRoot, 'src/components/brand-mark.ts');
const sourceDirectory = join(repositoryRoot, 'src');

function readBrandMarkSvg() {
  const sourceText = readFileSync(componentPath, 'utf8');
  const sourceFile = ts.createSourceFile(
    componentPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === 'brandMarkSvg' &&
        declaration.initializer &&
        ts.isNoSubstitutionTemplateLiteral(declaration.initializer)
      ) {
        return declaration.initializer.text.trim();
      }
    }
  }

  throw new Error(`Could not find the brandMarkSvg template in ${componentPath}`);
}

function renderSvg(svgPath, outputPath) {
  return sharp(svgPath)
    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outputPath);
}

function resizePng(inputPath, outputPath, size) {
  return sharp(inputPath)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outputPath);
}

export async function generateBrandIcons() {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'kube-brand-icons-'));
  const svgPath = join(temporaryDirectory, 'brand-mark.svg');
  const masterPng = join(temporaryDirectory, 'brand-mark-1024.png');
  writeFileSync(svgPath, readBrandMarkSvg());

  try {
    const faviconPng = join(temporaryDirectory, 'favicon.png');
    const iconPng = join(temporaryDirectory, 'icon.png');
    const faviconIco = join(temporaryDirectory, 'favicon.ico');
    const iconIco = join(temporaryDirectory, 'icon.ico');
    const iconIcns = join(temporaryDirectory, 'icon.icns');
    await renderSvg(svgPath, masterPng);

    const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
    const pngPaths = new Map(sizes.map((size) => [
      size,
      join(temporaryDirectory, `icon-${size}.png`),
    ]));
    await Promise.all(sizes.map((size) => resizePng(
      masterPng,
      pngPaths.get(size),
      size,
    )));

    writeFileSync(faviconPng, readFileSync(pngPaths.get(512)));
    writeFileSync(iconPng, readFileSync(pngPaths.get(512)));
    writeFileSync(faviconIco, await pngToIco([16, 32, 48, 64].map((size) => pngPaths.get(size))));
    writeFileSync(iconIco, await pngToIco([16, 32, 48, 64, 128, 256].map((size) => pngPaths.get(size))));

    const icns = new Icns();
    [
      [16, 'icp4'],
      [32, 'icp5'],
      [64, 'icp6'],
      [128, 'ic07'],
      [256, 'ic08'],
      [512, 'ic09'],
      [1024, 'ic10'],
    ].forEach(([size, osType]) => {
      icns.append(IcnsImage.fromPNG(readFileSync(pngPaths.get(size)), osType));
    });
    writeFileSync(iconIcns, icns.data);

    [
      [faviconPng, 'favicon.png'],
      [faviconIco, 'favicon.ico'],
      [iconPng, 'icon.png'],
      [iconIco, 'icon.ico'],
      [iconIcns, 'icon.icns'],
    ].forEach(([generatedPath, outputName]) => {
      renameSync(generatedPath, join(sourceDirectory, outputName));
    });
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateBrandIcons();
}