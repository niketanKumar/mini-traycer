import * as vscode from 'vscode';
import { Plan } from '../types';

export interface PlannerProvider {
	name: string;
	generatePlan(task: string, workspacePath: string | undefined, secrets: vscode.SecretStorage): Promise<Plan>;
}


