const fs = require('node:fs');
const path = require('node:path');

const [unitReportPath, e2eReportPath, outputPath] = process.argv.slice(2);

if (!unitReportPath || !e2eReportPath || !outputPath) {
  throw new Error('Usage: node scripts/test-reports-to-markdown.js <unit.json> <e2e.json> <output.md>');
}

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};

const escapeCell = (value) => String(value ?? '')
  .replace(/\|/g, '\\|')
  .replace(/[\r\n]+/g, ' ')
  .trim();

const formatDuration = (milliseconds) => {
  if (!Number.isFinite(milliseconds)) {
    return '-';
  }

  return milliseconds < 1000
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / 1000).toFixed(2)} s`;
};

const formatFailure = (message) => {
  const safeMessage = String(message ?? 'Unknown failure')
    .replace(/```/g, "'''")
    .trim();
  return `\n\n<details><summary>Failure details</summary>\n\n\`\`\`text\n${safeMessage}\n\`\`\`\n\n</details>`;
};

const renderCaseTable = (rows) => {
  if (!rows.length) {
    return '_No test cases were reported._';
  }

  return [
    '| Status | Test | Duration |',
    '| --- | --- | ---: |',
    ...rows.map((row) => `| ${escapeCell(row.status)} | ${escapeCell(row.title)} | ${escapeCell(row.duration)} |`),
  ].join('\n');
};

const statusCounts = (rows) => rows.reduce((counts, row) => {
  counts[row.status] = (counts[row.status] || 0) + 1;
  return counts;
}, {});

const renderSummary = (rows) => {
  const counts = statusCounts(rows);
  const parts = ['Passed', 'Failed', 'Flaky', 'Skipped']
    .map((status) => `${status}: ${counts[status] || 0}`);
  return `**Total:** ${rows.length} (${parts.join(' | ')})`;
};

const unitReport = readJson(unitReportPath);
const e2eReport = readJson(e2eReportPath);
const unitRows = [];
const unitFailures = [];

for (const file of unitReport?.testResults || []) {
  for (const assertion of file.assertionResults || []) {
    const status = assertion.status === 'passed'
      ? 'Passed'
      : assertion.status === 'failed'
        ? 'Failed'
        : 'Skipped';
    unitRows.push({
      status,
      title: `${path.basename(file.name)}: ${assertion.fullName || assertion.title}`,
      duration: formatDuration(assertion.duration),
    });

    for (const failure of assertion.failureMessages || []) {
      unitFailures.push({ title: assertion.fullName || assertion.title, message: failure });
    }
  }
}

const e2eRows = [];
const e2eFailures = [];

const visitSuite = (suite, parentTitles = []) => {
  const suiteTitle = suite.title && suite.title !== path.basename(suite.file || '')
    ? [...parentTitles, suite.title]
    : parentTitles;

  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      const status = {
        expected: 'Passed',
        unexpected: 'Failed',
        flaky: 'Flaky',
        skipped: 'Skipped',
      }[test.status] || 'Unknown';
      const resultDuration = (test.results || [])
        .reduce((duration, result) => duration + (result.duration || 0), 0);
      e2eRows.push({
        status,
        title: `${path.basename(spec.file || suite.file || 'test')}: ${[...suiteTitle, spec.title].filter(Boolean).join(' › ')}`,
        duration: formatDuration(resultDuration),
      });

      for (const result of test.results || []) {
        for (const error of result.errors || []) {
          e2eFailures.push({ title: spec.title, message: error.message || JSON.stringify(error) });
        }
      }
    }
  }

  for (const child of suite.suites || []) {
    visitSuite(child, suiteTitle);
  }
};

for (const suite of e2eReport?.suites || []) {
  visitSuite(suite);
}

const renderFailures = (heading, failures) => {
  if (!failures.length) {
    return '';
  }

  return `\n\n### ${heading}\n\n${failures.map(({ title, message }) => {
    return `#### ${escapeCell(title)}${formatFailure(message)}`;
  }).join('\n\n')}`;
};

const markdown = [
  '# Automated Test Reports',
  '',
  '## Unit Tests',
  '',
  renderSummary(unitRows),
  '',
  renderCaseTable(unitRows),
  renderFailures('Unit Test Failures', unitFailures),
  '',
  '## End-to-End Tests',
  '',
  renderSummary(e2eRows),
  '',
  renderCaseTable(e2eRows),
  renderFailures('End-to-End Test Failures', e2eFailures),
].filter((section) => section !== null).join('\n');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${markdown.trim()}\n`);