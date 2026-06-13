// Golden-set synthesis eval: runs the real synthesizer over a fixed input set
// and scores grounding/coverage/length/topics so prompt changes become
// falsifiable. Requires ANTHROPIC_API_KEY (it makes real LLM calls), like the
// pipeline CLI. The scoring logic is unit-tested in src/eval/scorer.test.ts.
import { GOLDEN_SET } from '../eval/golden-set.js';
import { DEFAULT_THRESHOLDS, scorePost } from '../eval/scorer.js';
import { ClaudeSynthesizer } from '../llm/synthesizer.js';

const synthesizer = new ClaudeSynthesizer();
let failed = 0;

for (const testCase of GOLDEN_SET) {
  try {
    const { post } = await synthesizer.synthesize(testCase.clusters);
    const s = scorePost(post, testCase.clusters, DEFAULT_THRESHOLDS);
    const lines = [
      `\n=== ${testCase.name} === ${s.pass ? 'PASS' : 'FAIL'}`,
      `  citations:  ${s.citationCount} (out-of-range: ${s.invalidCitations.join(',') || 'none'})`,
      `  coverage:   ${s.coveredSources}/${s.totalSources} (${(s.sourceCoverage * 100).toFixed(0)}%)`,
      `  words:      ${s.wordCount} (in range: ${s.lengthInRange})`,
      `  density:    ${s.citationDensityPer100Words.toFixed(1)} cites/100 words`,
      `  topics:     ${s.topicCount} [${post.topics.join(', ')}] (canonical: ${s.topicsCanonical})`,
      `  TL;DR:      ${s.hasTldr}`,
    ];
    if (s.failures.length) lines.push(`  FAILURES:   ${s.failures.join('; ')}`);
    console.log(lines.join('\n'));
    if (!s.pass) failed++;
  } catch (err) {
    console.error(`\n=== ${testCase.name} === ERROR`);
    console.error(err);
    failed++;
  }
}

console.log(`\n${GOLDEN_SET.length - failed}/${GOLDEN_SET.length} cases passed`);
process.exit(failed > 0 ? 1 : 0);
