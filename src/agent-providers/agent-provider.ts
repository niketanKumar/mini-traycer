import * as vscode from 'vscode';
import { Plan } from '../types';

export interface AgentProvider {
	name: string;
	executePlan(plan: Plan, workspacePath: string, context: vscode.ExtensionContext): Promise<void>;
}


