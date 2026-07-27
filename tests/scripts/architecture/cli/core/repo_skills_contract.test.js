const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const SKILLS_ROOT = path.join(REPO_ROOT, 'skills');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(SKILLS_ROOT, 'manifest.json'), 'utf8'));

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

test('canonical skill inventory is sorted, complete, and mirrored', () => {
  assert.equal(MANIFEST.schema_version, 1);
  assert.deepEqual(MANIFEST.skills, [...new Set(MANIFEST.skills)].sort());

  const mirrorRoot = path.join(REPO_ROOT, '.agents', 'skills');
  if (fs.existsSync(mirrorRoot)) {
    const result = spawnSync('node', ['scripts/dev/sync_repo_skills.js', '--check'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  }

  const canonicalDirs = fs.readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(canonicalDirs, MANIFEST.skills);
});

test('every public skill has valid package metadata', () => {
  for (const skill of MANIFEST.skills) {
    const skillRoot = path.join(SKILLS_ROOT, skill);
    const body = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
    const metadata = fs.readFileSync(path.join(skillRoot, 'agents', 'openai.yaml'), 'utf8');
    assert.match(body, new RegExp(`^---\\nname: ${skill}\\n`, 'm'));
    assert.match(body, /^description: .+Use .+/m, `${skill} description should contain trigger guidance`);
    assert.match(metadata, /display_name: ".+"/);
    assert.match(metadata, /short_description: ".{25,64}"/);
    assert.match(metadata, new RegExp(`default_prompt: ".*\\$${skill.replaceAll('-', '\\-')}.*"`));
  }
});

test('workflow routing is deterministic and non-live by default', () => {
  const orchestrator = read('skills/session-orchestrator/SKILL.md');
  const exerciser = read('skills/feature-exerciser/SKILL.md');
  const blast = read('skills/blast-through/SKILL.md');
  const mass = read('skills/mass-implement/SKILL.md');

  for (const route of [
    'refine-suggestion',
    'feature-exerciser',
    'blast-through',
    'codex',
    'mass-implement',
    'polymarket-history-backfill',
  ]) {
    assert.match(orchestrator, new RegExp(`\`${route}\``), `orchestrator should route ${route}`);
  }
  assert.match(exerciser, /Do not fix a discovered defect automatically/);
  assert.match(blast, /Audit only/);
  assert.match(blast, /DCS below `0\.95` blocks promotion, not diagnosis/);
  assert.match(mass, /proposed -> preflight -> GO \| GO WITH FIXES \| NO-GO/);
  assert.match(orchestrator, /In Plan Mode or another read-only mode, defer the entry/);
});

test('agent and CLI compatibility docs point at the canonical workflow', () => {
  const agents = read('AGENTS.md');
  const bootstrap = read('docs/operational/guides/bootstrap.md');
  const claude = read('CLAUDE.md');
  const gemini = read('GEMINI.md');

  for (const skill of MANIFEST.skills) {
    assert.match(agents, new RegExp(`\`${skill}\``), `AGENTS.md should list ${skill}`);
  }
  assert.match(bootstrap, /skills\/session-orchestrator\/SKILL\.md/);
  assert.match(claude, /tracked `skills\/` tree is canonical/);
  assert.match(gemini, /skills\/session-orchestrator\/SKILL\.md/);
  assert.doesNotMatch(gemini, /update_topic|git checkout/);
});
