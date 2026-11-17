/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { BoardroomSession, BoardroomVote } from '../types/nexus.ts';
import { db } from './db.ts';

interface TopicProfile {
  category: 'budget_conservative' | 'video_scale' | 'affiliate_revenue' | 'night_automation' | 'general';
  budgetCapCzk: number;
  dailyVideosTarget: number;
  marginScore: number;
  speedScore: number;
  riskScore: number;
  capacityScore: number;
  primaryMitigation: string;
}

function classifyTopicProfile(topic: string): TopicProfile {
  const lower = topic.toLowerCase();
  const remainingDailyBudget = Math.max(200, Math.round(db.dailyCzkBudgetLimit - db.totalCzkBudgetSpent));

  if (/snížen|konzerv|cashflow|rozpoč|budget|úspor|náklad|limit/i.test(lower)) {
    return {
      category: 'budget_conservative',
      budgetCapCzk: Math.min(1200, remainingDailyBudget),
      dailyVideosTarget: 5,
      marginScore: 93,
      speedScore: 79,
      riskScore: 92,
      capacityScore: 90,
      primaryMitigation: 'zamrazení placené akcelerace při ROAS < 1.8 a prioritizace lokálního FFmpeg renderu za 0 Kč',
    };
  }

  if (/affiliate|trychtýř|funnel|partner|prodej|konverz|monetiz|výnos/i.test(lower)) {
    return {
      category: 'affiliate_revenue',
      budgetCapCzk: Math.min(2500, remainingDailyBudget),
      dailyVideosTarget: 8,
      marginScore: 91,
      speedScore: 86,
      riskScore: 81,
      capacityScore: 87,
      primaryMitigation: 'povinné UTM trackování všech affiliate odkazů a automatická synchronizace hot leadů do CRM',
    };
  }

  if (/noční|night|smyčk|loop|automatick|bezobsluž/i.test(lower)) {
    return {
      category: 'night_automation',
      budgetCapCzk: Math.min(1800, remainingDailyBudget),
      dailyVideosTarget: 10,
      marginScore: 87,
      speedScore: 94,
      riskScore: 76,
      capacityScore: 82,
      primaryMitigation: 'aktivace circuit breakeru a automatického Kill Switche při překročení chybovosti renderů > 5 %',
    };
  }

  if (/video|youtube|tiktok|reels|shorts|moviepy|produk|obsah/i.test(lower)) {
    return {
      category: 'video_scale',
      budgetCapCzk: Math.min(2200, remainingDailyBudget),
      dailyVideosTarget: 8,
      marginScore: 88,
      speedScore: 92,
      riskScore: 82,
      capacityScore: 86,
      primaryMitigation: 'střídání 3 kreativních formátů (Shorts/Reels/Tutorial) pro prevenci saturace publika',
    };
  }

  return {
    category: 'general',
    budgetCapCzk: Math.min(2000, remainingDailyBudget),
    dailyVideosTarget: 6,
    marginScore: 85,
    speedScore: 87,
    riskScore: 83,
    capacityScore: 88,
    primaryMitigation: 'postupný rollout v kontrolovaných dávkách s denním vyhodnocením konverzních metrik',
  };
}

