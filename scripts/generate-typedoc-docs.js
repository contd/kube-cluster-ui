const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const reports = [
  { name: 'Unit', source: 'reports/unit', target: 'unit' },
  { name: 'End-to-end', source: 'reports/e2e', target: 'e2e' },
];
const projectDocsDir = path.join(root, 'reports', 'typedoc-documents');
const projectDocPath = path.join(projectDocsDir, 'test-reports.md');
const availableReports = reports.filter(({ source }) => {
  return fs.existsSync(path.join(root, source, 'index.html'));
});
const reportLinks = availableReports.map(({ name, target }) => {
  return `- [${name} test HTML report](https://typedoc-report.invalid/${target})`;
});
const reportNotice = reportLinks.length
  ? reportLinks.join('\n')
  : '_No HTML test reports were found for this documentation build._';

fs.mkdirSync(projectDocsDir, { recursive: true });
fs.writeFileSync(projectDocPath, `# Automated Test Reports\n\n${reportNotice}\n`);

const typedocArgs = [
  'typedoc',
  '--entryPointStrategy', 'expand',
  '--skipErrorChecking',
  '--favicon', 'src/favicon.svg',
  '--customCss', 'typedoc.css',
  '--out', 'docs',
  'src',
  '--projectDocuments', projectDocPath,
];
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, typedocArgs, {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.exit(result.status || 1);
}

const generatedDocPath = path.join(root, 'docs', 'documents', 'test-reports.html');
let generatedDoc = fs.readFileSync(generatedDocPath, 'utf8');

for (const { source, target } of reports) {
  const sourcePath = path.join(root, source);
  const destinationPath = path.join(root, 'docs', target);
  fs.rmSync(destinationPath, { recursive: true, force: true });

  if (fs.existsSync(path.join(sourcePath, 'index.html'))) {
    fs.cpSync(sourcePath, destinationPath, { recursive: true });
    generatedDoc = generatedDoc.replace(
      `href="https://typedoc-report.invalid/${target}"`,
      `href="../${target}/index.html"`,
    );
  }
}

fs.writeFileSync(generatedDocPath, generatedDoc);