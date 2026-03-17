"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import {
  Flame,
  Cloud,
  GitBranch,
  LayoutGrid,
  Triangle,
  MessageSquare,
} from "lucide-react";
import { transitions } from "@/lib/animations";
import { IntegrationDialog } from "@/app/(dashboard)/[product]/homev1/qai-integrations/components/integration-dialog";
import { JiraIntegrationDialog } from "@/app/(dashboard)/[product]/homev1/qai-integrations/components/jira-integration-dialog";

interface Integration {
  id: string;
  name: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}

interface IntegrationCategory {
  title: string;
  integrations: Integration[];
}

// Defined the dialog configuration types
interface DialogConfig {
  title: string;
  description: string;
  useProductId: boolean;
}

// Defined the dialog configurations
const dialogConfigs: Record<string, DialogConfig> = {
  firebase: {
    title: "Integrate QAI with Firebase App Distribution",
    description:
      "Add the following to your Firebase App Distribution testers list:",
    useProductId: false,
  },
  testflight: {
    title: "Integrate QAI with TestFlight",
    description: "Add the following to your TestFlight testers list:",
    useProductId: false,
  },
  figma: {
    title: "Integrate QAI with Figma",
    description:
      "Add the following to your Figma project with the role Viewer:",
    useProductId: true,
  },
  ticketing: {
    title: "Integrate QAI with Jira/Linear/Trello",
    description:
      "Add the following to your Jira/Linear/Trello project with the role User/Viewer/Read Access:",
    useProductId: true,
  },
  jira: {
    title: "Integrate QAI with Jira",
    description: "Configure your Jira integration with QAI:",
    useProductId: true,
  },
};

const integrationCategories: IntegrationCategory[] = [
  {
    title: "Test Run Triggers",
    integrations: [
      {
        id: "firebase",
        name: "Firebase App Distribution integration",
        icon: <Flame className="h-5 w-5 text-orange-500" />,
      },
      {
        id: "testflight",
        name: "TestFlight Integration",
        icon: <Cloud className="h-5 w-5 text-blue-500" />,
      },
      {
        id: "cicd",
        name: "CI/CD integration",
        icon: <GitBranch className="h-5 w-5 text-muted-foreground" />,
        comingSoon: true,
      },
    ],
  },
  {
    title: "Ticketing",
    integrations: [
      {
        id: "ticketing",
        name: "Ticketing tool integration",
        icon: <LayoutGrid className="h-5 w-5 text-purple-500" />,
      },
      {
        id: "jira",
        name: "Jira Integration",
        icon: <Triangle className="h-5 w-5 text-blue-600" />,
      },
    ],
  },
  {
    title: "Notifications",
    integrations: [
      {
        id: "slack",
        name: "Slack Integration",
        icon: <MessageSquare className="h-5 w-5 text-green-500" />,
        comingSoon: true,
      },
    ],
  },
];

function IntegrationCard({
  integration,
  onClick,
}: {
  integration: Integration;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`p-4 flex items-center gap-3 cursor-pointer transition-all duration-normal hover:border-primary/30 hover:shadow-md ${
        integration.comingSoon ? "opacity-70" : ""
      }`}
      onClick={integration.comingSoon ? undefined : onClick}
    >
      <div className="flex-shrink-0">{integration.icon}</div>
      <span className="text-sm font-medium text-foreground">
        {integration.name}
      </span>
      {integration.comingSoon && (
        <Badge variant="secondary" className="ml-auto text-xs">
          Coming Soon
        </Badge>
      )}
    </Card>
  );
}

export default function QAIIntegrationsV2() {
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const [openJiraDialog, setOpenJiraDialog] = useState(false);

  const currentDialogConfig = openDialog ? dialogConfigs[openDialog] : null;

  const handleIntegrationClick = (integrationId: string) => {
    if (integrationId === "jira") {
      setOpenJiraDialog(true);
    } else {
      setOpenDialog(integrationId);
    }
  };

  return (
    <div className="absolute inset-0 bg-white pointer-events-auto z-10">
      <div className="flex-1 overflow-y-auto p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transitions.normal}
          className="max-w-4xl mx-auto"
        >
          <h1 className="text-2xl font-bold text-foreground mb-2">
            QAI Integrations
          </h1>
          <p className="text-muted-foreground mb-8">
            Integrate QAI into your existing toolchain to cover even more ground
            automatically.
          </p>

          <div className="space-y-8">
            {integrationCategories.map((category) => (
              <div key={category.title}>
                <h2 className="text-base font-semibold text-foreground mb-1">
                  {category.title}
                </h2>
                <div className="border-b border-border mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {category.integrations.map((integration) => (
                    <IntegrationCard
                      key={integration.id}
                      integration={integration}
                      onClick={
                        integration.comingSoon
                          ? undefined
                          : () => handleIntegrationClick(integration.id)
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Standard Dialog Component */}
      {currentDialogConfig && (
        <IntegrationDialog
          open={openDialog !== null}
          onOpenChange={(open) => setOpenDialog(open ? openDialog : null)}
          title={currentDialogConfig.title}
          description={currentDialogConfig.description}
          useProductId={currentDialogConfig.useProductId}
        />
      )}

      {/* Jira Integration Dialog Component */}
      <JiraIntegrationDialog
        open={openJiraDialog}
        onOpenChange={setOpenJiraDialog}
      />
    </div>
  );
}
