/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Check,
  Cloud,
  Copy,
  Cpu,
  Film,
  FlaskConical,
  Image as ImageIcon,
  Layers,
  Music,
  Play,
  RefreshCw,
  Search,
  Server,
  Terminal,
  Workflow,
  Zap,
} from 'lucide-react';
import {
  ComputeGpuInstance,
  FalCatalogSummary,
  FalInferenceRun,
  FalModelModality,
  FalModelSpec,
  GpuOfferingSpec,
  GpuSeriesId,
  InfraWorkflowRun,
  InfraWorkflowStep,
  LoraTrainingJob,
  McpToolDefinition,
  ServerlessEndpoint,
} from '../types/nexus.ts';
import { copyTextSafely } from '../utils/clipboard.ts';

type InfraSection =
  | 'models'
  | 'serverless'
  | 'compute'
  | 'workflows'
  | 'training'
  | 'devtools';

interface PresetWorkflowItem {
  id: string;
  name: string;
  description: string;
  steps: InfraWorkflowStep[];
}

export const InfraCloudView: React.FC = () => {
  const [section, setSection] = useState<InfraSection>('models');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Overview state
  const [summary, setSummary] = useState<FalCatalogSummary>({
    totalModelsCount: 1542,
    byModality: { image: 640, video: 412, '3d': 210, audio: 280 },
    slaUptime: '99.99%',
    engineName: 'fal Inference Engine™',
    maxSpeedup: '10×',
    liveExternalEnabled: false,
  });
  const [models, setModels] = useState<FalModelSpec[]>([]);
  const [recentRuns, setRecentRuns] = useState<FalInferenceRun[]>([]);
  const [endpoints, setEndpoints] = useState<ServerlessEndpoint[]>([]);
  const [gpuOfferings, setGpuOfferings] = useState<GpuOfferingSpec[]>([]);
  const [gpuInstances, setGpuInstances] = useState<ComputeGpuInstance[]>([]);
  const [presetWorkflows, setPresetWorkflows] = useState<PresetWorkflowItem[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<InfraWorkflowRun[]>([]);
  const [trainingJobs, setTrainingJobs] = useState<LoraTrainingJob[]>([]);
  const [mcpTools, setMcpTools] = useState<McpToolDefinition[]>([]);

  // Model APIs & Playground state
  const [modelQuery, setModelQuery] = useState('');
  const [modalityFilter, setModalityFilter] = useState<FalModelModality | 'all'>('all');
  const [selectedModelId, setSelectedModelId] = useState('fal-ai/gpt-image-2.6');
  const [playgroundPrompt, setPlaygroundPrompt] = useState(
    'Architektonický interiér pražského studia při zlaté hodině, čisté sklo a broušený hliník, 35mm objektiv'
  );
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '9:16' | '16:9'>('16:9');
  const [numSteps, setNumSteps] = useState(24);
  const [accelerated, setAccelerated] = useState(true);
  const [isRunningInference, setIsRunningInference] = useState(false);
  const [activeRun, setActiveRun] = useState<FalInferenceRun | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Serverless Deploy state
  const [epName, setEpName] = useState('studio-brand-flux3');
  const [epBaseModel, setEpBaseModel] = useState('fal-ai/flux-3/pro');
  const [epWeightsUrl, setEpWeightsUrl] = useState('s3://nexus-weights/brand-flux3-lora.safetensors');
  const [epGpuProfile, setEpGpuProfile] = useState<ServerlessEndpoint['gpuProfile']>('h100-sxm');
  const [epVisibility, setEpVisibility] = useState<'private' | 'team'>('private');
  const [isDeployingEp, setIsDeployingEp] = useState(false);
  const [invokingEpId, setInvokingEpId] = useState<string | null>(null);

  // Compute GPU Rental state
  const [selectedGpuId, setSelectedGpuId] = useState<GpuSeriesId>('b200-hgx');
  const [gpuCount, setGpuCount] = useState(2);
  const [gpuRegion, setGpuRegion] = useState<'eu-central-prague' | 'eu-west-frankfurt' | 'us-east-virginia'>(
    'eu-central-prague'
  );
  const [gpuWorkload, setGpuWorkload] = useState<ComputeGpuInstance['workload']>('lora_training');
  const [isProvisioningGpu, setIsProvisioningGpu] = useState(false);

  // Workflows & fal Agent state
  const [agentGoal, setAgentGoal] = useState(
    'Vytvoř 3D produktový model bezdrátových sluchátek v Meshy 7.1, natoč video průlet v H3 Max a přidej zvuk v Lyria Audio 2'
  );
  const [isRunningWorkflow, setIsRunningWorkflow] = useState(false);

  // LoRA Training state
  const [loraName, setLoraName] = useState('Praha Cyber Editorial LoRA');
  const [loraBase, setLoraBase] = useState('fal-ai/flux-3/pro');
  const [loraTrigger, setLoraTrigger] = useState('PRGSTYLE');
  const [loraDataset, setLoraDataset] = useState('s3://nexus-datasets/praha-32-frames.zip');
  const [loraGpu, setLoraGpu] = useState<GpuSeriesId>('h200-sxm');
  const [loraSteps, setLoraSteps] = useState(1200);
  const [loraRank, setLoraRank] = useState(32);
  const [isTrainingLora, setIsTrainingLora] = useState(false);

  // DevTools (Genmedia CLI & MCP) state
  const [cliInput, setCliInput] = useState('genmedia models list');
  const [cliOutput, setCliOutput] = useState<string>(
    'Připraven Genmedia CLI v2.4 + MCP protokol. Spusťte příkaz nebo vyberte rychlou akci níže.'
  );
  const [isRunningCli, setIsRunningCli] = useState(false);
  const [mcpToolName, setMcpToolName] = useState('fal_generate_media');
  const [mcpResultJson, setMcpResultJson] = useState<string>('');

  const loadOverview = async (q = modelQuery, mod = modalityFilter) => {
    setErrorMsg(null);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('query', q.trim());
      if (mod !== 'all') qs.set('modality', mod);
      const res = await fetch(`/v1/infra/overview?${qs.toString()}`);
      if (!res.ok) throw new Error('Nepodařilo se načíst přehled infrastruktury.');
      const data = await res.json();
      setSummary(data.summary);
      setModels(data.models || []);
      setRecentRuns(data.recentRuns || []);
      if (!activeRun && data.recentRuns?.length > 0) {
        setActiveRun(data.recentRuns[0]);
      }
      setEndpoints(data.endpoints || []);
      setGpuOfferings(data.gpuOfferings || []);
      setGpuInstances(data.gpuInstances || []);
      setPresetWorkflows(data.presetWorkflows || []);
      setWorkflowRuns(data.workflowRuns || []);
      setTrainingJobs(data.trainingJobs || []);
      setMcpTools(data.mcpTools || []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Chyba při komunikaci se serverem.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOverview('', 'all');
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch(
        `/v1/infra/models?query=${encodeURIComponent(modelQuery)}&modality=${encodeURIComponent(
          modalityFilter
        )}&limit=48`
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.models) {
            setModels(data.models);
            if (data.summary) setSummary(data.summary);
          }
        })
        .catch(() => {});
    }, 150);
    return () => clearTimeout(timer);
  }, [modelQuery, modalityFilter]);

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId) || models[0],
    [models, selectedModelId]
  );

  const handleCopy = async (key: string, text: string) => {
    await copyTextSafely(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId((prev) => (prev === key ? null : prev)), 1800);
  };

  const handleRunInference = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!playgroundPrompt.trim()) return;
    setIsRunningInference(true);
    setErrorMsg(null);
    setStatusNotice(null);
    try {
      const res = await fetch('/v1/infra/models/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: selectedModelId,
          prompt: playgroundPrompt.trim(),
          aspectRatio,
          numSteps,
          inferenceEngineAccelerated: accelerated,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generování selhalo.');
      setActiveRun(data.run);
      setRecentRuns((prev) => [data.run, ...prev.slice(0, 19)]);
      setStatusNotice(
        `Dokončeno přes ${data.run.modelName} za ${data.run.actualLatencyMs} ms (${data.run.speedupFactor}× zrychlení).`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Chyba při spuštění inference.');
    } finally {
      setIsRunningInference(false);
    }
  };

  const handleDeployServerless = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDeployingEp(true);
    setErrorMsg(null);
    setStatusNotice(null);
    try {
      const res = await fetch('/v1/infra/serverless/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: epName.trim(),
          baseModel: epBaseModel,
          weightsSourceUrl: epWeightsUrl.trim(),
          gpuProfile: epGpuProfile,
          visibility: epVisibility,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Nasazení serverless endpointu selhalo.');
      setEndpoints((prev) => [data.endpoint, ...prev]);
      setStatusNotice(`Endpoint "${data.endpoint.name}" je připraven na ${data.endpoint.endpointUrl}`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Nasazení selhalo.');
    } finally {
      setIsDeployingEp(false);
    }
  };

  const handleInvokeEndpoint = async (id: string) => {
    setInvokingEpId(id);
    setErrorMsg(null);
    try {
      const res = await fetch(`/v1/infra/serverless/${id}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: playgroundPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Testovací volání endpointu selhalo.');
      setEndpoints((prev) => prev.map((ep) => (ep.id === id ? data.endpoint : ep)));
      setActiveRun(data.run);
      setRecentRuns((prev) => [data.run, ...prev.slice(0, 19)]);
      setStatusNotice(`Endpoint "${data.endpoint.name}" odpověděl za ${data.run.actualLatencyMs} ms.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Volání endpointu selhalo.');
    } finally {
      setInvokingEpId(null);
    }
  };

  const handleToggleEndpointStatus = async (ep: ServerlessEndpoint) => {
    const nextStatus = ep.status === 'paused' ? 'ready' : 'paused';
    const res = await fetch(`/v1/infra/serverless/${ep.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) {
      const data = await res.json();
      setEndpoints((prev) => prev.map((item) => (item.id === ep.id ? data.endpoint : item)));
    }
  };

  const handleProvisionGpu = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProvisioningGpu(true);
    setErrorMsg(null);
    setStatusNotice(null);
    try {
      const res = await fetch('/v1/infra/compute/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gpuId: selectedGpuId,
          gpuCount,
          region: gpuRegion,
          workload: gpuWorkload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pronájem GPU uzlu selhal.');
      setGpuInstances((prev) => [data.instance, ...prev]);
      setStatusNotice(
        `GPU uzel ${data.instance.name} spuštěn (${data.instance.totalVramGb} GB VRAM · $${data.instance.hourlyCostUsd}/h).`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Chyba při alokaci GPU.');
    } finally {
      setIsProvisioningGpu(false);
    }
  };

  const handleUpdateGpuStatus = async (id: string, status: ComputeGpuInstance['status']) => {
    const res = await fetch(`/v1/infra/compute/instances/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const data = await res.json();
      setGpuInstances((prev) => prev.map((g) => (g.id === id ? data.instance : g)));
    }
  };

  const handleRunAgentPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentGoal.trim()) return;
    setIsRunningWorkflow(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/v1/infra/agent/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: agentGoal.trim(), execute: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'fal Agent workflow selhal.');
      setWorkflowRuns((prev) => [data.workflowRun, ...prev]);
      setStatusNotice(
        `fal Agent dokončil ${data.workflowRun.steps.length} kroky za ${data.workflowRun.totalLatencyMs} ms.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Chyba workflow.');
    } finally {
      setIsRunningWorkflow(false);
    }
  };

  const handleRunPresetWorkflow = async (presetId: string) => {
    setIsRunningWorkflow(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/v1/infra/workflows/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Spuštění workflow selhalo.');
      setWorkflowRuns((prev) => [data.workflowRun, ...prev]);
      setStatusNotice(`Workflow "${data.workflowRun.name}" úspěšně dokončen.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Chyba při spuštění workflow.');
    } finally {
      setIsRunningWorkflow(false);
    }
  };

  const handleStartTraining = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTrainingLora(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/v1/infra/training/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adapterName: loraName.trim(),
          baseModelId: loraBase,
          triggerWord: loraTrigger.trim(),
          datasetSource: loraDataset.trim(),
          gpuTier: loraGpu,
          rank: loraRank,
          steps: loraSteps,
          learningRate: 0.0002,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Spuštění LoRA tréninku selhalo.');
      setTrainingJobs((prev) => [data.job, ...prev]);
      setStatusNotice(`LoRA "${data.job.adapterName}" dokončena (ztráta ${data.job.currentLoss}).`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Chyba LoRA tréninku.');
    } finally {
      setIsTrainingLora(false);
    }
  };

  const handleDeployTrainedLora = async (jobId: string) => {
    setErrorMsg(null);
    const res = await fetch(`/v1/infra/training/jobs/${jobId}/deploy`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || 'Nasazení LoRA selhalo.');
      return;
    }
    setTrainingJobs((prev) => prev.map((j) => (j.id === jobId ? data.job : j)));
    setEndpoints((prev) => [data.endpoint, ...prev]);
    setStatusNotice(`Natrénovaná LoRA nasazena na ${data.endpoint.endpointUrl}`);
  };

  const handleRunCli = async (cmdOverride?: string) => {
    const cmd = (cmdOverride ?? cliInput).trim();
    if (!cmd) return;
    setIsRunningCli(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/v1/infra/cli/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'CLI příkaz selhal.');
      setCliOutput(`$ ${cmd}\n${data.stdout}`);
      if (cmdOverride) setCliInput(cmdOverride);
      await loadOverview();
    } catch (err: any) {
      setCliOutput(`$ ${cmd}\nChyba: ${err?.message || 'Neznámá chyba'}`);
    } finally {
      setIsRunningCli(false);
    }
  };

  const handleRunMcpCall = async () => {
    setErrorMsg(null);
    const sampleArgsByTool: Record<string, Record<string, any>> = {
      fal_generate_media: {
        modelId: selectedModelId,
        prompt: playgroundPrompt,
        aspectRatio,
      },
      fal_deploy_serverless: {
        name: 'mcp-auto-endpoint',
        baseModel: 'fal-ai/flux-3/pro',
        gpuProfile: 'h100-sxm',
      },
      fal_provision_gpu: {
        gpuId: 'b300-ultra',
        gpuCount: 1,
        workload: 'lora_training',
      },
      fal_run_workflow: {
        goal: agentGoal,
      },
      fal_train_lora: {
        adapterName: 'MCP Brand LoRA',
        baseModelId: 'fal-ai/flux-3/pro',
        triggerWord: 'MCPBRAND',
      },
    };
    const res = await fetch('/v1/infra/mcp/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: mcpToolName,
        arguments: sampleArgsByTool[mcpToolName] || {},
      }),
    });
    const data = await res.json();
    setMcpResultJson(JSON.stringify(data, null, 2));
    await loadOverview();
  };

  const totalRunningVramGb = gpuInstances
    .filter((g) => g.status === 'running')
    .reduce((acc, g) => acc + g.totalVramGb, 0);
  const totalHourlyCost = gpuInstances
    .filter((g) => g.status === 'running')
    .reduce((acc, g) => acc + g.hourlyCostUsd, 0);

  const sdkSnippet = useMemo(
    () =>
      `import { fal } from "@fal-ai/client";\n\nfal.config({ proxyUrl: "/v1/infra/models/run" });\n\nconst result = await fal.subscribe("${selectedModelId}", {\n  input: {\n    prompt: ${JSON.stringify(playgroundPrompt)},\n    aspect_ratio: "${aspectRatio}",\n    num_inference_steps: ${numSteps},\n    acceleration: ${accelerated ? '"fal-inference-engine-v3"' : '"standard"'}\n  }\n});`,
    [selectedModelId, playgroundPrompt, aspectRatio, numSteps, accelerated]
  );

  const modalityIcon = (modality: FalModelModality) => {
    if (modality === 'image') return <ImageIcon className="h-4 w-4 text-emerald-400 shrink-0" />;
    if (modality === 'video') return <Film className="h-4 w-4 text-cyan-400 shrink-0" />;
    if (modality === '3d') return <Box className="h-4 w-4 text-amber-400 shrink-0" />;
    return <Music className="h-4 w-4 text-sky-400 shrink-0" />;
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 space-y-6">
      {/* Workspace Header & Tabular KPI Strip */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1 max-w-3xl">
            <p className="text-xs font-mono text-emerald-400">
              Model APIs · Serverless · Compute GPU · fal Inference Engine™
            </p>
            <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight text-balance">
              Media AI Infrastruktura &amp; Výpočetní Cloud
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Sjednocený přístup k více než 1 500 modelům pro obrázky, video, 3D a zvuk, bezserverové nasazení vlastních vah jedním kliknutím a dedikované GPU klastry až po Blackwell B300.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => loadOverview()}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Obnovit stav</span>
            </button>
          </div>
        </div>

        {/* Clean 4-column Summary Metrics (Tabular Numerals, No Nested Boxes) */}
        <div className="grid grid-cols-2 gap-4 border-t border-zinc-800 pt-4 lg:grid-cols-4 font-mono tabular-nums">
          <div>
            <div className="text-xs text-zinc-400">Produkční Model APIs</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {summary.totalModelsCount.toLocaleString('cs-CZ')}+
            </div>
            <div className="text-xs text-zinc-500">
              {summary.byModality.image} obr · {summary.byModality.video} video · {summary.byModality['3d']} 3D · {summary.byModality.audio} audio
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-400">fal Inference Engine™</div>
            <div className="mt-1 text-lg font-semibold text-emerald-400">
              až {summary.maxSpeedup} rychlejší
            </div>
            <div className="text-xs text-zinc-500">
              SLA dostupnost {summary.slaUptime} · {summary.liveExternalEnabled ? 'FAL_KEY aktivní' : 'Lokální akcelerovaný runtime'}
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-400">Serverless Endpointy</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {endpoints.length} nasazených
            </div>
            <div className="text-xs text-zinc-500">
              {endpoints.filter((e) => e.status === 'ready').length} aktivních · Scale-to-Zero
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-400">Dedikované Compute GPU</div>
            <div className="mt-1 text-lg font-semibold text-cyan-400">
              {totalRunningVramGb} GB VRAM
            </div>
            <div className="text-xs text-zinc-500">
              ${totalHourlyCost.toFixed(2)}/h · RTX, H100, H200, B200, B300
            </div>
          </div>
        </div>

        {/* Segmented Sub-Navigation Tabs */}
        <div
          role="tablist"
          aria-label="Sekce infrastruktury"
          className="flex items-center gap-1 overflow-x-auto border-t border-zinc-800 pt-4"
        >
          {[
            { id: 'models', label: 'Model APIs & Playground', icon: Layers },
            { id: 'serverless', label: 'Serverless Deploy', icon: Cloud },
            { id: 'compute', label: 'Compute GPU (RTX–B300)', icon: Cpu },
            { id: 'workflows', label: 'Workflows & fal Agent', icon: Workflow },
            { id: 'training', label: 'LoRA Training', icon: FlaskConical },
            { id: 'devtools', label: 'SDK · Genmedia CLI · MCP', icon: Terminal },
          ].map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`infra-tab-${item.id}`}
                onClick={() => setSection(item.id as InfraSection)}
                className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-emerald-500 text-zinc-950 font-semibold'
                    : 'bg-zinc-950/60 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {errorMsg && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="underline text-rose-100">
            Zavřít
          </button>
        </div>
      )}

      {statusNotice && (
        <div
          data-testid="infra-status-notice"
          className="rounded-lg border border-emerald-500/40 bg-emerald-950/25 px-4 py-3 text-xs text-emerald-200 flex items-center justify-between gap-3"
        >
          <span>{statusNotice}</span>
          <button type="button" onClick={() => setStatusNotice(null)} className="underline text-emerald-100">
            Skrýt
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-8 text-sm text-zinc-400">
          Načítám katalog modelů, serverless endpointy a GPU klastry...
        </div>
      ) : null}

      {/* =================================================================== */}
      {/* 1. MODEL APIS & PLAYGROUND + FAL INFERENCE ENGINE™                  */}
      {/* =================================================================== */}
      {!isLoading && section === 'models' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Left: Unified Model Catalog (7 cols) */}
          <section className="lg:col-span-7 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Katalog Model APIs ({summary.totalModelsCount.toLocaleString('cs-CZ')}+)
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Obrázky (GPT Image 2.6, FLUX 3), video (H3 Max, Seedance 2.5), 3D (Meshy 7.1) a zvuk přes jedno API.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="search"
                  aria-label="Hledat model v katalogu"
                  value={modelQuery}
                  onChange={(e) => setModelQuery(e.target.value)}
                  placeholder="Hledat model (FLUX 3, Meshy, H3 Max...)"
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Modality Filter */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-800 pb-3">
              {[
                { id: 'all', label: `Všechny (${summary.totalModelsCount})` },
                { id: 'image', label: `Obrázky (${summary.byModality.image})` },
                { id: 'video', label: `Video (${summary.byModality.video})` },
                { id: '3d', label: `3D (${summary.byModality['3d']})` },
                { id: 'audio', label: `Zvuk (${summary.byModality.audio})` },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModalityFilter(m.id as FalModelModality | 'all')}
                  className={`rounded px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    modalityFilter === m.id
                      ? 'bg-zinc-100 text-zinc-950'
                      : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Compact Data List (Single-elevation, Hairline dividers) */}
            {models.length === 0 ? (
              <div className="py-10 text-center text-sm text-zinc-400">
                Žádný model neodpovídá dotazu "{modelQuery}". Zkuste zrušit filtr.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/80 max-h-[600px] overflow-y-auto pr-1">
                {models.map((m) => {
                  const isSelected = m.id === selectedModelId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      data-testid={`fal-model-row-${m.id}`}
                      onClick={() => setSelectedModelId(m.id)}
                      className={`w-full text-left py-3 px-3 rounded-md transition-colors flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between ${
                        isSelected
                          ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40'
                          : 'hover:bg-zinc-800/50'
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          {modalityIcon(m.modality)}
                          <span className="text-sm font-semibold text-white truncate">{m.name}</span>
                          <span className="text-xs font-mono text-zinc-500 truncate">{m.id}</span>
                        </div>
                        <p className="text-xs text-zinc-400 line-clamp-2">{m.summary}</p>
                        <div className="text-xs text-zinc-500 font-mono">
                          {m.provider} · {m.maxResolutionOrFormat} · {m.tags.slice(0, 3).join(' / ')}
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-1 shrink-0 font-mono tabular-nums pl-2">
                        <span className="text-xs font-semibold text-emerald-400">
                          {m.speedupFactor} · {m.acceleratedLatencyMs} ms
                        </span>
                        <span className="text-xs text-zinc-400">{m.pricePerUnit}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Right: Interactive Playground & fal Inference Engine™ Result (5 cols) */}
          <section className="lg:col-span-5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Playground &amp; Sandbox
                </h2>
                <p className="text-xs text-zinc-400">
                  Aktivní model: <span className="text-emerald-400 font-mono">{selectedModel?.name || selectedModelId}</span>
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-400 tabular-nums">SLA 99,99 %</span>
            </div>

            <form onSubmit={handleRunInference} className="space-y-3">
              <div>
                <label htmlFor="playground-prompt" className="block text-xs font-medium text-zinc-300 mb-1">
                  Zadání (Prompt)
                </label>
                <textarea
                  id="playground-prompt"
                  rows={3}
                  value={playgroundPrompt}
                  onChange={(e) => setPlaygroundPrompt(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
                  placeholder="Popište obraz, video, 3D objekt nebo zvukovou stopu..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="playground-aspect" className="block text-xs font-medium text-zinc-300 mb-1">
                    Poměr stran
                  </label>
                  <select
                    id="playground-aspect"
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as '1:1' | '9:16' | '16:9')}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="16:9">16:9 Širokoúhlý</option>
                    <option value="9:16">9:16 Vertikální (Shorts)</option>
                    <option value="1:1">1:1 Čtverec</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="playground-steps" className="block text-xs font-medium text-zinc-300 mb-1">
                    Kroky difuze ({numSteps})
                  </label>
                  <input
                    id="playground-steps"
                    type="range"
                    min={4}
                    max={50}
                    value={numSteps}
                    onChange={(e) => setNumSteps(Number(e.target.value))}
                    className="w-full accent-emerald-500 mt-2"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2.5 cursor-pointer">
                <div>
                  <div className="text-xs font-medium text-white">fal Inference Engine™ (až 10× zrychlení)</div>
                  <div className="text-[11px] text-zinc-400">
                    FP8 kvantizace + FlashDiffusion grafová optimalizace
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={accelerated}
                  onChange={(e) => setAccelerated(e.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
              </label>

              <button
                type="submit"
                data-testid="infra-run-inference-btn"
                disabled={isRunningInference}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition-colors"
              >
                <Zap className="h-4 w-4" />
                <span>{isRunningInference ? 'Generuji výstup...' : 'Spustit generování přes Model API'}</span>
              </button>
            </form>

            {/* Generated Output & Latency Telemetry */}
            {activeRun && (
              <div data-testid="infra-active-run" className="border-t border-zinc-800 pt-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                  <span className="text-white font-semibold">{activeRun.modelName}</span>
                  <span className="text-emerald-400">
                    {activeRun.actualLatencyMs} ms ({activeRun.speedupFactor}× oproti {activeRun.baseLatencyMs} ms)
                  </span>
                </div>

                {activeRun.outputPreviewSvg && (
                  <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
                    <img
                      src={activeRun.outputPreviewSvg}
                      alt={activeRun.outputSummary}
                      referrerPolicy="no-referrer"
                      className="w-full h-auto block"
                    />
                  </div>
                )}

                <p className="text-xs text-zinc-300">{activeRun.outputSummary}</p>

                <div className="space-y-1 text-[11px] font-mono text-zinc-400 tabular-nums border-t border-zinc-800 pt-2">
                  {activeRun.pipelineStages.map((st, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span>{st.stage}</span>
                      <span className="text-zinc-200">{st.durationMs} ms</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick @fal-ai/client Snippet */}
            <div className="border-t border-zinc-800 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-300">@fal-ai/client SDK</span>
                <button
                  type="button"
                  onClick={() => handleCopy('sdk-inline', sdkSnippet)}
                  className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                >
                  {copiedId === 'sdk-inline' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedId === 'sdk-inline' ? 'Zkopírováno' : 'Kopírovat SDK'}</span>
                </button>
              </div>
              <pre className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 text-[11px] font-mono text-zinc-300">
                {sdkSnippet}
              </pre>
            </div>
          </section>
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. SERVERLESS DEPLOYMENT (1-CLICK CUSTOM WEIGHTS & LORA)            */}
      {/* =================================================================== */}
      {!isLoading && section === 'serverless' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          <section className="lg:col-span-5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                Bezserverové nasazení jedním kliknutím
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Nasaďte vlastní doladěné modely a váhy (.safetensors / HuggingFace / S3) na zabezpečený endpoint bez řešení MLOps.
              </p>
            </div>

            <form onSubmit={handleDeployServerless} className="space-y-3">
              <div>
                <label htmlFor="ep-name" className="block text-xs font-medium text-zinc-300 mb-1">
                  Název endpointu
                </label>
                <input
                  id="ep-name"
                  type="text"
                  required
                  value={epName}
                  onChange={(e) => setEpName(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="ep-base" className="block text-xs font-medium text-zinc-300 mb-1">
                  Základní model
                </label>
                <select
                  id="ep-base"
                  value={epBaseModel}
                  onChange={(e) => setEpBaseModel(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="fal-ai/flux-3/pro">FLUX 3 Pro</option>
                  <option value="fal-ai/h3-max">H3 Max</option>
                  <option value="fal-ai/seedance-2.5">Seedance 2.5</option>
                  <option value="fal-ai/eleven-turbo-v3">ElevenTurbo v3 CZ</option>
                </select>
              </div>

              <div>
                <label htmlFor="ep-weights" className="block text-xs font-medium text-zinc-300 mb-1">
                  Cesta k vlastním vahám (Weights / LoRA)
                </label>
                <input
                  id="ep-weights"
                  type="text"
                  required
                  value={epWeightsUrl}
                  onChange={(e) => setEpWeightsUrl(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-mono text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ep-gpu" className="block text-xs font-medium text-zinc-300 mb-1">
                    GPU Profil
                  </label>
                  <select
                    id="ep-gpu"
                    value={epGpuProfile}
                    onChange={(e) => setEpGpuProfile(e.target.value as ServerlessEndpoint['gpuProfile'])}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="rtx-4090">RTX 4090 (32 GB)</option>
                    <option value="h100-sxm">H100 SXM (80 GB)</option>
                    <option value="h200-sxm">H200 SXM (141 GB)</option>
                    <option value="b200-hgx">Blackwell B200 (192 GB)</option>
                    <option value="b300-ultra">Blackwell B300 (288 GB)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="ep-vis" className="block text-xs font-medium text-zinc-300 mb-1">
                    Zabezpečení přístupu
                  </label>
                  <select
                    id="ep-vis"
                    value={epVisibility}
                    onChange={(e) => setEpVisibility(e.target.value as 'private' | 'team')}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="private">Soukromý (Bearer Key)</option>
                    <option value="team">Týmový (RBAC)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                data-testid="deploy-serverless-btn"
                disabled={isDeployingEp}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition-colors"
              >
                <Cloud className="h-4 w-4" />
                <span>{isDeployingEp ? 'Nasazuji endpoint...' : 'Nasadit jedním kliknutím'}</span>
              </button>
            </form>
          </section>

          <section className="lg:col-span-7 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                Zabezpečené Serverless Endpointy ({endpoints.length})
              </h2>
              <span className="text-xs text-zinc-400">Automatické škálování 0 → N replik</span>
            </div>

            {endpoints.length === 0 ? (
              <div className="py-10 text-center text-sm text-zinc-400">
                Zatím nemáte žádný nasazený endpoint. Využijte formulář vlevo pro nasazení jedním kliknutím.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {endpoints.map((ep) => (
                  <div key={ep.id} className="py-4 space-y-2.5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{ep.name}</span>
                          <span
                            className={`text-xs font-mono ${
                              ep.status === 'ready'
                                ? 'text-emerald-400'
                                : ep.status === 'paused'
                                  ? 'text-rose-400'
                                  : 'text-amber-400'
                            }`}
                          >
                            {ep.status === 'ready'
                              ? 'Aktivní'
                              : ep.status === 'scaled_to_zero'
                                ? 'Scale-to-Zero'
                                : 'Pozastaveno'}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-zinc-400 mt-0.5 break-all">
                          {ep.endpointUrl}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleInvokeEndpoint(ep.id)}
                          disabled={invokingEpId === ep.id || ep.status === 'paused'}
                          className="inline-flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40 whitespace-nowrap"
                        >
                          <Play className="h-3 w-3" />
                          <span>{invokingEpId === ep.id ? 'Volám...' : 'Otestovat'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleEndpointStatus(ep)}
                          className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300 hover:text-white whitespace-nowrap"
                        >
                          {ep.status === 'paused' ? 'Aktivovat' : 'Pozastavit'}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-zinc-400 tabular-nums">
                      <span>Base: {ep.baseModel}</span>
                      <span>·</span>
                      <span>GPU: {ep.gpuProfile}</span>
                      <span>·</span>
                      <span>Cold start: {ep.coldStartMs} ms</span>
                      <span>·</span>
                      <span>Požadavky: {ep.requestsCount}</span>
                      <span>·</span>
                      <span>Token: {ep.authTokenMasked}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* =================================================================== */}
      {/* 3. COMPUTE GPU CLUSTERS (RTX, H100, H200, B200, B300)               */}
      {/* =================================================================== */}
      {!isLoading && section === 'compute' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
            {/* GPU Offerings Catalog */}
            <section className="lg:col-span-7 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Dedikované GPU řady (RTX, H100, H200, B200, B300)
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Přímý pronájem výpočetních uzlů s NVLink pro náročný trénink, vlastní kontejnery a vysokokapacitní inferenci.
                </p>
              </div>

              <div className="divide-y divide-zinc-800">
                {gpuOfferings.map((gpu) => {
                  const selected = gpu.id === selectedGpuId;
                  return (
                    <button
                      key={gpu.id}
                      type="button"
                      onClick={() => setSelectedGpuId(gpu.id)}
                      className={`w-full text-left py-3 px-3 rounded-md transition-colors flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between ${
                        selected ? 'bg-cyan-500/10 ring-1 ring-cyan-500/40' : 'hover:bg-zinc-800/50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{gpu.name}</span>
                          <span className="text-xs font-mono text-cyan-400">{gpu.family}</span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">{gpu.recommendedFor}</p>
                        <div className="text-xs font-mono text-zinc-500 mt-1 tabular-nums">
                          {gpu.vramGb} GB VRAM · {gpu.interconnect} · {gpu.fp8Tflops} FP8 TFLOPS · {gpu.availableNodes} volných uzlů
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="text-sm font-semibold text-white">${gpu.hourlyRateUsd.toFixed(2)} / h</div>
                        <div className="text-[11px] text-zinc-400">za 1× GPU</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Provisioning Form */}
            <section className="lg:col-span-5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
              <h2 className="text-base font-semibold text-white">Pronajmout GPU klastr</h2>
              <form onSubmit={handleProvisionGpu} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="gpu-count" className="block text-xs font-medium text-zinc-300 mb-1">
                      Počet GPU
                    </label>
                    <select
                      id="gpu-count"
                      value={gpuCount}
                      onChange={(e) => setGpuCount(Number(e.target.value))}
                      className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                    >
                      <option value={1}>1× GPU</option>
                      <option value={2}>2× GPU</option>
                      <option value={4}>4× GPU</option>
                      <option value={8}>8× GPU (NVLink Node)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="gpu-region" className="block text-xs font-medium text-zinc-300 mb-1">
                      Datacentrum
                    </label>
                    <select
                      id="gpu-region"
                      value={gpuRegion}
                      onChange={(e) => setGpuRegion(e.target.value as any)}
                      className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                    >
                      <option value="eu-central-prague">EU Central (Praha)</option>
                      <option value="eu-west-frankfurt">EU West (Frankfurt)</option>
                      <option value="us-east-virginia">US East (Virginia)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="gpu-workload" className="block text-xs font-medium text-zinc-300 mb-1">
                    Typ zátěže
                  </label>
                  <select
                    id="gpu-workload"
                    value={gpuWorkload}
                    onChange={(e) => setGpuWorkload(e.target.value as ComputeGpuInstance['workload'])}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                  >
                    <option value="lora_training">Trénink LoRA adaptérů</option>
                    <option value="fine_tuning">Full-Weights Fine-Tuning</option>
                    <option value="inference">Dedikovaná produkční inference</option>
                    <option value="custom_container">Vlastní Docker / PyTorch kontejner</option>
                  </select>
                </div>

                <button
                  type="submit"
                  data-testid="provision-gpu-btn"
                  disabled={isProvisioningGpu}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition-colors"
                >
                  <Server className="h-4 w-4" />
                  <span>{isProvisioningGpu ? 'Alokuji uzel...' : 'Pronajmout GPU klastr'}</span>
                </button>
              </form>
            </section>
          </div>

          {/* Active GPU Instances Table */}
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
            <h2 className="text-base font-semibold text-white">
              Pronajaté výpočetní instance ({gpuInstances.length})
            </h2>
            <div className="divide-y divide-zinc-800">
              {gpuInstances.map((inst) => (
                <div
                  key={inst.id}
                  className="py-3.5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">{inst.name}</span>
                      <span
                        className={`text-xs font-mono ${
                          inst.status === 'running'
                            ? 'text-emerald-400'
                            : inst.status === 'stopped'
                              ? 'text-amber-400'
                              : 'text-zinc-500'
                        }`}
                      >
                        {inst.status}
                      </span>
                      <span className="text-xs font-mono text-zinc-400">
                        {inst.gpuCount}× {inst.gpuName} · {inst.totalVramGb} GB VRAM · ${inst.hourlyCostUsd.toFixed(2)}/h
                      </span>
                    </div>
                    <div className="text-xs font-mono text-zinc-500 truncate">{inst.sshEndpoint}</div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {inst.status !== 'running' && inst.status !== 'terminated' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateGpuStatus(inst.id, 'running')}
                        className="rounded border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/25"
                      >
                        Spustit
                      </button>
                    )}
                    {inst.status === 'running' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateGpuStatus(inst.id, 'stopped')}
                        className="rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300 hover:text-white"
                      >
                        Zastavit
                      </button>
                    )}
                    {inst.status !== 'terminated' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateGpuStatus(inst.id, 'terminated')}
                        className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20"
                      >
                        Uvolnit
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* =================================================================== */}
      {/* 4. WORKFLOWS & FAL AGENT                                            */}
      {/* =================================================================== */}
      {!isLoading && section === 'workflows' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          <section className="lg:col-span-5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-white">fal Agent &amp; Vizuální Workflows</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Zadejte záměr v češtině – fal Agent automaticky poskládá vícefázový DAG řetězec (obrázek → 3D → video → zvuk) a spustí ho přes fal Inference Engine™.
              </p>
            </div>

            <form onSubmit={handleRunAgentPlan} className="space-y-3">
              <div>
                <label htmlFor="fal-agent-goal" className="block text-xs font-medium text-zinc-300 mb-1">
                  Zadání pro fal Agent
                </label>
                <textarea
                  id="fal-agent-goal"
                  rows={3}
                  value={agentGoal}
                  onChange={(e) => setAgentGoal(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                data-testid="fal-agent-run-btn"
                disabled={isRunningWorkflow}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                <Workflow className="h-4 w-4" />
                <span>{isRunningWorkflow ? 'Spouštím DAG workflow...' : 'Naplánovat a spustit přes fal Agent'}</span>
              </button>
            </form>

            <div className="border-t border-zinc-800 pt-4 space-y-2">
              <div className="text-xs font-medium text-zinc-300">Předpřipravené produkční šablony</div>
              <div className="divide-y divide-zinc-800">
                {presetWorkflows.map((wf) => (
                  <div key={wf.id} className="py-3 space-y-2">
                    <div className="text-xs font-semibold text-white">{wf.name}</div>
                    <p className="text-xs text-zinc-400">{wf.description}</p>
                    <button
                      type="button"
                      disabled={isRunningWorkflow}
                      onClick={() => handleRunPresetWorkflow(wf.id)}
                      className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                    >
                      <Play className="h-3 w-3 text-emerald-400" />
                      <span>Spustit šablonu ({wf.steps.length} kroky)</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="lg:col-span-7 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <h2 className="text-base font-semibold text-white">
              Historie spuštěných Workflows ({workflowRuns.length})
            </h2>

            {workflowRuns.length === 0 ? (
              <div className="py-12 text-center text-sm text-zinc-400">
                Zatím nebyl spuštěn žádný workflow. Zadejte cíl pro fal Agent nebo klikněte na šablonu vlevo.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {workflowRuns.map((run) => (
                  <div key={run.id} className="py-4 first:pt-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-white">{run.name}</div>
                        <div className="text-xs text-zinc-400 font-mono tabular-nums">
                          {run.steps.length} uzlů · {run.totalLatencyMs} ms celkem · prům. zrychlení {run.speedupFactor}×
                        </div>
                      </div>
                      <span className="text-xs font-mono text-emerald-400">Dokončeno</span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {run.steps.map((step) => (
                        <div key={step.id} className="border border-zinc-800 rounded p-2.5 space-y-2 bg-zinc-950/60">
                          <div className="flex items-center justify-between gap-2 text-xs font-mono">
                            <span className="text-white font-medium truncate">{step.label}</span>
                            <span className="text-emerald-400 shrink-0">{step.latencyMs} ms</span>
                          </div>
                          {step.outputPreview && (
                            <img
                              src={step.outputPreview}
                              alt={step.label}
                              referrerPolicy="no-referrer"
                              className="w-full h-28 object-cover rounded border border-zinc-800"
                            />
                          )}
                          <div className="text-[11px] font-mono text-zinc-500 truncate">{step.modelId}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* =================================================================== */}
      {/* 5. LORA TRAINING                                                    */}
      {/* =================================================================== */}
      {!isLoading && section === 'training' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          <section className="lg:col-span-5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-white">Trénink vlastního LoRA adaptéru</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Dolaďte si vlastní styl, tvář či produkt nad FLUX 3 nebo H3 Max a výsledné váhy jedním kliknutím nasaďte jako Serverless Endpoint.
              </p>
            </div>

            <form onSubmit={handleStartTraining} className="space-y-3">
              <div>
                <label htmlFor="lora-name" className="block text-xs font-medium text-zinc-300 mb-1">
                  Název adaptéru
                </label>
                <input
                  id="lora-name"
                  type="text"
                  required
                  value={loraName}
                  onChange={(e) => setLoraName(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="lora-base" className="block text-xs font-medium text-zinc-300 mb-1">
                    Základní model
                  </label>
                  <select
                    id="lora-base"
                    value={loraBase}
                    onChange={(e) => setLoraBase(e.target.value)}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                  >
                    <option value="fal-ai/flux-3/pro">FLUX 3 Pro</option>
                    <option value="fal-ai/flux-3/dev">FLUX 3 Dev</option>
                    <option value="fal-ai/h3-max">H3 Max (Video LoRA)</option>
                    <option value="fal-ai/seedance-2.5">Seedance 2.5</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="lora-trigger" className="block text-xs font-medium text-zinc-300 mb-1">
                    Trigger slovo
                  </label>
                  <input
                    id="lora-trigger"
                    type="text"
                    required
                    value={loraTrigger}
                    onChange={(e) => setLoraTrigger(e.target.value)}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-mono text-white"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="lora-dataset" className="block text-xs font-medium text-zinc-300 mb-1">
                  Dataset (S3 / ZIP / HuggingFace)
                </label>
                <input
                  id="lora-dataset"
                  type="text"
                  required
                  value={loraDataset}
                  onChange={(e) => setLoraDataset(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-mono text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="lora-gpu" className="block text-xs font-medium text-zinc-300 mb-1">
                    GPU uzel
                  </label>
                  <select
                    id="lora-gpu"
                    value={loraGpu}
                    onChange={(e) => setLoraGpu(e.target.value as GpuSeriesId)}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-white"
                  >
                    <option value="h100-sxm">H100</option>
                    <option value="h200-sxm">H200</option>
                    <option value="b200-hgx">B200</option>
                    <option value="b300-ultra">B300</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="lora-rank" className="block text-xs font-medium text-zinc-300 mb-1">
                    LoRA Rank
                  </label>
                  <input
                    id="lora-rank"
                    type="number"
                    min={4}
                    max={128}
                    value={loraRank}
                    onChange={(e) => setLoraRank(Number(e.target.value))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <label htmlFor="lora-steps" className="block text-xs font-medium text-zinc-300 mb-1">
                    Kroky
                  </label>
                  <input
                    id="lora-steps"
                    type="number"
                    min={100}
                    max={5000}
                    step={100}
                    value={loraSteps}
                    onChange={(e) => setLoraSteps(Number(e.target.value))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs font-mono text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                data-testid="train-lora-btn"
                disabled={isTrainingLora}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                <FlaskConical className="h-4 w-4" />
                <span>{isTrainingLora ? 'Trénuji adaptér...' : 'Spustit LoRA Training'}</span>
              </button>
            </form>
          </section>

          <section className="lg:col-span-7 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <h2 className="text-base font-semibold text-white">
              Tréninkové úlohy a váhy ({trainingJobs.length})
            </h2>
            <div className="divide-y divide-zinc-800">
              {trainingJobs.map((job) => (
                <div key={job.id} className="py-4 space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{job.adapterName}</span>
                        <span className="text-xs font-mono text-emerald-400">
                          {job.status} · loss {job.currentLoss}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-zinc-400 mt-0.5 tabular-nums">
                        Base: {job.baseModelId} · Trigger: {job.triggerWord} · Rank {job.rank} · {job.steps} kroků ({job.gpuTier})
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeployTrainedLora(job.id)}
                      className="inline-flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 whitespace-nowrap shrink-0"
                    >
                      <Cloud className="h-3.5 w-3.5" />
                      <span>{job.deployedEndpointId ? 'Nasadit další verzi' : 'Nasadit na Serverless'}</span>
                    </button>
                  </div>

                  <div className="text-xs font-mono text-zinc-500 break-all">
                    Váhy: {job.weightsArtifactUrl} · Průběh ztráty: {job.lossHistory.join(' → ')}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* =================================================================== */}
      {/* 6. SDK, GENMEDIA CLI & MCP PROTOCOL                                 */}
      {/* =================================================================== */}
      {!isLoading && section === 'devtools' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Interactive Genmedia CLI */}
          <section className="lg:col-span-7 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-white">Genmedia CLI Terminál</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Spouštějte skutečné CLI příkazy proti backendu pro katalog modelů, generování médií, nasazení vah a pronájem GPU.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                'genmedia models list',
                'genmedia run fal-ai/gpt-image-2.6 --prompt "Futuristický dron nad Prahou"',
                'genmedia deploy --name studio-cli-ep --base fal-ai/flux-3/pro',
                'genmedia compute rent --gpu b300-ultra --count 2',
                'mcp tools/list',
              ].map((presetCmd) => (
                <button
                  key={presetCmd}
                  type="button"
                  onClick={() => handleRunCli(presetCmd)}
                  className="rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-mono text-zinc-300 hover:border-emerald-500/40 hover:text-white"
                >
                  {presetCmd.split(' ').slice(0, 3).join(' ')}…
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRunCli();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                aria-label="Genmedia CLI příkaz"
                value={cliInput}
                onChange={(e) => setCliInput(e.target.value)}
                className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-mono text-white focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                data-testid="cli-exec-btn"
                disabled={isRunningCli}
                className="rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 whitespace-nowrap"
              >
                {isRunningCli ? 'Běží...' : 'Spustit příkaz'}
              </button>
            </form>

            <pre
              data-testid="cli-output-box"
              className="min-h-[200px] max-h-[340px] overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3.5 text-xs font-mono text-emerald-300 whitespace-pre-wrap"
            >
              {cliOutput}
            </pre>
          </section>

          {/* MCP Protocol & @fal-ai/client SDK */}
          <section className="lg:col-span-5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-white">MCP Protokol &amp; SDK Integrace</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Model Context Protocol endpoint (<code className="text-zinc-200">/v1/infra/mcp/call</code>) a klientská knihovna <code className="text-zinc-200">@fal-ai/client</code>.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="mcp-tool-select" className="block text-xs font-medium text-zinc-300">
                Otestovat MCP Tool ({mcpTools.length} dostupných)
              </label>
              <div className="flex gap-2">
                <select
                  id="mcp-tool-select"
                  value={mcpToolName}
                  onChange={(e) => setMcpToolName(e.target.value)}
                  className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-mono text-white"
                >
                  {mcpTools.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  data-testid="mcp-call-btn"
                  onClick={handleRunMcpCall}
                  className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 whitespace-nowrap"
                >
                  Zavolat MCP
                </button>
              </div>
              {mcpResultJson && (
                <pre className="max-h-48 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 text-[11px] font-mono text-zinc-300">
                  {mcpResultJson}
                </pre>
              )}
            </div>

            <div className="border-t border-zinc-800 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-300">mcp.json konfigurace klienta</span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      'mcp-json',
                      JSON.stringify(
                        {
                          mcpServers: {
                            'nexus-fal-infra': {
                              command: 'npx',
                              args: ['-y', '@fal-ai/genmedia-mcp'],
                              env: { FAL_ENDPOINT: 'http://localhost:3000/v1/infra/mcp/call' },
                            },
                          },
                        },
                        null,
                        2
                      )
                    )
                  }
                  className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                >
                  {copiedId === 'mcp-json' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedId === 'mcp-json' ? 'Zkopírováno' : 'Kopírovat JSON'}</span>
                </button>
              </div>
              <pre className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 text-[11px] font-mono text-zinc-400">
{`{
  "mcpServers": {
    "nexus-fal-infra": {
      "command": "npx",
      "args": ["-y", "@fal-ai/genmedia-mcp"],
      "env": {
        "FAL_ENDPOINT": "/v1/infra/mcp/call"
      }
    }
  }
}`}
              </pre>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
