/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function generateOpenApi31Spec() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'NEXUS X OS - OpenAPI 3.1 Autonomous Agent & Video Studio Engine',
      version: '1.0.0',
      description:
        'Jediný zdroj pravdy pro NEXUS X OS: All-in-one autonomní operační systém, multi-agentní boardroom, LangGraph orchestrace a YouTube MoviePy video factory.',
      contact: {
        name: 'NEXUS X Core Architecture',
        email: 'ops@nexus-x.internal',
      },
    },
    servers: [
      {
        url: '/',
        description: 'Lokální a cloudový produkční uzel',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Bearer autorizační token NEXUS X OS',
        },
      },
      schemas: {
        Thread: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'th-main-001' },
            title: { type: 'string', example: 'NEO Primární Operační Řízení' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            messagesCount: { type: 'integer', example: 4 },
          },
          required: ['id', 'title', 'createdAt', 'updatedAt'],
        },
        Message: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'msg-001' },
            threadId: { type: 'string', example: 'th-main-001' },
            role: { type: 'string', enum: ['user', 'assistant', 'system'] },
            content: { type: 'string', example: 'Analyzoval jsem váš cíl...' },
            createdAt: { type: 'string', format: 'date-time' },
            suggestions: {
              type: 'array',
              items: { type: 'string' },
              description: 'Přesně 6 konkrétních rozkazovacích vět jako další kroky',
            },
            plan: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
                },
              },
            },
          },
          required: ['id', 'threadId', 'role', 'content', 'createdAt'],
        },
        Agent: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'agent-video' },
            name: { type: 'string', example: 'Video Agent' },
            role: { type: 'string', example: 'Video Factory' },
            focus: { type: 'string', example: 'YouTube Shorts střih a retence' },
            confidence: { type: 'integer', minimum: 81, maximum: 94 },
            tasks: { type: 'integer', minimum: 7, maximum: 42 },
            status: { type: 'string', enum: ['active', 'paused'] },
          },
          required: ['id', 'name', 'role', 'focus', 'confidence', 'tasks', 'status'],
        },
        Opportunity: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'opp-1' },
            title: { type: 'string', example: 'Affiliate funnel pro AI nástroje' },
            channel: { type: 'string', enum: ['Affiliate', 'TikTok', 'YouTube', 'Meta Ads', 'E-mail', 'Produkt'] },
            projectionCzk: { type: 'number', example: 18400 },
            confidence: { type: 'number', example: 86 },
            status: { type: 'string', enum: ['new', 'active', 'won', 'paused', 'closed'] },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'title', 'channel', 'projectionCzk', 'confidence', 'status'],
        },
        FactoryAsset: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'asset-001' },
            threadId: { type: 'string', example: 'th-main-001' },
            line: { type: 'string', enum: ['video', 'ad', 'funnel'] },
            title: { type: 'string' },
            prompt: { type: 'string' },
            body: { type: 'string' },
            meta: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['queued', 'rendering', 'ready', 'failed'] },
            mimeType: { type: 'string', example: 'video/mp4' },
            sizeBytes: { type: 'integer', example: 64500 },
            durationSec: { type: 'number', example: 6 },
            resolution: { type: 'string', example: '720x1280' },
            sha256: { type: 'string' },
            streamUrl: { type: 'string', example: '/api/v1/assets/asset-001/stream' },
            downloadUrl: { type: 'string', example: '/api/v1/assets/asset-001/download' },
            createdAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'line', 'title', 'body', 'meta', 'createdAt'],
        },
        RunTrace: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            threadId: { type: 'string' },
            goal: { type: 'string' },
            model: { type: 'string' },
            totalTokens: { type: 'integer' },
            costCzk: { type: 'number' },
            latencyMs: { type: 'number' },
            spans: { type: 'array', items: { type: 'object' } },
            toolCalls: { type: 'array', items: { type: 'object' } },
          },
          required: ['id', 'threadId', 'goal', 'totalTokens', 'costCzk', 'latencyMs'],
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/v1/threads': {
        get: {
          summary: 'Seznam všech konverzačních vláken',
          description: 'Vrátí seznam existujících vláken v NEXUS X OS.',
          responses: {
            '200': {
              description: 'Úspěšný seznam vláken',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Thread' } },
                },
              },
            },
          },
        },
        post: {
          summary: 'Vytvoření nového vlákna',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { title: { type: 'string', example: 'Nové video workflow' } },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Vlákno vytvořeno',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Thread' } } },
            },
          },
        },
      },
      '/v1/threads/{id}/messages': {
        get: {
          summary: 'Zprávy vlákna',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Seznam zpráv',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Message' } } } },
            },
          },
        },
        post: {
          summary: 'Odeslání zprávy (s podporou SSE streamingu i JSON odpovědi)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'string', example: 'Chci vydělat 50 000 Kč měsíčně pomocí YouTube Shorts' },
                    dryRun: { type: 'boolean', default: false },
                  },
                  required: ['content'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Odpověď asistenta NEO včetně plánu a 6 návrhů',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Message' } },
                'text/event-stream': { schema: { type: 'string' } },
              },
            },
          },
        },
      },
      '/v1/boardroom/sessions': {
        post: {
          summary: 'Zahájení zasedání AI Boardroomu',
          description: 'Spustí 3kolovou debatu 16 agentů a vygeneruje vážený konsenzus.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { topic: { type: 'string', example: 'Zvýšení alokace pro YouTube video produkci' } },
                  required: ['topic'],
                },
              },
            },
          },
          responses: { '201': { description: 'Zasedání dokončeno a uloženo' } },
        },
      },
      '/v1/agents': {
        get: {
          summary: 'Seznam 16 agentů',
          responses: { '200': { description: 'Seznam agentů' } },
        },
      },
      '/v1/agents/{id}': {
        patch: {
          summary: 'Změna stavu agenta (active / paused)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { status: { type: 'string', enum: ['active', 'paused'] } },
                  required: ['status'],
                },
              },
            },
          },
          responses: { '200': { description: 'Stav aktualizován' } },
        },
      },
      '/v1/opportunities': {
        get: {
          summary: 'Seznam obchodních příležitostí',
          responses: { '200': { description: 'Příležitosti a pipeline' } },
        },
      },
      '/v1/opportunities/{id}': {
        patch: {
          summary: 'Změna stavu příležitosti (new, active, won, paused, closed)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { status: { type: 'string', enum: ['new', 'active', 'won', 'paused', 'closed'] } },
                  required: ['status'],
                },
              },
            },
          },
          responses: { '200': { description: 'Stav příležitosti upraven' } },
        },
      },
      '/v1/factory/generations': {
        post: {
          summary: 'Generování obsahu na výrobních linkách (video, ad, funnel) s podporou 202 Accepted async workeru',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    line: { type: 'string', enum: ['video', 'ad', 'funnel'] },
                    topic: { type: 'string' },
                    format: { type: 'string', default: '9:16' },
                    templateId: { type: 'string' },
                    async: { type: 'boolean', default: false },
                  },
                  required: ['line', 'topic'],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Vygenerované assety' },
            '202': { description: 'Úloha přijata do pozadí (Retry-After + statusUrl pro polling)' },
          },
        },
      },
      '/v1/factory/assets': {
        get: {
          summary: 'Knihovna vygenerovaných assetů',
          responses: { '200': { description: 'Seznam assetů' } },
        },
      },
      '/api/v1/assets': {
        get: {
          summary: 'Media Vault – seznam vygenerovaných videí a assetů',
          parameters: [
            { name: 'thread_id', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'line', in: 'query', required: false, schema: { type: 'string', enum: ['all', 'video', 'ad', 'funnel'] } },
            { name: 'status', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Seznam assetů v Media Vaultu',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      assets: { type: 'array', items: { $ref: '#/components/schemas/FactoryAsset' } },
                      total: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/assets/render': {
        post: {
          summary: 'Spustí render nového H.264/AAC MP4 videa (-movflags +faststart) a uloží ho do Media Vaultu',
          responses: {
            '201': { description: 'Video asset vyrenderován a ověřen (+faststart)' },
            '202': { description: 'Úloha zařazena do background worker fronty (async: true)' },
          },
        },
      },
      '/api/v1/assets/{asset_id}': {
        get: {
          summary: 'Detail video assetu včetně SHA-256 checksumu a URL pro stream/stažení',
          parameters: [{ name: 'asset_id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Detail video assetu' } },
        },
      },
      '/api/v1/assets/{asset_id}/status': {
        get: {
          summary: 'Stav renderovací úlohy v reálném čase (202 Accepted při zpracování, 200 OK po ověření +faststart & SHA-256)',
          parameters: [{ name: 'asset_id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Video asset je připraven (faststartVerified=true)' },
            '202': { description: 'Background worker zpracovává render (obsahuje Retry-After a progressPercent)' },
          },
        },
      },
      '/api/v1/orchestrator/smart-video/trends': {
        get: {
          summary: 'Analyzuje virální trendy a spáruje nejlepší téma s MoviePy šablonou',
          responses: { '200': { description: 'Analýza trendů a doporučený brief' } },
        },
      },
      '/api/v1/orchestrator/smart-video/analyze-and-trigger': {
        post: {
          summary: 'SmartVideoOrchestrator: analyzuje trendy a automaticky spustí MoviePy + FFmpeg (+faststart) pipeline',
          responses: {
            '201': { description: 'Video dokončeno synchronně' },
            '202': { description: 'Úloha přijata do background workeru s progressem' },
          },
        },
      },
      '/api/v1/assets/{asset_id}/stream': {
        head: {
          summary: 'Pre-check hlaviček streamu (Accept-Ranges, Content-Length, ETag, 202 při renderu)',
          parameters: [{ name: 'asset_id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Hlavičky připraveného streamu' },
            '202': { description: 'Asset se právě generuje (vrací Retry-After)' },
            '206': { description: 'Hlavičky Range segmentu' },
          },
        },
        get: {
          summary: 'HTTP Byte-Range video/mp4 stream (podporuje 206 Partial Content, ETag/If-Range, ?format=poster, ?download=1 a signed URL)',
          parameters: [
            { name: 'asset_id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'format', in: 'query', required: false, schema: { type: 'string', enum: ['poster'] } },
            { name: 'download', in: 'query', required: false, schema: { type: 'string', enum: ['1'] } },
            { name: 'expires', in: 'query', required: false, schema: { type: 'integer' } },
            { name: 'signature', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Kompletní video/mp4 stream nebo JPEG poster' },
            '202': { description: 'Video se právě renderuje (vrací Retry-After)' },
            '206': { description: 'Částečný Byte-Range video/mp4 stream' },
            '304': { description: 'Obsah v lokální cache prohlížeče je aktuální' },
            '403': { description: 'Neplatný nebo expirovaný podpis URL' },
            '416': { description: 'Rozsah mimo velikost souboru (Range Not Satisfiable)' },
          },
        },
      },
      '/api/v1/assets/{asset_id}/download': {
        get: {
          summary: 'Přímé stažení MP4 souboru s Content-Disposition: attachment',
          parameters: [{ name: 'asset_id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'MP4 binární soubor ke stažení' } },
        },
      },
      '/v1/metrics/summary': {
        get: {
          summary: 'Centrální KPI a metriky',
          responses: { '200': { description: 'Metriky firmy' } },
        },
      },
      '/v1/activity': {
        get: {
          summary: 'Audit log aktivit',
          responses: { '200': { description: 'Seznam aktivit' } },
        },
      },
      '/v1/memory/search': {
        get: {
          summary: 'Vyhledávání v hybridní paměti (BM25 + Cosine)',
          parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Nalezené paměti' } },
        },
      },
      '/v1/memory': {
        post: {
          summary: 'Ruční zápis do paměti',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    kind: { type: 'string', enum: ['semantic', 'episodic', 'procedural', 'decision', 'trend'] },
                    scope: { type: 'string', enum: ['user', 'business', 'campaign'] },
                    content: { type: 'string' },
                    importance: { type: 'number', minimum: 0, maximum: 1 },
                  },
                  required: ['kind', 'scope', 'content'],
                },
              },
            },
          },
          responses: { '201': { description: 'Uloženo do paměti' } },
        },
      },
      '/v1/runs/{id}': {
        get: {
          summary: 'Detail běhu (trace, spany, tokeny, cena v Kč, latence)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Trace data běhu' } },
        },
      },
      '/v1/evals/run': {
        post: {
          summary: 'Spuštění 20 Golden Evals testů s LLM-as-judge',
          responses: { '200': { description: 'Výsledky evaluací a regresní test' } },
        },
      },
      '/v1/evals/results': {
        get: {
          summary: 'Poslední výsledky evaluací',
          responses: { '200': { description: 'Historie eval výsledků' } },
        },
      },
      '/healthz': {
        get: {
          summary: 'Health check systému',
          responses: { '200': { description: 'Systém je zdravý' } },
        },
      },
      '/v1/system/pause': {
        post: {
          summary: 'Nouzový vypínač (Kill Switch / Emergency Pause)',
          description: 'Zastaví všechny běžící procesy a zabrání novým exekucím.',
          responses: { '200': { description: 'Systém byl pozastaven nebo obnoven' } },
        },
      },
      '/v1/system/performance': {
        get: {
          summary: 'Reálný monitoring výkonu systému (CPU, RAM, Job Queue)',
          description: 'Vrací aktuální využití CPU (%), spotřebu paměti (MB) a počet úloh ve frontě autonomního OS.',
          responses: { '200': { description: 'Telemetrická data výkonu' } },
        },
      },
      '/v1/system/health/stream': {
        get: {
          summary: 'Real-time SSE stream systémové telemetrie (System Health)',
          description: 'Server-Sent Events kanál vysílající živý stav CPU, RAM, event loop lagu a fronty renderovacích úloh.',
          responses: {
            '200': {
              description: 'SSE stream s událostí health',
              content: { 'text/event-stream': { schema: { type: 'string' } } },
            },
          },
        },
      },
      '/v1/integrations': {
        get: {
          summary: 'Seznam integrací sociálních médií a CMS',
          description: 'Vrátí stav připojení pro Google Drive, Dropbox, YouTube Studio, Facebook Creator a Buffer.',
          responses: { '200': { description: 'Seznam integrací' } },
        },
      },
      '/v1/publish': {
        post: {
          summary: 'Publikace nebo naplánování videa',
          description: 'Odešle hotové video k okamžité publikaci nebo naplánuje na vybrané platformy.',
          responses: { '201': { description: 'Úloha publikace vytvořena' } },
        },
      },
      '/v1/templates': {
        get: {
          summary: 'Seznam stylů a šablon videí (tutoriály, vlogy, news shorts, animované explainery, product demos)',
          parameters: [{ name: 'category', in: 'query', required: false, schema: { type: 'string' } }],
          responses: { '200': { description: 'Seznam šablon' } },
        },
        post: {
          summary: 'Uložení nové uživatelské šablony střihu a scénáře',
          responses: { '201': { description: 'Šablona uložena' } },
        },
      },
      '/v1/templates/{id}': {
        patch: {
          summary: 'Přizpůsobení a aktualizace existující šablony videa',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Šablona aktualizována' } },
        },
        delete: {
          summary: 'Smazání vlastní šablony',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Šablona smazána' } },
        },
      },
      '/v1/analytics': {
        get: {
          summary: 'Analytika výkonu videí (YouTube, TikTok, Instagram Reels)',
          description: 'Vrátí zhlédnutí, lajky, komentáře, dobu sledování, retenci, demografii a doporučení pro další tvorbu.',
          parameters: [{ name: 'platform', in: 'query', required: false, schema: { type: 'string', enum: ['all', 'YouTube', 'TikTok', 'Instagram Reels'] } }],
          responses: { '200': { description: 'Kompletní analytická data' } },
        },
      },
      '/v1/analytics/sync': {
        post: {
          summary: 'Synchronizace metrik výkonu z propojených video platforem',
          responses: { '200': { description: 'Metriky a AI doporučení aktualizovány' } },
        },
      },
      '/v1/accounts': {
        get: {
          summary: 'Seznam studiových účtů a aktivního workspace',
          responses: { '200': { description: 'Seznam účtů a aktivního uživatele' } },
        },
        post: {
          summary: 'Vytvoření nového studiového účtu / pracovního prostoru',
          responses: { '201': { description: 'Účet vytvořen' } },
        },
      },
      '/v1/team': {
        get: {
          summary: 'Seznam členů týmu a matice oprávnění (Admin, Editor, Viewer)',
          responses: { '200': { description: 'Seznam členů týmu a role' } },
        },
      },
      '/v1/team/invite': {
        post: {
          summary: 'Pozvání člena týmu s přiřazením role a oprávnění',
          responses: { '201': { description: 'Člen pozván a přidán' } },
        },
      },
      '/v1/team/{id}': {
        patch: {
          summary: 'Změna role, stavu nebo oprávnění člena týmu',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Člen aktualizován' } },
        },
        delete: {
          summary: 'Odebrání člena týmu',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Člen odebrán' } },
        },
      },
      '/v1/team/switch-actor': {
        post: {
          summary: 'Přepnutí aktivního uživatelského profilu pro ověření RBAC oprávnění',
          responses: { '200': { description: 'Aktivní profil přepnut' } },
        },
      },
    },
  };
}
