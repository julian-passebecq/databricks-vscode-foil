import {commands, Uri, window, workspace} from "vscode";

import type {BundleValidateModel} from "../bundle/models/BundleValidateModel";
import {FoilLabManager} from "./FoilLabManager";
import {FoilLabModel} from "./FoilLabModel";

export class FoilLabCommands {
    constructor(
        private readonly manager: FoilLabManager,
        private readonly model: FoilLabModel,
        private readonly bundleValidateModel: BundleValidateModel
    ) {}

    initializeProject = async (): Promise<void> => {
        try {
            await this.manager.initializeProject();
            window.showInformationMessage(
                "FOIL Lab initialized for Eolien-first R&D."
            );
        } catch (e) {
            window.showErrorMessage(
                `Unable to initialize FOIL Lab: ${(e as Error).message}`
            );
        }
    };

    refresh = async (): Promise<void> => {
        await this.manager.refresh();
    };

    validateProject = async (): Promise<void> => {
        const state = await this.model.refresh();
        const issues = [
            ...state.projectIssues,
            ...state.machines.flatMap((machine) => machine.issues),
            ...state.campaigns.flatMap((campaign) => campaign.issues),
            ...state.appIssues,
        ];
        const errors = issues.filter((issue) => issue.severity === "error");
        const warnings = issues.filter((issue) => issue.severity === "warning");

        if (!state.initialized) {
            window.showWarningMessage(
                "FOIL Lab is not initialized in the active Databricks project."
            );
            return;
        }
        if (errors.length > 0) {
            window.showErrorMessage(
                `FOIL Lab validation failed: ${errors.length} error(s), ${warnings.length} warning(s).`
            );
            return;
        }
        window.showInformationMessage(
            `FOIL Lab validation passed${
                warnings.length > 0 ? ` with ${warnings.length} warning(s)` : ""
            }.`
        );
    };

    validateBundle = async (): Promise<void> => {
        if (
            !this.bundleValidateModel.target ||
            !this.bundleValidateModel.authProvider
        ) {
            window.showWarningMessage(
                "Configure a Databricks workspace and bundle target before validation."
            );
            return;
        }
        await this.bundleValidateModel.refresh();
        window.showInformationMessage("Databricks bundle validation passed.");
    };

    deploy = async (): Promise<void> => {
        await commands.executeCommand("databricks.bundle.deploy");
    };

    deployAndRun = async (): Promise<void> => {
        await commands.executeCommand(
            "databricks.bundle.deployAndRunFromInput"
        );
    };

    configureLogin = async (): Promise<void> => {
        await commands.executeCommand("databricks.connection.configureLogin");
    };

    focusGold = async (): Promise<void> => {
        await commands.executeCommand("unityCatalogView.focus");
        await commands.executeCommand("list.find");
    };

    openProjectConfig = async (): Promise<void> => {
        await this.openFile(this.model.projectConfigPath);
    };

    openAppSpec = async (): Promise<void> => {
        await this.openFile(this.model.appSpecPath);
    };

    importControlMachine = async (): Promise<void> => {
        try {
            if (!this.model.state.initialized) {
                await this.manager.initializeProject();
            }
            const selected = await window.showOpenDialog({
                canSelectMany: false,
                canSelectFiles: true,
                canSelectFolders: false,
                title: "Import FOIL machine or campaign snapshot",
                openLabel: "Import FOIL snapshot",
                filters: {"FOIL snapshot": ["json"]},
            });
            if (!selected?.[0]) {
                return;
            }
            const target = await this.manager.importControlMachineSnapshot(
                selected[0].fsPath
            );
            await this.openFile(target);
            window.showInformationMessage(
                "FOIL snapshot imported and materialized locally. Campaign compilation now uses the frozen local copy rather than live MongoDB state."
            );
        } catch (e) {
            window.showErrorMessage(
                `Unable to import FOIL snapshot: ${(e as Error).message}`
            );
        }
    };