export class BoardroomEngine {
  public static async conveneSession(topic: string): Promise<BoardroomSession> {
    const cleanTopic = topic.trim();
    const traceId = `trace-boardroom-${Date.now().toString(36)}`;
    const profile = classifyTopicProfile(cleanTopic);

    const activeAgentsCount = db.agents.filter((a) => a.status === 'active').length;
    const totalPipelineCzk = db.opportunities
      .filter((o) => o.status !== 'closed')
      .reduce((acc, o) => acc + o.projectionCzk, 0);
    const shortTopic = cleanTopic.length > 72 ? `${cleanTopic.slice(0, 69)}...` : cleanTopic;

    const participatingAgents = [
      db.agents.find((a) => a.id === 'agent-ceo') || db.agents[0],
      db.agents.find((a) => a.id === 'agent-cfo') || db.agents[1],
      db.agents.find((a) => a.id === 'agent-coo') || db.agents[2],
      db.agents.find((a) => a.id === 'agent-cmo') || db.agents[4],
      db.agents.find((a) => a.id === 'agent-video') || db.agents[5],
      db.agents.find((a) => a.id === 'agent-revenue') || db.agents[13],
      db.agents.find((a) => a.id === 'agent-cto') || db.agents[3],
    ];

    // Round 1: Independent topic-aware positions
    let round1_positions: BoardroomVote[] = participatingAgents.map((agent) => {
      let vote: 'pro' | 'proti' | 'kompromis' = 'pro';
      let note = '';

      if (agent.id === 'agent-cfo') {
        vote = profile.category === 'budget_conservative' ? 'pro' : 'kompromis';
        note = `K tématu "${shortTopic}": požaduji striktní denní strop ${profile.budgetCapCzk.toLocaleString('cs-CZ')} Kč při aktuální pipeline ${totalPipelineCzk.toLocaleString('cs-CZ')} Kč.`;
      } else if (agent.id === 'agent-coo') {
        vote = profile.category === 'night_automation' ? 'kompromis' : 'pro';
        note = `Provozní kapacita (${activeAgentsCount} aktivních agentů) bezpečně zvládne ${profile.dailyVideosTarget} výstupů denně pro "${shortTopic}".`;
      } else if (agent.id === 'agent-video') {
        vote = profile.category === 'budget_conservative' ? 'kompromis' : 'pro';
        note = `Pro "${shortTopic}" nasadíme lokální MoviePy/FFmpeg render (0 externích kreditů) s 3s kinetickým hookem.`;
      } else if (agent.id === 'agent-cmo') {
        vote = profile.category === 'budget_conservative' ? 'kompromis' : 'pro';
        note = `Distribuce zaměřená na "${shortTopic}" maximalizuje organický dosah bez závislosti na placené reklamě.`;
      } else if (agent.id === 'agent-revenue') {
        vote = 'pro';
        note = `Napojení na AI Comment Swarm DM trychtýř a affiliate můstek promění poptávku z "${shortTopic}" v měřitelné příležitosti.`;
      } else if (agent.id === 'agent-cto') {
        vote = 'kompromis';
        note = `Vyžaduji idempotentní exekuci a aktivní guardrails/Kill Switch při nasazení plánu "${shortTopic}".`;
      } else {
        vote = 'pro';
        note = `Strategicky podporuji "${shortTopic}" s týdenním auditem marže, retence a bezpečnosti.`;
      }

      return { agent: agent.name, vote, note };
    });

    // Round 2: Counter-critique
    let round2_critique: BoardroomVote[] = [
      {
        agent: 'CFO Agent',
        vote: 'kompromis',
        note: `Kritika CMO k "${shortTopic}": Každý kanál musí reportovat atribuci a návratnost před dalším navýšením limitu nad ${profile.budgetCapCzk.toLocaleString('cs-CZ')} Kč.`,
      },
      {
        agent: 'COO Agent',
        vote: 'kompromis',
        note: `Kritika Video Agenta: Při ${profile.dailyVideosTarget} kusech denně trvám na SHA-256 kontrole integrity a +faststart auditu před publikací.`,
      },
      {
        agent: 'CMO Agent',
        vote: 'pro',
        note: `Reakce pro CFO: Všechny kampaně pro "${shortTopic}" používají trackované CTA klíčové slovo a UTM atribuční model.`,
      },
      {
        agent: 'CTO Agent',
        vote: 'pro',
        note: `Architektura připravena: RBAC oprávnění, circuit breaker i nouzový Kill Switch chrání realizaci "${shortTopic}".`,
      },
    ];

    const weightedScore = Math.round(
      profile.marginScore * 0.3 +
        profile.speedScore * 0.25 +
        profile.riskScore * 0.25 +
        profile.capacityScore * 0.2
    );

    // Round 3: Compromise & Consensus
    let round3_compromise: BoardroomVote[] = participatingAgents.map((agent) => {
      if (agent.id === 'agent-cfo') {
        return {
          agent: agent.name,
          vote: 'pro',
          note: `Konsenzus: Schváleno pro "${shortTopic}" s denním limitem ${profile.budgetCapCzk.toLocaleString('cs-CZ')} Kč.`,
          score: weightedScore,
        };
      }
      if (agent.id === 'agent-coo') {
        return {
          agent: agent.name,
          vote: 'pro',
          note: `Konsenzus: Pipeline nastavena na ${profile.dailyVideosTarget} úloh/den s automatickým monitoringem zdraví.`,
          score: weightedScore,
        };
      }
      return {
        agent: agent.name,
        vote: 'pro',
        note: `Konsenzus: Akceptuji opatření (${profile.primaryMitigation}) pro realizaci "${shortTopic}".`,
        score: weightedScore,
      };
    });

    let verdict = `Schváleno (${weightedScore}%): Realizovat "${shortTopic}" s limitem ${profile.budgetCapCzk.toLocaleString('cs-CZ')} Kč/den a dávkou ${profile.dailyVideosTarget} výstupů denně.`;
    let summary = `AI Boardroom projednal téma "${cleanTopic}" s ${activeAgentsCount} aktivními agenty a celkovou pipeline ${totalPipelineCzk.toLocaleString('cs-CZ')} Kč. Hlavní strategií je kombinace lokálního nulového renderu a řízené konverze bez planých nákladů. Klíčová mitigace rizik: ${profile.primaryMitigation}.`;

    // Optional Gemini 4 Hydrogen live debate enrichment when key exists outside unit test mode
    const apiKey = process.env.GEMINI_API_KEY;
    const canUseGemini =
      Boolean(apiKey) &&
      apiKey !== 'MY_GEMINI_API_KEY' &&
      process.env.NODE_ENV !== 'test' &&
      !process.env.NODE_TEST_CONTEXT;

    if (canUseGemini && apiKey) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Téma zasedání AI Boardroomu: "${cleanTopic}"
Kontext studia: ${activeAgentsCount} aktivních agentů, pipeline ${totalPipelineCzk} Kč, zbývající denní limit ${profile.budgetCapCzk} Kč, cílová kapacita ${profile.dailyVideosTarget} výstupů/den.
Vygeneruj přesný český exekutivní verdikt (max 22 slov), 2 věty souhrnu porady se zmínkou konkrétního tématu a krátké reakce pro CFO, CMO a CTO.`,
          config: {
            abortSignal: controller.signal,
            systemInstruction:
              'Jsi exekutivní předseda AI Boardroomu. Odpovídej výhradně česky, realisticky, bez přehnaných slibů a bez markdownu.',
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                verdict: { type: Type.STRING },
                summary: { type: Type.STRING },
                cfoNote: { type: Type.STRING },
                cmoNote: { type: Type.STRING },
                ctoNote: { type: Type.STRING },
              },
            },
          },
        });
        const raw = (response.text ?? '').trim();
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.verdict === 'string' && parsed.verdict.trim().length > 10) {
            verdict = parsed.verdict.trim().slice(0, 160);
          }
          if (typeof parsed.summary === 'string' && parsed.summary.trim().length > 20) {
            summary = parsed.summary.trim().slice(0, 420);
          }
          if (typeof parsed.cfoNote === 'string' && parsed.cfoNote.trim()) {
            round1_positions = round1_positions.map((r) =>
              r.agent === 'CFO Agent' ? { ...r, note: parsed.cfoNote.trim().slice(0, 180) } : r
            );
          }
          if (typeof parsed.cmoNote === 'string' && parsed.cmoNote.trim()) {
            round1_positions = round1_positions.map((r) =>
              r.agent === 'CMO Agent' ? { ...r, note: parsed.cmoNote.trim().slice(0, 180) } : r
            );
          }
          if (typeof parsed.ctoNote === 'string' && parsed.ctoNote.trim()) {
            round2_critique = round2_critique.map((r) =>
              r.agent === 'CTO Agent' ? { ...r, note: parsed.ctoNote.trim().slice(0, 180) } : r
            );
          }
        }
      } catch {
        // Keep topic-aware deterministic result cleanly on network timeout/error
      } finally {
        clearTimeout(timeout);
      }
    }

    const session: BoardroomSession = {
      id: `br-session-${Date.now().toString(36)}`,
      topic: cleanTopic,
      verdict,
      summary,
      consensusScore: weightedScore,
      rounds: {
        round1_positions,
        round2_critique,
        round3_compromise,
      },
      votes: round3_compromise,
      createdAt: new Date().toISOString(),
      traceId,
    };

    db.boardroomSessions.unshift(session);

    db.activities.unshift({
      id: `act-${Date.now()}`,
      title: `Boardroom konsenzus: ${shortTopic}`,
      description: `Verdikt: "${session.verdict}" (Konsenzus skóre: ${weightedScore}%)`,
      agent: 'CEO Agent',
      timestamp: new Date().toISOString(),
      type: 'decision',
    });

    return session;
  }
}
