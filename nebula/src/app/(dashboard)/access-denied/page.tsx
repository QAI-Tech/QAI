import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

const AccessDeniedPage = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl">Access Denied</CardTitle>
          <CardDescription className="text-gray-600">
            You do not have permission to access this page. Please sign in with
            an authorized email.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <Link href="/">
            <Button className="w-full" variant="outline">
              Go Back to Home
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccessDeniedPage;
