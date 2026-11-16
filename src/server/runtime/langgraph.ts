/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VideoStoryboard } from '../../types/nexus.ts';

export interface GraphState {
  runId: string;
  threadId: string;
  goal: string;
  intent?: string;
  stepPlan: Array<{
    id: number;
    title: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed';
    assignedAgent?: string;
  }>;
  toolsToCall: Array<{ tool: string; args: any }>;
  toolOutputs: Array<{ tool: string; output: any; success: boolean }>;
  viralScript?: {
    hook: string;
    body: string;
    cta: string;
    humorAngle: string;
    retentionTricks: string[];
  };
  videoStoryboard?: VideoStoryboard;
  moviePyScript?: string;
  reply: string;
  suggestions: string[];
  criticPassed: boolean;
  criticFeedback?: string[];
  retryCount: number;
  currentStepIndex: number;
  executionHistory: Array<{
    node: string;
    status: 'completed' | 'skipped' | 'repaired';
    timestamp: string;
    snapshotState?: any;
  }>;
}

export type GraphNodeHandler = (state: GraphState) => Promise<Partial<GraphState>>;

export class StateGraph {
  private nodes: Map<string, GraphNodeHandler> = new Map();
  private edges: Map<string, string | ((state: GraphState) => string)> = new Map();
  private entryPoint: string = '';

  public addNode(name: string, handler: GraphNodeHandler): this {
    this.nodes.set(name, handler);
    return this;
  }

  public setEntryPoint(nodeName: string): this {
    this.entryPoint = nodeName;
    return this;
  }

  public addEdge(fromNode: string, toNode: string): this {
    this.edges.set(fromNode, toNode);
    return this;
  }

  public addConditionalEdges(
    fromNode: string,
    condition: (state: GraphState) => string
  ): this {
    this.edges.set(fromNode, condition);
    return this;
  }

  public async invoke(
    initialState: Partial<GraphState>,
    onStepUpdate?: (nodeName: string, state: GraphState) => void
  ): Promise<GraphState> {
    let state: GraphState = {
      runId: initialState.runId || `run-${Date.now()}`,
      threadId: initialState.threadId || 'th-main-001',
      goal: initialState.goal || '',
      stepPlan: initialState.stepPlan || [],
      toolsToCall: initialState.toolsToCall || [],
      toolOutputs: initialState.toolOutputs || [],
      reply: '',
      suggestions: [],
      criticPassed: true,
      retryCount: 0,
      currentStepIndex: 0,
      executionHistory: [],
      ...initialState,
    };

    let currentNode = this.entryPoint;
    const maxGraphSteps = 12;
    let stepCount = 0;

    while (currentNode && currentNode !== '__END__' && stepCount < maxGraphSteps) {
      stepCount++;
      const handler = this.nodes.get(currentNode);
      if (!handler) {
        break;
      }

      const updates = await handler(state);
      state = { ...state, ...updates };

      state.executionHistory.push({
        node: currentNode,
        status: state.criticPassed ? 'completed' : 'repaired',
        timestamp: new Date().toISOString(),
      });

      if (onStepUpdate) {
        onStepUpdate(currentNode, state);
      }

      // Determine next node
      const nextEdge = this.edges.get(currentNode);
      if (typeof nextEdge === 'function') {
        currentNode = nextEdge(state);
      } else if (typeof nextEdge === 'string') {
        currentNode = nextEdge;
      } else {
        currentNode = '__END__';
      }
    }

    return state;
  }
}
