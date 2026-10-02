/** Converts unit and Playwright JSON reports into a Markdown summary. */
const fs = require('node:fs');
const path = require('node:path');

/** Unit JSON input, E2E JSON input, and Markdown output paths from the CLI. */
const [unitReportPath, e2eReportPath, outputPath] = process.argv.slice(2);

if (!unitReportPath || !e2eReportPath || !outputPath) {
  throw new Error('Usage: node scripts/test-reports-to-markdown.js <unit.json> <e2e.json> <output.md>');
}

/**
 * Reads a JSON report when present, returning null when it is missing or invalid.
 *
 * @param {string} filePath - Report file to parse.
 * @returns {object|null} Parsed JSON report, or null when parsing fails.
 */
const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * Escapes a value for safe inclusion in a Markdown table cell.
 *
 * @param {*} value - Value to render as text.
 * @returns {string} Single-line Markdown cell content.
 */
const escapeCell = (value) => String(value ?? '')
  .replace(/\|/g, '\\|')
  .replace(/[\r\n]+/g, ' ')
  .trim();

/**
 * Formats a duration in milliseconds for concise test-report display.
 *
 * @param {number} milliseconds - Duration reported by the test runner.
 * @returns {string} Millisecond or second display, or `-` for invalid durations.
 */
const formatDuration = (milliseconds) => {
  if (!Number.isFinite(milliseconds)) {
    return '-';
  }

  return milliseconds < 1000
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / 1000).toFixed(2)} s`;
};

/**
 * Wraps failure output in a collapsible Markdown details block.
 *
 * @param {*} message - Failure message or stack trace.
 * @returns {string} Collapsible Markdown containing the failure text.
 */
const formatFailure = (message) => {
  const safeMessage = String(message ?? 'Unknown failure')
    .replace(/```/g, "'''")
    .trim();
  return `\n\n<details><summary>Failure details</summary>\n\n\`\`\`text\n${safeMessage}\n\`\`\`\n\n</details>`;
};

/**
 * Renders test rows as a Markdown status, name, and duration table.
 * @param {{status: string, title: string, duration: string}[]} rows - Test rows to render.
 * @returns {string} Markdown table or an empty-report placeholder.
 */
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

/**
 * Counts test rows by their display status.
 * @param {{status: string}[]} rows - Test rows to count.
 * @returns {Record<string, number>} Counts grouped by status label.
 */
const statusCounts = (rows) => rows.reduce((counts, row) => {
  counts[row.status] = (counts[row.status] || 0) + 1;
  return counts;
}, {});

/**
 * Formats the overall case totals by status for a report section.
 * @param {{status: string}[]} rows - Test rows represented by the summary.
 * @returns {string} Markdown summary of total, passed, failed, flaky, and skipped cases.
 */
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

/**
 * Recursively collects Playwright spec records from a nested suite tree.
 *
 * @param {object} suite - Playwright JSON suite node.
 * @param {string[]} [parentTitles=[]] - Enclosing suite titles for full test names.
 * @returns {void} Appends cases and failure details to the report collections.
 */
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

/**
 * Renders failure entries beneath a Markdown subsection.
 *
 * @param {string} heading - Section heading for the runner's failures.
 * @param {{title: string, message: string}[]} failures - Failure entries to render.
 * @returns {string} Markdown failure section, or an empty string when there are none.
 */
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