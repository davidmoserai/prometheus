import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { Memory } from '@mastra/memory'
import { LibSQLStore, LibSQLVector } from '@mastra/libsql'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'
import type { ProviderConfig } from './types'

let memoryInstance: Memory | null = null
let hasEmbedder = false

// Embedding models per provider (auto-detected from configured API keys)
const EMBEDDING_MODELS: Record<string, string> = {
  openai: 'openai/text-embedding-3-small',
  'vercel-ai-gateway': 'openai/text-embedding-3-small',
  google: 'google/text-embedding-004',
  mistral: 'mistral/mistral-embed',
}

/**
 * Initialize the shared Memory instance.
 * Auto-detects an embedding model from configured providers for semantic search.
 */
export function initMemory(providers: ProviderConfig[]): Memory {
  const userDataPath = app.getPath('userData')
  const storePath = join(userDataPath, 'prometheus-data')
  if (!existsSync(storePath)) mkdirSync(storePath, { recursive: true })

  const dbUrl = `file:${join(storePath, 'mastra-memory.db')}`

  // Auto-detect embedding model from first configured provider that supports embeddings
  let embedder: InstanceType<typeof ModelRouterEmbeddingModel> | undefined
  for (const providerId of Object.keys(EMBEDDING_MODELS)) {
    const provider = providers.find(p => p.id === providerId && p.apiKey)
    if (provider) {
      const modelId = EMBEDDING_MODELS[providerId]

      // Set the env var so Mastra's model router can find the API key
      switch (provider.id) {
        case 'openai': process.env.OPENAI_API_KEY = provider.apiKey; break
        case 'google': process.env.GOOGLE_GENERATIVE_AI_API_KEY = provider.apiKey; break
        case 'mistral': process.env.MISTRAL_API_KEY = provider.apiKey; break
        case 'vercel-ai-gateway': process.env.AI_GATEWAY_API_KEY = provider.apiKey; break
      }

      embedder = new ModelRouterEmbeddingModel({
        id: modelId as `${string}/${string}`,
        apiKey: provider.apiKey,
      })
      console.log(`Memory: using ${modelId} for semantic search`)
      break
    }
  }

  memoryInstance = new Memory({
    storage: new LibSQLStore({ id: 'prometheus-memory', url: dbUrl }),
    vector: embedder ? new LibSQLVector({ id: 'prometheus-vector', url: dbUrl }) : undefined,
    embedder,
    options: {
      // Don't auto-inject message history — we pass current conversation messages ourselves,
      // and agents use search_memory to look up older conversations on demand
      lastMessages: false,
      semanticRecall: false,
      workingMemory: {
        enabled: true,
        scope: 'resource',
        template: `# Agent Memory

## Key Facts
-

## Decisions & Context
-

## Active Work
-

## Notes
-
`,
      },
    },
  })

  hasEmbedder = !!embedder
  return memoryInstance
}

/**
 * Get the shared Memory instance. Throws if not initialized.
 */
export function getMemory(): Memory {
  if (!memoryInstance) throw new Error('Memory not initialized — call initMemory() first')
  return memoryInstance
}

/**
 * Whether semantic recall (search_memory) is available.
 */
export function isSemanticRecallEnabled(): boolean {
  return hasEmbedder
}