    createCampaign = async (): Promise<void> => {
        try {
            if (!this.model.state.initialized) {
                await this.manager.initializeProject();
            }
            const campaignId = await window.showInputBox({
                title: "Create FOIL campaign",
                prompt: "Campaign id used for the version-controlled JSON file",
                placeHolder: "wind_turbulence_sensitivity_001",
                validateInput: (value) =>
                    value.trim().length === 0
                        ? "Campaign id is required."
                        : undefined,
            });
            if (campaignId === undefined) {
                return;
            }

            const filePath = await this.manager.createCampaign(campaignId);
            await this.openFile(filePath);
        } catch (e) {
            window.showErrorMessage(
                `Unable to create FOIL campaign: ${(e as Error).message}`
            );
        }
    };

    compileCampaign = async (): Promise<void> => {
        const campaignId = await this.pickCampaign("Compile FOIL campaign");
        if (campaignId === undefined) {
            return;
        }

        try {
            const manifestPath = await this.manager.compileCampaign(campaignId);
            await this.openFile(manifestPath);
            window.showInformationMessage(
                `FOIL campaign ${campaignId} compiled to .foil-lab/build. Review before adding it to the bundle.`
            );
        } catch (e) {
            window.showErrorMessage(
                `Unable to compile FOIL campaign: ${(e as Error).message}`
            );
        }
    };

    applyCampaign = async (): Promise<void> => {
        const campaignId = await this.pickCampaign(
            "Apply FOIL campaign to Databricks bundle"
        );
        if (campaignId === undefined) {
            return;
        }

        const confirmation = await window.showWarningMessage(
            `Apply ${campaignId} to the active Databricks bundle? This updates the bundle include list but does not deploy anything.`,
            {modal: true},
            "Apply"
        );
        if (confirmation !== "Apply") {
            return;
        }

        try {
            const result = await this.manager.applyCampaign(campaignId);
            let validationMessage =
                "Bundle target is not configured; validate before deployment.";
            if (
                this.bundleValidateModel.target &&
                this.bundleValidateModel.authProvider
            ) {
                await this.bundleValidateModel.refresh();
                validationMessage = "Databricks bundle validation passed.";
            }

            window.showInformationMessage(
                result.changed
                    ? `FOIL campaign ${campaignId} added to ${result.bundleFile}. ${validationMessage}`
                    : `FOIL campaign ${campaignId} is already included. ${validationMessage}`
            );
        } catch (e) {
            window.showErrorMessage(
                `Unable to apply FOIL campaign: ${(e as Error).message}`
            );
        }
    };

    configureApp = async (): Promise<void> => {
        const state = await this.model.refresh();
        if (!state.initialized || state.app === undefined) {
            window.showWarningMessage(
                "Initialize the FOIL Lab before configuring the App."
            );
            return;
        }

        const catalog = await window.showInputBox({
            title: "Configure FOIL App",
            prompt: "Unity Catalog catalog containing the FOIL Gold schema",
            value: state.app.catalog,
            placeHolder: "foil",
            validateInput: (value) =>
                value.trim().length === 0 ? "Catalog is required." : undefined,
        });
        if (catalog === undefined) {
            return;
        }

        const sqlWarehouseId = await window.showInputBox({
            title: "Configure FOIL App",
            prompt: "Databricks SQL warehouse ID used by the App",
            value: state.app.sqlWarehouseId,
            placeHolder: "xxxxxxxxxxxxxxxx",
            validateInput: (value) =>
                value.trim().length === 0
                    ? "SQL warehouse ID is required."
                    : undefined,
        });
        if (sqlWarehouseId === undefined) {
            return;
        }

        try {
            const appSpecPath = await this.manager.configureApp(
                catalog,
                sqlWarehouseId
            );
            await this.openFile(appSpecPath);
            window.showInformationMessage(
                "FOIL App configuration saved. The App remains read-only."
            );
        } catch (e) {
            window.showErrorMessage(
                `Unable to configure FOIL App: ${(e as Error).message}`
            );
        }
    };

