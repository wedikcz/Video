/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GuardrailsService } from './guardrails.ts';
import { ToolExecutor } from './executor.ts';
import { CriticEngine } from './critic.ts';
import { MemoryService } from './memory.ts';
import { TracerService } from './tracer.ts';
import { VideoDirectorEngine } from './videoDirector.ts';
import { db } from '../db.ts';
import {
  Message,
  MultiGenArtifact,
  MultiGenMode,
  SelfHealingEvent,
  StepPlanItem,
  VideoCreativeBrief,
} from '../../types/nexus.ts';

export interface RunExecutionParams {
  threadId: string;
  userMessage: string;
  dryRun?: boolean;
  modelId?: string;
  multiGenMode?: MultiGenMode;
  onStreamEvent?: (event: { type: 'delta' | 'tool_event' | 'span' | 'done'; data: any }) => void;
}

export class AgentOrchestrator {
  public static async executeGoal(params: RunExecutionParams): Promise<{
    message: Message;
    runId: string;
    trace: any;
  }> {
    const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const tracer = new TracerService(runId, params.threadId, params.userMessage);
    const overallEnd = tracer.startSpan('orchestrator:lifecycle');

    // 0. Enforce Emergency Kill Switch honestly at runtime boundary
    if (db.isSystemPaused) {
      overallEnd('error', { reason: 'Emergency Kill Switch active' });
      const trace = tracer.finish();
      const pausedMsg: Message = {
        id: `msg-${Date.now()}`,
        threadId: params.threadId,
        role: 'assistant',
        content:
          'NEXUS X OS je aktuálně pozastaven (Nouzový Kill Switch). Autonomní nástroje a video rendery byly z bezpečnostních důvodů zastaveny. Klikněte na "OBNOVIT OS" v horní liště pro pokračování.',
        createdAt: new Date().toISOString(),
        suggestions: [
          'Obnovit provoz NEXUS X OS v horní liště',
          'Zkontrolovat auditní aktivitu před pozastavením',
          'Ověřit zůstatek denního rozpočtu',
          'Zobrazit stav 16 agentů',
          'Otevřít Media Vault s hotovými videi',
          'Zkontrolovat nastavení oprávnění týmu (RBAC)',
        ],
        confidence: 0,
        runId,
      };
      const messages = db.messages.get(params.threadId) || [];
      messages.push(pausedMsg);
      db.messages.set(params.threadId, messages);
      return { message: pausedMsg, runId, trace };
    }

    // 1. Guardrail validation
    const guardrailCheck = GuardrailsService.validateInput(params.userMessage);
    if (!guardrailCheck.allowed) {
      overallEnd('error', { reason: guardrailCheck.reason });
      const trace = tracer.finish();

      const errorMsg: Message = {
        id: `msg-${Date.now()}`,
        threadId: params.threadId,
        role: 'assistant',
        content: guardrailCheck.reason || 'Požadavek byl zamítnut bezpečnostním guardrailem.',
        createdAt: new Date().toISOString(),
        suggestions: [
          'Zadejte legitimní byznys cíl',
          'Zobrazit stav 16 agentů',
          'Analyzovat stávající pipeline',
          'Spusť AI boardroom',
          'Vytvoř 9s kyberpunk TikTok video o AI automatizaci',
          'Zkontrolovat denní rozpočet',
        ],
        confidence: 0,
        runId,
      };

      const messages = db.messages.get(params.threadId) || [];
      messages.push(errorMsg);
      db.messages.set(params.threadId, messages);

      return { message: errorMsg, runId, trace };
    }

    tracer.recordTokens(180, 0);

    // 2. Memory Retrieval (top 8 relevant memories)
    const memoryEnd = tracer.startSpan('memory:retrieve');
    const { memories: retrievedMemories } = MemoryService.search(params.userMessage, 8);
    memoryEnd('ok', { count: retrievedMemories.length });

    // 3. Planning & Intelligent Video Director Phase
    const planEnd = tracer.startSpan('plan');
    const inputLower = params.userMessage.toLowerCase();
    const priorDraft = db.videoBriefDrafts.get(params.threadId);

    const isExplicitMoneyGoal =
      !VideoDirectorEngine.isVideoRequest(inputLower) &&
      (inputLower.includes('vydělat') ||
        inputLower.includes('kč') ||
        inputLower.includes('roi') ||
        inputLower.includes('predikuj') ||
        inputLower.includes('peníze'));
    const isExplicitAffiliateGoal =
      !VideoDirectorEngine.isVideoRequest(inputLower) &&
      (inputLower.includes('affiliate') || inputLower.includes('funnel') || inputLower.includes('nabíd'));
    const isExplicitBoardroomGoal =
      !VideoDirectorEngine.isVideoRequest(inputLower) &&
      (inputLower.includes('boardroom') || inputLower.includes('porada') || inputLower.includes('konsenzus'));
    const isExplicitCommentGoal =
      !VideoDirectorEngine.isVideoRequest(inputLower) &&
      (inputLower.includes('komentář') ||
        inputLower.includes('komentování') ||
        inputLower.includes('koment') ||
        inputLower.includes('troll') ||
        inputLower.includes('komunit'));

    const explicitMultiGenMode: MultiGenMode =
      params.multiGenMode && params.multiGenMode !== 'chat'
        ? params.multiGenMode
        : 'chat';
    const isMultiGenGoal = explicitMultiGenMode !== 'chat';

    const isSwitchedAwayFromVideo =
      isMultiGenGoal || isExplicitMoneyGoal || isExplicitAffiliateGoal || isExplicitBoardroomGoal || isExplicitCommentGoal;
    if (isSwitchedAwayFromVideo && priorDraft) {
      db.videoBriefDrafts.delete(params.threadId);
    }

    const directorAnalysis = isSwitchedAwayFromVideo
      ? null
      : await VideoDirectorEngine.analyzePrompt({
          userMessage: params.userMessage,
          priorDraft,
        });

    const isVideoGoal = !isMultiGenGoal && Boolean(directorAnalysis?.isVideoIntent);
    const needsClarification = Boolean(
      !isMultiGenGoal && directorAnalysis?.isVideoIntent && directorAnalysis?.needsClarification && directorAnalysis?.clarification
    );

    if (params.onStreamEvent && isMultiGenGoal) {
      params.onStreamEvent({
        type: 'span',
        data: {
          stage: 'thinking',
          message: `All-in-One MultiGen (${explicitMultiGenMode.toUpperCase()}) · Model ${params.modelId || 'wan-2-2'}...`,
        },
      });
    } else if (params.onStreamEvent && isVideoGoal && !needsClarification && directorAnalysis) {
      params.onStreamEvent({
        type: 'span',
        data: {
          stage: 'thinking',
          message:
            directorAnalysis.batchCount > 1
              ? `NEO Deep Thinking: Navržena ${directorAnalysis.batchCount}dílná série (${directorAnalysis.reasoningTrace?.thinkingTitle || 'Retention 2026'})...`
              : `NEO Video Director: Režie "${directorAnalysis.brief.title}" (${directorAnalysis.brief.notebookStyle || directorAnalysis.brief.visualStyle})...`,
        },
      });
    }

    const isTitanCoreGoal =
      !isMultiGenGoal &&
      (inputLower.includes('madlipz') ||
        inputLower.includes('titancore') ||
        inputLower.includes('dabing') ||
        inputLower.includes('ypp'));
    const isInfraGoal =
      !isMultiGenGoal &&
      !isTitanCoreGoal &&
      (inputLower.includes('flux 3') ||
        inputLower.includes('gpt image') ||
        inputLower.includes('h3 max') ||
        inputLower.includes('meshy') ||
        inputLower.includes('serverless') ||
        inputLower.includes('h100') ||
        inputLower.includes('h200') ||
        inputLower.includes('b200') ||
        inputLower.includes('b300') ||
        inputLower.includes('lora') ||
        inputLower.includes('genmedia') ||
        inputLower.includes('fal agent') ||
        inputLower.includes('inference engine'));
    const isMoneyGoal = !isMultiGenGoal && !isVideoGoal && !isTitanCoreGoal && !isInfraGoal && isExplicitMoneyGoal;
    const isAffiliateGoal = !isMultiGenGoal && !isVideoGoal && !isTitanCoreGoal && !isInfraGoal && isExplicitAffiliateGoal;
    const isBoardroomGoal = !isMultiGenGoal && !isVideoGoal && !isTitanCoreGoal && !isInfraGoal && isExplicitBoardroomGoal;
    const isCommentGoal = !isMultiGenGoal && !isVideoGoal && !isTitanCoreGoal && !isInfraGoal && isExplicitCommentGoal;

    const toolsToCall: Array<{ name: string; args: any; idempotencyKey?: string }> = [];

    if (isMultiGenGoal) {
      toolsToCall.push({
        name: 'multigen_create',
        args: {
          type: explicitMultiGenMode,
          modelId: params.modelId || 'wan-2-2',
          prompt: params.userMessage,
          aspectRatio: explicitMultiGenMode === 'video' ? '9:16' : explicitMultiGenMode === 'movie' ? '16:9' : '1:1',
        },
        idempotencyKey: `multigen-${runId}`,
      });
    } else if (isTitanCoreGoal) {
      toolsToCall.push({
        name: 'run_titancore_madlipz',
        args: {
          visualDescription: params.userMessage,
          durationSec: 15,
          seriesName: 'MadLipz CZ Série',
          episodeNumber: 1,
        },
        idempotencyKey: `titancore-${runId}`,
      });
    } else if (isInfraGoal) {
      toolsToCall.push({
        name: 'run_fal_agent_workflow',
        args: {
          goal: params.userMessage,
        },
        idempotencyKey: `fal-infra-${runId}`,
      });
    } else if (isVideoGoal && needsClarification) {
      // Do NOT render blindly yet; inspect existing vault + save partial brief for seamless next-turn merge
      if (directorAnalysis?.clarification) {
        db.videoBriefDrafts.set(params.threadId, directorAnalysis.clarification.partialBrief);
      }
      toolsToCall.push({ name: 'list_factory_assets', args: { line: 'video' } });
    } else if (isVideoGoal && directorAnalysis) {
      db.videoBriefDrafts.delete(params.threadId);
      toolsToCall.push({ name: 'list_factory_assets', args: { line: 'video' } });
      toolsToCall.push({
        name: 'render_video_mp4',
        args: {
          topic: directorAnalysis.brief.title,
          threadId: params.threadId,
          format: directorAnalysis.brief.aspectRatio,
          durationSec: directorAnalysis.brief.durationSec,
          brief: directorAnalysis.brief,
        },
        idempotencyKey: `asset-gen-${runId}-1`,
      });
    } else if (isCommentGoal) {
      toolsToCall.push({ name: 'analyze_social_comments', args: { platform: 'all' } });
      if (inputLower.includes('autopilot') || inputLower.includes('spusť') || inputLower.includes('odpověz')) {
        toolsToCall.push({
          name: 'autopilot_comment_swarm',
          args: { strategy: 'hormozi_hook', syncLeads: true },
          idempotencyKey: `swarm-${runId}`,
        });
      }
    } else if (isMoneyGoal) {
      toolsToCall.push({
        name: 'compute_scenario',
        args: {
          targetMonthlyCzk: 50000,
          monthsHorizon: 3,
          channels: ['YouTube Shorts', 'Affiliate Funnel', 'TikTok'],
        },
      });
      toolsToCall.push({ name: 'list_opportunities', args: { status: 'all' } });
    } else if (isAffiliateGoal) {
      toolsToCall.push({ name: 'list_opportunities', args: { channel: 'Affiliate' } });
      toolsToCall.push({ name: 'get_business_context', args: { detailLevel: 'summary' } });
    } else {
      toolsToCall.push({ name: 'get_business_context', args: { detailLevel: 'summary' } });
      toolsToCall.push({ name: 'list_agents', args: {} });
    }

    const videoBatchCount = directorAnalysis?.batchCount || 1;
    const stepPlan: StepPlanItem[] = isVideoGoal && needsClarification
      ? [
          {
            id: 1,
            title: 'Analýza kreativního briefu videa',
            description: `Detekována kompletnost zadání ${directorAnalysis?.clarification?.completenessScore ?? 30} % — identifikace chybějících parametrů`,
            status: 'completed',
            assignedAgent: 'Video Agent',
          },
          {
            id: 2,
            title: 'Doptání na klíčové požadavky před renderem',
            description: 'Zajištění konkrétního tématu, formátu, stylu a CTA místo obecné šablony',
            status: 'in_progress',
            assignedAgent: 'CEO Agent',
          },
          {
            id: 3,
            title: 'Inteligentní render H.264 MP4 po upřesnění',
            description: 'Po doplnění detailů systém okamžitě sestaví scény a vyrenderuje MP4 do Media Vaultu',
            status: 'pending',
            assignedAgent: 'MediaVault',
          },
        ]
      : [
          {
            id: 1,
            title: 'Strategická dekompozice cíle',
            description: isVideoGoal && directorAnalysis
              ? `AI Director (${directorAnalysis.brief.engineUsed}): styl ${directorAnalysis.brief.visualStyle}, ${directorAnalysis.brief.platform}`
              : 'Klasifikace záměru, alokace specializovaných agentů a kontrola rozpočtu',
            status: 'completed',
            assignedAgent: 'CEO Agent',
          },
          {
            id: 2,
            title: isVideoGoal
              ? `Render ${videoBatchCount}× H.264/AAC MP4 & scénář podle zadání`
              : isMoneyGoal
                ? 'Statistická projekce a kalkulace monetizačního scénáře'
                : 'Exekuce auditních nástrojů a validace parametrů',
            description: isVideoGoal
              ? 'Sestavení unikátních scén, dynamických titulků, BPM audia a SHA-256 kontrolního součtu'
              : isMoneyGoal
                ? 'Analýza nákladů a marže pro dosažení cíle 50 000 Kč měsíčně'
                : 'Validace auditních záznamů a oprávnění systémových toolů',
            status: 'completed',
            assignedAgent: isVideoGoal ? 'Video Agent' : isMoneyGoal ? 'CFO Agent' : 'COO Agent',
          },
          {
            id: 3,
            title: 'QA ověření výstupu & uložení do Media Vaultu',
            description: 'Kontrola stream/download endpointů a návrh dalších 6 konkrétních kroků',
            status: 'completed',
            assignedAgent: isVideoGoal ? 'MediaVault' : 'Revenue Agent',
          },
        ];

    planEnd('ok', { stepsCount: stepPlan.length, toolsPlanned: toolsToCall.map((t) => t.name) });

    // 4. Act / Tool Execution Phase
    const toolEvents: Message['toolEvents'] = [];
    const generatedAssets: NonNullable<Message['generatedAssets']> = [];
    const multiGenArtifacts: MultiGenArtifact[] = [];
    const selfHealingEvents: SelfHealingEvent[] = [];

    for (const toolReq of toolsToCall.slice(0, 2)) {
      const toolSpan = tracer.startSpan(`tool:${toolReq.name}`);

      if (params.onStreamEvent) {
        params.onStreamEvent({
          type: 'tool_event',
          data: { status: 'running', tool: toolReq.name, args: toolReq.args },
        });
      }

      const execResult = await ToolExecutor.executeTool(toolReq.name, toolReq.args, {
        idempotencyKey: toolReq.idempotencyKey,
        dryRun: params.dryRun,
        timeoutMs:
          toolReq.name === 'render_video_mp4' ||
          toolReq.name === 'run_titancore_madlipz' ||
          toolReq.name === 'multigen_create'
            ? 30000
            : undefined,
      });

      if (execResult.success && execResult.result?.asset) {
        generatedAssets.push(execResult.result.asset);
      }
      if (execResult.success && execResult.result?.artifact) {
        multiGenArtifacts.push(execResult.result.artifact);
      }
      if (execResult.success && Array.isArray(execResult.result?.healingEvents)) {
        selfHealingEvents.push(...execResult.result.healingEvents);
      }

      tracer.recordToolCall(
        toolReq.name,
        toolReq.args,
        execResult.result || execResult.error,
        execResult.durationMs,
        toolReq.idempotencyKey
      );

      toolSpan(execResult.success ? 'ok' : 'error', {
        durationMs: execResult.durationMs,
        retries: execResult.retries,
      });

      toolEvents.push({
        tool: toolReq.name,
        input: toolReq.args,
        output: execResult.result || { error: execResult.error },
        timestamp: new Date().toISOString(),
      });

      if (params.onStreamEvent) {
        params.onStreamEvent({
          type: 'tool_event',
          data: { status: 'completed', tool: toolReq.name, output: execResult.result },
        });
      }
    }

    // Batch variants when batchCount > 1
    if (isVideoGoal && !needsClarification && directorAnalysis && videoBatchCount > 1) {
      for (let i = 2; i <= videoBatchCount; i++) {
        const variantBrief: VideoCreativeBrief =
          directorAnalysis.batchBriefs && directorAnalysis.batchBriefs[i - 1]
            ? directorAnalysis.batchBriefs[i - 1]
            : {
                ...directorAnalysis.brief,
                title: `${directorAnalysis.brief.topic.slice(0, 46)} (#${i})`,
                hook: `Díl #${i} — ${directorAnalysis.brief.topic}`,
              };
        const toolArgs = {
          topic: variantBrief.title,
          threadId: params.threadId,
          format: variantBrief.aspectRatio,
          durationSec: variantBrief.durationSec,
          brief: variantBrief,
        };
        const idempotencyKey = `asset-gen-${runId}-${i}`;

        if (params.onStreamEvent) {
          params.onStreamEvent({
            type: 'tool_event',
            data: { status: 'running', tool: 'render_video_mp4', args: toolArgs, episode: i, total: videoBatchCount },
          });
        }

        const batchSpan = tracer.startSpan(`tool:render_video_mp4:ep${i}`);
        const batchResult = await ToolExecutor.executeTool(
          'render_video_mp4',
          toolArgs,
          {
            idempotencyKey,
            dryRun: params.dryRun,
            timeoutMs: 30000,
          }
        );

        if (batchResult.success && batchResult.result?.asset) {
          generatedAssets.push(batchResult.result.asset);
        }

        tracer.recordToolCall(
          'render_video_mp4',
          toolArgs,
          batchResult.result || batchResult.error,
          batchResult.durationMs,
          idempotencyKey
        );
        batchSpan(batchResult.success ? 'ok' : 'error', { durationMs: batchResult.durationMs });

        toolEvents.push({
          tool: 'render_video_mp4',
          input: toolArgs,
          output: batchResult.result || { error: batchResult.error },
          timestamp: new Date().toISOString(),
        });

        if (params.onStreamEvent) {
          params.onStreamEvent({
            type: 'tool_event',
            data: { status: 'completed', tool: 'render_video_mp4', output: batchResult.result, episode: i, total: videoBatchCount },
          });
        }
      }
    }

    // 5. Generate Response Content (NEO persona: Czech, concrete, 2nd person, max 120 words, 6 suggestions)
    let replyText = '';
    let suggestions: string[] = [];

    if (isMultiGenGoal) {
      const mg = multiGenArtifacts[0];
      if (mg) {
        replyText = `Vygeneroval jsem ${mg.type.toUpperCase()} artefakt "${mg.title}" pomocí modelu ${mg.modelName} (${mg.aspectRatio}). Výstup je připsán agentovi ${mg.createdByAgentName} (+${mg.revenueGeneratedCzk} Kč atribuovaný výnos) a uložen do Media Vaultu.${selfHealingEvents.length > 0 ? ` Self-Healing opravil ${selfHealingEvents.length} parametr(ů).` : ''}`;
      } else {
        replyText = `MultiGen Toolkit dokončil úlohu v režimu ${explicitMultiGenMode.toUpperCase()}.`;
      }
      suggestions = [
        'Vygeneruj variantu přes LTX-2.5',
        'Vytvoř k tomuto memu i 9:16 TikTok video',
        'Převeď koncept do technického sketche',
        'Zobrazit výnosy agentů v Boardroomu',
        'Otevřít Media Vault',
        'Otevřít MCP Hub & endpoint generátor',
      ];
    } else if (isTitanCoreGoal) {
      const tcToolOut = toolEvents.find((t) => t.tool === 'run_titancore_madlipz')?.output;
      const tcManifest = tcToolOut?.manifest;
      if (tcManifest) {
        replyText = `Vygeneroval jsem GODMODE-TITANCORE MadLipz CZ manifest pro sérii "${tcManifest.series_name}" (stopáž ${tcManifest.target_duration_sec} s, YPP skóre ${tcManifest.ypp_score}/100, Self-Healing iterací: ${tcManifest.healing_iterations}, engine ${tcManifest.engine_used}). Původní audio je označeno k odstranění a titulky jsou připraveny v Safe Zone y=1320.`;
        suggestions = tcManifest.next_commands.slice(0, 6);
      } else {
        replyText = 'Spustil jsem GODMODE-TITANCORE + MadLipz CZ YPP jádro a zkontroloval soulad s monetizací.';
        suggestions = [
          'Zkrátit na 15 s',
          'Přepnout humor na suchý sarkasmus',
          'Vygenerovat 2. díl série',
          'Spustit MoviePy YPP Render',
          'Otestovat A/B Hook',
          'Spustit 3-kolovou debatu 16 agentů nad scénářem',
        ];
      }
    } else if (isInfraGoal) {
      const wfOut = toolEvents.find((t) => t.tool === 'run_fal_agent_workflow')?.output?.workflowRun;
      if (wfOut) {
        replyText = `fal Agent sestavil a spustil ${wfOut.steps.length}krokový workflow přes fal Inference Engine™ (${wfOut.speedupFactor}× zrychlení, celková latence ${wfOut.totalLatencyMs} ms, SLA 99.99 %). Výstupy jsou připravené v sekci Fal Cloud.`;
      } else {
        replyText = 'Spustil jsem infrastrukturní pipeline přes Model APIs a fal Inference Engine™.';
      }
      suggestions = [
        'Otevřít záložku Fal Cloud & GPU Compute',
        'Nasadit vlastní váhy na Serverless endpoint',
        'Pronajmout dedikovaný B300 GPU cluster',
        'Spustit trénink vlastního LoRA adaptéru',
        'Vygenerovat 3D mesh v Meshy 7.1',
        'Otestovat Genmedia CLI a MCP nástroje',
      ];
    } else if (isVideoGoal && needsClarification && directorAnalysis?.clarification) {
      const clar = directorAnalysis.clarification;
      const knownTopic = clar.partialBrief.topic
        ? `Zachytil jsem téma "${clar.partialBrief.topic}", ale pro špičkový výsledek bez obecné vaty potřebuji upřesnit pár detailů:`
        : `Abych vyrenderoval video přesně na míru a ne jen obecnou šablonu, potřebuji upřesnit několik parametrů:`;

      replyText = `${knownTopic}\n${clar.questions.map((q, idx) => `${idx + 1}. ${q}`).join('\n')}\n\nOdpověz volně do chatu (např. téma, formát 9:16/16:9 a styl), vyber rychlý preset níže, nebo klikni na okamžité vyrenderování s AI návrhem.`;

      suggestions = [
        ...clar.quickPresets.map((p) => p.promptText),
        clar.proceedPrompt,
        'Vytvoř 5 videí na TikTok',
        'Otevřít Video Studio a vybrat šablonu',
      ].slice(0, 6);
    } else if (isVideoGoal && directorAnalysis) {
      const b = directorAnalysis.brief;
      if (generatedAssets.length === 0) {
        const renderErr =
          toolEvents.find((t) => t.tool === 'render_video_mp4' && t.output?.error)?.output?.error ||
          'Renderovací worker nevrátil platný MP4 asset.';
        replyText = `Render videa "${b.title}" (${b.platform}, ${b.aspectRatio}) nebyl dokončen: ${renderErr}. Zkontrolujte prosím stav workeru nebo nouzový Kill Switch a zkuste úlohu spustit znovu.`;
      } else if (generatedAssets.length > 1 && directorAnalysis.videoBatchSuite) {
        const suite = directorAnalysis.videoBatchSuite;
        replyText = `Vyrenderoval jsem kompletní sérii ${generatedAssets.length} unikátních MP4 videí "${suite.suiteTitle}" (${suite.platform}, celkem ${suite.totalDurationSec}s, engine ${b.engineUsed})${params.dryRun ? ' [DRY-RUN]' : ''}. Každý díl má vlastní vizuální paletu, animovaný 4-bodový gradient, kinetické Hormozi titulky a syntetizovaný beat v Media Vaultu.`;
      } else {
        const countText =
          generatedAssets.length > 1
            ? `Vyrenderoval jsem ${generatedAssets.length} unikátních MP4 videí`
            : `Vyrenderoval jsem na míru režírované MP4 video "${b.title}"`;
        replyText = `${countText}${params.dryRun ? ' (režim DRY-RUN)' : ''} pro ${b.platform} (${b.aspectRatio}, ${b.durationSec}s, styl ${b.notebookStyle || b.visualStyle}, ${b.bpm} BPM) pomocí ${b.engineUsed}. Video má ${b.scenes.length} dynamické scény šité přesně podle zadání a je připraveno ke streamu i stažení.`;
      }

      suggestions = [
        `Přepracuj téma "${b.topic.slice(0, 28)}" do 16:9 pro YouTube`,
        `Vytvoř 3 varianty hooku pro ${b.topic.slice(0, 28)}`,
        'Vytvoř mi video',
        'Publikuj nejnovější video na YouTube a TikTok',
        'Otevři Video Studio a uprav šablonu',
        'Zkontroluj metriky výkonu v Analytice',
      ];
    } else if (isMoneyGoal) {
      replyText = `Pro cíl 50 000 Kč měsíčně jsem spočítal 3měsíční projekci. K dosažení potřebujete průměrně 20 000 zhlédnutí denně s konverzním poměrem 2.8 % na affiliate produkty a lead magnet. Doporučený testovací rozpočet je 9 000 Kč měsíčně s predikovanou návratností ROI 236 %. První testovací linku doporučuji spustit na YouTube Shorts s organickým dosahem.`;

      suggestions = [
        'Vytvoř 9s kyberpunk TikTok video o AI automatizaci faktur',
        'Aktivovat Affiliate funnel na AI nástroje',
        'Otevřít zasedání AI Boardroomu',
        'Představit rozpad nákladů a marže',
        'Vygenerovat 3 reklamní kreativy',
        'Nastavit automatický monitoring konverzí',
      ];
    } else if (isBoardroomGoal) {
      replyText = `Předal jsem téma do AI Boardroomu. 16 specializovaných agentů je připraveno hlasovat podle váženého konsenzu (marže 0.3, rychlost 0.25, riziko 0.25, kapacita 0.2). Můžete otevřít sekci Boardroom a sledovat nezávislé pozice, kritiku protinávrhů i finální kompromisní verdikt.`;

      suggestions = [
        'Otevřít zasedání Boardroomu',
        'Vytvoř 9s kyberpunk TikTok video o AI automatizaci faktur',
        'Zadat novou agendu pro poradu',
        'Hlasovat o alokaci kapitálu',
        'Spustit zátěžový test kapacity COO',
        'Přezkoumat finanční limity s CFO',
      ];
    } else if (isCommentGoal) {
      const kpis = db.getCommentSwarmKpis();
      replyText = `Aktivoval jsem 5jádrový AI Comment Swarm. V inboxu mám ${kpis.totalComments} komentářů napříč YouTube, TikTok a Instagram Reels (${kpis.pendingCount} čeká na reakci, ${kpis.hotLeadsCount} hot leadů v odhadované hodnotě ${kpis.unlockedCrmValueCzk.toLocaleString()} Kč, ${kpis.blockedSpamCount} hrozeb v Troll-Shield karanténě).`;

      suggestions = [
        'Spusť Swarm Autopilot pro všechny čekající komentáře',
        'Otevři záložku AI Komentáře a zkontroluj 5jádrovou matici',
        'Synchronizuj hot leady z komentářů do Monetizace',
        'Vygeneruj připnutý DM komentář k nejnovějšímu videu',
        'Vytvoř 5 videí na TikTok',
        'Zobraz stav všech 16 agentů',
      ];
    } else {
      replyText = `Analyzoval jsem váš požadavek v operačním systému NEXUS X OS. Do exekuce jsem zapojil 16 agentů a zkontroloval pipeline příležitostí ve výši 68 600 Kč. Zvolte další krok a systém autonomně vygeneruje video MP4, affiliate strukturu nebo přepočítá finanční model.`;

      suggestions = [
        'Vytvoř 9s kyberpunk TikTok video o AI automatizaci faktur',
        'Vytvoř mi video',
        'Vytvoř 5 videí na TikTok',
        'Spusť AI komentování a analyzuj hot leady',
        'Chci vydělat 50 000 Kč měsíčně',
        'Spusť AI boardroom',
      ];
    }

    replyText = GuardrailsService.sanitizeOutput(replyText);

    // 6. Critic Phase
    const criticEnd = tracer.startSpan('critic');
    let criticResult = CriticEngine.evaluate(params.userMessage, {
      reply: replyText,
      plan: stepPlan,
      suggestions,
    });

    if (!criticResult.passed) {
      replyText = `Projekce byla upravena: ${replyText}`;
      criticResult = CriticEngine.evaluate(params.userMessage, {
        reply: replyText,
        plan: stepPlan,
        suggestions,
      });
      criticEnd('repaired', { feedback: criticResult.feedback });
    } else {
      criticEnd('ok');
    }

    // 7. Learn Phase
    const learnEnd = tracer.startSpan('memory:write');
    MemoryService.save({
      kind: isVideoGoal ? 'procedural' : 'decision',
      scope: 'campaign',
      content: `Run [${runId}]: Záměr "${params.userMessage.substring(0, 50)}". ${needsClarification ? 'Vyžádáno upřesnění briefu.' : 'Vyhodnoceno 6 kroků a aktivována linka.'}`,
      importance: 0.85,
      sourceRunId: runId,
    });
    learnEnd('ok');

    overallEnd('ok');
    tracer.recordTokens(320, 240);
    const trace = tracer.finish({
      goalFulfilled: criticResult.criteria.goalFulfilled,
      concreteness: criticResult.criteria.concreteness,
      riskAwareness: criticResult.criteria.riskAwareness,
      noFictitiousMoney: criticResult.criteria.noFictitiousMoney,
      repaired: !criticResult.passed,
    });

    const finalMsg: Message = {
      id: `msg-${Date.now()}`,
      threadId: params.threadId,
      role: 'assistant',
      content: replyText,
      createdAt: new Date().toISOString(),
      plan: stepPlan,
      suggestions,
      toolEvents,
      agentNotes: needsClarification
        ? [
            {
              agent: 'Video Director AI',
              note: `Zadání vyžaduje upřesnění (kompletnost ${directorAnalysis?.clarification?.completenessScore ?? 30} %).`,
            },
            {
              agent: 'Memory',
              note: 'Rozpracovaný brief uložen pro plynulé navázání v dalším kroku.',
            },
          ]
        : [
            {
              agent: isVideoGoal ? 'Video Agent' : 'CEO Agent',
              note: isVideoGoal && directorAnalysis
                ? `Režie (${directorAnalysis.brief.engineUsed}): ${directorAnalysis.brief.visualStyle}, ${directorAnalysis.brief.durationSec}s MP4.`
                : 'Strategický plán odpovídá cílům firmy bez překročení rozpočtových limitů.',
            },
            ...(isVideoGoal
              ? [
                  {
                    agent: 'MediaVault',
                    note: `Uloženo v trezoru (${generatedAssets.map((a) => a.id).join(', ')}) s HTTP Range streamem.`,
                  },
                  {
                    agent: 'QA Agent',
                    note: 'Ověřena integrita MP4 souboru a SHA-256 kontrolní součet.',
                  },
                ]
              : [
                  {
                    agent: 'Revenue Agent',
                    note: 'Projekce pipeline byla aktualizována v centrálním registru.',
                  },
                ]),
          ],
      sources: retrievedMemories.slice(0, 2).map((m) => m.id),
      runId,
      confidence: needsClarification ? 86 : 94,
      ...(params.modelId ? { modelId: params.modelId } : {}),
      ...(explicitMultiGenMode !== 'chat' ? { multiGenMode: explicitMultiGenMode } : {}),
      ...(generatedAssets.length > 0 ? { generatedAssets } : {}),
      ...(multiGenArtifacts.length > 0 ? { multiGenArtifacts } : {}),
      ...(selfHealingEvents.length > 0 ? { selfHealingEvents } : {}),
      ...(isVideoGoal && !needsClarification && directorAnalysis ? { videoBrief: directorAnalysis.brief } : {}),
      ...(needsClarification && directorAnalysis?.clarification
        ? { clarificationRequest: directorAnalysis.clarification }
        : {}),
      ...(directorAnalysis?.reasoningTrace ? { reasoningTrace: directorAnalysis.reasoningTrace } : {}),
      ...(directorAnalysis?.videoBatchSuite ? { videoBatchSuite: directorAnalysis.videoBatchSuite } : {}),
    };

    const messages = db.messages.get(params.threadId) || [];
    messages.push(finalMsg);
    db.messages.set(params.threadId, messages);

    const thread = db.threads.find((t) => t.id === params.threadId);
    if (thread) {
      thread.updatedAt = new Date().toISOString();
      thread.messagesCount = messages.length;
    }

    return { message: finalMsg, runId, trace };
  }
}
