# NEXUS X OS: All-in-One Autonomní Agentní Operační Systém & YouTube Video Factory

> **OpenAPI 3.1 služba s vlastním agentním runtimem, OpenAI/Gemini tool callingem, LangGraph architekturou a automatizovaným MoviePy 2.x renderováním.**

---

## 0. První Princip Produktu

NEXUS X OS není dashboard, CRM ani jednoduchý generátor videí. Je to **AI operační systém autonomní digitální firmy**:
- **Chat je mozek (NEO)**.
- **Agenti jsou zaměstnanci (16 specializovaných rolí)**.
- **Workflow jsou výrobní linky (YouTube Shorts / TikTok / Ads / Funnels)**.
- **Po každé odpovědi vzniká minimálně 6 konkrétních rozkazovacích pokračování**. Stav "hotovo" neexistuje.
- **Každá GUI akce má chatovou reprezentaci a každá chatová akce má záznam ve workflow logu**.

---

## 1. Architektura Systému

```
React 19 UI ──HTTP/SSE──> Express Backend (Port 3000) ──> Run Engine (Vlastní kód)
                                    ├── Planner (goal → 3-krokový plán + alokace agentů)
                                    ├── Tool Router (OpenAPI 3.1 registry → 12 reálných toolů)
                                    ├── Executor (Zod validace, timeout 10s, retry, idempotence, circuit breaker)
                                    ├── Critic (kontrola rubric: cíl, konkrétnost, bez vymyšlených peněz)
                                    ├── Memory (hybridní retrieval: BM25 0.4 + Cosine 0.6 + decay)
                                    ├── Guardrails (moderace, PII redakce, injection detekce, budget stop)
                                    ├── Tracer (spans, tokeny, cena v Kč, latence ms)
                                    ├── LangGraph Orchestrator (StateGraph s uzly, větvením a checkpointy)
                                    └── MoviePy 2.x Engine (automatizované video storyboardy, audio a titulky)
```

---

## 2. 16 Specializovaných Agentů (Seeded)

1. **CEO Agent** (Strategie) - Exekutivní řízení a alokace kapitálu (Confidence 94%, 42 úkolů, Active)
2. **CFO Agent** (Finance) - Cashflow, marže a jednotková ekonomika (Confidence 91%, 38 úkolů, Active)
3. **COO Agent** (Provoz) - Procesní kapacity a MoviePy render uzly (Confidence 89%, 31 úkolů, Active)
4. **CTO Agent** (Technika) - Architektura systémů, spolehlivost API (Confidence 92%, 35 úkolů, Active)
5. **CMO Agent** (Marketing) - Virální distribuce a retence (Confidence 88%, 29 úkolů, Active)
6. **Video Agent** (Video Factory) - YouTube Shorts střih a MoviePy render (Confidence 93%, 40 úkolů, Active)
7. **Visual Agent** (Vizuál) - Kinetická typografie a brand pack (Confidence 87%, 24 úkolů, Paused)
8. **Affiliate Agent** (Affiliate) - Partnerské můstky a konverze (Confidence 86%, 27 úkolů, Active)
9. **SEO Agent** (SEO) - Vyhledávací záměr a YouTube metadata (Confidence 84%, 22 úkolů, Paused)
10. **Trend Agent** (Trendy) - Monitoring sociálních signálů (Confidence 89%, 33 úkolů, Active)
11. **Research Agent** (Výzkum) - Konkurenční benchmarky a fact-checking (Confidence 83%, 19 úkolů, Paused)
12. **Analytics Agent** (Data) - Retence diváků a atribuční modely (Confidence 90%, 30 úkolů, Active)
13. **Automation Agent** (Automatizace) - Webhooky a bezobslužný provoz (Confidence 92%, 36 úkolů, Active)
14. **Revenue Agent** (Výnosy) - Monetizační kaskády a cenotvorba (Confidence 88%, 28 úkolů, Active)
15. **Knowledge Agent** (Znalosti) - Sémantická paměť a korporátní kontext (Confidence 85%, 16 úkolů, Paused)
16. **Experiment Agent** (Experimenty) - A/B testování hooků a statistika (Confidence 82%, 14 úkolů, Paused)

---

## 3. OpenAPI 3.1 Endpointy

- `GET /openapi.json` - Validní OpenAPI 3.1 schéma
- `GET /docs` - Interaktivní Scalar API Reference dokumentace
- `POST /v1/threads`, `GET /v1/threads`, `GET /v1/threads/{id}/messages` - Správa konverzací
- `POST /v1/threads/{id}/messages` - Odeslání zprávy s SSE streamingem nebo JSON odpovědí
- `POST /v1/boardroom/sessions` - Spuštění 3-kolové debaty 16 agentů
- `GET /v1/agents`, `PATCH /v1/agents/{id}` - Stav agentů (active / paused)
- `GET /v1/opportunities`, `PATCH /v1/opportunities/{id}` - Obchodní pipeline
- `POST /v1/factory/generations`, `GET /v1/factory/assets` - Video & asset generátor
- `GET /v1/metrics/summary`, `GET /v1/activity` - KPI a auditní stream
- `GET /v1/memory/search?q=`, `POST /v1/memory` - Hybridní paměť
- `GET /v1/runs/{id}` - Telemetrický trace běhu (spany, tokeny, náklady v Kč)
- `POST /v1/evals/run`, `GET /v1/evals/results` - Spuštění 20 Golden Evals testů
- `GET /healthz`, `POST /v1/system/pause` - Health check a Emergency Kill Switch

---

## 4. Spuštění a Vývoj

```bash
# Instalace závislostí
npm install

# Spuštění unit testů (node:test)
npm test

# Spuštění dev serveru (Express + Vite na portu 3000)
npm run dev

# Sestavení produkčního buildu
npm run build
```
