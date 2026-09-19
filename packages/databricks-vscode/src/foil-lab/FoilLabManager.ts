import {Disposable, RelativePattern, workspace} from "vscode";
import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";

import {
    BundleFileSet,
    parseBundleYaml,
    writeBundleYaml,
} from "../bundle/BundleFileSet";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {compileApp} from "./appCompiler";
import {addBundleInclude} from "./bundleIntegration";
import {compileCampaign as buildCampaign} from "./compileCampaign";
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
        private readonly workspaceFolderManager: WorkspaceFolderManager,
        private readonly bundleFileSet: BundleFileSet
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
        if (root === undefined) {
            throw new Error(
                "Open or select a Databricks project folder first."
            );
        }

        await Promise.all([
            mkdir(path.join(root, "machines"), {recursive: true}),
            mkdir(path.join(root, "campaigns"), {recursive: true}),
            mkdir(path.join(root, "analysis-modules"), {recursive: true}),
            mkdir(path.join(root, "ui"), {recursive: true}),
            mkdir(path.join(root, "build"), {recursive: true}),
        ]);

        await Promise.all([
            this.writeJsonIfMissing(
                path.join(root, "project.json"),
                PROJECT_CONFIG
            ),
            this.writeJsonIfMissing(
                path.join(root, "machines", "eolien_lab_v1.json"),
                EOLIEN_MACHINE
            ),
            this.writeJsonIfMissing(
                path.join(root, "machines", "hydro_reference_v1.json"),
                HYDRO_REFERENCE_MACHINE
            ),
            this.writeJsonIfMissing(
                path.join(
                    root,
                    "campaigns",
                    "wind_parameter_sweep_example.json"
                ),
                EXAMPLE_CAMPAIGN
            ),
            this.writeJsonIfMissing(
                path.join(root, "analysis-modules", "registry.json"),
                ANALYSIS_REGISTRY
            ),
            this.writeJsonIfMissing(
                path.join(root, "ui", "app.json"),
                APP_SPEC
            ),
            this.writeTextIfMissing(path.join(root, ".gitignore"), "build/\n"),
        ]);
        await this.model.refresh();
    }

    async importControlMachineSnapshot(snapshotPath: string): Promise<string> {
        const root = this.model.labRootPath;
        if (root === undefined) {
            throw new Error("Initialize the FOIL Lab before importing a control snapshot.");
        }

        const raw = JSON.parse(await readFile(snapshotPath, "utf8")) as {
            schema?: string;
            sourceRepo?: string;
            machineId?: string;
            technology?: string;
            status?: string;
            machineRevision?: string;
            referenceFacts?: unknown[];
            simulationParameters?: string[];
            unresolvedEngineering?: string[];
            rules?: string[];
        };
        if (
            raw.schema !== "foil-control/databricks-machine-snapshot-v1" ||
            raw.machineId === undefined ||
            raw.machineRevision === undefined ||
            raw.sourceRepo === undefined
        ) {
            throw new Error("Selected JSON is not a valid FOIL control Databricks machine snapshot.");
        }
        if (raw.technology !== "EOLIEN") {
            throw new Error("The MVP importer accepts the active EOLIEN control machine only.");
        }

        const machine = {
            machineId: "eolien_lab_v1",
            technology: "EOLIEN",
            status: "ACTIVE",
            classification: "SYNTHETIC",
            modelVersion: `control-${raw.machineRevision}`,
            description:
                "Active wind profile imported from the FOIL company control repository. Scenario values remain synthetic until approved evidence updates the control source.",
            control: {
                sourceRepo: raw.sourceRepo,
                controlMachineId: raw.machineId,
                revision: raw.machineRevision,
                importedAt: new Date().toISOString(),
                snapshotPath,
            },
            parameters: {
                referenceFacts: raw.referenceFacts ?? [],
                simulationParameterIds: raw.simulationParameters ?? [],
                unresolvedEngineering: raw.unresolvedEngineering ?? [],
                controlRules: raw.rules ?? [],
            },
        };

        const target = path.join(root, "machines", "eolien_lab_v1.json");
        await mkdir(path.dirname(target), {recursive: true});
        await writeFile(target, `${JSON.stringify(machine, null, 4)}\n`, "utf8");
        await this.model.refresh();
        return target;
    }

    async createCampaign(campaignId: string): Promise<string> {
        const root = this.model.labRootPath;
        if (root === undefined) {
            throw new Error(
                "Open or select a Databricks project folder first."
            );
        }

        const normalizedId = campaignId.trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
        if (normalizedId.length === 0) {
            throw new Error(
                "Campaign id must contain at least one valid character."
            );
        }

        const filePath = path.join(root, "campaigns", `${normalizedId}.json`);
        const campaign = {
            campaignId: normalizedId,
            technology: this.model.state.project?.activeTechnology ?? "EOLIEN",
            machineId:
                this.model.state.machines.find(
                    (machine) => machine.config?.status === "ACTIVE"
                )?.config?.machineId ?? "eolien_lab_v1",
            classification:
                this.model.state.project?.defaultClassification ?? "SYNTHETIC",
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

    async compileCampaign(campaignId: string): Promise<string> {
        await this.model.refresh();
        const root = this.model.labRootPath;
        const project = this.model.state.project;
        const campaign = this.model.state.campaigns.find(
            (item) => item.config?.campaignId === campaignId
        );
        const machine = this.model.state.machines.find(
            (item) => item.config?.machineId === campaign?.config?.machineId
        );

        if (root === undefined || project === undefined) {
            throw new Error(
                "Initialize the FOIL Lab before compiling a campaign."
            );
        }
        if (campaign?.config === undefined) {
            throw new Error(
                "The campaign is missing or has validation errors. Fix its JSON before compiling."
            );
        }
        if (machine?.config === undefined) {
            throw new Error(
                "The campaign references a missing or invalid machine profile."
            );
        }

        const plan = buildCampaign(project, machine.config, campaign.config);
        const buildRoot = path.join(root, "build", plan.campaignId);
        await rm(buildRoot, {recursive: true, force: true});

        for (const artifact of plan.artifacts) {
            const target = path.join(buildRoot, artifact.relativePath);
            await mkdir(path.dirname(target), {recursive: true});
            await writeFile(target, artifact.content, "utf8");
        }

        return path.join(buildRoot, "manifest.json");
    }

    async applyCampaign(campaignId: string): Promise<{
        manifestPath: string;
        bundleFile: string;
        includePath: string;
        changed: boolean;
    }> {
        const manifestPath = await this.compileCampaign(campaignId);
        const rootFile = await this.bundleFileSet.getRootFile();
        if (rootFile === undefined) {
            throw new Error(
                "No unique Databricks bundle root file was found in the active project."
            );
        }

        const includePath = `.foil-lab/build/${campaignId}/resources/campaign.job.yml`;
        const bundle = await parseBundleYaml(rootFile);
        const integrated = addBundleInclude(bundle, includePath);
        if (integrated.changed) {
            await writeBundleYaml(rootFile, integrated.bundle);
            this.bundleFileSet.bundleDataCache.invalidate();
        }

        return {
            manifestPath,
            bundleFile: rootFile.fsPath,
            includePath,
            changed: integrated.changed,
        };
    }

    async configureApp(
        catalog: string,
        sqlWarehouseId: string
    ): Promise<string> {
        await this.model.refresh();
        const app = this.model.state.app;
        const appSpecPath = this.model.appSpecPath;
        if (app === undefined || appSpecPath === undefined) {
            throw new Error(
                "Initialize the FOIL Lab before configuring the App."
            );
        }

        const updated = {
            ...app,
            catalog: catalog.trim(),
            sqlWarehouseId: sqlWarehouseId.trim(),
            goldSchema:
                this.model.state.project?.databricks.goldSchema ??
                app.goldSchema,
            readOnly: true,
            canLaunchCampaigns: false,
        };
        await writeFile(
            appSpecPath,
            `${JSON.stringify(updated, null, 4)}\n`,
            "utf8"
        );
        await this.model.refresh();
        return appSpecPath;
    }

    async generateApp(): Promise<string> {
        await this.model.refresh();
        const root = this.model.labRootPath;
        const app = this.model.state.app;
        const project = this.model.state.project;
        if (root === undefined || app === undefined || project === undefined) {
            throw new Error(
                "Initialize and configure the FOIL Lab before generating the App."
            );
        }
        if (app.goldSchema !== project.databricks.goldSchema) {
            throw new Error(
                "App Gold schema must match the FOIL project Gold schema."
            );
        }

        const plan = compileApp(app);
        for (const artifact of plan.artifacts) {
            const target = path.join(root, artifact.relativePath);
            await mkdir(path.dirname(target), {recursive: true});
            await writeFile(target, artifact.content, "utf8");
        }

        return path.join(root, "app", "manifest.json");
    }

    async applyApp(): Promise<{
        manifestPath: string;
        bundleFile: string;
        includePath: string;
        changed: boolean;
    }> {
        const manifestPath = await this.generateApp();
        const rootFile = await this.bundleFileSet.getRootFile();
        if (rootFile === undefined) {
            throw new Error(
                "No unique Databricks bundle root file was found in the active project."
            );
        }

        const includePath = ".foil-lab/foil-app.yml";
        const bundle = await parseBundleYaml(rootFile);
        const integrated = addBundleInclude(bundle, includePath);
        if (integrated.changed) {
            await writeBundleYaml(rootFile, integrated.bundle);
            this.bundleFileSet.bundleDataCache.invalidate();
        }

        return {
            manifestPath,
            bundleFile: rootFile.fsPath,
            includePath,
            changed: integrated.changed,
        };
    }

    async refresh(): Promise<void> {
        await this.model.refresh();
    }

    private async writeTextIfMissing(
        filePath: string,
        content: string
    ): Promise<void> {
        try {
            await writeFile(filePath, content, {
                encoding: "utf8",
                flag: "wx",
            });
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
                throw e;
            }
        }
    }

    private async writeJsonIfMissing(
        filePath: string,
        value: unknown
    ): Promise<void> {
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
        this.fileWatcher = undefined;

        let pattern: RelativePattern;
        try {
            pattern = new RelativePattern(
                this.workspaceFolderManager.activeProjectUri,
                ".foil-lab/**/*.json"
            );
        } catch {
            return;
        }
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
