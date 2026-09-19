import {Disposable, RelativePattern, workspace} from "vscode";
import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";

import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {FoilLabModel} from "./FoilLabModel";
import {
    ANALYSIS_REGISTRY,
    APP_SPEC,
    EOLIEN_MACHINE,
    EXAMPLE_CAMPAIGN,
    HYDRO_REFERENCE_MACHINE,
    PROJECT_CONFIG,
} from "./scaffoldTemplates";

export class FoilLabManager implements Disposable {
    private disposables: Disposable[] = [];
    private fileWatcher: Disposable | undefined;

    constructor(
        private readonly model: FoilLabModel,
        private readonly workspaceFolderManager: WorkspaceFolderManager
    ) {
        this.disposables.push(
            this.workspaceFolderManager.onDidChangeActiveProjectFolder(() => {
                this.registerFileWatcher();
                void this.model.refresh();
            })
        );
        this.registerFileWatcher();
    }

    async initialize(): Promise<void> {
        await this.model.refresh();
    }

    async initializeProject(): Promise<void> {
        const root = this.model.labRootPath;
        await Promise.all([
            mkdir(path.join(root, "machines"), {recursive: true}),
            mkdir(path.join(root, "campaigns"), {recursive: true}),
            mkdir(path.join(root, "analysis-modules"), {recursive: true}),
            mkdir(path.join(root, "ui"), {recursive: true}),
        ]);

        await Promise.all([
            this.writeJsonIfMissing(path.join(root, "project.json"), PROJECT_CONFIG),
            this.writeJsonIfMissing(path.join(root, "machines", "eolien_lab_v1.json"), EOLIEN_MACHINE),
            this.writeJsonIfMissing(path.join(root, "machines", "hydro_reference_v1.json"), HYDRO_REFERENCE_MACHINE),
            this.writeJsonIfMissing(path.join(root, "campaigns", "wind_parameter_sweep_example.json"), EXAMPLE_CAMPAIGN),
            this.writeJsonIfMissing(path.join(root, "analysis-modules", "registry.json"), ANALYSIS_REGISTRY),
            this.writeJsonIfMissing(path.join(root, "ui", "app.json"), APP_SPEC),
        ]);
        await this.model.refresh();
    }

    async createCampaign(campaignId: string): Promise<string> {
        const normalizedId = campaignId.trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
        if (normalizedId.length === 0) {
            throw new Error("Campaign id must contain at least one valid character.");
        }

        const filePath = path.join(this.model.labRootPath, "campaigns", `${normalizedId}.json`);
        const campaign = {
            campaignId: normalizedId,
            technology: this.model.state.project?.activeTechnology ?? "EOLIEN",
            machineId:
                this.model.state.machines.find((machine) => machine.config?.status === "ACTIVE")?.config?.machineId ??
                "eolien_lab_v1",
            classification: this.model.state.project?.defaultClassification ?? "SYNTHETIC",
            objective: "Describe the experiment objective.",
            analyses: [{module: "descriptive_statistics", enabled: true}],
            outputs: {
                gold: true,
                aiBiDashboard: true,
                streamlitApp: true,
                mlflow: false,
            },
        };
        await mkdir(path.dirname(filePath), {recursive: true});
        await writeFile(filePath, `${JSON.stringify(campaign, null, 4)}\n`, {
            encoding: "utf8",
            flag: "wx",
        });
        await this.model.refresh();
        return filePath;
    }

    async refresh(): Promise<void> {
        await this.model.refresh();
    }

    private async writeJsonIfMissing(filePath: string, value: unknown): Promise<void> {
        try {
            await writeFile(filePath, `${JSON.stringify(value, null, 4)}\n`, {
                encoding: "utf8",
                flag: "wx",
            });
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
                throw e;
            }
        }
    }

    private registerFileWatcher(): void {
        this.fileWatcher?.dispose();
        const pattern = new RelativePattern(
            this.workspaceFolderManager.activeProjectUri,
            ".foil-lab/**/*.json"
        );
        const watcher = workspace.createFileSystemWatcher(pattern);
        watcher.onDidCreate(() => void this.model.refresh());
        watcher.onDidChange(() => void this.model.refresh());
        watcher.onDidDelete(() => void this.model.refresh());
        this.fileWatcher = watcher;
    }

    dispose(): void {
        this.fileWatcher?.dispose();
        this.disposables.forEach((disposable) => disposable.dispose());
    }
}
