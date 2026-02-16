import { runPipeline } from '../agents/pipeline';
import { generateMachineJson } from './generateMachineJson';

async function main() {
  await runPipeline({ rootDirAbs: process.cwd() });
  await generateMachineJson({ rootDirAbs: process.cwd() });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(String(err));
  process.exit(1);
});
