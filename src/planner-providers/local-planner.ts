import * as vscode from 'vscode';
import { PlannerProvider } from './planner-provider';
import { Plan } from '../types';
import { generatePlanFromTask } from '../core/local-plan-heuristics';

export class LocalPlanner implements PlannerProvider {
	name = 'Local';

	async generatePlan(task: string, _workspacePath: string | undefined, _secrets: vscode.SecretStorage): Promise<Plan> {
		return generatePlanFromTask(task);
	}
}


