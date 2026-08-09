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

test('every skill enforces bounded-context truthfulness and test integrity', () => {
  for (const skill of MANIFEST.skills) {
    const body = read(`skills/${skill}/SKILL.md`);
    assert.match(body, /## Truthfulness And Test Integrity/, `${skill} should load the shared truth contract`);
    assert.match(body, /Context is bounded/, `${skill} should disclose bounded context`);
    assert.match(body, /Never claim a file was read/, `${skill} should forbid fabricated evidence`);
    assert.match(
      body,
      /Do not weaken, skip, delete, mock away, suppress, or rewrite tests merely to make a result pass/,
      `${skill} should forbid test cheating`,
    );
    assert.match(body, /Change a stale test only with canonical contract or approved behavior evidence/);
  }

  const rules = read('PROJECT_RULES.md');
  assert.match(rules, /## Truthfulness And Test Integrity/);
  assert.match(rules, /A false green is worse than an explicit failure/);
});

test('workflow routing is deterministic and non-live by default', () => {
  const orchestrator = read('skills/session-orchestrator/SKILL.md');
  const exerciser = read('skills/feature-exerciser/SKILL.md');
  const blast = read('skills/blast-through/SKILL.md');
  const mass = read('skills/mass-implement/SKILL.md');
  const refactor = read('skills/refactor-readability/SKILL.md');

  for (const route of [
    'refine-suggestion',
    'feature-exerciser',
    'blast-through',
    'refactor-readability',
    'codex',
    'mass-implement',
    'polymarket-history-backfill',
  ]) {
    assert.match(orchestrator, new RegExp(`\`${route}\``), `orchestrator should route ${route}`);
  }
  assert.match(exerciser, /Do not fix a discovered defect automatically/);
  assert.match(blast, /Audit only/);
  assert.match(blast, /DCS below `0\.95` blocks promotion, not diagnosis/);
  assert.match(blast, /Existing-Codebase Coherence Gate/);
  assert.match(mass, /proposed -> preflight -> GO \| GO WITH FIXES \| NO-GO/);
  assert.match(mass, /Readable Implementation Contract/);
  assert.match(mass, /## Duplicate And Stub Preflight/);
  assert.match(mass, /do not leave poison code beside the\s+new implementation/i);
  assert.match(mass, /Do not delete from string search alone/);
  assert.match(refactor, /behavior-preserving/i);
  assert.match(refactor, /Do not change public APIs/);
  assert.match(orchestrator, /In Plan Mode or another read-only mode, defer the entry/);
});

test('codebase untangler preserves incremental ownership and knowledge boundaries', () => {
  const untangler = read('skills/codebase-untangler/SKILL.md');
  const orchestrator = read('skills/session-orchestrator/SKILL.md');
  const claude = read('CLAUDE.md');

  assert.match(orchestrator, /`codebase-untangler`/);
  assert.match(claude, /skills\/codebase-untangler\/SKILL\.md/);
  assert.match(untangler, /candidate -> mapped -> characterized -> planned -> approved -> implementing -> verified -> reviewed -> migrated -> retired/);
  assert.match(untangler, /Freeze Behavior Before Movement/);
  assert.match(untangler, /Compatibility deletion without complete consumer proof is `NO-GO`/);
  assert.match(untangler, /`docs\/` owns durable, source-linked engineering knowledge/);
  assert.match(untangler, /`workspace\/` owns operational state/);
  assert.match(untangler, /docs\/atlas\/algorithms/);
  assert.match(untangler, /docs\/atlas\/structures/);
  assert.match(untangler, /docs\/atlas\/protocols/);
  assert.match(untangler, /docs\/atlas\/topology/);
  assert.match(untangler, /Work directly in the main session unless the user explicitly authorizes delegation later/);
  assert.match(untangler, /Never use a clean-slate rewrite/);
  assert.match(untangler, /Do not delete from string search alone/);
});

test('blast-through attributes low grades and defects to a proved fault domain and causal owner', () => {
  const blast = read('skills/blast-through/SKILL.md');
  const modes = read('skills/blast-through/references/audit-modes.md');

  assert.match(blast, /## Fault-Domain And Stub-Causality Gate/);
  assert.match(blast, /every confirmed finding and every reviewed section graded below A/);
  for (const faultDomain of [
    'our_source',
    'our_host_or_deployment',
    'operator_config_or_credentials',
    'external_provider',
    'environment_or_sandbox',
    'shared_or_mixed',
    'unresolved',
  ]) {
    assert.match(blast, new RegExp(`\\b${faultDomain}\\b`));
  }
  for (const stubClass of [
    'production_stub',
    'test_stub_only',
    'silent_fallback',
    'compatibility_shim',
    'adapter_not_stub',
    'none',
    'unresolved',
  ]) {
    assert.match(blast, new RegExp(`\\b${stubClass}\\b`));
  }
  assert.match(blast, /Do not infer provider fault from a normalized 401 alone/);
  assert.match(blast, /Report `stub_involvement: none` when no stub participates/);
  assert.match(modes, /## Fault Attribution Matrix/);
  assert.match(modes, /Trace `entrypoint -> caller -> canonical owner -> config projection -> owned runtime -> external dependency ->/);
  assert.match(modes, /Attribute a rejected credential to `operator_config_or_credentials` only when/);
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
