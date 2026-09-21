import {
    Disposable,
    Event,
    EventEmitter,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
} from "vscode";

import {FoilLabModel} from "../../foil-lab/FoilLabModel";
import type {FoilLabValidationIssue} from "../../foil-lab/FoilLabTypes";
import {FREE_EDITION_PROFILE} from "../../foil-lab/freeEditionProfile";

interface FoilLabTreeNode extends TreeItem {
    kind:
        | "project"
        | "machines"
        | "machine"
        | "campaigns"
        | "campaign"
        | "app"
        | "dashboard"
        | "free"
        | "capability"
        | "actions"
        | "action"
        | "issue";
}

export class FoilLabTreeDataProvider
    implements TreeDataProvider<FoilLabTreeNode>, Disposable
{
    private readonly _onDidChangeTreeData = new EventEmitter<
        FoilLabTreeNode | undefined
    >();
    readonly onDidChangeTreeData: Event<FoilLabTreeNode | undefined> =
        this._onDidChangeTreeData.event;
    private readonly modelSubscription: Disposable;

    constructor(private readonly model: FoilLabModel) {
        this.modelSubscription = this.model.onDidChangeState(() => {
            this._onDidChangeTreeData.fire(undefined);
        });
    }

    getTreeItem(element: FoilLabTreeNode): TreeItem {
        return element;
    }

    async getChildren(parent?: FoilLabTreeNode): Promise<FoilLabTreeNode[]> {
        if (!parent) {
            return this.getRootNodes();
        }
        switch (parent.kind) {
            case "project":
                return this.getProjectChildren();
            case "machines":
                return this.getMachineChildren();
            case "campaigns":
                return this.getCampaignChildren();
            case "app":
                return this.getAppChildren();
            case "dashboard":
                return this.getDashboardChildren();
            case "free":
                return this.getFreeCapabilityChildren();
            case "actions":
                return this.getActionChildren();
            default:
                return [];
        }
    }

    private getRootNodes(): FoilLabTreeNode[] {
        const state = this.model.state;
        const project = this.node(
            state.initialized
                ? state.project?.name ?? "FOIL Virtual Lab"
                : "FOIL Virtual Lab",
            "project",
            TreeItemCollapsibleState.Expanded,
            "beaker"
        );
        project.description = state.initialized
            ? `${state.project?.activeTechnology ?? "?"} · ${
                  state.project?.defaultClassification ?? "?"
              }`
            : "not initialized";

        return [
            project,
            this.node(
                "Machines",
                "machines",
                TreeItemCollapsibleState.Expanded,
                "tools"
            ),
            this.node(
                "Campaigns",
                "campaigns",
                TreeItemCollapsibleState.Expanded,
                "graph"
            ),
            this.node(
                "Streamlit App",
                "app",
                TreeItemCollapsibleState.Expanded,
                "browser"
            ),
            this.node(
                "AI/BI Dashboard",
                "dashboard",
                TreeItemCollapsibleState.Expanded,
                "dashboard"
            ),
            this.node(
                "Databricks Free",
                "free",
                TreeItemCollapsibleState.Collapsed,
                "cloud"
            ),
            this.node(
                "Actions",
                "actions",
                TreeItemCollapsibleState.Expanded,
                "play"
            ),
        ];
    }

    private getProjectChildren(): FoilLabTreeNode[] {
        const state = this.model.state;
        if (!state.initialized) {
            return [
                this.action(
                    "Initialize FOIL Lab",
                    "databricks.foilLab.initialize",
                    "new-folder"
                ),
            ];
        }

        const items: FoilLabTreeNode[] = [
            this.action(
                `Technology: ${state.project?.activeTechnology ?? "unknown"}`,
                "databricks.foilLab.openProjectConfig",
                "symbol-enum"
            ),
            this.action(
                `Gold: ${state.project?.databricks.goldSchema ?? "foil_gold"}`,
                "databricks.foilLab.focusGold",
                "database"
            ),
            this.action(
                `App: ${
                    state.project?.databricks.appResource ?? "foil_virtual_lab"
                }`,
                "databricks.foilLab.openAppSpec",
                "browser"
            ),
        ];
        return [...items, ...this.issueNodes(state.projectIssues)];
    }

    private getMachineChildren(): FoilLabTreeNode[] {
        if (this.model.state.machines.length === 0) {
            return [this.info("No machine profiles", "machine")];
        }
        return this.model.state.machines.map((machine) => {
            const node = this.node(
                machine.config?.machineId ?? machine.fileName,
                "machine",
                TreeItemCollapsibleState.None,
                "tools"
            );
            node.description = machine.config
                ? `${machine.config.technology} · ${machine.config.status}`
                : "invalid";
            node.tooltip = this.formatIssues(machine.issues);
            return node;
        });
    }

    private getCampaignChildren(): FoilLabTreeNode[] {
        const campaigns = this.model.state.campaigns.map((campaign) => {
            const node = this.node(
                campaign.config?.campaignId ?? campaign.fileName,
                "campaign",
                TreeItemCollapsibleState.None,
                "graph-line"
            );
            node.description = campaign.config
                ? `${campaign.config.analyses.length} analysis module(s)`
                : "invalid";
            node.tooltip = this.formatIssues(campaign.issues);
            return node;
        });
        campaigns.push(
            this.action(
                "Create campaign",
                "databricks.foilLab.createCampaign",
                "add"
            ),
            this.action(
                "Compile campaign preview",
                "databricks.foilLab.compileCampaign",
                "package"
            ),
            this.action(
                "Apply campaign to bundle",
                "databricks.foilLab.applyCampaign",
                "git-merge"
            )
        );
        return campaigns;
    }

    private getAppChildren(): FoilLabTreeNode[] {
        const app = this.model.state.app;
        if (app === undefined) {
            return [
                this.action(
                    "Open App configuration",
                    "databricks.foilLab.openAppSpec",
                    "json"
                ),
            ];
        }

        const configured =
            app.catalog.length > 0 && app.sqlWarehouseId.length > 0;
        const items: FoilLabTreeNode[] = [
            this.action(
                `${app.appName} · ${
                    configured ? "configured" : "needs configuration"
                }`,
                "databricks.foilLab.openAppSpec",
                configured ? "pass" : "warning"
            ),
            this.action(
                configured
                    ? `Gold: ${app.catalog}.${app.goldSchema}`
                    : "Configure catalog + SQL warehouse",
                "databricks.foilLab.configureApp",
                "gear"
            ),
            this.action(
                "Generate Streamlit App",
                "databricks.foilLab.generateApp",
                "package"
            ),
            this.action(
                "Apply App to bundle",
                "databricks.foilLab.applyApp",
                "git-merge"
            ),
        ];
        return [...items, ...this.issueNodes(this.model.state.appIssues)];
    }

    private getDashboardChildren(): FoilLabTreeNode[] {
        const app = this.model.state.app;
        const configured =
            app !== undefined &&
            app.catalog.length > 0 &&
            app.sqlWarehouseId.length > 0;

        return [
            this.action(
                configured
                    ? `Gold: ${app!.catalog}.${app!.goldSchema}`
                    : "Configure catalog + SQL warehouse first",
                "databricks.foilLab.configureApp",
                configured ? "pass" : "warning"
            ),
            this.action(
                "Generate AI/BI dashboard",
                "databricks.foilLab.generateDashboard",
                "package"
            ),
            this.action(
                "Apply dashboard to bundle",
                "databricks.foilLab.applyDashboard",
                "git-merge"
            ),
        ];
    }

    private getFreeCapabilityChildren(): FoilLabTreeNode[] {
        return FREE_EDITION_PROFILE.capabilities.map((capability) => {
            const icon =
                capability.status === "supported"
                    ? "pass"
                    : capability.status === "limited"
                      ? "warning"
                      : "circle-slash";
            const node = this.node(
                capability.label,
                "capability",
                TreeItemCollapsibleState.None,
                icon
            );
            node.description = capability.value;
            node.tooltip = `Static Free Edition profile (${FREE_EDITION_PROFILE.sourceDate}).`;
            return node;
        });
    }

    private getActionChildren(): FoilLabTreeNode[] {
        return [
            this.action(
                "Sign in / configure workspace",
                "databricks.foilLab.configureLogin",
                "account"
            ),
            this.action(
                "Import machine / campaign snapshot",
                "databricks.foilLab.importControlMachine",
                "repo-pull"
            ),
            this.action(
                "Import bundled Wind baseline",
                "databricks.foilLab.importBundledBaseline",
                "beaker"
            ),
            this.action(
                "Validate FOIL configuration",
                "databricks.foilLab.validate",
                "check-all"
            ),
            this.action(
                "Compile campaign preview",
                "databricks.foilLab.compileCampaign",
                "package"
            ),
            this.action(
                "Apply campaign to bundle",
                "databricks.foilLab.applyCampaign",
                "git-merge"
            ),
            this.action(
                "Validate Databricks bundle",
                "databricks.foilLab.validateBundle",
                "check"
            ),
            this.action(
                "Deploy bundle",
                "databricks.foilLab.deploy",
                "cloud-upload"
            ),
            this.action(
                "Deploy and run resource",
                "databricks.foilLab.deployAndRun",
                "run"
            ),
            this.action(
                "Configure Streamlit App",
                "databricks.foilLab.configureApp",
                "gear"
            ),
            this.action(
                "Generate Streamlit App",
                "databricks.foilLab.generateApp",
                "package"
            ),
            this.action(
                "Apply Streamlit App to bundle",
                "databricks.foilLab.applyApp",
                "git-merge"
            ),
            this.action(
                "Generate AI/BI dashboard",
                "databricks.foilLab.generateDashboard",
                "dashboard"
            ),
            this.action(
                "Apply AI/BI dashboard to bundle",
                "databricks.foilLab.applyDashboard",
                "git-merge"
            ),
            this.action(
                "Open Gold / Unity Catalog",
                "databricks.foilLab.focusGold",
                "database"
            ),
        ];
    }

    private action(
        label: string,
        command: string,
        icon: string
    ): FoilLabTreeNode {
        const node = this.node(
            label,
            "action",
            TreeItemCollapsibleState.None,
            icon
        );
        node.command = {command, title: label};
        return node;
    }

    private info(
        label: string,
        kind: FoilLabTreeNode["kind"]
    ): FoilLabTreeNode {
        return this.node(label, kind, TreeItemCollapsibleState.None, "info");
    }

    private issueNodes(issues: FoilLabValidationIssue[]): FoilLabTreeNode[] {
        return issues.map((issue) => {
            const node = this.node(
                issue.message,
                "issue",
                TreeItemCollapsibleState.None,
                issue.severity === "error" ? "error" : "warning"
            );
            node.description = issue.path;
            return node;
        });
    }

    private formatIssues(issues: FoilLabValidationIssue[]): string | undefined {
        return issues.length === 0
            ? undefined
            : issues
                  .map((issue) => `${issue.severity}: ${issue.message}`)
                  .join("\n");
    }

    private node(
        label: string,
        kind: FoilLabTreeNode["kind"],
        collapsibleState: TreeItemCollapsibleState,
        icon: string
    ): FoilLabTreeNode {
        const node = new TreeItem(label, collapsibleState) as FoilLabTreeNode;
        node.kind = kind;
        node.iconPath = new ThemeIcon(icon);
        return node;
    }

    dispose(): void {
        this.modelSubscription.dispose();
        this._onDidChangeTreeData.dispose();
    }
}
