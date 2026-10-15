import { MessageSquareText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** 평가의견 (2026-10-15). 빈 의견은 "의견 없음" */
export function CommentsCard({ items }: { items: { title: string; text: string }[] }) {
  if (items.length === 0) return null;
  return (
    <Card data-testid="comments">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="size-4" aria-hidden="true" />
          평가의견
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {items.map((c) => (
          <div key={c.title} className="flex flex-col gap-1.5">
            <span className="text-caption font-medium text-text-secondary">{c.title}</span>
            <p className="whitespace-pre-wrap rounded-md border bg-muted/40 px-3 py-2 text-body">{c.text || <span className="text-muted-foreground">(의견 없음)</span>}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
