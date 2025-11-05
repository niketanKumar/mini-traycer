import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { PlannerProvider } from './planner-provider';
import { Plan, PlanStep } from '../types';

interface OpenAIChatRequestBody {
	model: string;
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
	temperature?: number;
	max_tokens?: number;
}

export class LLMPlanner implements PlannerProvider {
	name = 'LLM';

	async generatePlan(task: string, workspacePath: string | undefined, secrets: vscode.SecretStorage): Promise<Plan> {
        const config = vscode.workspace.getConfiguration('agentPlanner');
        const provider = (config.get<string>('llm.provider') || 'openai').toLowerCase();
        const baseUrl = (config.get<string>('llm.baseUrl') || 'https://api.openai.com').replace(/\/$/, '');
        const model = (config.get<string>('llm.model') || 'gpt-4o-mini').trim();
        const temperature = config.get<number>('llm.temperature') ?? 0.2;
        const timeoutMs = config.get<number>('llm.timeoutMs') ?? 60000;
        const apiKey = (await secrets.get('agentPlanner.llm.apiKey')) || '';
        const azureDeployment = (config.get<string>('azure.deployment') || '').trim();
        const azureApiVersion = (config.get<string>('azure.apiVersion') || '2024-08-01-preview').trim();

		if (!apiKey) {
			throw new Error('LLM API key not set. Run: Agent Planner: Set LLM API Key');
		}

		const contextLines: string[] = [];
		contextLines.push('You are a senior software engineer planning coding tasks.');
		contextLines.push('Create a concise, safe, actionable plan with 5-12 steps.');
		contextLines.push('Return ONLY a compact JSON object, no markdown fences, matching this TypeScript type:');
		contextLines.push('{' +
		'\n"task": string,' +
		'\n"createdAt": string,' +
		'\n"steps": Array<{ "id": string, "title": string, "detail"?: string }>' +
		'\n}');
		if (workspacePath) {
			contextLines.push(`Workspace path: ${workspacePath}`);
		}

		const systemPrompt = contextLines.join('\n');
		const userPrompt = `Task: ${task}\nGenerate the JSON plan now.`;

        const body: OpenAIChatRequestBody = {
			model,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt },
			],
			temperature,
			max_tokens: 1000,
		};

		const controller = new AbortController();
		const to = setTimeout(() => controller.abort(), timeoutMs);
		try {
            const endpoint = provider === 'azure'
                ? `${baseUrl}/openai/deployments/${encodeURIComponent(azureDeployment)}/chat/completions?api-version=${encodeURIComponent(azureApiVersion)}`
                : `${baseUrl}/v1/chat/completions`;

            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (provider === 'azure') {
                headers['api-key'] = apiKey;
            } else {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const res = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal as any,
            });
			if (!res.ok) {
				const text = await res.text();
				throw new Error(`LLM error ${res.status}: ${text}`);
			}
			const data: any = await res.json();
			const content: string = data?.choices?.[0]?.message?.content || '';
			const jsonText = this.extractJson(content);
			const raw = JSON.parse(jsonText);
			const now = new Date().toISOString();
			const steps: PlanStep[] = Array.isArray(raw.steps) ? raw.steps.map((s: any, idx: number) => ({
				id: s.id || `${Date.now()}-${idx}`,
				title: String(s.title || '').trim(),
				detail: s.detail ? String(s.detail) : undefined,
			})) : [];
			if (steps.length === 0) {
				throw new Error('LLM returned no steps.');
			}
			const plan: Plan = {
				task: String(raw.task || task).trim(),
				steps,
				createdAt: String(raw.createdAt || now),
			};
			return plan;
		} finally {
			clearTimeout(to);
		}
	}

	private extractJson(text: string): string {
		const trimmed = text.trim();
		if (trimmed.startsWith('```')) {
			const match = trimmed.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
			if (match && match[1]) return match[1].trim();
		}
		const start = trimmed.indexOf('{');
		const end = trimmed.lastIndexOf('}');
		if (start !== -1 && end !== -1 && end > start) {
			return trimmed.slice(start, end + 1);
		}
		return trimmed;
	}
}


