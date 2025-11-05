import * as vscode from 'vscode';
import { AgentProvider } from './agent-provider';
import { CursorProvider } from './cursor-provider';

export function getAgentProvider(agentId: string, _config: vscode.WorkspaceConfiguration): AgentProvider {
	switch (agentId) {
		case 'cursor':
		default:
			return new CursorProvider();
	}
}


