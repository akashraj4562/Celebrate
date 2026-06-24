import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { generateDeliverable } from './generate';

// Load server/.env regardless of the process's working directory.
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') });

const PORT = Number(process.env.PORT ?? 5201);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5200';

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[celebrate] WARNING: ANTHROPIC_API_KEY is not set in server/.env');
}

// Reads ANTHROPIC_API_KEY from the environment. The key lives only here, server-side.
const anthropic = new Anthropic();

const app = express();
app.use(cors({ origin: WEB_ORIGIN }));
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'celebrate-api' });
});

// Step-1 hello-world: proves the Anthropic round-trip works through the proxy.
app.get('/api/ping', async (_req, res) => {
  try {
    const message = await anthropic.messages.create({
      model: process.env.MODEL_CHAT ?? 'claude-sonnet-4-6',
      max_tokens: 64,
      messages: [
        { role: 'user', content: 'Reply with exactly this sentence: Celebrate backend is live.' },
      ],
    });
    const reply = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
    res.json({ ok: true, model: message.model, reply });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    console.error('[/api/ping]', detail);
    res.status(500).json({ ok: false, error: detail });
  }
});

// Generate a single module's Deliverable (spec §6, §11).
app.post('/api/module/generate', async (req, res) => {
  const { moduleId, planState } = req.body ?? {};
  if (!moduleId || !planState?.input) {
    res.status(400).json({ error: 'moduleId and planState (with input) are required' });
    return;
  }
  try {
    const t0 = Date.now();
    const deliverable = await generateDeliverable(anthropic, moduleId, planState);
    console.log(`[generate] ${moduleId} in ${Date.now() - t0}ms`);
    res.json(deliverable);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    console.error('[/api/module/generate]', detail);
    res.status(500).json({ error: detail });
  }
});

app.listen(PORT, () => {
  console.log(`[celebrate] API listening on http://localhost:${PORT} (web origin: ${WEB_ORIGIN})`);
});
