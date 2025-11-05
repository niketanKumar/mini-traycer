import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { AgentProvider } from './agent-provider';
import { Plan } from '../types';

export class CursorProvider implements AgentProvider {
	name = 'Cursor';

	async executePlan(plan: Plan, workspacePath: string, _context: vscode.ExtensionContext): Promise<void> {
		const output = vscode.window.createOutputChannel('Agent Planner');
		const planDir = path.join(workspacePath, '.agent-plans');
		if (!fs.existsSync(planDir)) {
			fs.mkdirSync(planDir, { recursive: true });
		}
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		const planFile = path.join(planDir, `plan-${stamp}.md`);
		const lines: string[] = [];
		lines.push(`# Plan for: ${plan.task}`);
		lines.push('');
		lines.push(`Created: ${plan.createdAt}`);
		lines.push('');
		lines.push('## Steps');
		for (let i = 0; i < plan.steps.length; i++) {
			const s = plan.steps[i];
			lines.push(`- [ ] ${i + 1}. ${s.title}`);
			if (s.detail) lines.push(`  - ${s.detail}`);
		}
		fs.writeFileSync(planFile, lines.join('\n'), { encoding: 'utf8' });

		const config = vscode.workspace.getConfiguration('agentPlanner');
		const configuredPath = (config.get<string>('cursor.path') || '').trim();
		const execPath = configuredPath || 'cursor';
		const argsTemplate = (config.get<string>('cursor.argsTemplate') || '{workspace} {planFile}').trim();
		const args = this.buildArgs(argsTemplate, workspacePath, planFile);

		output.appendLine(`[Cursor] exec: ${execPath}`);
		output.appendLine(`[Cursor] args: ${JSON.stringify(args)}`);
		output.show(true);

		await this.launch(execPath, args, output).catch(async (err) => {
			output.appendLine(`[Cursor] launch error: ${err?.message || err}`);
			const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(planFile));
			await vscode.window.showTextDocument(doc, { preview: false });
			vscode.window.showWarningMessage('Could not launch Cursor. Plan opened in VS Code. Configure agentPlanner.cursor.path and cursor.argsTemplate if needed.');
		});
	}

	private buildArgs(template: string, workspacePath: string, planFile: string): string[] {
		const replaced = template
			.replace(/\{workspace\}/g, this.quoteIfNeeded(workspacePath))
			.replace(/\{planFile\}/g, this.quoteIfNeeded(planFile));
		return replaced.match(/(?:\"[^\"]*\"|'[^']*'|\S+)/g) || [];
	}

	private quoteIfNeeded(value: string): string {
		return /\s/.test(value) ? `"${value}"` : value;
	}

	private async launch(execPath: string, args: string[], output: vscode.OutputChannel): Promise<void> {
		return new Promise((resolve, reject) => {
			const child = spawn(execPath, args, {
				detached: true,
				shell: true,
				stdio: 'ignore',
			});
			child.on('error', (err) => {
				output.appendLine(`[Cursor] process error: ${err?.message || err}`);
				reject(err);
			});
			// Detach immediately; assume GUI app
			try { child.unref(); } catch { /* ignore */ }
			vscode.window.showInformationMessage('Opened plan in Cursor (if CLI is available).');
			resolve();
		});
	}
}


