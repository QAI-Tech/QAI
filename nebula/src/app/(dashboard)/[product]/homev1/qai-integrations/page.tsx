"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IntegrationDialog } from "./components/integration-dialog";
import { JiraIntegrationDialog } from "./components/jira-integration-dialog";
import { Slack, Ticket, Workflow } from "lucide-react";
// Defined the  dialog configuration types
interface DialogConfig {
  title: string;
  description: string;
  useProductId: boolean;
}

// Defined the  dialog configurations
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

export default function QAIIntegrations() {
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const [openJiraDialog, setOpenJiraDialog] = useState(false);

  const currentDialogConfig = openDialog ? dialogConfigs[openDialog] : null;

  return (
    <div className="container mx-auto max-w-5xl py-8 mt-12">
      <h1 className="text-2xl font-bold mb-2">QAI Integrations</h1>
      <p className="text-gray-600 mb-8">
        Integrate QAI into your existing toolchain to cover even more ground
        automatically.
      </p>

      {/* Test Run Triggers Section */}
      <div className="bg-gray-50 rounded-lg mb-6">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-medium">Test Run Triggers</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button
            variant="outline"
            className="h-auto py-3 px-4 flex items-center justify-between bg-white border-gray-200 hover:bg-gray-50 text-black rounded-md"
            onClick={() => setOpenDialog("firebase")}
          >
            <div className="flex items-center">
              <div className="w-8 h-8 flex items-center justify-center mr-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-orange-500"
                >
                  <path
                    d="M4.3 17.3l6.8-13.1c.2-.3.6-.3.8 0l.9 1.7-5.5 10.9c-.1.2-.4.2-.6.1l-2.4-1.5z"
                    fill="#FFA000"
                    stroke="none"
                  />
                  <path
                    d="M13.1 7.1l2.4-2.4c.3-.3.7-.2.9.1l7.2 12.8c.1.2 0 .4-.1.6L19.6 22H9.6c-.2 0-.4-.1-.4-.3l-1.5-2.9 5.4-11.7z"
                    fill="#F57F17"
                    stroke="none"
                  />
                  <path
                    d="M13.1 7.1L4.3 17.3l-2.1-4.4c-.1-.2 0-.5.2-.6l7.4-4.2c.2-.1.4-.1.6 0l2.7 1.5z"
                    fill="#FFCA28"
                    stroke="none"
                  />
                </svg>
              </div>
              <span>Firebase App Distribution integration</span>
            </div>
          </Button>

          <Button
            variant="outline"
            className="h-auto py-3 px-4 flex items-center justify-between bg-white border-gray-200 hover:bg-gray-50 text-black rounded-md"
            onClick={() => setOpenDialog("testflight")}
          >
            <div className="flex items-center">
              <div className="w-8 h-8 flex items-center justify-center mr-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                >
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
                    fill="#0066CC"
                  />
                  <path d="M12 6l-5 8h10l-5-8z" fill="white" />
                </svg>
              </div>
              <span>TestFlight Integration</span>
            </div>
          </Button>

          <Button
            variant="outline"
            className="h-auto py-3 px-4 flex items-center justify-between bg-white border-gray-200 hover:bg-gray-50 text-black rounded-md"
          >
            <div className="flex items-center">
              <div className="w-8 h-8 flex items-center justify-center mr-3">
                <Workflow className="h-5 w-5 text-purple-500" />
              </div>
              <span>CI/CD integration</span>
            </div>
            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-800 rounded">
              Coming Soon
            </span>
          </Button>
        </div>
      </div>

      {/* Ticketing Section */}
      <div className="bg-gray-50 rounded-lg mb-6">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-medium">Ticketing</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button
            variant="outline"
            className="h-auto py-3 px-4 flex items-center justify-between bg-white border-gray-200 hover:bg-gray-50 text-black rounded-md hidden"
            onClick={() => setOpenDialog("figma")}
          >
            <div className="flex items-center">
              <div className="w-8 h-8 flex items-center justify-center mr-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                >
                  <path
                    d="M8 24c2.208 0 4-1.792 4-4v-4H8c-2.208 0-4 1.792-4 4s1.792 4 4 4z"
                    fill="#0ACF83"
                  />
                  <path
                    d="M4 12c0-2.208 1.792-4 4-4h4v8H8c-2.208 0-4-1.792-4-4z"
                    fill="#A259FF"
                  />
                  <path
                    d="M4 4c0-2.208 1.792-4 4-4h4v8H8C5.792 8 4 6.208 4 4z"
                    fill="#F24E1E"
                  />
                  <path
                    d="M12 0h4c2.208 0 4 1.792 4 4s-1.792 4-4 4h-4V0z"
                    fill="#FF7262"
                  />
                  <path
                    d="M20 12c0 2.208-1.792 4-4 4s-4-1.792-4-4 1.792-4 4-4 4 1.792 4 4z"
                    fill="#1ABCFE"
                  />
                </svg>
              </div>
              <span>Figma Integration</span>
            </div>
          </Button>

          <Button
            variant="outline"
            className="h-auto py-3 px-4 flex items-center justify-between bg-white border-gray-200 hover:bg-gray-50 text-black rounded-md"
            onClick={() => setOpenDialog("ticketing")}
          >
            <div className="flex items-center">
              <div className="w-8 h-8 flex items-center justify-center mr-3">
                <Ticket className="h-5 w-5 text-green-500" />
              </div>
              <span>Ticketing tool integration</span>
            </div>
          </Button>

          {/* Add Jira Integration Button with proper Jira icon */}
          <Button
            variant="outline"
            className="h-auto py-3 px-4 flex items-center justify-between bg-white border-gray-200 hover:bg-gray-50 text-black rounded-md"
            onClick={() => setOpenJiraDialog(true)}
          >
            <div className="flex items-center">
              <div className="w-8 h-8 flex items-center justify-center mr-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                  <defs>
                    <linearGradient
                      id="atlGrad"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="100%"
                    >
                      <stop offset="0%" stop-color="#0052CC" />
                      <stop offset="100%" stop-color="#2684FF" />
                    </linearGradient>
                  </defs>
                  <path
                    fill="url(#atlGrad)"
                    d="M8 40 L20 8 a4 4 0 0 1 8 0 L40 40 L28 40 L24 28 L20 40 Z"
                  />
                </svg>
              </div>
              <span>Jira Integration</span>
            </div>
          </Button>
        </div>
      </div>

      {/* Notifications Section */}
      <div className="bg-gray-50 rounded-lg">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-medium">Notifications</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button
            variant="outline"
            className="h-auto py-3 px-4 flex items-center justify-between bg-white border-gray-200 hover:bg-gray-50 text-black rounded-md"
          >
            <div className="flex items-center">
              <div className="w-8 h-8 flex items-center justify-center mr-3">
                <Slack className="h-5 w-5 text-purple-500" />
              </div>
              <span>Slack Integration</span>
            </div>
            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-800 rounded">
              Coming Soon
            </span>
          </Button>
        </div>
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
