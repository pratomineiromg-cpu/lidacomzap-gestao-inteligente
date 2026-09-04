import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChannelProvider } from '../../../src/domain/omnichannel';
import type { ChannelGatewayAdapter, GatewayAuditEvent } from '../contracts';
import { GatewayError } from '../errors';
import { InMemoryIdempotencyStore } from '../idempotency';
import { processInboundProviderEvent } from '../inbound';
import { EvolutionOptionalOfflineAdapter } from '../providers/evolution-optional';
import { RcsGoogleOfflineAdapter } from '../providers/rcs-google';
import { WhatsAppMetaOfflineAdapter } from '../providers/whatsapp-meta';

const FIXTURE_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures'
);

interface SimulatorArguments {
  provider: ChannelProvider;
  fixture: string;
  repeat: number;
}

function parseArguments(args: readonly string[]): SimulatorArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new GatewayError('INVALID_EVENT');
    }
    values.set(key.slice(2), value);
  }

  const provider = values.get('provider') as ChannelProvider | undefined;
  const fixture = values.get('fixture');
  const repeatValue = values.get('repeat') ?? '1';
  const repeat = Number(repeatValue);
  if (
    !provider ||
    !fixture ||
    !['WHATSAPP_META_OFFICIAL', 'WHATSAPP_EVOLUTION_OPTIONAL', 'RCS_GOOGLE'].includes(provider) ||
    !Number.isInteger(repeat) ||
    repeat < 1 ||
    repeat > 10
  ) {
    throw new GatewayError('INVALID_EVENT');
  }
  return { provider, fixture, repeat };
}

function adapterFor(provider: ChannelProvider): ChannelGatewayAdapter {
  if (provider === 'WHATSAPP_META_OFFICIAL') {
    return new WhatsAppMetaOfflineAdapter({
      capabilities: ['TEXT', 'DELIVERY_RECEIPT'],
      capabilitySource: 'MANUAL'
    });
  }
  if (provider === 'RCS_GOOGLE') {
    return new RcsGoogleOfflineAdapter({
      capabilities: ['TEXT', 'RICH_MEDIA', 'DELIVERY_RECEIPT', 'READ_RECEIPT'],
      capabilitySource: 'MANUAL'
    });
  }
  return new EvolutionOptionalOfflineAdapter({
    capabilities: ['TEXT'],
    capabilitySource: 'MANUAL'
  });
}

export function loadSyntheticFixture(fixtureName: string): unknown {
  if (
    path.basename(fixtureName) !== fixtureName ||
    path.extname(fixtureName).toLowerCase() !== '.json'
  ) {
    throw new GatewayError('INVALID_EVENT');
  }
  const resolved = path.resolve(FIXTURE_DIRECTORY, fixtureName);
  if (path.dirname(resolved) !== FIXTURE_DIRECTORY) {
    throw new GatewayError('INVALID_EVENT');
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
}

export function simulateFixture(
  adapter: ChannelGatewayAdapter,
  rawFixture: unknown,
  repeat: number
): readonly GatewayAuditEvent[] {
  const store = new InMemoryIdempotencyStore();
  const audits: GatewayAuditEvent[] = [];
  for (let index = 0; index < repeat; index += 1) {
    const result = processInboundProviderEvent({
      adapter,
      rawFixture,
      idempotencyStore: store
    });
    audits.push(result.audit);
  }
  return audits;
}

export function executeGatewaySimulatorCli(
  args: readonly string[],
  write: (line: string) => void = console.log
): number {
  try {
    const parsed = parseArguments(args);
    const rawFixture = loadSyntheticFixture(parsed.fixture);
    const audits = simulateFixture(adapterFor(parsed.provider), rawFixture, parsed.repeat);
    for (const audit of audits) {
      write(JSON.stringify(audit));
    }
    return audits.every((audit) => audit.outcome !== 'REJECTED') ? 0 : 1;
  } catch (error) {
    const code = error instanceof GatewayError ? error.code : 'INVALID_EVENT';
    write(`FAIL ${code}`);
    return 1;
  }
}

const isDirectExecution = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectExecution) {
  process.exitCode = executeGatewaySimulatorCli(process.argv.slice(2));
}
