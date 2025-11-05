import * as vscode from 'vscode';
import { PlannerProvider } from './planner-provider';
import { LocalPlanner } from './local-planner';
import { LLMPlanner } from './llm-planner';

export function getPlannerProvider(config: vscode.WorkspaceConfiguration): PlannerProvider {
	const mode = (config.get<string>('planning.mode') || 'local').toLowerCase();
	switch (mode) {
		case 'llm':
			return new LLMPlanner();
		case 'local':
		default:
			return new LocalPlanner();
	}
}


