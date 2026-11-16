/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BoardroomSession, BoardroomVote } from '../types/nexus.ts';
import { db } from './db.ts';

export class BoardroomEngine {
  public static async conveneSession(topic: string): Promise<BoardroomSession> {
    const traceId = `trace-boardroom-${Date.now().toString(36)}`;

    // Select 7 active key executive agents for the debate
    const participatingAgents = [
      db.agents.find((a) => a.id === 'agent-ceo') || db.agents[0],
      db.agents.find((a) => a.id === 'agent-cfo') || db.agents[1],
      db.agents.find((a) => a.id === 'agent-coo') || db.agents[2],
      db.agents.find((a) => a.id === 'agent-cmo') || db.agents[4],
      db.agents.find((a) => a.id === 'agent-video') || db.agents[5],
      db.agents.find((a) => a.id === 'agent-revenue') || db.agents[13],
      db.agents.find((a) => a.id === 'agent-cto') || db.agents[3],
    ];

    // Round 1: Independent Positions
    const round1_positions: BoardroomVote[] = participatingAgents.map((agent) => {
      let vote: 'pro' | 'proti' | 'kompromis' = 'pro';
      let note = '';

      if (agent.id === 'agent-cfo') {
        vote = 'kompromis';
        note = 'Podmínkou je striktní limit CAC do 180 Kč a testovací rozpočet maximálně 10 000 Kč.';
      } else if (agent.id === 'agent-coo') {
        vote = 'kompromis';
        note = 'Produkční kapacita MoviePy pipeline zvládne maximálně 12 videí denně bez přetížení render uzlů.';
      } else if (agent.id === 'agent-video') {
        vote = 'pro';
        note = 'YouTube Shorts s humorným háčkem v prvních 3 s mají momentálně nejnižší náklad na zhlédnutí.';
      } else if (agent.id === 'agent-cmo') {
        vote = 'pro';
        note = 'Okamžitá virální distribuce napříč YouTube a TikTokem zajistí exponenciální organický reach.';
      } else if (agent.id === 'agent-revenue') {
        vote = 'pro';
        note = 'Affiliate můstek přináší odhadovaný konverzní poměr 3.4 % s okamžitou výplatou provizí.';
      } else if (agent.id === 'agent-cto') {
        vote = 'kompromis';
        note = 'Architektura LangGraphu vyžaduje idempotentní tool caching, aby nedošlo k duplicitním voláním.';
      } else {
        vote = 'pro';
        note = 'Strategicky schvaluji spuštění s vyhodnocením klíčových KPI po prvních 7 dnech.';
      }

      return { agent: agent.name, vote, note };
    });

    // Round 2: Counter-critique
    const round2_critique: BoardroomVote[] = [
      {
        agent: 'CFO Agent',
        vote: 'kompromis',
        note: 'Kritika CMO: Organický dosah bez affiliate trackingu je neefektivní. Trvám na atribučním modelu.',
      },
      {
        agent: 'COO Agent',
        vote: 'kompromis',
        note: 'Kritika Video Agenta: Nesmíme obětovat technickou kvalitu zvuku na úkor kvantity.',
      },
      {
        agent: 'CMO Agent',
        vote: 'pro',
        note: 'Reakce pro CFO: Všechna videa obsahují trackovaný UTM parametr a zkrácený referral link.',
      },
      {
        agent: 'Video Agent',
        vote: 'pro',
        note: 'MoviePy 2.x automatizace garantuje 1080x1920 rozlišení a čistou dynamickou kinetickou typografii.',
      },
    ];

    // Round 3: Compromise & Consensus Scoring
    // Weights: margin 0.3, speed 0.25, risk 0.25, capacity 0.2
    const marginScore = 88;
    const speedScore = 92;
    const riskScore = 80;
    const capacityScore = 85;

    const weightedScore = Math.round(
      marginScore * 0.3 + speedScore * 0.25 + riskScore * 0.25 + capacityScore * 0.2
    );

    const round3_compromise: BoardroomVote[] = participatingAgents.map((agent) => {
      let vote: 'pro' | 'proti' | 'kompromis' = 'pro';
      let note = '';

      if (agent.id === 'agent-cfo') {
        vote = 'pro';
        note = 'Konsenzus: Akceptuji spuštění s denním stropem 2 000 Kč na placenou akceleraci.';
      } else if (agent.id === 'agent-coo') {
        vote = 'pro';
        note = 'Konsenzus: Automatizovaná fronta nastavena na 8 videí denně s intervalem 3 hodiny.';
      } else {
        vote = 'pro';
        note = 'Konsenzus: Všechny podmínky splněny, workflow je schváleno k ostré exekuci.';
      }

      return { agent: agent.name, vote, note, score: weightedScore };
    });

    const session: BoardroomSession = {
      id: `br-session-${Date.now().toString(36)}`,
      topic,
      verdict: `Schváleno: Spustit autonomní YouTube a affiliate pipeline s denním limitem 2 000 Kč.`,
      summary: `Porada schválila okamžité spuštění video výrobní linky s integrovaným affiliate trychtýřem. CFO a COO vymínili automatické zastavení při překročení limitu chybovosti. Primárním rizikem zůstává saturace publika, které bude mitigováno střídáním 3 kreativních formátů.`,
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
      title: `Boardroom konsenzus: ${topic.substring(0, 40)}`,
      description: `Verdikt: "${session.verdict}" (Konsenzus skóre: ${weightedScore}%)`,
      agent: 'CEO Agent',
      timestamp: new Date().toISOString(),
      type: 'decision',
    });

    return session;
  }
}
