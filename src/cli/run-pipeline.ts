import { pipeline } from '../container.js';

try {
  const result = await pipeline.run();
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
} catch (err) {
  console.error('Pipeline failed:', err);
  process.exit(1);
}