    generateApp = async (): Promise<void> => {
        try {
            const manifestPath = await this.manager.generateApp();
            await this.openFile(manifestPath);
            window.showInformationMessage(
                "FOIL Streamlit App generated in .foil-lab/app. No deployment was performed."
            );
        } catch (e) {
            window.showErrorMessage(
                `Unable to generate FOIL App: ${(e as Error).message}`
            );
        }
    };

    generateDashboard = async (): Promise<void> => {
        try {
            const manifestPath = await this.manager.generateDashboard();
            await this.openFile(manifestPath);
            window.showInformationMessage(
                "FOIL AI/BI dashboard generated from the Gold contract. No deployment was performed."
            );
        } catch (e) {
            window.showErrorMessage(
                `Unable to generate FOIL AI/BI dashboard: ${(e as Error).message}`
            );
        }
    };

    applyDashboard = async (): Promise<void> => {
        const confirmation = await window.showWarningMessage(
            "Apply the generated FOIL AI/BI dashboard to the active Databricks bundle? Run a campaign first so the Gold datasets exist. This does not deploy the bundle.",
            {modal: true},
            "Apply"
        );
        if (confirmation !== "Apply") {
            return;
        }

        try {
            const result = await this.manager.applyDashboard();
            let validationMessage =
                "Bundle target is not configured; validate before deployment.";
            if (
                this.bundleValidateModel.target &&
                this.bundleValidateModel.authProvider
            ) {
                await this.bundleValidateModel.refresh();
                validationMessage = "Databricks bundle validation passed.";
            }

            window.showInformationMessage(
                result.changed
                    ? `FOIL AI/BI dashboard added to ${result.bundleFile}. ${validationMessage}`
                    : `FOIL AI/BI dashboard is already included. ${validationMessage}`
            );
        } catch (e) {
            window.showErrorMessage(
                `Unable to apply FOIL AI/BI dashboard: ${(e as Error).message}`
            );
        }
    };

    applyApp = async (): Promise<void> => {
        const confirmation = await window.showWarningMessage(
            "Apply the generated FOIL Streamlit App to the active Databricks bundle? Run at least one descriptive-statistics campaign first so the bound Gold tables exist. This does not deploy the bundle.",
            {modal: true},
            "Apply"
        );
        if (confirmation !== "Apply") {
            return;
        }

        try {
            const result = await this.manager.applyApp();
            let validationMessage =
                "Bundle target is not configured; validate before deployment.";
            if (
                this.bundleValidateModel.target &&
                this.bundleValidateModel.authProvider
            ) {
                await this.bundleValidateModel.refresh();
                validationMessage = "Databricks bundle validation passed.";
            }

            window.showInformationMessage(
                result.changed
                    ? `FOIL App added to ${result.bundleFile}. ${validationMessage}`
                    : `FOIL App is already included. ${validationMessage}`
            );
        } catch (e) {
            window.showErrorMessage(
                `Unable to apply FOIL App: ${(e as Error).message}`
            );
        }
    };

    private async pickCampaign(title: string): Promise<string | undefined> {
        const state = await this.model.refresh();
        const validCampaigns = state.campaigns.filter(
            (campaign) => campaign.config !== undefined
        );
        if (validCampaigns.length === 0) {
            window.showWarningMessage("No valid FOIL campaign is available.");
            return undefined;
        }

        const selected = await window.showQuickPick(
            validCampaigns.map((campaign) => ({
                label: campaign.config!.campaignId,
                description: campaign.config!.objective,
            })),
            {
                title,
                placeHolder:
                    "Select a validated campaign from .foil-lab/campaigns",
            }
        );
        return selected?.label;
    }

    private async openFile(filePath: string | undefined): Promise<void> {
        if (filePath === undefined) {
            window.showWarningMessage(
                "Open or select a Databricks project folder first."
            );
            return;
        }
        try {
            const document = await workspace.openTextDocument(
                Uri.file(filePath)
            );
            await window.showTextDocument(document);
        } catch {
            window.showWarningMessage(
                "FOIL Lab file was not found. Initialize the lab first."
            );
        }
    }
}
