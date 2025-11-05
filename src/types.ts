export interface PlanStep {
	id: string;
	title: string;
	detail?: string;
}

export interface Plan {
	task: string;
	steps: PlanStep[];
	createdAt: string;
}


