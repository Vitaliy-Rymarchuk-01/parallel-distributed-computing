import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

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

export default function Home() {
  const [phrase, setPhrase] = useState("distributed systems");
  const [topN, setTopN] = useState(5);
  const [minScore, setMinScore] = useState(0);

  const searchMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/search", { phrase, topN, minScore });
      return data as {
        results: Array<{ doc: string; score: number; url: string }>;
      };
    },
  });

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Distributed Search (Lab 1)</CardTitle>
          <CardDescription>
            Search documents using distributed TF-IDF.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm">
            API base URL:{" "}
            <span className="font-mono">{api.defaults.baseURL}</span>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Phrase</div>
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="Type your query"
            />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-sm font-medium">Top N</div>
                <input
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={topN}
                  onChange={(e) => setTopN(Number(e.target.value) || 1)}
                  type="number"
                  min={1}
                />
              </div>
              <div>
                <div className="text-sm font-medium">Min score</div>
                <input
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value) || 0)}
                  type="number"
                  min={0}
                  step={0.1}
                />
              </div>
            </div>
          </div>

          {searchMutation.isPending && (
            <div className="text-sm text-gray-500">Searching...</div>
          )}

          {searchMutation.isError && (
            <div className="text-sm text-red-600">
              Error: {String(searchMutation.error)}
            </div>
          )}

          {searchMutation.data && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Results</div>
              <div className="space-y-1">
                {searchMutation.data.results.length === 0 && (
                  <div className="text-sm text-gray-500">No matches</div>
                )}
                {searchMutation.data.results.map((r) => (
                  <div key={r.doc} className="text-sm">
                    <a
                      className="font-mono underline"
                      href={`${api.defaults.baseURL}${r.url}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.doc}
                    </a>
                    <span className="ml-2 text-gray-600">
                      {r.score.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="gap-3">
          <Button
            onClick={() => searchMutation.mutate()}
            disabled={searchMutation.isPending}
          >
            Search
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              window.open(`${api.defaults.baseURL}/discovery/workers`, "_blank")
            }
          >
            Open workers
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
