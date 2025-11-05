import * as vscode from 'vscode';
import { getPlannerProvider } from './planner-providers';
import { AgentProvider } from './agent-providers/agent-provider';
import { getAgentProvider } from './agent-providers';
import { Plan } from './types';

const PLAN_STATE_KEY = 'agentPlanner.currentPlan';

function formatPlanMarkdown(plan: Plan): string {
	const lines: string[] = [];
	lines.push(`# Plan for: ${plan.task}`);
	lines.push('');
	lines.push(`Created: ${plan.createdAt}`);
	lines.push('');
	lines.push('## Steps');
	for (let i = 0; i < plan.steps.length; i++) {
		const step = plan.steps[i];
		lines.push(`- [ ] ${i + 1}. ${step.title}`);
		if (step.detail) {
			lines.push(`  - ${step.detail}`);
		}
	}
	return lines.join('\n');
}

async function openReadonlyPreview(content: string, language: string, name: string): Promise<void> {
	const doc = await vscode.workspace.openTextDocument({ content, language });
	await vscode.window.showTextDocument(doc, { preview: true });
	await vscode.commands.executeCommand('workbench.action.files.saveAs', vscode.Uri.parse(`untitled:${name}`));
}

async function handleCreatePlan(context: vscode.ExtensionContext): Promise<void> {
	const task = await vscode.window.showInputBox({
		prompt: 'Describe the task for the coding agent to perform',
		placeHolder: 'e.g., Add dark mode toggle to settings and update tests',
	});
	if (!task) {
		return;
	}

	const folders = vscode.workspace.workspaceFolders;
	const workspacePath = folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
	const config = vscode.workspace.getConfiguration('agentPlanner');
	const planner = getPlannerProvider(config);
	const plan = await planner.generatePlan(task, workspacePath, context.secrets);
	await context.workspaceState.update(PLAN_STATE_KEY, plan);

	const markdown = formatPlanMarkdown(plan);
	await openReadonlyPreview(markdown, 'markdown', 'agent-plan.md');

	const choice = await vscode.window.showInformationMessage(
		'Plan created. Approve, edit as JSON, or cancel?',
		{ modal: true },
		'Approve',
		'Edit as JSON',
		'Cancel'
	);

	if (choice === 'Edit as JSON') {
		const json = JSON.stringify(plan, null, 2);
		const doc = await vscode.workspace.openTextDocument({ content: json, language: 'json' });
		await vscode.window.showTextDocument(doc, { preview: false });
		vscode.window.showInformationMessage('Edit the JSON, then run: Agent Planner: Save Edited Plan');
		return;
	}

	if (choice === 'Approve') {
		vscode.window.showInformationMessage('Plan approved. You can now run: Agent Planner: Run Plan');
		return;
	}
}

async function handleSaveEditedPlan(context: vscode.ExtensionContext): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage('No active editor. Open the JSON plan first.');
		return;
	}
	try {
		const text = editor.document.getText();
		const parsed = JSON.parse(text) as Plan;
		if (!parsed || !parsed.task || !Array.isArray(parsed.steps)) {
			throw new Error('Invalid plan JSON. Expected { task: string, steps: [] }.');
		}
		await context.workspaceState.update(PLAN_STATE_KEY, parsed);
		vscode.window.showInformationMessage('Edited plan saved. You can now run: Agent Planner: Run Plan');
	} catch (err: any) {
		vscode.window.showErrorMessage(`Failed to parse/save plan JSON: ${err?.message || err}`);
	}
}

async function handleRunPlan(context: vscode.ExtensionContext): Promise<void> {
	const plan = context.workspaceState.get<Plan>(PLAN_STATE_KEY);
	if (!plan) {
		vscode.window.showErrorMessage('No plan found. Create or save a plan first.');
		return;
	}
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) {
		vscode.window.showErrorMessage('Open a workspace folder to run the plan.');
		return;
	}
	const workspacePath = folders[0].uri.fsPath;
	const config = vscode.workspace.getConfiguration('agentPlanner');
	const agentId = (config.get<string>('agent') || 'cursor');

	const provider: AgentProvider = getAgentProvider(agentId, config);
	try {
		await provider.executePlan(plan, workspacePath, context);
		vscode.window.showInformationMessage(`Plan sent to agent: ${provider.name}.`);
	} catch (err: any) {
		vscode.window.showErrorMessage(`Failed to run plan with ${provider.name}: ${err?.message || err}`);
	}
}

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('agent-planner.createPlan', () => handleCreatePlan(context)),
		vscode.commands.registerCommand('agent-planner.saveEditedPlan', () => handleSaveEditedPlan(context)),
		vscode.commands.registerCommand('agent-planner.runPlan', () => handleRunPlan(context)),
		vscode.commands.registerCommand('agent-planner.setLlmApiKey', async () => {
			const value = await vscode.window.showInputBox({
				prompt: 'Enter API Key for LLM planner',
				password: true,
				ignoreFocusOut: true,
			});
			if (!value) return;
			await context.secrets.store('agentPlanner.llm.apiKey', value.trim());
			vscode.window.showInformationMessage('LLM API key saved to secure storage.');
		}),
		vscode.commands.registerCommand('agent-planner.configureLlm', async () => {
			const provider = await vscode.window.showQuickPick(['azure', 'openai'], {
				placeHolder: 'Choose LLM provider',
			});
			if (!provider) return;
			const cfg = vscode.workspace.getConfiguration('agentPlanner');
			await cfg.update('planning.mode', 'llm', vscode.ConfigurationTarget.Workspace);
			await cfg.update('llm.provider', provider, vscode.ConfigurationTarget.Workspace);
			if (provider === 'azure') {
				const baseUrl = await vscode.window.showInputBox({
					prompt: 'Azure OpenAI base URL (e.g., https://your-resource.openai.azure.com)',
					ignoreFocusOut: true,
				});
				if (!baseUrl) return;
				const deployment = await vscode.window.showInputBox({
					prompt: 'Azure deployment name (e.g., gpt-4o-mini)',
					ignoreFocusOut: true,
				});
				if (!deployment) return;
				const apiVersion = await vscode.window.showInputBox({
					prompt: 'Azure API version',
					value: '2024-08-01-preview',
					ignoreFocusOut: true,
				});
				if (!apiVersion) return;
				await cfg.update('llm.baseUrl', baseUrl.replace(/\/$/, ''), vscode.ConfigurationTarget.Workspace);
				await cfg.update('azure.deployment', deployment, vscode.ConfigurationTarget.Workspace);
				await cfg.update('azure.apiVersion', apiVersion, vscode.ConfigurationTarget.Workspace);
				vscode.window.showInformationMessage('Azure LLM configured. Set the API key via: Agent Planner: Set LLM API Key');
			} else {
				const model = await vscode.window.showInputBox({
					prompt: 'OpenAI model (e.g., gpt-4o-mini)',
					value: 'gpt-4o-mini',
					ignoreFocusOut: true,
				});
				await cfg.update('llm.baseUrl', 'https://api.openai.com', vscode.ConfigurationTarget.Workspace);
				if (model) await cfg.update('llm.model', model, vscode.ConfigurationTarget.Workspace);
				vscode.window.showInformationMessage('OpenAI LLM configured. Set the API key via: Agent Planner: Set LLM API Key');
			}
		}),
	);
}

export function deactivate() {
	// no-op
}

 