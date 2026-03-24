import type { Route } from "./+types/home";
import { useQuery } from "@tanstack/react-query";

import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { api } from "~/lib/api";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Health Check" },
    { name: "description", content: "Frontend health check page" },
  ];
}

export default function Home() {
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const { data } = await api.get("/health");
      return data as { status: string };
    },
    retry: 1,
  });

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Distributed Search (Lab 1)</CardTitle>
          <CardDescription>
            React client checks backend health via HTTP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm">
            API base URL:{" "}
            <span className="font-mono">{api.defaults.baseURL}</span>
          </div>

          {healthQuery.isLoading && (
            <div className="text-sm text-gray-500">Loading...</div>
          )}

          {healthQuery.isError && (
            <div className="text-sm text-red-600">
              Error: {String(healthQuery.error)}
            </div>
          )}

          {healthQuery.data && (
            <div className="text-sm">
              Backend status:{" "}
              <span className="font-medium">{healthQuery.data.status}</span>
            </div>
          )}
        </CardContent>
        <CardFooter className="gap-3">
          <Button
            onClick={() => healthQuery.refetch()}
            disabled={healthQuery.isFetching}
          >
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              window.open(`${api.defaults.baseURL}/health`, "_blank")
            }
          >
            Open /health
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
