import { Plan, PlanStep } from '../types';

function createStep(title: string, detail?: string): PlanStep {
	return {
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		title,
		detail,
	};
}

export function generatePlanFromTask(task: string): Plan {
	const steps: PlanStep[] = [];

	steps.push(
		createStep('Understand requirements and constraints', 'Clarify scope, inputs/outputs, and edge cases.'),
	);
	steps.push(
		createStep('Locate affected code and entry points', 'Search project for relevant modules, routes, or components.'),
	);
	steps.push(
		createStep('Design the change', 'Define data structures, APIs, and update strategy with minimal risk.'),
	);
	steps.push(
		createStep('Implement changes', 'Write code with clear naming and small, testable units.'),
	);
	steps.push(
		createStep('Add/Update tests', 'Cover happy paths and critical edge cases.'),
	);
	steps.push(
		createStep('Run and fix issues', 'Build/lint/test; iterate until all pass.'),
	);
	steps.push(
		createStep('Refactor and document', 'Improve readability and add necessary docs.'),
	);
	steps.push(
		createStep('Prepare for merge', 'Update changelog, ensure CI passes, and request review.'),
	);

	return {
		task: task.trim(),
		steps,
		createdAt: new Date().toISOString(),
	};
}


