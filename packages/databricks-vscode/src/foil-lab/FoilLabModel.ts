import {Event, EventEmitter} from "vscode";
import {readdir, readFile} from "node:fs/promises";
import path from "node:path";

import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import type {
    FoilCampaignSummary,
    FoilLabState,
    FoilMachineSummary,
} from "./FoilLabTypes";
import {
    validateAppConfig,
    validateCampaignConfig,
    validateMachineConfig,
    validateProjectConfig,
} from "./foilLabValidation";

const EMPTY_STATE: FoilLabState = {
    initialized: false,
    projectIssues: [],
    machines: [],
    campaigns: [],
    appIssues: [],
};

export class FoilLabModel {
    private _state: FoilLabState = EMPTY_STATE;
    private readonly _onDidChangeState = new EventEmitter<FoilLabState>();
    readonly onDidChangeState: Event<FoilLabState> =
        this._onDidChangeState.event;

    constructor(
        private readonly workspaceFolderManager: WorkspaceFolderManager
    ) {}

    get state(): FoilLabState {
        return this._state;
    }

    get labRootPath(): string | undefined {
        try {
            return path.join(
                this.workspaceFolderManager.activeProjectUri.fsPath,
                ".foil-lab"
            );
        } catch {
            return undefined;
        }
    }

    get projectConfigPath(): string | undefined {
        const root = this.labRootPath;
        return root === undefined ? undefined : path.join(root, "project.json");
    }

    get appSpecPath(): string | undefined {
        const root = this.labRootPath;
        return root === undefined
            ? undefined
            : path.join(root, "ui", "app.json");
    }

    async refresh(): Promise<FoilLabState> {
        const projectConfigPath = this.projectConfigPath;
        if (projectConfigPath === undefined) {
            this.setState(EMPTY_STATE);
            return this._state;
        }

        const projectRaw = await this.readJson(projectConfigPath);
        if (projectRaw === undefined) {
            this.setState(EMPTY_STATE);
            return this._state;
        }

        const project = validateProjectConfig(projectRaw);
        const root = this.labRootPath;
        if (root === undefined) {
            this.setState(EMPTY_STATE);
            return this._state;
        }

        if (
            project.config?.controlContextFile !== undefined
        ) {
            const projectRoot = this.workspaceFolderManager.activeProjectUri.fsPath;
            const contextPath = path.isAbsolute(project.config.controlContextFile)
                ? project.config.controlContextFile
                : path.resolve(projectRoot, project.config.controlContextFile);
            const contextRaw = await this.readJson(contextPath);
            if (
                contextRaw === undefined ||
                typeof contextRaw !== "object" ||
                contextRaw === null ||
                Array.isArray(contextRaw)
            ) {
                project.issues.push({
                    severity: "warning",
                    path: "controlContextFile",
                    message:
                        "FOIL control context could not be loaded. Update controlContextFile or regenerate foil-control-v1/interfaces/databricks/lab_context.json.",
                });
            } else {
                const context = contextRaw as Record<string, unknown>;
                if (context.schema !== "foil-control/databricks-lab-context-v1") {
                    project.issues.push({
                        severity: "warning",
                        path: "controlContextFile",
                        message:
                            "FOIL control context has an unexpected schema.",
                    });
                }
                const activeMachine = context.activeMachine;
                if (
                    typeof activeMachine === "object" &&
                    activeMachine !== null &&
                    !Array.isArray(activeMachine)
                ) {
                    const technology = (activeMachine as Record<string, unknown>).technology;
                    if (
                        typeof technology === "string" &&
                        technology !== project.config.activeTechnology
                    ) {
                        project.issues.push({
                            severity: "warning",
                            path: "controlContextFile",
                            message:
                                "FOIL control context active technology differs from the Databricks project.",
                        });
                    }
                }
            }
        }

        const machines = await this.readSummaries(
            path.join(root, "machines"),
            (fileName, value): FoilMachineSummary => {
                const validation = validateMachineConfig(value);
                return {fileName, ...validation};
            }
        );
        const campaigns = await this.readSummaries(
            path.join(root, "campaigns"),
            (fileName, value): FoilCampaignSummary => {
                const validation = validateCampaignConfig(value);
                return {fileName, ...validation};
            }
        );
        const appRaw = await this.readJson(this.appSpecPath!);
        const app =
            appRaw === undefined
                ? {
                      issues: [
                          {
                              severity: "warning" as const,
                              path: "app",
                              message:
                                  "FOIL App configuration is missing. Reinitialize the lab to restore it.",
                          },
                      ],
                  }
                : validateAppConfig(appRaw);
        if (
            app.config !== undefined &&
            project.config !== undefined &&
            app.config.goldSchema !== project.config.databricks.goldSchema
        ) {
            app.issues.push({
                severity: "warning",
                path: "goldSchema",
                message: "App goldSchema differs from the project Gold schema.",
            });
        }

        this.setState({
            initialized: true,
            project: project.config,
            projectIssues: project.issues,
            machines,
            campaigns,
            app: app.config,
            appIssues: app.issues,
        });
        return this._state;
    }

    private async readSummaries<T>(
        directory: string,
        parse: (fileName: string, value: unknown) => T
    ): Promise<T[]> {
        let entries;
        try {
            entries = await readdir(directory, {withFileTypes: true});
        } catch {
            return [];
        }

        const jsonFiles = entries
            .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
            .sort((a, b) => a.name.localeCompare(b.name));

        const result: T[] = [];
        for (const entry of jsonFiles) {
            const value = await this.readJson(path.join(directory, entry.name));
            if (value !== undefined) {
                result.push(parse(entry.name, value));
            }
        }
        return result;
    }

    private async readJson(filePath: string): Promise<unknown | undefined> {
        try {
            return JSON.parse(await readFile(filePath, "utf8")) as unknown;
        } catch {
            return undefined;
        }
    }

    private setState(state: FoilLabState): void {
        this._state = state;
        this._onDidChangeState.fire(state);
    }

    dispose(): void {
        this._onDidChangeState.dispose();
    }
}
